const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/login - logowanie uzytkownika na podstawie username + password
// Zwraca dane uzytkownika (bez hasla), ktore frontend zapamietuje, aby wiedziec
// jaki widok pokazac (szef / kierownik / mechanik).
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Podaj login i hasło.' });
  }

  try {
    const result = await pool.query(
      `SELECT id AS "Id", username AS "Username", full_name AS "FullName", role AS "Role"
       FROM users WHERE username = $1 AND password = $2`,
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas logowania.' });
  }
});

module.exports = router;
