const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { wystawToken } = require('../middleware/auth');

// Logowanie jest jedynym endpointem API dostepnym bez tokenu (patrz
// server.js), wiec jest wystawione publicznie na caly internet (Render).
// Bez limitu ktokolwiek moglby probowac zgadywac hasla bez ograniczen.
//
// Limiter PO IP (req.ip, respektujacy "trust proxy" w server.js) jest tylko
// zgruba drugą warstwą - klient w pelni kontroluje naglowek X-Forwarded-For,
// wiec przy "trust proxy: 1" moze podac WLASNY, dowolny adres jako pierwszy
// wpis listy, a Render dopisze prawdziwy adres jako drugi; Express z
// trustProxy=1 odczyta wtedy jako "req.ip" wlasnie ten PIERWSZY,
// kontrolowany przez atakujacego wpis - wiec samo IP mozna bez trudu
// "rotowac" i obejsc limit. Dlatego GLOWNA linia obrony jest PONIZEJ:
// limiter kluczowany loginem z body (czyms, czego atakujacy nie moze
// podrobic naglowkiem) - bez wzgledu na to, spod ilu "adresow IP" sie
// zglasza, proby logowania na JEDNO konto i tak sa ograniczone.
const limiterLogowaniaPoIp = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minut
  limit: 60, // luzny, drugoplanowy limit - lapie oczywiste zalewanie requestami
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.' },
});

const limiterLogowaniaPoLoginie = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minut
  limit: 10, // 10 prob NA KONKRETNE konto w tym oknie - nie da sie obejsc spoofowaniem IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.body?.username || '').trim().toLowerCase() || 'brak-loginu',
  message: { error: 'Zbyt wiele prób logowania na to konto. Spróbuj ponownie za kilka minut.' },
});

// POST /api/login - logowanie uzytkownika na podstawie username + password.
// Haslo w bazie jest zahaszowane (bcrypt) - patrz server.js (hashujIstniejaceHasla)
// dla migracji starych, jawnych hasel przy starcie serwera.
// Zwraca token JWT (do naglowka "Authorization: Bearer <token>" w kolejnych
// zapytaniach) oraz dane uzytkownika (bez hasla), ktore frontend zapamietuje,
// aby wiedziec jaki widok pokazac (szef / kierownik / mechanik / ...).
router.post('/login', limiterLogowaniaPoIp, limiterLogowaniaPoLoginie, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Podaj login i hasło.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password, full_name, role
       FROM users WHERE username = $1`,
      [username]
    );

    // Celowo ten sam, ogolny komunikat bledu dla "brak uzytkownika" i "zle haslo"
    // - nie ujawniamy atakujacemu, czy dany login w ogole istnieje w systemie.
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    const user = result.rows[0];
    const haslaZgodne = await bcrypt.compare(password, user.password);

    if (!haslaZgodne) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    const token = wystawToken(user);

    res.json({
      token,
      user: {
        Id: user.id,
        Username: user.username,
        FullName: user.full_name,
        Role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera podczas logowania.' });
  }
});

module.exports = router;
