const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const TYPY = ['wyposazenie_inspecto', 'mycie'];
const TYP_LABELS = { wyposazenie_inspecto: 'Wyposażenie i Inspecto', mycie: 'Mycie' };

// Wybiera "najlepszego" mechanika sposrod tych oznaczonych jako wykonujacy
// rowniez dalsze kroki (users.wykonuje_dodatkowe_prace = true), wg kolejnosci:
//   1. mechanik bez zadnych aktywnych zadan,
//   2. w przeciwnym razie mechanik bez niczego "w trakcie",
//   3. w przeciwnym razie mechanik z najmniejszym obciazeniem.
async function wybierzMechanikaDoZadania(pool) {
  const wynik = await pool.query(`
    SELECT
      u.id AS "Id", u.full_name AS "FullName", u.email AS "Email",
      COALESCE(j_stats.rozpoczete, 0) AS "Rozpoczete",
      COALESCE(j_stats.aktywne, 0) AS "AktywneJoby",
      COALESCE(z_stats.niewykonane, 0) AS "NiewykonaneZadania"
    FROM users u
    LEFT JOIN LATERAL (
      SELECT
        SUM(CASE WHEN j.status = 'rozpoczete' THEN 1 ELSE 0 END) AS rozpoczete,
        COUNT(*) AS aktywne
      FROM jobs j
      WHERE j.mechanik_id = u.id AND j.status IN ('przydzielone', 'rozpoczete')
    ) j_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS niewykonane
      FROM zadania_po_naprawie z
      WHERE z.user_id = u.id AND z.wykonano = FALSE
    ) z_stats ON TRUE
    WHERE u.role = 'mechanik' AND u.wykonuje_dodatkowe_prace = TRUE
  `);

  const lista = wynik.rows;
  if (lista.length === 0) return null;

  lista.sort((a, b) => {
    const aWTrakcie = a.Rozpoczete > 0 ? 1 : 0;
    const bWTrakcie = b.Rozpoczete > 0 ? 1 : 0;
    if (aWTrakcie !== bWTrakcie) return aWTrakcie - bWTrakcie;
    const aObciazenie = Number(a.AktywneJoby) + Number(a.NiewykonaneZadania);
    const bObciazenie = Number(b.AktywneJoby) + Number(b.NiewykonaneZadania);
    return aObciazenie - bObciazenie;
  });

  return lista[0];
}

// Tworzy zadania "po naprawie" (wyposazenie+inspecto oraz mycie) dla danej
// roboty. Mechanik jest wybierany RAZ i OBA typy trafiaja do TEJ SAMEJ osoby.
// Zwraca liste przypisan [{ typ, userId, fullName, email }].
async function utworzZadaniaPoNaprawie(pool, jobId) {
  const mechanik = await wybierzMechanikaDoZadania(pool);
  if (!mechanik) return [];

  const przypisania = [];
  for (const typ of TYPY) {
    await pool.query(
      `INSERT INTO zadania_po_naprawie (job_id, typ, user_id) VALUES ($1, $2, $3)`,
      [jobId, typ, mechanik.Id]
    );
    przypisania.push({ typ, userId: mechanik.Id, fullName: mechanik.FullName, email: mechanik.Email });
  }
  return przypisania;
}

// GET /api/followup/podsumowanie
router.get('/podsumowanie', async (req, res) => {
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
router.get('/wszystkie', async (req, res) => {
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

// GET /api/followup/moje/:userId
router.get('/moje/:userId', async (req, res) => {
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

// PUT /api/followup/:id/wykonaj
router.put('/:id/wykonaj', async (req, res) => {
  try {
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

// GET /api/followup/status-zlecenia - status (wykonano/nie) WSZYSTKICH zadan
// po naprawie (w odroznieniu od /wszystkie, ktore zwraca TYLKO niewykonane).
// Uzywane przez tablice mechanikow do pokazania na karcie JUZ ZAKONCZONEGO
// zlecenia, czy Wyposazenie+Inspecto i Mycie zostaly wykonane przez mechanika,
// czy jeszcze na niego czekaja - inaczej ta informacja znikala calkowicie po
// wykonaniu zadania (bo /wszystkie i /moje/:userId celowo pokazuja tylko to,
// co jeszcze trzeba zrobic).
router.get('/status-zlecenia', async (req, res) => {
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
router.get('/powiadomienia', async (req, res) => {
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

// PUT /api/followup/powiadomienia - body: { userIds: [1,2,...] }
router.put('/powiadomienia', async (req, res) => {
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

module.exports = { router, utworzZadaniaPoNaprawie, TYP_LABELS };
