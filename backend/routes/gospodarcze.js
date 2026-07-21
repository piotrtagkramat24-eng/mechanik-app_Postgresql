const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { wyslijMaila, szablonEmail, escapeHtml, tabelkaSzczegolow } = require('../mail');

// Wspolny fragment zapytania — zadania cykliczne sa ZAWSZE widoczne (Widoczne=1),
// jednorazowe tylko jesli nie zakonczone. dni_wyprzedzenia usuniete z logiki widocznosci.
const SELECT_ZADANIA = `
  SELECT
    z.id AS "Id",
    z.zadanie AS "Zadanie",
    z.lokalizacja AS "Lokalizacja",
    z.typ AS "Typ",
    z.co_ile_dni AS "CoIleDni",
    z.priorytet AS "Priorytet",
    z.priorytet_kolejnosc AS "PriorytetKolejnosc",
    z.status AS "Status",
    z.aktywny AS "Aktywny",
    z.data_utworzenia AS "DataUtworzenia",
    z.data_ostatniego_wykonania AS "DataOstatniegoWykonania",
    z.nastepny_termin AS "NastepnyTermin",
    (z.nastepny_termin - CURRENT_DATE) AS "DniDoTerminu",
    CASE
      WHEN z.status = 'zakonczone' THEN false
      WHEN z.typ = 'cykliczne'    THEN true
      WHEN z.typ = 'jednorazowe'  THEN true
      ELSE false
    END AS "Widoczne",
    p.id AS "PracownikId",
    p.full_name AS "PracownikFullName",
    p.email AS "PracownikEmail",
    u.id AS "UtworzonoPrzezId",
    u.full_name AS "UtworzonoPrzezFullName",
    rej_json.rejestracje_json AS "RejestracjeJson",
    rej_dzien.rejestracje AS "RejestracjeDzisiajRaw"
  FROM gospodarcze_zadania z
  JOIN users p ON p.id = z.pracownik_id
  JOIN users u ON u.id = z.utworzono_przez
  LEFT JOIN LATERAL (
    SELECT json_agg(t) AS rejestracje_json
    FROM (
      SELECT r.id AS "Id", r.rejestracja AS "Rejestracja"
      FROM gospodarcze_zadania_rejestracje r
      WHERE r.zadanie_id = z.id
      ORDER BY r.id
    ) t
  ) rej_json ON TRUE
  LEFT JOIN LATERAL (
    SELECT rd.rejestracje
    FROM gospodarcze_rejestracje_dzienne rd
    WHERE rd.zadanie_id = z.id AND rd.data = CURRENT_DATE
    LIMIT 1
  ) rej_dzien ON TRUE
`;

const ORDER_BY_TERMIN = `
  ORDER BY
    CASE WHEN z.status = 'zakonczone' THEN 1 ELSE 0 END,
    z.priorytet_kolejnosc ASC,
    CASE WHEN z.nastepny_termin IS NULL THEN 1 ELSE 0 END,
    z.nastepny_termin ASC,
    CASE z.priorytet WHEN 'Wysoki' THEN 0 WHEN 'Średni' THEN 1 ELSE 2 END
`;

const PRIORYTETY = ['Wysoki', 'Średni', 'Niski'];

