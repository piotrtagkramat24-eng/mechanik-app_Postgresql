const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Wyposazenie i Inspecto sa teraz JEDNYM zadaniem (typ 'wyposazenie', etykieta
// "Wyposażenie + Inspecto") - poprzednio byly dwoma osobnymi typami, ktore
// mozna bylo przypisac do roznych osob; patrz migracja 13d w schema.sql.
const TYPY = ['wyposazenie', 'mycie'];
const TYP_LABELS = { wyposazenie: 'Wyposażenie + Inspecto', mycie: 'Mycie' };

// Zwraca aktualne reczne przypisanie typ -> osoba (patrz tabela
// dalsze_kroki_przypisania), po jednym wierszu na kazdy z TYPY - nawet gdy
// dla danego typu nikogo jeszcze nie przypisano (UserId wtedy = null).
async function pobierzPrzypisania(pool) {
  const wynik = await pool.query(`
    SELECT t.typ AS "Typ", u.id AS "Id", u.full_name AS "FullName", u.email AS "Email"
    FROM unnest($1::varchar[]) AS t(typ)
    LEFT JOIN dalsze_kroki_przypisania dkp ON dkp.typ = t.typ
    LEFT JOIN users u ON u.id = dkp.user_id
  `, [TYPY]);
  return wynik.rows;
}

// Tworzy zadania "po naprawie" (Wyposazenie / Inspecto / Mycie) dla danej
// roboty, wg recznego przypisania kazdego typu do konkretnej osoby (patrz
// dalsze_kroki_przypisania i PUT /api/followup/przypisania). Typy bez
// przypisanej osoby sa pomijane - nie tworzy sie dla nich zadanie.
// Zwraca liste utworzonych przypisan [{ typ, userId, fullName, email }].
async function utworzZadaniaPoNaprawie(pool, jobId) {
  const przypisania = await pobierzPrzypisania(pool);
  const utworzone = [];

  for (const p of przypisania) {
    if (!p.Id) continue; // nikt nie przypisany do tego typu - pomijamy
    await pool.query(
      `INSERT INTO zadania_po_naprawie (job_id, typ, user_id) VALUES ($1, $2, $3)`,
      [jobId, p.Typ, p.Id]
    );
    utworzone.push({ typ: p.Typ, userId: p.Id, fullName: p.FullName, email: p.Email });
  }
  return utworzone;
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

// DELETE /api/followup/:id - kierownik/szef usuwa zadanie po naprawie z
// tablicy mechanikow (np. gdy zostalo utworzone przez pomylke albo juz nie
// jest potrzebne) - do tej pory nie bylo mozliwosci go usunac.
router.delete('/:id', async (req, res) => {
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

// GET /api/followup/przypisania - aktualne reczne przypisanie kazdego typu
// zadania po naprawie (Wyposazenie / Inspecto / Mycie) do konkretnej osoby.
// Zwraca zawsze po jednym wierszu na kazdy typ z TYPY (UserId = null, gdy
// dla danego typu jeszcze nikogo nie przypisano).
router.get('/przypisania', async (req, res) => {
  try {
    const przypisania = await pobierzPrzypisania(pool);
    res.json(
      przypisania.map((p) => ({
        Typ: p.Typ,
        TypLabel: TYP_LABELS[p.Typ] || p.Typ,
        UserId: p.Id,
        FullName: p.FullName,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania przypisań zadań po naprawie.' });
  }
});

// PUT /api/followup/przypisania - body: { typ, userId }. Ustawia (lub, gdy
// userId jest puste/null, czyści) osobę odpowiedzialną za dany typ zadania
// po naprawie. Każdy typ ma dokładnie jedną przypisaną osobę na raz.
router.put('/przypisania', async (req, res) => {
  const { typ, userId } = req.body || {};
  if (!TYPY.includes(typ)) {
    return res.status(400).json({ error: 'Nieprawidłowy typ zadania po naprawie.' });
  }
  try {
    await pool.query(
      `INSERT INTO dalsze_kroki_przypisania (typ, user_id) VALUES ($1, $2)
       ON CONFLICT (typ) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [typ, userId || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania przypisania.' });
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

module.exports = { router, utworzZadaniaPoNaprawie, TYP_LABELS, TYPY };
