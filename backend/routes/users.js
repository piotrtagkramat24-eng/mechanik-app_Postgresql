const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireRole } = require('../middleware/auth');

const MIN_DLUGOSC_HASLA = 6;

// GET /api/users?role=mechanik - lista uzytkownikow, opcjonalnie filtrowana po roli
// (mozna podac kilka rol na raz, rozdzielone przecinkiem, np. ?role=mechanik,kierownik
// - potrzebne np. do "Tablicy mechanikow", bo kierownik tez pracuje jako mechanik)
router.get('/', async (req, res) => {
  const { role } = req.query;

  try {
    let query = `SELECT id AS "Id", username AS "Username", full_name AS "FullName",
                        role AS "Role", email AS "Email",
                        wykonuje_dodatkowe_prace AS "WykonujeDodatkowePrace",
                        godz_tydz_od AS "GodzTydzOd", godz_tydz_do AS "GodzTydzDo",
                        godz_tydz_przerwa_od AS "GodzTydzPrzerwaOd", godz_tydz_przerwa_min AS "GodzTydzPrzerwaMin",
                        godz_sob_od AS "GodzSobOd", godz_sob_do AS "GodzSobDo",
                        godz_sob_przerwa_od AS "GodzSobPrzerwaOd", godz_sob_przerwa_min AS "GodzSobPrzerwaMin"
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

// PUT /api/users/:id/password - superadmin recznie ustawia (resetuje) haslo
// dowolnemu uzytkownikowi (np. gdy ktos zapomni swojego). Haslo jest hashowane
// (bcrypt) przed zapisem - w bazie nigdy nie trzymamy hasla jawnym tekstem.
router.put('/:id/password', requireRole('superadmin'), async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || String(newPassword).length < MIN_DLUGOSC_HASLA) {
    return res.status(400).json({
      error: `Nowe hasło musi mieć co najmniej ${MIN_DLUGOSC_HASLA} znaków.`,
    });
  }

  try {
    const hash = await bcrypt.hash(String(newPassword), 10);
    const result = await pool.query('UPDATE users SET password = $1 WHERE id = $2', [
      hash,
      req.params.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania nowego hasła.' });
  }
});

// PUT /api/users/:id/email - ustawia/zmienia adres e-mail uzytkownika
// (potrzebny do powiadomien mailowych o zakonczonych robotach)
router.put('/:id/email', requireRole('superadmin'), async (req, res) => {
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
router.put('/:id/dodatkowe-prace', requireRole('superadmin'), async (req, res) => {
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

// Waliduje napis "HH:MM" (00:00-23:59). Zwraca true dla null/undefined/'' (dozwolone,
// oznacza "brak" - np. mechanik nie pracuje w soboty).
function poprawnaGodzinaLubPusta(val) {
  if (val === null || val === undefined || val === '') return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(val));
}

// PUT /api/users/:id/godziny-pracy - dynamiczna konfiguracja godzin pracy
// mechanika (super admin). Uzywana przez pasek uplywu czasu na "Tablicy
// mechanikow", zeby liczyc czas trwania roboty wg RZECZYWISTYCH godzin
// roboczych zamiast zegarowych 24h.
// body: {
//   godzTydzOd, godzTydzDo,                 // "HH:MM", pon-pt
//   godzTydzPrzerwaOd, godzTydzPrzerwaMin,  // przerwa w tygodniu; Min=0 = brak przerwy
//   godzSobOd, godzSobDo,                   // "HH:MM" lub null = nie pracuje w soboty
//   godzSobPrzerwaOd, godzSobPrzerwaMin,    // przerwa w sobote; Min=0 = brak przerwy
// }
router.put('/:id/godziny-pracy', requireRole('superadmin'), async (req, res) => {
  const {
    godzTydzOd, godzTydzDo, godzTydzPrzerwaOd, godzTydzPrzerwaMin,
    godzSobOd, godzSobDo, godzSobPrzerwaOd, godzSobPrzerwaMin,
  } = req.body;

  if (!poprawnaGodzinaLubPusta(godzTydzOd) || !poprawnaGodzinaLubPusta(godzTydzDo) ||
      !poprawnaGodzinaLubPusta(godzTydzPrzerwaOd) || !poprawnaGodzinaLubPusta(godzSobOd) ||
      !poprawnaGodzinaLubPusta(godzSobDo) || !poprawnaGodzinaLubPusta(godzSobPrzerwaOd)) {
    return res.status(400).json({ error: 'Godziny muszą być w formacie GG:MM (np. 08:00).' });
  }
  if (!godzTydzOd || !godzTydzDo) {
    return res.status(400).json({ error: 'Podaj godziny pracy w tygodniu (od-do).' });
  }
  const tydzPrzerwaMin = Number(godzTydzPrzerwaMin) || 0;
  const sobPrzerwaMin = Number(godzSobPrzerwaMin) || 0;
  if (tydzPrzerwaMin < 0 || sobPrzerwaMin < 0) {
    return res.status(400).json({ error: 'Czas przerwy nie może być ujemny.' });
  }

  try {
    await pool.query(
      `UPDATE users SET
         godz_tydz_od = $1,
         godz_tydz_do = $2,
         godz_tydz_przerwa_od = $3,
         godz_tydz_przerwa_min = $4,
         godz_sob_od = $5,
         godz_sob_do = $6,
         godz_sob_przerwa_od = $7,
         godz_sob_przerwa_min = $8
       WHERE id = $9`,
      [
        godzTydzOd,
        godzTydzDo,
        tydzPrzerwaMin > 0 ? (godzTydzPrzerwaOd || null) : null,
        tydzPrzerwaMin,
        godzSobOd || null,
        godzSobDo || null,
        sobPrzerwaMin > 0 ? (godzSobPrzerwaOd || null) : null,
        sobPrzerwaMin,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas zapisywania godzin pracy.' });
  }
});

module.exports = router;