// Powiadomienie mailowe do pracownika gospodarczego o nowo przydzielonym
// (lub przepisanym na niego) zadaniu.
async function wyslijPowiadomienieONowymZadaniu(zadanie, przepisane = false) {
  if (!zadanie || !zadanie.PracownikEmail) return;

  const temat = przepisane
    ? `Zadanie przypisane do Ciebie: ${zadanie.Zadanie}`
    : `Nowe zadanie: ${zadanie.Zadanie}`;

  let tresc = przepisane
    ? `Dzień dobry,\n\nZostało Państwu przypisane zadanie gospodarcze.\n\n`
    : `Dzień dobry,\n\nZostało Państwu przydzielone nowe zadanie gospodarcze.\n\n`;
  tresc += `Zadanie: ${zadanie.Zadanie}\n`;
  if (zadanie.Lokalizacja) tresc += `Lokalizacja: ${zadanie.Lokalizacja}\n`;
  tresc += `Priorytet: ${zadanie.Priorytet}\n`;
  tresc += zadanie.Typ === 'cykliczne'
    ? `Rodzaj: cykliczne — powtarza się co ${zadanie.CoIleDni} dni\n`
    : `Rodzaj: jednorazowe\n`;
  if (zadanie.NastepnyTermin) {
    tresc += `Termin: ${new Date(zadanie.NastepnyTermin).toLocaleDateString('pl-PL')}\n`;
  }

  const html = szablonEmail({
    tytul: przepisane ? 'Zadanie przypisane do Państwa' : 'Nowe zadanie gospodarcze',
    preheader: `${zadanie.Zadanie}${zadanie.Lokalizacja ? ' — ' + zadanie.Lokalizacja : ''}`,
    trescHtml: `
      <p style="margin:0 0 12px;">Dzień dobry,</p>
      <p style="margin:0 0 12px;">
        ${przepisane ? 'Zostało Państwu przypisane poniższe zadanie gospodarcze.' : 'Zostało Państwu przydzielone nowe zadanie gospodarcze.'}
      </p>
      ${tabelkaSzczegolow([
        { etykieta: 'Zadanie', wartosc: zadanie.Zadanie },
        { etykieta: 'Lokalizacja', wartosc: zadanie.Lokalizacja },
        { etykieta: 'Priorytet', wartosc: zadanie.Priorytet },
        { etykieta: 'Rodzaj', wartosc: zadanie.Typ === 'cykliczne' ? `Cykliczne — co ${zadanie.CoIleDni} dni` : 'Jednorazowe' },
        { etykieta: 'Termin', wartosc: zadanie.NastepnyTermin ? new Date(zadanie.NastepnyTermin).toLocaleDateString('pl-PL') : null },
      ])}
    `,
  });

  await wyslijMaila({ to: zadanie.PracownikEmail, subject: temat, text: tresc, html });
}

