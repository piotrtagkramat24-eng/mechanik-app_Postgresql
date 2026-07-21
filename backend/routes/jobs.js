const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { wyslijMaila, szablonEmail, escapeHtml, tabelkaSzczegolow } = require('../mail');
const { utworzZadaniaPoNaprawie, TYP_LABELS } = require('./followup');

// Wspolny fragment zapytania - laczy Joby z danymi auta i mechanika,
// zeby frontend nie musial doklejac tych danych samodzielnie.
// Szacowany czas (CzasSzacowanyMin/Sredni/Max) jest SUMA czasow wszystkich
// czynnosci dopisanych do zlecenia w job_czynnosci (patrz JobCzynnosci) —
// dzieki temu automatycznie rosnie, gdy ktos dopisze kolejna czynnosc.
// Dla zlecen bez wpisow w job_czynnosci (nie powinno sie zdarzac, ale na
// wszelki wypadek) spada z powrotem na stare kolumny w jobs.
const SELECT_JOBS = `
  SELECT
    j.id AS "Id",
    j.opis AS "Opis",
    j.opis_wykonania AS "OpisWykonania",
    j.status AS "Status",
    j.priorytet AS "Priorytet",
    j.data_utworzenia AS "DataUtworzenia",
    j.data_przydzielenia AS "DataPrzydzielenia",
    j.data_rozpoczecia AS "DataRozpoczecia",
    j.data_zakonczenia AS "DataZakonczenia",
    j.predefiniowana_praca_id AS "PredefiniowanaPracaId",
    COALESCE(jc_agg.suma_czas_min, j.czas_szacowany_min) AS "CzasSzacowanyMin",
    COALESCE(jc_agg.suma_czas_sredni, j.czas_szacowany_sredni) AS "CzasSzacowanySredni",
    COALESCE(jc_agg.suma_czas_max, j.czas_szacowany_max) AS "CzasSzacowanyMax",
    COALESCE(jc_agg.liczba_czynnosci, 0) AS "LiczbaCzynnosci",
    jc_json.czynnosci_json AS "CzynnosciJson",
    CASE WHEN j.zdjecie_wykonania IS NOT NULL THEN true ELSE false END AS "MaZdjecie",
    c.id AS "CarId",
    c.marka AS "Marka",
    c.model AS "Model",
    c.rejestracja AS "Rejestracja",
    c.typ_pojazdu AS "TypPojazdu",
    c.kategoria AS "Kategoria",
    m.id AS "MechanikId",
    m.full_name AS "MechanikFullName",
    m.email AS "MechanikEmail",
    m.godz_tydz_od AS "MechGodzTydzOd",
    m.godz_tydz_do AS "MechGodzTydzDo",
    m.godz_tydz_przerwa_od AS "MechGodzTydzPrzerwaOd",
    m.godz_tydz_przerwa_min AS "MechGodzTydzPrzerwaMin",
    m.godz_sob_od AS "MechGodzSobOd",
    m.godz_sob_do AS "MechGodzSobDo",
    m.godz_sob_przerwa_od AS "MechGodzSobPrzerwaOd",
    m.godz_sob_przerwa_min AS "MechGodzSobPrzerwaMin",
    u.full_name AS "UtworzonoPrzezFullName"
  FROM jobs j
  JOIN cars c ON c.id = j.car_id
  LEFT JOIN users m ON m.id = j.mechanik_id
  JOIN users u ON u.id = j.utworzono_przez
  LEFT JOIN LATERAL (
    SELECT
      SUM(jc.czas_min) AS suma_czas_min,
      SUM(jc.czas_sredni) AS suma_czas_sredni,
      SUM(jc.czas_max) AS suma_czas_max,
      COUNT(*) AS liczba_czynnosci
    FROM job_czynnosci jc
    WHERE jc.job_id = j.id
  ) jc_agg ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(t) AS czynnosci_json
    FROM (
      SELECT
        jc2.id AS "Id", jc2.nazwa AS "Nazwa", jc2.czas_min AS "CzasMin",
        jc2.czas_sredni AS "CzasSredni", jc2.czas_max AS "CzasMax",
        jc2.predefiniowana_praca_id AS "PredefiniowanaPracaId",
        jc2.status AS "Status", jc2.data_rozpoczecia AS "DataRozpoczecia",
        jc2.data_zakonczenia AS "DataZakonczenia"
      FROM job_czynnosci jc2
      WHERE jc2.job_id = j.id
      ORDER BY jc2.id
    ) t
  ) jc_json ON TRUE
`;

