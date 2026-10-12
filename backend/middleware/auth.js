const jwt = require('jsonwebtoken');

// Sekret do podpisywania tokenow JWT. Powinien byc ustawiony w .env
// (JWT_SECRET=dlugi-losowy-ciag-znakow). Jesli go brakuje, generujemy losowy
// sekret na czas dzialania procesu - aplikacja wciaz dziala, ale KAZDY restart
// backendu uniewaznia wszystkie wydane wczesniej tokeny (uzytkownicy musza sie
// zalogowac ponownie). Do produkcyjnego uzytku zdecydowanie zalecane ustawienie
// wlasnego, stalego sekretu w .env.
let ostrzezenieWypisane = false;
function pobierzSekret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!ostrzezenieWypisane) {
    console.warn(
      '[Auth] Brak JWT_SECRET w .env - wygenerowano tymczasowy sekret dla tej sesji serwera.\n' +
        '[Auth] Kazdy restart backendu wyloguje wszystkich uzytkownikow. Ustaw JWT_SECRET w .env, ' +
        'aby tego uniknac (np. dlugi losowy ciag znakow).'
    );
    ostrzezenieWypisane = true;
  }
  if (!pobierzSekret._losowy) {
    pobierzSekret._losowy = require('crypto').randomBytes(48).toString('hex');
  }
  return pobierzSekret._losowy;
}

const CZAS_WAZNOSCI_TOKENU = '12h';

function wystawToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    },
    pobierzSekret(),
    { expiresIn: CZAS_WAZNOSCI_TOKENU }
  );
}

// Sledzenie "kto jest aktywnie zalogowany" - w pamieci procesu (JWT jest
// bezstanowy, nie ma gdzie indziej trzymac listy sesji). Aktualizowane przy
// KAZDYM uwierzytelnionym zapytaniu do API (ponizej w requireAuth), wiec
// "ostatnia aktywnosc" to realnie "ostatnie dzialanie w aplikacji", a nie
// tylko "ma jeszcze wazny token". Mapa jest ograniczona z natury do liczby
// kont w systemie (klucz = user id, nadpisywany, nie rosnie w nieskonczonosc
// jak np. mapa prob logowania w routes/auth.js, ktora kluczuje dowolnym
// tekstem od anonimowego klienta).
const aktywneSesje = new Map(); // userId -> { id, username, fullName, role, zalogowanyOd, ostatniaAktywnosc }

function zarejestrujAktywnosc(dane) {
  aktywneSesje.set(dane.id, {
    id: dane.id,
    username: dane.username,
    fullName: dane.fullName,
    role: dane.role,
    zalogowanyOd: dane.iat * 1000, // "iat" z JWT jest w sekundach
    ostatniaAktywnosc: Date.now(),
  });
}

// Zwraca sesje z aktywnoscia w ciagu ostatnich `oknoMs` (domyslnie 5 minut) -
// to jest nasza definicja "aktywnie zalogowany", bo token sam w sobie jest
// wazny 12h niezaleznie od tego, czy ktos faktycznie korzysta z aplikacji.
// Wylogowanie jest dzis czysto po stronie frontu (kasuje token lokalnie, nie
// informuje backendu) - taka osoba zniknie z listy, gdy tylko przestanie
// wysylac zapytania, czyli najpozniej po uplywie okna.
function pobierzAktywneSesje(oknoMs = 5 * 60 * 1000) {
  const teraz = Date.now();
  return Array.from(aktywneSesje.values())
    .filter((s) => teraz - s.ostatniaAktywnosc <= oknoMs)
    .sort((a, b) => b.ostatniaAktywnosc - a.ostatniaAktywnosc);
}

// Middleware: wymaga poprawnego naglowka "Authorization: Bearer <token>".
// Po weryfikacji ustawia req.user = { id, username, role, fullName }.
function requireAuth(req, res, next) {
  const naglowek = req.headers.authorization || '';
  const [typ, token] = naglowek.split(' ');

  if (typ !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Brak autoryzacji. Zaloguj się ponownie.' });
  }

  try {
    const dane = jwt.verify(token, pobierzSekret());
    req.user = dane;
    zarejestrujAktywnosc(dane);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesja wygasła lub token jest nieprawidłowy. Zaloguj się ponownie.' });
  }
}

// Middleware fabrykujacy: wymaga, aby req.user.role byla jedna z podanych.
// Uzycie: requireRole('superadmin'), requireRole('superadmin', 'szef') itd.
// Musi byc uzyte PO requireAuth (potrzebuje req.user).
function requireRole(...dozwoloneRole) {
  return (req, res, next) => {
    if (!req.user || !dozwoloneRole.includes(req.user.role)) {
      return res.status(403).json({ error: 'Brak uprawnień do wykonania tej operacji.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, wystawToken, pobierzAktywneSesje };