// Wysyla mail do skonfigurowanych odbiorcow (powiadomienia_odbiorcy - ta sama
// tabela co przy zakonczonych robotach warsztatowych), a jesli nikt nie jest
// skonfigurowany - domyslnie do wszystkich uzytkownikow z rola szef/kierownik.
async function wyslijPowiadomienieOZakonczeniuGospodarczym(pool, zadanie, wykonawca, rejestracjeWykonanie) {
  const odbRes = await pool
    .query(
      `SELECT u.email AS "Email", u.full_name AS "FullName" FROM powiadomienia_odbiorcy p
       JOIN users u ON u.id = p.user_id`
    )
    .catch(() => ({ rows: [] }));

  let odbiorcy = odbRes.rows || [];
  if (odbiorcy.length === 0) {
    const domyslni = await pool
      .query(`SELECT email AS "Email", full_name AS "FullName" FROM users WHERE role IN ('szef','kierownik')`)
      .catch(() => ({ rows: [] }));
    odbiorcy = domyslni.rows || [];
  }

  const emaile = odbiorcy.map((u) => u.Email).filter(Boolean);
  if (emaile.length === 0) return;

  const temat = `Zakończono zadanie gospodarcze: ${zadanie.Zadanie}`;
  let tresc =
    `Dzień dobry,\n\n` +
    `Pracownik gospodarczy ${wykonawca || ''} zakończył zadanie.\n\n` +
    `Zadanie: ${zadanie.Zadanie}\n` +
    (zadanie.Lokalizacja ? `Lokalizacja: ${zadanie.Lokalizacja}\n` : '');

  let rejestracjeHtml = '';
  if (Array.isArray(rejestracjeWykonanie) && rejestracjeWykonanie.length > 0) {
    tresc += '\nNumery rejestracyjne:\n';
    for (const r of rejestracjeWykonanie) {
      tresc += `  - ${r.rejestracja || r.rejestracjaId}: ${r.wykonano ? 'wykonano' : 'nie wykonano'}\n`;
    }
    rejestracjeHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0; width:100%; border-collapse:collapse;">
        <tr>
          <th style="text-align:left; padding:6px 12px 6px 0; font-size:12px; color:#6b7280; border-bottom:1px solid #e5e7eb;">Numer rejestracyjny</th>
          <th style="text-align:left; padding:6px 0; font-size:12px; color:#6b7280; border-bottom:1px solid #e5e7eb;">Status</th>
        </tr>
        ${rejestracjeWykonanie
          .map(
            (r) => `
          <tr>
            <td style="padding:6px 12px 6px 0; font-size:13px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(r.rejestracja || r.rejestracjaId)}</td>
            <td style="padding:6px 0; font-size:13px; border-bottom:1px solid #f3f4f6; color:${r.wykonano ? '#166534' : '#b91c1c'};">${r.wykonano ? '✓ Wykonano' : '✗ Nie wykonano'}</td>
          </tr>`
          )
          .join('')}
      </table>`;
  }

  const html = szablonEmail({
    tytul: 'Zakończono zadanie gospodarcze',
    preheader: `${zadanie.Zadanie}${zadanie.Lokalizacja ? ' — ' + zadanie.Lokalizacja : ''}`,
    trescHtml: `
      <p style="margin:0 0 12px;">Dzień dobry,</p>
      <p style="margin:0 0 12px;">Pracownik gospodarczy <strong>${escapeHtml(wykonawca || '')}</strong> zakończył poniższe zadanie.</p>
      ${tabelkaSzczegolow([
        { etykieta: 'Zadanie', wartosc: zadanie.Zadanie },
        { etykieta: 'Lokalizacja', wartosc: zadanie.Lokalizacja },
      ])}
      ${rejestracjeHtml}
    `,
  });

  await wyslijMaila({ to: emaile, subject: temat, text: tresc, html });
}

// GET /api/gospodarcze - wszystkie zadania (widok szefa/kierownika)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(SELECT_ZADANIA + ' WHERE z.aktywny = TRUE ' + ORDER_BY_TERMIN);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zadań gospodarczych.' });
  }
});

// GET /api/gospodarcze/pracownik/:id - zadania konkretnego pracownika
router.get('/pracownik/:id', async (req, res) => {
  try {
    const result = await pool.query(
      SELECT_ZADANIA + ' WHERE z.aktywny = TRUE AND z.pracownik_id = $1 ' + ORDER_BY_TERMIN,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zadań pracownika.' });
  }
});

// GET /api/gospodarcze/:id/historia
router.get('/:id/historia', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         w.id AS "Id", w.data_wykonania AS "DataWykonania", w.data_zapisu AS "DataZapisu",
         u.full_name AS "WykonalFullName",
         rw_json.rejestracje_wykonanie_json AS "RejestracjeWykonanieJson"
       FROM gospodarcze_wykonania w
       LEFT JOIN users u ON u.id = w.wykonal_user_id
       LEFT JOIN LATERAL (
         SELECT json_agg(t) AS rejestracje_wykonanie_json
         FROM (
           SELECT rw.rejestracja_id AS "RejestracjaId", r.rejestracja AS "Rejestracja", rw.wykonano AS "Wykonano"
           FROM gospodarcze_wykonania_rejestracje rw
           JOIN gospodarcze_zadania_rejestracje r ON r.id = rw.rejestracja_id
           WHERE rw.wykonanie_id = w.id
           ORDER BY r.id
         ) t
       ) rw_json ON TRUE
       WHERE w.zadanie_id = $1
       ORDER BY w.data_wykonania DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania historii zadania.' });
  }
});

// GET /api/gospodarcze/:id/rejestracje-dzisiaj
router.get('/:id/rejestracje-dzisiaj', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rejestracje AS "Rejestracje" FROM gospodarcze_rejestracje_dzienne
       WHERE zadanie_id = $1 AND data = CURRENT_DATE
       LIMIT 1`,
      [req.params.id]
    );
    const raw = result.rows[0]?.Rejestracje;
    let rejestracje = [];
    if (raw) {
      try { rejestracje = JSON.parse(raw); } catch { rejestracje = []; }
    }
    res.json({ rejestracje });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania dzisiejszych rejestracji.' });
  }
});