// Aktywne (niezakonczone) roboty sortowane wg Priorytet (kolejnosc ustawiona
// przez kierownika), zakonczone na koniec, sortowane od najnowiej zakonczonych.
const ORDER_BY_QUEUE = `
  ORDER BY
    CASE WHEN j.status = 'zakonczone' THEN 1 ELSE 0 END,
    j.priorytet ASC,
    j.data_zakonczenia DESC
`;

// GET /api/jobs - wszystkie roboty (widok szefa i kierownika)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(SELECT_JOBS + ORDER_BY_QUEUE);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania listy robót.' });
  }
});

// GET /api/jobs/mechanik/:id - roboty przydzielone konkretnemu mechanikowi
router.get('/mechanik/:id', async (req, res) => {
  try {
    const result = await pool.query(
      SELECT_JOBS + ' WHERE j.mechanik_id = $1 ' + ORDER_BY_QUEUE,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania robót mechanika.' });
  }
});

// POST /api/jobs - szef/kierownik dodaje nowa robote do istniejacego auta
// body: { carId, userId, czynnosci: [{ predefiniowanaPracaId?, nazwa, czasMin?, czasSredni?, czasMax? }, ...] }
router.post('/', async (req, res) => {
  const { carId, userId, czynnosci } = req.body;

  if (!carId || !userId || !Array.isArray(czynnosci) || czynnosci.length === 0) {
    return res.status(400).json({ error: 'Podaj samochód, użytkownika oraz przynajmniej jedną czynność lub opis.' });
  }
  for (const cz of czynnosci) {
    if (!cz || !String(cz.nazwa || '').trim()) {
      return res.status(400).json({ error: 'Każda czynność musi mieć podaną nazwę lub opis.' });
    }
    if (!cz.predefiniowanaPracaId && (cz.czasSredni === undefined || cz.czasSredni === null || cz.czasSredni === '')) {
      return res.status(400).json({ error: `Podaj przewidywany czas wykonania dla własnej czynności „${cz.nazwa}”.` });
    }
  }

  const client = await pool.connect();
  try {
    const opisZbiorczy = czynnosci.map((c) => String(c.nazwa).trim()).join(', ').slice(0, 500);

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO jobs (car_id, opis, utworzono_przez, priorytet)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(priorytet), 0) + 1 FROM jobs))
       RETURNING id AS "Id"`,
      [carId, opisZbiorczy, userId]
    );
    const newId = result.rows[0].Id;

    for (const cz of czynnosci) {
      await client.query(
        `INSERT INTO job_czynnosci (job_id, predefiniowana_praca_id, nazwa, czas_min, czas_sredni, czas_max, dodane_przez)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId,
          cz.predefiniowanaPracaId || null,
          String(cz.nazwa).trim(),
          cz.czasMin ?? null,
          cz.czasSredni ?? null,
          cz.czasMax ?? null,
          userId,
        ]
      );
    }

    await client.query('COMMIT');

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [newId]);
    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas dodawania roboty.' });
  } finally {
    client.release();
  }
});

