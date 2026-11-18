const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');

const ZARZADZA_WARSZTATEM = requireRole('szef', 'kierownik', 'superadmin');
// Ustawienia (przypisania typow zadan po naprawie, odbiorcy powiadomien
// mailowych) sa w UI dostepne wylacznie dla superadmina (UstawieniaPanel.jsx).
const TYLKO_SUPERADMIN = requireRole('superadmin');

// Wyposazenie i Inspecto sa teraz JEDNYM zadaniem (typ 'wyposazenie', etykieta
// "Wyposażenie + Inspecto") - poprzednio byly dwoma osobnymi typami, ktore
// mozna bylo przypisac do roznych osob; patrz migracja 13d w schema.sql.
const TYPY = ['wyposazenie', 'mycie'];
const TYP_LABELS = { wyposazenie: 'Wyposażenie + Inspecto', mycie: 'Mycie' };

// Zwraca wszystkie reczne przypisania typ -> osoba. Jeden typ może mieć
// kilka osob; tabela dalsze_kroki_przypisania przechowuje po jednym wierszu
// dla każdej pary (typ, user_id).
async function pobierzPrzypisania(pool) {
  const wynik = await pool.query(`
    SELECT dkp.typ AS "Typ", u.id AS "Id", u.full_name AS "FullName", u.email AS "Email",
           u.na_urlopie AS "NaUrlopie"
    FROM dalsze_kroki_przypisania dkp
    JOIN users u ON u.id = dkp.user_id
    ORDER BY dkp.typ, u.full_name
  `);
  return wynik.rows;
}

// Tworzy zadania "po naprawie" dla wszystkich przypisanych osób każdego typu.
// Jeśli osoba jest na urlopie, zadanie trafia do mechanika, który zakończył robotę.
async function utworzZadaniaPoNaprawie(pool, job) {
  const jobId = job.Id;
  const wykonawcaId = job.MechanikId || null;
  const przypisania = await pobierzPrzypisania(pool);
  const utworzone = [];
  const utworzoneKlucze = new Set();

  for (const p of przypisania) {
    let odbiorcaId = p.Id;
    let odbiorcaFullName = p.FullName;
    let odbiorcaEmail = p.Email;

    if (p.NaUrlopie && wykonawcaId) {
      odbiorcaId = wykonawcaId;
      odbiorcaFullName = job.MechanikFullName;
      odbiorcaEmail = job.MechanikEmail;
    }

    const klucz = `${p.Typ}:${odbiorcaId}`;
    if (utworzoneKlucze.has(klucz)) continue;

    await pool.query(
      `INSERT INTO zadania_po_naprawie (job_id, typ, user_id) VALUES ($1, $2, $3)`,
      [jobId, p.Typ, odbiorcaId]
    );
    utworzoneKlucze.add(klucz);
    utworzone.push({ typ: p.Typ, userId: odbiorcaId, fullName: odbiorcaFullName, email: odbiorcaEmail });
  }
  return utworzone;
}

// GET /api/followup/podsumowanie
router.get('/podsumowanie', ZARZADZA_WARSZTATEM, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT user_id AS "UserId", typ AS "Typ", COUNT(*) AS "Liczba"
      FROM zadania_po_naprawie
      WHERE wykonano = FALSE
      GROUP BY user_id, typ
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania podsumowania.' });
  }
});

// GET /api/followup/wszystkie
router.get('/wszystkie', ZARZADZA_WARSZTATEM, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        z.id AS "Id", z.typ AS "Typ", z.user_id AS "UserId", z.wykonano AS "Wykonano",
        z.data_utworzenia AS "DataUtworzenia",
        j.id AS "JobId", j.opis AS "Opis",
        c.marka AS "Marka", c.model AS "Model", c.rejestracja AS "Rejestracja"
      FROM zadania_po_naprawie z
      JOIN jobs j ON j.id = z.job_id
      JOIN cars c ON c.id = j.car_id
      WHERE z.wykonano = FALSE
      ORDER BY z.data_utworzenia ASC
    `);
    res.json(result.rows.map((r) => ({ ...r, TypLabel: TYP_LABELS[r.Typ] || r.Typ })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zadań po naprawie.' });
  }
});

// GET /api/followup/moje/:userId - WYLACZNIE wlasne zadania. Frontend
// (FollowUpPanel.jsx) zawsze woła to z user.Id zalogowanej osoby, wiec bez
// tej kontroli dowolny zalogowany mechanik mogl podac cudze :userId i
// zobaczyc czyjas prywatna liste zadan po naprawie.
router.get('/moje/:userId', (req, res, next) => {
  if (String(req.user.id) !== String(req.params.userId)) {
    return res.status(403).json({ error: 'Brak uprawnień do podglądu zadań innej osoby.' });
  }
  next();
}, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         z.id AS "Id", z.typ AS "Typ", z.wykonano AS "Wykonano", z.data_utworzenia AS "DataUtworzenia",
         j.id AS "JobId", j.opis AS "Opis",
         c.marka AS "Marka", c.model AS "Model", c.rejestracja AS "Rejestracja"
       FROM zadania_po_naprawie z
       JOIN jobs j ON j.id = z.job_id
       JOIN cars c ON c.id = j.car_id
       WHERE z.user_id = $1 AND z.wykonano = FALSE
       ORDER BY z.data_utworzenia ASC`,
      [req.params.userId]
    );
    res.json(result.rows.map((r) => ({ ...r, TypLabel: TYP_LABELS[r.Typ] || r.Typ })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania zadań po naprawie.' });
  }
});