// PUT /api/gospodarcze/:id/rejestracje-dzisiaj
// body: { rejestracje: ["ABC123", "XYZ789", ...] }
router.put('/:id/rejestracje-dzisiaj', async (req, res) => {
  const { rejestracje } = req.body;
  if (!Array.isArray(rejestracje)) {
    return res.status(400).json({ error: 'Podaj listę numerów rejestracyjnych.' });
  }

  try {
    const czyste = rejestracje.map((r) => String(r).trim()).filter(Boolean);

    const existing = await pool.query(
      `SELECT id AS "Id" FROM gospodarcze_rejestracje_dzienne
       WHERE zadanie_id = $1 AND data = CURRENT_DATE`,
      [req.params.id]
    );

    if (existing.rows[0]) {
      await pool.query('UPDATE gospodarcze_rejestracje_dzienne SET rejestracje = $1 WHERE id = $2', [
        JSON.stringify(czyste),
        existing.rows[0].Id,
      ]);
    } else {
      await pool.query(
        `INSERT INTO gospodarcze_rejestracje_dzienne (zadanie_id, data, rejestracje)
         VALUES ($1, CURRENT_DATE, $2)`,
        [req.params.id, JSON.stringify(czyste)]
      );
    }

    const full = await pool.query(SELECT_ZADANIA + ' WHERE z.id = $1', [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania dzisiejszych rejestracji.' });
  }
});

// GET /api/gospodarcze/:id/rejestracje - lista numerow rejestracyjnych przypisanych do zadania
router.get('/:id/rejestracje', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS "Id", rejestracja AS "Rejestracja" FROM gospodarcze_zadania_rejestracje
       WHERE zadanie_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania numerów rejestracyjnych.' });
  }
});

// POST /api/gospodarcze - szef/kierownik dodaje nowe zadanie
router.post('/', async (req, res) => {
  const { zadanie, lokalizacja, typ, coIleDni, priorytet, pracownikId, userId, termin, rejestracje } = req.body;

  if (!zadanie || !typ || !pracownikId || !userId) {
    return res.status(400).json({ error: 'Podaj nazwę zadania, typ, pracownika oraz użytkownika dodającego.' });
  }
  if (typ !== 'jednorazowe' && typ !== 'cykliczne') {
    return res.status(400).json({ error: 'Nieprawidłowy typ zadania.' });
  }
  if (typ === 'cykliczne' && (!coIleDni || Number(coIleDni) <= 0)) {
    return res.status(400).json({ error: 'Dla zadania cyklicznego podaj liczbę dni.' });
  }

  const finalPriorytet = PRIORYTETY.includes(priorytet) ? priorytet : 'Średni';

  const client = await pool.connect();
  try {
    // Cykliczne: termin = dzisiaj (od razu w kalendarzu)
    // Jednorazowe: termin = podany lub NULL
    const initialTermin = typ === 'cykliczne' ? new Date() : (termin ? new Date(termin) : null);

    await client.query('BEGIN');

    // Kolejnosc na koncu listy
    const maxQ = await client.query(
      `SELECT COALESCE(MAX(priorytet_kolejnosc), 0) + 1 AS "NextOrder" FROM gospodarcze_zadania WHERE aktywny = TRUE`
    );
    const nextOrder = maxQ.rows[0].NextOrder;

    const result = await client.query(
      `INSERT INTO gospodarcze_zadania
         (zadanie, lokalizacja, typ, co_ile_dni, dni_wyprzedzenia, priorytet, priorytet_kolejnosc,
          pracownik_id, utworzono_przez, nastepny_termin)
       VALUES
         ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9)
       RETURNING id AS "Id"`,
      [
        zadanie,
        lokalizacja || null,
        typ,
        typ === 'cykliczne' ? Number(coIleDni) : null,
        finalPriorytet,
        nextOrder,
        pracownikId,
        userId,
        initialTermin,
      ]
    );

    const newId = result.rows[0].Id;

    if (Array.isArray(rejestracje) && rejestracje.length > 0) {
      for (const rej of rejestracje) {
        const rejTrim = String(rej || '').trim();
        if (!rejTrim) continue;
        await client.query(
          'INSERT INTO gospodarcze_zadania_rejestracje (zadanie_id, rejestracja) VALUES ($1, $2)',
          [newId, rejTrim]
        );
      }
    }

    await client.query('COMMIT');

    const full = await pool.query(SELECT_ZADANIA + ' WHERE z.id = $1', [newId]);
    const zadanieFull = full.rows[0];

    wyslijPowiadomienieONowymZadaniu(zadanieFull).catch((e) =>
      console.error('[Mail] Blad przy powiadomieniu o nowym zadaniu gospodarczym:', e.message)
    );

    res.status(201).json(zadanieFull);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas dodawania zadania gospodarczego.' });
  } finally {
    client.release();
  }
});

