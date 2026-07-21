const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/users?role=mechanik - lista uzytkownikow, opcjonalnie filtrowana po roli
// (mozna podac kilka rol na raz, rozdzielone przecinkiem, np. ?role=mechanik,kierownik
// - potrzebne np. do "Tablicy mechanikow", bo kierownik tez pracuje jako mechanik)
router.get('/', async (req, res) => {
  const { role } = req.query;

  try {
    let query = `SELECT id AS "Id", username AS "Username", full_name AS "FullName",
                        role AS "Role", email AS "Email",
                        wykonuje_dodatkowe_prace AS "WykonujeDodatkowePrace"
                 FROM users`;
    const params = [];

    if (role) {
      const roleList = String(role)
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);

      if (roleList.length > 0) {
        params.push(roleList);
        query += ` WHERE role = ANY($1)`;
      }
    }
    query += ' ORDER BY full_name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania użytkowników.' });
  }
});

// PUT /api/users/:id/email - ustawia/zmienia adres e-mail uzytkownika
// (potrzebny do powiadomien mailowych o zakonczonych robotach)
router.put('/:id/email', async (req, res) => {
  const { email } = req.body;
  try {
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [
      (email || '').trim() || null,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania adresu e-mail.' });
  }
});

// PUT /api/users/:id/dodatkowe-prace - oznacza czy mechanik rowniez wykonuje
// "dalsze kroki" po naprawie (Wyposazenie/Inspecto/Mycie), a nie tylko naprawy.
// Uzywane przez algorytm automatycznego przydzielania w followup.js.
router.put('/:id/dodatkowe-prace', async (req, res) => {
  const { wartosc } = req.body;
  try {
    await pool.query('UPDATE users SET wykonuje_dodatkowe_prace = $1 WHERE id = $2', [
      !!wartosc,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania ustawienia.' });
  }
});

module.exports = router;