// PUT /api/followup/:id/wykonaj - WYLACZNIE wlasne zadanie. W obecnym UI
// (FollowUpPanel.jsx) kazdy konczy tylko to, co widzi na wlasnej liscie, ale
// bez tej kontroli dowolny mechanik mogl podac cudze :id i oznaczyc komus
// innemu zadanie jako wykonane.
router.put('/:id/wykonaj', requireRole('szef', 'kierownik', 'superadmin', 'mechanik'), async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT user_id AS "UserId" FROM zadania_po_naprawie WHERE id = $1',
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zadania.' });
    }
    if (String(existing.rows[0].UserId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'To zadanie jest przypisane do kogoś innego.' });
    }

    await pool.query(
      `UPDATE zadania_po_naprawie SET wykonano = TRUE, data_wykonania = now() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas oznaczania zadania.' });
  }
});

// DELETE /api/followup/:id - kierownik/szef usuwa zadanie po naprawie z
// tablicy mechanikow (np. gdy zostalo utworzone przez pomylke albo juz nie
// jest potrzebne) - do tej pory nie bylo mozliwosci go usunac.
router.delete('/:id', ZARZADZA_WARSZTATEM, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM zadania_po_naprawie WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Nie znaleziono zadania.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas usuwania zadania.' });
  }
});

// GET /api/followup/status-zlecenia - status (wykonano/nie) WSZYSTKICH zadan
// po naprawie (w odroznieniu od /wszystkie, ktore zwraca TYLKO niewykonane).
// Uzywane przez tablice mechanikow do pokazania na karcie JUZ ZAKONCZONEGO
// zlecenia, czy Wyposazenie / Inspecto / Mycie zostaly wykonane przez mechanika,
// czy jeszcze na niego czekaja - inaczej ta informacja znikala calkowicie po
// wykonaniu zadania (bo /wszystkie i /moje/:userId celowo pokazuja tylko to,
// co jeszcze trzeba zrobic).
router.get('/status-zlecenia', ZARZADZA_WARSZTATEM, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT job_id AS "JobId", typ AS "Typ", wykonano AS "Wykonano", data_wykonania AS "DataWykonania"
      FROM zadania_po_naprawie
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania statusu zadań po naprawie.' });
  }
});

// GET /api/followup/powiadomienia
router.get('/powiadomienia', TYLKO_SUPERADMIN, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id AS "Id", u.full_name AS "FullName", u.role AS "Role",
        CASE WHEN p.id IS NULL THEN false ELSE true END AS "Aktywny"
      FROM users u
      LEFT JOIN powiadomienia_odbiorcy p ON p.user_id = u.id
      WHERE u.role IN ('szef','kierownik')
      ORDER BY u.full_name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania odbiorców powiadomień.' });
  }
});

// GET /api/followup/przypisania - aktualne przypisania wielu osób do każdego typu.
router.get('/przypisania', TYLKO_SUPERADMIN, async (req, res) => {
  try {
    const przypisania = await pobierzPrzypisania(pool);
    res.json(TYPY.map((typ) => {
      const osoby = przypisania.filter((p) => p.Typ === typ);
      return {
        Typ: typ,
        TypLabel: TYP_LABELS[typ] || typ,
        UserIds: osoby.map((p) => p.Id),
        Users: osoby.map((p) => ({ Id: p.Id, FullName: p.FullName })),
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania przypisań zadań po naprawie.' });
  }
});

// PUT /api/followup/przypisania - body: { typ, userIds: [1,2,...] }.
// Dopuszczamy też legacy body { typ, userId }, dla kompatybilności klienta.
router.put('/przypisania', TYLKO_SUPERADMIN, async (req, res) => {
  const { typ } = req.body || {};
  let userIds = Array.isArray(req.body?.userIds)
    ? req.body.userIds
    : (req.body?.userId ? [req.body.userId] : []);
  userIds = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (!TYPY.includes(typ)) {
    return res.status(400).json({ error: 'Nieprawidłowy typ zadania po naprawie.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dalsze_kroki_przypisania WHERE typ = $1', [typ]);
    for (const userId of userIds) {
      await client.query(
        'INSERT INTO dalsze_kroki_przypisania (typ, user_id) VALUES ($1, $2)',
        [typ, userId]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania przypisań.' });
  } finally {
    client.release();
  }
});

// PUT /api/followup/powiadomienia - body: { userIds: [1,2,...] }
router.put('/powiadomienia', TYLKO_SUPERADMIN, async (req, res) => {
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM powiadomienia_odbiorcy');
    for (const userId of userIds) {
      await client.query('INSERT INTO powiadomienia_odbiorcy (user_id) VALUES ($1)', [userId]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania odbiorców powiadomień.' });
  } finally {
    client.release();
  }
});

module.exports = { router, utworzZadaniaPoNaprawie, TYP_LABELS, TYPY };
