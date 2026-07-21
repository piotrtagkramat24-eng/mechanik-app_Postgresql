const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/predefiniowane-prace - lista predefiniowanych prac z domyslnymi czasami
// (uzywana jako podpowiedzi przy dodawaniu roboty do samochodu)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS "Id", nazwa AS "Nazwa", czas_min AS "CzasMin",
              czas_sredni AS "CzasSredni", czas_max AS "CzasMax"
       FROM predefiniowane_prace
       WHERE aktywny = TRUE
       ORDER BY nazwa ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania predefiniowanych prac.' });
  }
});

// POST /api/predefiniowane-prace - dodanie nowej predefiniowanej pracy (opcjonalnie, np. z panelu szefa)
// body: { nazwa, czasMin, czasSredni, czasMax }
router.post('/', async (req, res) => {
  const { nazwa, czasMin, czasSredni, czasMax } = req.body;
  if (!nazwa) return res.status(400).json({ error: 'Podaj nazwę pracy.' });

  try {
    const result = await pool.query(
      `INSERT INTO predefiniowane_prace (nazwa, czas_min, czas_sredni, czas_max)
       VALUES ($1, $2, $3, $4)
       RETURNING id AS "Id", nazwa AS "Nazwa", czas_min AS "CzasMin",
                 czas_sredni AS "CzasSredni", czas_max AS "CzasMax", aktywny AS "Aktywny"`,
      [nazwa, czasMin || null, czasSredni || null, czasMax || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas dodawania predefiniowanej pracy.' });
  }
});

module.exports = router;