// PUT /api/gospodarcze/:id - edycja zadania
router.put('/:id', async (req, res) => {
  const { zadanie, lokalizacja, coIleDni, priorytet, pracownikId, termin, rejestracje } = req.body;

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT id AS "Id", zadanie AS "Zadanie", lokalizacja AS "Lokalizacja", co_ile_dni AS "CoIleDni",
              priorytet AS "Priorytet", pracownik_id AS "PracownikId", nastepny_termin AS "NastepnyTermin"
       FROM gospodarcze_zadania WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zadania.' });
    }
    const current = existing.rows[0];

    await client.query('BEGIN');

    await client.query(
      `UPDATE gospodarcze_zadania
       SET zadanie = $1, lokalizacja = $2, co_ile_dni = $3,
           priorytet = $4, pracownik_id = $5, nastepny_termin = $6
       WHERE id = $7`,
      [
        zadanie ?? current.Zadanie,
        lokalizacja ?? current.Lokalizacja,
        coIleDni ?? current.CoIleDni,
        PRIORYTETY.includes(priorytet) ? priorytet : current.Priorytet,
        pracownikId ?? current.PracownikId,
        termin !== undefined ? (termin ? new Date(termin) : null) : current.NastepnyTermin,
        req.params.id,
      ]
    );

    if (Array.isArray(rejestracje)) {
      await client.query('DELETE FROM gospodarcze_zadania_rejestracje WHERE zadanie_id = $1', [req.params.id]);
      for (const rej of rejestracje) {
        const rejTrim = String(rej || '').trim();
        if (!rejTrim) continue;
        await client.query(
          'INSERT INTO gospodarcze_zadania_rejestracje (zadanie_id, rejestracja) VALUES ($1, $2)',
          [req.params.id, rejTrim]
        );
      }
    }

    await client.query('COMMIT');

    const full = await pool.query(SELECT_ZADANIA + ' WHERE z.id = $1', [req.params.id]);
    const zadanieFull = full.rows[0];

    const nowyPracownikId = pracownikId !== undefined ? Number(pracownikId) : current.PracownikId;
    if (nowyPracownikId !== current.PracownikId) {
      wyslijPowiadomienieONowymZadaniu(zadanieFull, true).catch((e) =>
        console.error('[Mail] Blad przy powiadomieniu o zmianie przypisania zadania gospodarczego:', e.message)
      );
    }

    res.json(zadanieFull);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas edycji zadania.' });
  } finally {
    client.release();
  }
});

// DELETE /api/gospodarcze/:id - archiwizacja
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE gospodarcze_zadania SET aktywny = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania zadania.' });
  }
});

