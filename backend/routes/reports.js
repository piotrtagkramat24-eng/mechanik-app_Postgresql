const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Raporty dla szefa/superadmina — praca mechanikow (na podstawie zakonczonych
// zlecen) oraz pracownika gospodarczego (na podstawie historii wykonan).

function parseZakres(req) {
  const dzisiaj = new Date();
  const miesiacTemu = new Date(dzisiaj.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = req.query.from || miesiacTemu.toISOString().slice(0, 10);
  const to = req.query.to || dzisiaj.toISOString().slice(0, 10);
  return { from, to };
}

// GET /api/reports/mechanicy?from=YYYY-MM-DD&to=YYYY-MM-DD&mechanikId=
router.get('/mechanicy', async (req, res) => {
  const { from, to } = parseZakres(req);
  const { mechanikId } = req.query;

  try {
    const params = [from, to];
    let filtrMechanika = '';
    if (mechanikId) {
      params.push(mechanikId);
      filtrMechanika = `AND j.mechanik_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         jc.id AS "CzynnoscId",
         jc.nazwa AS "Nazwa",
         jc.predefiniowana_praca_id AS "PredefiniowanaPracaId",
         jc.data_rozpoczecia AS "DataRozpoczecia",
         jc.data_zakonczenia AS "DataZakonczenia",
         jc.czas_sredni AS "CzasSzacowanySredni",
         j.id AS "JobId",
         j.opis AS "ZlecenieOpis",
         m.id AS "MechanikId",
         m.full_name AS "MechanikFullName",
         c.marka AS "Marka", c.model AS "Model", c.rejestracja AS "Rejestracja",
         EXTRACT(EPOCH FROM (jc.data_zakonczenia - jc.data_rozpoczecia)) / 3600.0 AS "CzasRzeczywistyGodziny"
       FROM job_czynnosci jc
       JOIN jobs j ON j.id = jc.job_id
       JOIN cars c ON c.id = j.car_id
       LEFT JOIN users m ON m.id = j.mechanik_id
       WHERE jc.status = 'zakonczone'
         AND jc.data_zakonczenia IS NOT NULL
         AND jc.data_zakonczenia::date BETWEEN $1 AND $2
         ${filtrMechanika}
       ORDER BY jc.data_zakonczenia DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas generowania raportu mechaników.' });
  }
});

// GET /api/reports/gospodarczy?from=YYYY-MM-DD&to=YYYY-MM-DD&pracownikId=
router.get('/gospodarczy', async (req, res) => {
  const { from, to } = parseZakres(req);
  const { pracownikId } = req.query;

  try {
    const params = [from, to];
    let filtrPracownika = '';
    if (pracownikId) {
      params.push(pracownikId);
      filtrPracownika = `AND COALESCE(w.wykonal_user_id, z.pracownik_id) = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         w.id AS "Id",
         w.data_wykonania AS "DataWykonania",
         z.id AS "ZadanieId",
         z.zadanie AS "Zadanie",
         z.lokalizacja AS "Lokalizacja",
         z.typ AS "Typ",
         COALESCE(u.id, p.id) AS "PracownikId",
         COALESCE(u.full_name, p.full_name) AS "PracownikFullName",
         rw_json.rejestracje_wykonanie_json AS "RejestracjeWykonanieJson",
         rd_row.rejestracje AS "RejestracjeDniaRaw"
       FROM gospodarcze_wykonania w
       JOIN gospodarcze_zadania z ON z.id = w.zadanie_id
       JOIN users p ON p.id = z.pracownik_id
       LEFT JOIN users u ON u.id = w.wykonal_user_id
       LEFT JOIN LATERAL (
         SELECT json_agg(t) AS rejestracje_wykonanie_json
         FROM (
           SELECT r.rejestracja AS "Rejestracja", rw.wykonano AS "Wykonano"
           FROM gospodarcze_wykonania_rejestracje rw
           JOIN gospodarcze_zadania_rejestracje r ON r.id = rw.rejestracja_id
           WHERE rw.wykonanie_id = w.id
         ) t
       ) rw_json ON TRUE
       LEFT JOIN LATERAL (
         SELECT rd.rejestracje FROM gospodarcze_rejestracje_dzienne rd
         WHERE rd.zadanie_id = z.id AND rd.data = w.data_wykonania::date
         LIMIT 1
       ) rd_row ON TRUE
       WHERE w.data_wykonania::date BETWEEN $1 AND $2
         ${filtrPracownika}
       ORDER BY w.data_wykonania DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas generowania raportu pracownika gospodarczego.' });
  }
});

module.exports = router;
