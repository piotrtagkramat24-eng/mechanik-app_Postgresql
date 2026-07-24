// Backendowy odpowiednik logiki z frontend/src/utils/jobTimeUtils.js
// (roboczeMilisekundyMiedzy / harmonogramZJoba) — potrzebny w raportach
// (routes/reports.js), zeby "czas rzeczywisty" liczyc WZGLEDEM GODZIN
// ROBOCZYCH mechanika (pon-pt wg jego harmonogramu + przerwa, sobota
// jesli pracuje), a nie jako surowa roznica zegarowa miedzy DataRozpoczecia
// a DataZakonczenia (tak jak liczyl to poprzednio EXTRACT(EPOCH ...) w SQL —
// dawalo to np. "18h" za robote zaczeta w piatek 16:00 i skonczona w
// poniedzialek 10:00, bo wliczalo noce i cala niedziele).
//
// WAZNE — STREFA CZASOWA: serwer (Node/Docker) czesto dziala w UTC, a firma
// i jej harmonogramy pracy (godz_tydz_od itp.) sa w czasie POLSKIM
// (Europe/Warsaw, z automatyczna zmiana czasu lato/zima). Dlatego granice dni
// i okien pracy licza sie na "czasie sciennym" Warszawy, a nie na lokalnym
// czasie serwera — inaczej w zimie/lecie albo na serwerze z inna strefa
// wyniki bylyby przesuniete o 1-2h.

const STREFA = 'Europe/Warsaw';

// Rozbija instant (Date, UTC) na skladowe czasu sciennego w Europe/Warsaw.
function czesciWarszawa(data) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: STREFA,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(data)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    rok: Number(parts.year),
    miesiac: Number(parts.month), // 1-12
    dzien: Number(parts.day),
    godziny: Number(parts.hour === '24' ? '0' : parts.hour),
    minuty: Number(parts.minute),
    sekundy: Number(parts.second),
  };
}

// Dzien tygodnia (0=niedz..6=sob) danego instantu, WEDLUG kalendarza Warszawy.
function dzienTygodniaWarszawa(data) {
  const c = czesciWarszawa(data);
  // Uzywamy UTC-daty zbudowanej z "sciennych" rok/miesiac/dzien wylacznie po
  // to, by getUTCDay() dal poprawny dzien tygodnia (bez wplywu strefy serwera).
  return new Date(Date.UTC(c.rok, c.miesiac - 1, c.dzien)).getUTCDay();
}

// Zamienia "scienna" date+godzine w Warszawie (rok, miesiac 1-12, dzien,
// minutyOdPolnocy) na rzeczywisty instant (Date w UTC), uwzgledniajac
// aktualne przesuniecie CET/CEST w tym okresie roku.
function warszawaNaInstant(rok, miesiac, dzien, minutyOdPolnocy) {
  const godziny = Math.floor(minutyOdPolnocy / 60);
  const minuty = minutyOdPolnocy % 60;
  // Pierwsze przyblizenie: potraktuj podane "scienne" wartosci jako UTC.
  let przyblizenie = Date.UTC(rok, miesiac - 1, dzien, godziny, minuty);
  // Sprawdz, jak ten instant wyglada w Warszawie i wylicz przesuniecie
  // (roznica miedzy "sciennym" czasem Warszawy a UTC), po czym skoryguj.
  for (let i = 0; i < 2; i++) {
    const c = czesciWarszawa(new Date(przyblizenie));
    const widoczneUtc = Date.UTC(c.rok, c.miesiac - 1, c.dzien, c.godziny, c.minuty);
    const przesuniecieMs = widoczneUtc - przyblizenie;
    const docelowyUtc = Date.UTC(rok, miesiac - 1, dzien, godziny, minuty);
    przyblizenie = docelowyUtc - przesuniecieMs;
  }
  return new Date(przyblizenie);
}

// Domyslny harmonogram firmowy (spojny z frontend/src/utils/jobTimeUtils.js),
// gdy mechanik nie ma jeszcze wlasnej konfiguracji w bazie.
const DOMYSLNY_HARMONOGRAM = {
  tydzOd: '08:00',
  tydzDo: '17:00',
  tydzPrzerwaOd: '11:00',
  tydzPrzerwaMin: 60,
  sobOd: '08:00',
  sobDo: '14:00',
  sobPrzerwaOd: null,
  sobPrzerwaMin: 0,
};