// PUT /api/gospodarcze/:id/wykonaj - oznaczenie jako wykonane
// body: { dataWykonania, userId, rejestracjeWykonanie? }
router.put('/:id/wykonaj', async (req, res) => {
  const { dataWykonania, userId, rejestracjeWykonanie } = req.body;
  if (!dataWykonania) return res.status(400).json({ error: 'Podaj datę wykonania.' });

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT * FROM gospodarcze_zadania WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zadania.' });
    }
    const task = existing.rows[0];

    // Jesli zadanie ma przypisane numery rejestracyjne, wymagamy statusu dla kazdego z nich.
    const rejRows = await client.query(
      'SELECT id FROM gospodarcze_zadania_rejestracje WHERE zadanie_id = $1',
      [req.params.id]
    );
    if (rejRows.rows.length > 0) {
      const podaneIds = new Set((rejestracjeWykonanie || []).map((r) => Number(r.rejestracjaId)));
      const brakujace = rejRows.rows.filter((r) => !podaneIds.has(r.id));
      if (brakujace.length > 0) {
        return res.status(400).json({ error: 'Zaznacz „Wykonano” lub „Nie wykonano” dla każdego numeru rejestracyjnego.' });
      }
    }

    await client.query('BEGIN');
    try {
      const histResult = await client.query(
        `INSERT INTO gospodarcze_wykonania (zadanie_id, data_wykonania, wykonal_user_id)
         VALUES ($1, $2, $3)
         RETURNING id AS "Id"`,
        [req.params.id, new Date(dataWykonania), userId || null]
      );
      const wykonanieId = histResult.rows[0].Id;

      if (Array.isArray(rejestracjeWykonanie)) {
        for (const r of rejestracjeWykonanie) {
          await client.query(
            `INSERT INTO gospodarcze_wykonania_rejestracje (wykonanie_id, rejestracja_id, wykonano)
             VALUES ($1, $2, $3)`,
            [wykonanieId, Number(r.rejestracjaId), !!r.wykonano]
          );
        }
      }

      if (task.typ === 'jednorazowe') {
        await client.query(
          `UPDATE gospodarcze_zadania
           SET data_ostatniego_wykonania = $1, status = 'zakonczone'
           WHERE id = $2`,
          [new Date(dataWykonania), req.params.id]
        );
      } else {
        // cykliczne: nowy termin = data wykonania + co_ile_dni
        await client.query(
          `UPDATE gospodarcze_zadania
           SET data_ostatniego_wykonania = $1,
               nastepny_termin = ($1::date + ($2 || ' days')::interval)
           WHERE id = $3`,
          [new Date(dataWykonania), task.co_ile_dni, req.params.id]
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    const full = await client.query(SELECT_ZADANIA + ' WHERE z.id = $1', [req.params.id]);
    const zadanieFull = full.rows[0];

    // Powiadomienie mailowe do szefa/kierownika o zakonczonym zadaniu gospodarczym
    (async () => {
      try {
        let wykonawcaFullName = zadanieFull?.PracownikFullName;
        if (userId) {
          const wyk = await pool.query('SELECT full_name AS "FullName" FROM users WHERE id = $1', [userId]);
          if (wyk.rows[0]) wykonawcaFullName = wyk.rows[0].FullName;
        }

        let rejestracjeZTekstem = null;
        if (Array.isArray(rejestracjeWykonanie) && rejestracjeWykonanie.length > 0) {
          const rejList = await pool.query(
            'SELECT id AS "Id", rejestracja AS "Rejestracja" FROM gospodarcze_zadania_rejestracje WHERE zadanie_id = $1',
            [req.params.id]
          );
          const mapaRej = new Map(rejList.rows.map((r) => [r.Id, r.Rejestracja]));
          rejestracjeZTekstem = rejestracjeWykonanie.map((r) => ({
            rejestracjaId: r.rejestracjaId,
            rejestracja: mapaRej.get(Number(r.rejestracjaId)),
            wykonano: r.wykonano,
          }));
        }

        await wyslijPowiadomienieOZakonczeniuGospodarczym(pool, zadanieFull, wykonawcaFullName, rejestracjeZTekstem);
      } catch (e) {
        console.error('[Mail] Blad przy powiadomieniu o zadaniu gospodarczym:', e.message);
      }
    })();

    res.json(zadanieFull);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas oznaczania zadania jako wykonanego.' });
  } finally {
    client.release();
  }
});

// PUT /api/gospodarcze/:id/kolejnosc - szef/kierownik zmienia kolejnosc zadania
router.put('/:id/kolejnosc', async (req, res) => {
  const { direction } = req.body;
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'Nieprawidłowy kierunek zmiany kolejności.' });
  }

  const client = await pool.connect();
  try {
    const queue = await client.query(
      `SELECT id AS "Id", priorytet_kolejnosc AS "PriorytetKolejnosc" FROM gospodarcze_zadania
       WHERE aktywny = TRUE AND status <> 'zakonczone'
       ORDER BY priorytet_kolejnosc ASC, id ASC`
    );
    const list = queue.rows;
    const index = list.findIndex((z) => z.Id === Number(req.params.id));

    if (index === -1) {
      return res.status(404).json({ error: 'Nie znaleziono zadania lub jest ono już zakończone.' });
    }

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) {
      const full = await client.query(SELECT_ZADANIA + ' WHERE z.id = $1', [req.params.id]);
      return res.json(full.rows[0]);
    }

    const current = list[index];
    const neighbor = list[swapIndex];

    await client.query('BEGIN');
    try {
      await client.query('UPDATE gospodarcze_zadania SET priorytet_kolejnosc = $1 WHERE id = $2', [
        neighbor.PriorytetKolejnosc,
        current.Id,
      ]);
      await client.query('UPDATE gospodarcze_zadania SET priorytet_kolejnosc = $1 WHERE id = $2', [
        current.PriorytetKolejnosc,
        neighbor.Id,
      ]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    const full = await client.query(SELECT_ZADANIA + ' WHERE z.id = $1', [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zmiany kolejności.' });
  } finally {
    client.release();
  }
});

module.exports = router;
