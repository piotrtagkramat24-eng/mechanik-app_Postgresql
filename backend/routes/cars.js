const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/cars - lista wszystkich pojazdow (samochody i naczepy)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id AS "Id", marka AS "Marka", model AS "Model", rejestracja AS "Rejestracja",
              data_przyjecia AS "DataPrzyjecia", typ_pojazdu AS "TypPojazdu", kategoria AS "Kategoria"
       FROM cars ORDER BY data_przyjecia DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas pobierania samochodów.' });
  }
});

// POST /api/cars - szef dodaje nowy pojazd do warsztatu
// body: { marka, model, rejestracja, typPojazdu?, kategoria? }
// typPojazdu: 'samochod' | 'naczepa' (domyslnie 'samochod')
// kategoria: uzywana glownie dla naczep (np. Plandeka, Chlodnia, Wywrotka...)
router.post('/', async (req, res) => {
  const { marka, model, rejestracja, typPojazdu, kategoria } = req.body;

  if (!marka || !model || !rejestracja) {
    return res.status(400).json({ error: 'Podaj markę, model i numer rejestracyjny.' });
  }

  const finalTyp = typPojazdu === 'naczepa' ? 'naczepa' : 'samochod';

  try {
    const result = await pool.query(
      `INSERT INTO cars (marka, model, rejestracja, typ_pojazdu, kategoria)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS "Id", marka AS "Marka", model AS "Model", rejestracja AS "Rejestracja",
                 data_przyjecia AS "DataPrzyjecia", typ_pojazdu AS "TypPojazdu", kategoria AS "Kategoria"`,
      [marka, model, rejestracja, finalTyp, kategoria || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas dodawania samochodu.' });
  }
});

module.exports = router;
