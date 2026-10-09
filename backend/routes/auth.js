const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { wystawToken } = require('../middleware/auth');

// Logowanie jest jedynym endpointem API dostepnym bez tokenu (patrz
// server.js), wiec jest wystawione publicznie na caly internet (Render).
// Bez ograniczen ktokolwiek moglby probowac zgadywac hasla bez przeszkod.
//
// Dwie niezalezne warstwy, celowo o INNYM charakterze:
//
// 1) Limiter PO IP (ponizej) - gruba, pierwsza warstwa. Ma znana wade: IP
//    (req.ip, "trust proxy" w server.js) teoretycznie da sie "rotowac"
//    spoofujac X-Forwarded-For, bo klient kontroluje ten naglowek, a Render
//    dopisuje prawdziwy adres obok niego. Zaakceptowane na ta skale (maly,
//    wewnetrzny warsztat, nie publiczny serwis wysokiej wartosci).
//
// 2) Rosnace OPOZNIENIE na KONKRETNY login (ponizej, bledneProbyLoginu) -
//    NIE blokuje logowania, tylko je spowalnia po kolejnych blednych
//    probach na to samo konto - niezaleznie od IP/naglowkow, bo klucz to
//    sam login z body, ktorego nie da sie "zrotowac". Dzieki temu, ze to
//    opoznienie a nie blokada, nie da sie tego uzyc do trwalego zablokowania
//    logowania komus (co stalo sie z wczesniejsza wersja opartej o
//    express-rate-limit po samym loginie - zobacz historie commitow:
//    e328f84 dodal twardy limit po loginie, 6722efd go usunal, bo
//    pozwalal KAZDEMU bez znajomosci hasla zablokowac konkretne konto na
//    10 min samym wyslaniem paru zlych hasel. NIE ZASTEPOWAC tego z
//    powrotem twardym limitem/blokada po samym loginie).
const limiterLogowaniaPoIp = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minut
  limit: 20, // na IP - kilka biura/warsztatu za tym samym NAT nie powinno nigdy tego dotknac
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za kilka minut.' },
});

const bledneProbyLoginu = new Map(); // login (lowercase) -> { liczba, ostatniaProba }
const OKNO_RESETU_PROB_MS = 15 * 60 * 1000; // 15 min bez bledu na to konto = licznik sie zeruje
const OPOZNIENIE_NA_PROBE_MS = 500;
const MAX_OPOZNIENIE_MS = 4000; // gorny sufit - nigdy nie czeka sie dluzej niz 4s
const MAX_SLEDZONYCH_LOGINOW = 500; // zabezpieczenie przed nieograniczonym wzrostem mapy

function kluczLoginu(username) {
  return String(username || '').trim().toLowerCase();
}

function opoznienieDlaLoginu(username) {
  const wpis = bledneProbyLoginu.get(kluczLoginu(username));
  if (!wpis || Date.now() - wpis.ostatniaProba > OKNO_RESETU_PROB_MS) return 0;
  return Math.min(wpis.liczba * OPOZNIENIE_NA_PROBE_MS, MAX_OPOZNIENIE_MS);
}

function zarejestrujBlednaProbeLoginu(username) {
  const klucz = kluczLoginu(username);
  const wpis = bledneProbyLoginu.get(klucz);
  if (!wpis || Date.now() - wpis.ostatniaProba > OKNO_RESETU_PROB_MS) {
    // Mapa rosnie o jeden wpis na kazdy PROBOWANY login (takze nieistniejacy) -
    // przy bardzo duzej liczbie roznych prob czyscimy najstarsze wpisy,
    // zeby nie rosla bez ograniczen.
    if (bledneProbyLoginu.size >= MAX_SLEDZONYCH_LOGINOW) {
      const najstarszyKlucz = bledneProbyLoginu.keys().next().value;
      bledneProbyLoginu.delete(najstarszyKlucz);
    }
    bledneProbyLoginu.set(klucz, { liczba: 1, ostatniaProba: Date.now() });
  } else {
    wpis.liczba += 1;
    wpis.ostatniaProba = Date.now();
  }
}

function wyczyscProbyLoginu(username) {
  bledneProbyLoginu.delete(kluczLoginu(username));
}

function poczekaj(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /api/login - logowanie uzytkownika na podstawie username + password.
// Haslo w bazie jest zahaszowane (bcrypt) - patrz server.js (hashujIstniejaceHasla)
// dla migracji starych, jawnych hasel przy starcie serwera.
// Zwraca token JWT (do naglowka "Authorization: Bearer <token>" w kolejnych
// zapytaniach) oraz dane uzytkownika (bez hasla), ktore frontend zapamietuje,
// aby wiedziec jaki widok pokazac (szef / kierownik / mechanik / ...).
router.post('/login', limiterLogowaniaPoIp, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Podaj login i hasło.' });
  }

  const opoznienie = opoznienieDlaLoginu(username);
  if (opoznienie > 0) await poczekaj(opoznienie);

  try {
    const result = await pool.query(
      `SELECT id, username, password, full_name, role
       FROM users WHERE username = $1`,
      [username]
    );

    // Celowo ten sam, ogolny komunikat bledu dla "brak uzytkownika" i "zle haslo"
    // - nie ujawniamy atakujacemu, czy dany login w ogole istnieje w systemie.
    if (result.rows.length === 0) {
      zarejestrujBlednaProbeLoginu(username);
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    const user = result.rows[0];
    const haslaZgodne = await bcrypt.compare(password, user.password);

    if (!haslaZgodne) {
      zarejestrujBlednaProbeLoginu(username);
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    wyczyscProbyLoginu(username);
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