// POST /api/jobs/:id/czynnosci - dopisz kolejna czynnosc do JUZ ISTNIEJACEGO zlecenia
router.post('/:id/czynnosci', async (req, res) => {
  const { predefiniowanaPracaId, nazwa, czasMin, czasSredni, czasMax, userId } = req.body;

  try {
    let finalNazwa = String(nazwa || '').trim();
    let cMin = czasMin ?? null;
    let cSredni = czasSredni ?? null;
    let cMax = czasMax ?? null;

    if (predefiniowanaPracaId) {
      const pr = await pool.query(
        'SELECT nazwa AS "Nazwa", czas_min AS "CzasMin", czas_sredni AS "CzasSredni", czas_max AS "CzasMax" FROM predefiniowane_prace WHERE id = $1',
        [predefiniowanaPracaId]
      );
      if (pr.rows[0]) {
        finalNazwa = pr.rows[0].Nazwa;
        cMin = pr.rows[0].CzasMin;
        cSredni = pr.rows[0].CzasSredni;
        cMax = pr.rows[0].CzasMax;
      }
    }

    if (!finalNazwa) {
      return res.status(400).json({ error: 'Podaj opis czynności lub wybierz pozycję z listy predefiniowanych prac.' });
    }
    if (!predefiniowanaPracaId && (cSredni === undefined || cSredni === null || cSredni === '')) {
      return res.status(400).json({ error: 'Podaj przewidywany czas wykonania dla własnej czynności.' });
    }

    await pool.query(
      `INSERT INTO job_czynnosci (job_id, predefiniowana_praca_id, nazwa, czas_min, czas_sredni, czas_max, dodane_przez)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, predefiniowanaPracaId || null, finalNazwa, cMin, cSredni, cMax, userId || null]
    );

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);

    if (!full.rows[0]) return res.status(404).json({ error: 'Nie znaleziono roboty.' });
    res.status(201).json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas dodawania czynności.' });
  }
});

// DELETE /api/jobs/:id/czynnosci/:czynnoscId - usuwa pojedyncza czynnosc ze zlecenia
router.delete('/:id/czynnosci/:czynnoscId', async (req, res) => {
  try {
    await pool.query('DELETE FROM job_czynnosci WHERE id = $1 AND job_id = $2', [
      req.params.czynnoscId,
      req.params.id,
    ]);

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);

    if (!full.rows[0]) return res.status(404).json({ error: 'Nie znaleziono roboty.' });
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania czynności.' });
  }
});

// PUT /api/jobs/:id/assign - kierownik przydziela mechanika do roboty
router.put('/:id/assign', async (req, res) => {
  const { mechanikId } = req.body;

  if (!mechanikId) {
    return res.status(400).json({ error: 'Wybierz mechanika.' });
  }

  try {
    await pool.query(
      `UPDATE jobs
       SET mechanik_id = $1,
           status = 'przydzielone',
           data_przydzielenia = now()
       WHERE id = $2`,
      [mechanikId, req.params.id]
    );

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);
    const job = full.rows[0];

    wyslijPowiadomienieOPrzydzieleniu(job).catch((e) =>
      console.error('[Mail] Blad przy powiadomieniu o przydzieleniu roboty:', e.message)
    );

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas przydzielania mechanika.' });
  }
});

// Wspolna logika uruchamiana, gdy CALE zlecenie przechodzi w status 'zakonczone'
async function obsluzZakonczenieRoboty(job) {
  if (!job) return;
  let przypisaniaPoNaprawie = [];
  try {
    przypisaniaPoNaprawie = await utworzZadaniaPoNaprawie(pool, job.Id);
  } catch (e) {
    console.error('[ZadaniaPoNaprawie] Blad tworzenia:', e.message);
  }
  wyslijPowiadomienieOZakonczeniu(pool, job).catch((e) =>
    console.error('[Mail] Blad przy przygotowaniu powiadomienia:', e.message)
  );
  if (przypisaniaPoNaprawie.length > 0) {
    wyslijPowiadomieniaOZadaniachPoNaprawie(job, przypisaniaPoNaprawie).catch((e) =>
      console.error('[Mail] Blad przy powiadomieniu o zadaniach po naprawie:', e.message)
    );
  }
}

// PUT /api/jobs/:id/status - mechanik zmienia status swojej roboty (calego zlecenia na raz)
router.put('/:id/status', async (req, res) => {
  const { status, opisWykonania, zdjecie } = req.body;
  const dozwolone = ['rozpoczete', 'zakonczone'];

  if (!dozwolone.includes(status)) {
    return res.status(400).json({ error: 'Nieprawidłowy status.' });
  }

  const dataKolumna = status === 'rozpoczete' ? 'data_rozpoczecia' : 'data_zakonczenia';

  try {
    let dodatkoweSet = '';
    const params = [status, req.params.id];
    if (status === 'zakonczone') {
      if (opisWykonania !== undefined) {
        params.push(opisWykonania || null);
        dodatkoweSet += `, opis_wykonania = $${params.length}`;
      }
      if (zdjecie !== undefined) {
        params.push(zdjecie || null);
        dodatkoweSet += `, zdjecie_wykonania = $${params.length}`;
      }
    }

    await pool.query(
      `UPDATE jobs
       SET status = $1,
           ${dataKolumna} = now()${dodatkoweSet}
       WHERE id = $2`,
      params
    );

    if (status === 'rozpoczete') {
      await pool.query(
        `UPDATE job_czynnosci SET status = 'rozpoczete', data_rozpoczecia = COALESCE(data_rozpoczecia, now())
         WHERE job_id = $1 AND status = 'oczekuje'`,
        [req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE job_czynnosci SET status = 'zakonczone', data_zakonczenia = COALESCE(data_zakonczenia, now())
         WHERE job_id = $1 AND status <> 'zakonczone'`,
        [req.params.id]
      );
    }

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);
    const job = full.rows[0];

    if (status === 'zakonczone' && job) {
      await obsluzZakonczenieRoboty(job);
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zmiany statusu.' });
  }
});