function parseHHMM(str) {
  if (str === null || str === undefined || str === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Buduje harmonogram na podstawie wiersza z tabeli users (kolumny
// godz_tydz_od itp. — patrz schema.sql / routes/users.js). Brakujace pola
// spadaja na domyslny harmonogram firmowy.
function harmonogramZUzytkownika(u) {
  if (!u) return DOMYSLNY_HARMONOGRAM;
  return {
    tydzOd: u.godz_tydz_od || DOMYSLNY_HARMONOGRAM.tydzOd,
    tydzDo: u.godz_tydz_do || DOMYSLNY_HARMONOGRAM.tydzDo,
    tydzPrzerwaOd: u.godz_tydz_przerwa_od ?? DOMYSLNY_HARMONOGRAM.tydzPrzerwaOd,
    tydzPrzerwaMin: u.godz_tydz_przerwa_min != null ? Number(u.godz_tydz_przerwa_min) : DOMYSLNY_HARMONOGRAM.tydzPrzerwaMin,
    sobOd: u.godz_sob_od ?? DOMYSLNY_HARMONOGRAM.sobOd,
    sobDo: u.godz_sob_do ?? DOMYSLNY_HARMONOGRAM.sobDo,
    sobPrzerwaOd: u.godz_sob_przerwa_od ?? DOMYSLNY_HARMONOGRAM.sobPrzerwaOd,
    sobPrzerwaMin: u.godz_sob_przerwa_min != null ? Number(u.godz_sob_przerwa_min) : DOMYSLNY_HARMONOGRAM.sobPrzerwaMin,
  };
}

// Dzieli okno pracy [start,end] (w minutach od polnocy) na 1 lub 2 kawalki,
// wycinajac przerwe [przerwaOd, przerwaOd+przerwaMin).
function podzielPrzerwa(start, end, przerwaOd, przerwaMin) {
  if (!przerwaMin || przerwaMin <= 0 || przerwaOd == null) return [[start, end]];
  const przerwaKoniec = przerwaOd + przerwaMin;
  const oknaRaw = [
    [start, Math.min(przerwaOd, end)],
    [Math.max(przerwaKoniec, start), end],
  ];
  return oknaRaw.filter(([s, e]) => e > s);
}

// Okna pracy (w minutach od polnocy) dla danego dnia tygodnia wg harmonogramu.
function oknaDnia(dzienTygodnia, harmonogram) {
  if (dzienTygodnia === 0) return []; // niedziela — firma nie pracuje
  if (dzienTygodnia === 6) {
    const s = parseHHMM(harmonogram.sobOd);
    const e = parseHHMM(harmonogram.sobDo);
    if (s == null || e == null || e <= s) return [];
    return podzielPrzerwa(s, e, parseHHMM(harmonogram.sobPrzerwaOd), harmonogram.sobPrzerwaMin);
  }
  const s = parseHHMM(harmonogram.tydzOd) ?? 8 * 60;
  const e = parseHHMM(harmonogram.tydzDo) ?? 17 * 60;
  if (e <= s) return [];
  return podzielPrzerwa(s, e, parseHHMM(harmonogram.tydzPrzerwaOd), harmonogram.tydzPrzerwaMin);
}

// Liczy ile milisekund PRACY (wg harmonogramu, w czasie Warszawy) uplynelo
// pomiedzy dwoma instantami — pomijajac noce, niedziele, godziny poza
// grafikiem i przerwy. Dziala dzien po dniu (kalendarz Warszawy).
function roboczeMilisekundyMiedzy(start, end, harmonogram = DOMYSLNY_HARMONOGRAM) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  let total = 0;
  const cStart = czesciWarszawa(start);
  const cEnd = czesciWarszawa(end);

  let cursorUtcDzien = Date.UTC(cStart.rok, cStart.miesiac - 1, cStart.dzien);
  const ostatniUtcDzien = Date.UTC(cEnd.rok, cEnd.miesiac - 1, cEnd.dzien);

  while (cursorUtcDzien <= ostatniUtcDzien) {
    const cursorDate = new Date(cursorUtcDzien);
    const rok = cursorDate.getUTCFullYear();
    const miesiac = cursorDate.getUTCMonth() + 1;
    const dzien = cursorDate.getUTCDate();
    const dow = cursorDate.getUTCDay();

    for (const [wS, wE] of oknaDnia(dow, harmonogram)) {
      const oknoStart = warszawaNaInstant(rok, miesiac, dzien, wS);
      const oknoEnd = warszawaNaInstant(rok, miesiac, dzien, wE);

      const overlapStart = start > oknoStart ? start : oknoStart;
      const overlapEnd = end < oknoEnd ? end : oknoEnd;
      if (overlapEnd > overlapStart) total += overlapEnd.getTime() - overlapStart.getTime();
    }

    cursorUtcDzien += 24 * 60 * 60 * 1000;
  }
  return total;
}

// Jak wyzej, ale zwraca od razu godziny.
function roboczeGodzinyMiedzy(start, end, harmonogram = DOMYSLNY_HARMONOGRAM) {
  return roboczeMilisekundyMiedzy(start, end, harmonogram) / 3600000;
}

module.exports = {
  DOMYSLNY_HARMONOGRAM,
  harmonogramZUzytkownika,
  roboczeMilisekundyMiedzy,
  roboczeGodzinyMiedzy,
  dzienTygodniaWarszawa,
};