// PUT /api/jobs/:id/czynnosci/:czynnoscId/status - start/koniec pojedynczej czynnosci
router.put('/:id/czynnosci/:czynnoscId/status', async (req, res) => {
  const { status, opisWykonania, zdjecie } = req.body;
  if (!['rozpoczete', 'zakonczone'].includes(status)) {
    return res.status(400).json({ error: 'Nieprawidłowy status czynności.' });
  }

  try {
    if (status === 'rozpoczete') {
      await pool.query(
        `UPDATE job_czynnosci
         SET status = 'rozpoczete', data_rozpoczecia = COALESCE(data_rozpoczecia, now())
         WHERE id = $1 AND job_id = $2`,
        [req.params.czynnoscId, req.params.id]
      );
      await pool.query(
        `UPDATE jobs SET status = 'rozpoczete', data_rozpoczecia = COALESCE(data_rozpoczecia, now())
         WHERE id = $1 AND status = 'przydzielone'`,
        [req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE job_czynnosci SET status = 'zakonczone', data_zakonczenia = now()
         WHERE id = $1 AND job_id = $2`,
        [req.params.czynnoscId, req.params.id]
      );

      const pozostale = await pool.query(
        `SELECT COUNT(*) AS c FROM job_czynnosci WHERE job_id = $1 AND status <> 'zakonczone'`,
        [req.params.id]
      );

      if (Number(pozostale.rows[0].c) === 0) {
        await pool.query(
          `UPDATE jobs
           SET status = 'zakonczone', data_zakonczenia = now(),
               opis_wykonania = $1, zdjecie_wykonania = $2
           WHERE id = $3`,
          [opisWykonania || null, zdjecie || null, req.params.id]
        );
      }
    }

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);

    const job = full.rows[0];
    if (!job) return res.status(404).json({ error: 'Nie znaleziono roboty.' });

    if (status === 'zakonczone' && job.Status === 'zakonczone') {
      await obsluzZakonczenieRoboty(job);
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zmiany statusu czynności.' });
  }
});

// GET /api/jobs/:id/zdjecie
router.get('/:id/zdjecie', async (req, res) => {
  try {
    const result = await pool.query('SELECT zdjecie_wykonania AS "ZdjecieWykonania" FROM jobs WHERE id = $1', [
      req.params.id,
    ]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Nie znaleziono roboty.' });
    res.json({ zdjecie: result.rows[0].ZdjecieWykonania || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zdjęcia.' });
  }
});

// PUT /api/jobs/:id - edycja krotkiego podsumowania zlecenia (Opis)
router.put('/:id', async (req, res) => {
  const { opis } = req.body;

  if (!opis || !opis.trim()) {
    return res.status(400).json({ error: 'Opis roboty nie może być pusty.' });
  }

  try {
    await pool.query('UPDATE jobs SET opis = $1 WHERE id = $2', [opis.trim(), req.params.id]);

    const full = await pool.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);

    if (!full.rows[0]) return res.status(404).json({ error: 'Nie znaleziono roboty.' });
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas edycji roboty.' });
  }
});

// DELETE /api/jobs/:id - trwale usuniecie roboty
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Nie znaleziono roboty.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania roboty.' });
  }
});

// Powiadomienie mailowe do mechanika, ktoremu kierownik przydzielil nowa robote.
async function wyslijPowiadomienieOPrzydzieleniu(job) {
  if (!job || !job.MechanikEmail) return;

  const temat = `Nowe zlecenie: ${job.Marka} ${job.Model} (${job.Rejestracja})`;
  const tresc =
    `Dzień dobry,\n\n` +
    `Zostali Państwo przydzieleni do nowego zlecenia serwisowego.\n\n` +
    `Pojazd: ${job.Marka} ${job.Model} (${job.Rejestracja})\n` +
    `Opis zlecenia: ${job.Opis}\n`;

  const html = szablonEmail({
    tytul: 'Nowe zlecenie serwisowe',
    preheader: `Przydzielono nowe zlecenie: ${job.Marka} ${job.Model} (${job.Rejestracja})`,
    trescHtml: `
      <p style="margin:0 0 12px;">Dzień dobry,</p>
      <p style="margin:0 0 12px;">Zostali Państwo przydzieleni do nowego zlecenia serwisowego. Poniżej szczegóły:</p>
      ${tabelkaSzczegolow([
        { etykieta: 'Pojazd', wartosc: `${job.Marka} ${job.Model}` },
        { etykieta: 'Rejestracja', wartosc: job.Rejestracja },
        { etykieta: 'Opis zlecenia', wartosc: job.Opis },
      ])}
      <p style="margin:16px 0 0;">Szczegóły oraz listę czynności do wykonania znajdą Państwo w systemie ewidencji.</p>
    `,
  });

  await wyslijMaila({ to: job.MechanikEmail, subject: temat, text: tresc, html });
}

// Powiadomienia mailowe do mechanikow automatycznie przydzielonych do zadan po naprawie
async function wyslijPowiadomieniaOZadaniachPoNaprawie(job, przypisania) {
  for (const p of przypisania) {
    if (!p.email) continue;
    const label = TYP_LABELS[p.typ] || p.typ;
    const temat = `Nowe zadanie po naprawie: ${label} — ${job.Marka} ${job.Model} (${job.Rejestracja})`;
    const tresc =
      `Dzień dobry,\n\n` +
      `Zostali Państwo przydzieleni do zadania „${label}” po zakończonej naprawie.\n\n` +
      `Pojazd: ${job.Marka} ${job.Model} (${job.Rejestracja})\n` +
      `Opis roboty: ${job.Opis}\n`;

    const html = szablonEmail({
      tytul: `Nowe zadanie po naprawie: ${label}`,
      preheader: `Zadanie „${label}” dla pojazdu ${job.Marka} ${job.Model} (${job.Rejestracja})`,
      trescHtml: `
        <p style="margin:0 0 12px;">Dzień dobry,</p>
        <p style="margin:0 0 12px;">Zostali Państwo przydzieleni do zadania <strong>„${escapeHtml(label)}”</strong> po zakończonej naprawie pojazdu.</p>
        ${tabelkaSzczegolow([
          { etykieta: 'Pojazd', wartosc: `${job.Marka} ${job.Model}` },
          { etykieta: 'Rejestracja', wartosc: job.Rejestracja },
          { etykieta: 'Opis roboty', wartosc: job.Opis },
        ])}
      `,
    });

    await wyslijMaila({ to: p.email, subject: temat, text: tresc, html });
  }
}

// Wysyla mail do skonfigurowanych odbiorcow (powiadomienia_odbiorcy), a jesli nikt
// nie jest skonfigurowany - domyslnie do wszystkich uzytkownikow z rola szef/kierownik.
async function wyslijPowiadomienieOZakonczeniu(pool, job) {
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

  const dalszeKroki = Object.values(TYP_LABELS).join(', ');
  const temat = `Zakończono robotę: ${job.Marka} ${job.Model} (${job.Rejestracja})`;
  const tresc =
    `Dzień dobry,\n\n` +
    `Mechanik ${job.MechanikFullName || ''} zakończył robotę.\n\n` +
    `Pojazd: ${job.Marka} ${job.Model} (${job.Rejestracja})\n` +
    `Opis roboty: ${job.Opis}\n` +
    (job.OpisWykonania ? `Uwagi do zgłoszenia: ${job.OpisWykonania}\n` : '') +
    `\nPojazd jest mechanicznie gotowy. Do wykonania pozostaje jeszcze: ${dalszeKroki}.\n`;

  const html = szablonEmail({
    tytul: 'Zakończono robotę',
    preheader: `${job.Marka} ${job.Model} (${job.Rejestracja}) — robota zakończona`,
    trescHtml: `
      <p style="margin:0 0 12px;">Dzień dobry,</p>
      <p style="margin:0 0 12px;">Mechanik <strong>${escapeHtml(job.MechanikFullName || '')}</strong> zakończył poniższą robotę.</p>
      ${tabelkaSzczegolow([
        { etykieta: 'Pojazd', wartosc: `${job.Marka} ${job.Model}` },
        { etykieta: 'Rejestracja', wartosc: job.Rejestracja },
        { etykieta: 'Opis roboty', wartosc: job.Opis },
        { etykieta: 'Uwagi do zgłoszenia', wartosc: job.OpisWykonania },
      ])}
      <p style="margin:16px 0 0; padding:12px; background-color:#f0fdf4; border-radius:6px; color:#166534;">
        Pojazd jest mechanicznie gotowy. Do wykonania pozostaje jeszcze: <strong>${escapeHtml(dalszeKroki)}</strong>.
      </p>
    `,
  });

  await wyslijMaila({ to: emaile, subject: temat, text: tresc, html });
}

// PUT /api/jobs/:id/priority - kierownik zmienia kolejnosc wykonania roboty
router.put('/:id/priority', async (req, res) => {
  const { direction } = req.body;

  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'Nieprawidłowy kierunek zmiany kolejności.' });
  }

  const client = await pool.connect();
  try {
    const queue = await client.query(
      `SELECT id AS "Id", priorytet AS "Priorytet" FROM jobs
       WHERE status <> 'zakonczone'
       ORDER BY priorytet ASC, id ASC`
    );

    const list = queue.rows;
    const index = list.findIndex((j) => j.Id === Number(req.params.id));

    if (index === -1) {
      return res.status(404).json({ error: 'Nie znaleziono roboty lub jest ona już zakończona.' });
    }

    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= list.length) {
      const full = await client.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);
      return res.json(full.rows[0]);
    }

    const current = list[index];
    const neighbor = list[swapIndex];

    await client.query('BEGIN');
    try {
      await client.query('UPDATE jobs SET priorytet = $1 WHERE id = $2', [neighbor.Priorytet, current.Id]);
      await client.query('UPDATE jobs SET priorytet = $1 WHERE id = $2', [current.Priorytet, neighbor.Id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    const full = await client.query(SELECT_JOBS + ' WHERE j.id = $1', [req.params.id]);

    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zmiany kolejności.' });
  } finally {
    client.release();
  }
});

module.exports = router;
