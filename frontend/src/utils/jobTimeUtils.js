// Pomocnicze funkcje do wyswietlania szacowanego czasu wykonania roboty
// oraz paska uplywu czasu od rozpoczecia pracy przez mechanika.

// Formatuje czasy z tabeli PredefiniowanePrace / Jobs (godziny, np. 1.5) na czytelny napis "~1h 30min (1h–2h)"
export function formatCzasSzacowany(job) {
  const min = job?.CzasSzacowanyMin;
  const sredni = job?.CzasSzacowanySredni;
  const max = job?.CzasSzacowanyMax;
  if (sredni == null) return '';

  const fmtH = (h) => {
    const totalMin = Math.round(Number(h) * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    if (hh === 0) return `${mm}min`;
    if (mm === 0) return `${hh}h`;
    return `${hh}h ${mm}min`;
  };

  const minVal = min != null ? min : sredni;
  const maxVal = max != null ? max : sredni;

  if (minVal === maxVal) return `~${fmtH(sredni)}`;
  return `~${fmtH(sredni)} (${fmtH(minVal)}–${fmtH(maxVal)})`;
}

// Formatuje dowolna liczbe godzin (np. z odejmowania dat) na "1h 20min"
export function formatGodziny(hours) {
  if (hours == null || Number.isNaN(hours)) return '';
  const totalMin = Math.round(hours * 60);
  const hh = Math.floor(Math.abs(totalMin) / 60);
  const mm = Math.abs(totalMin) % 60;
  const sign = totalMin < 0 ? '-' : '';
  if (hh === 0) return `${sign}${mm}min`;
  if (mm === 0) return `${sign}${hh}h`;
  return `${sign}${hh}h ${mm}min`;
}

// SQL Server (FOR JSON PATH, uzywane np. w CzynnosciJson) serializuje kolumny
// datetime BEZ znacznika strefy czasowej (np. "2024-06-01T10:00:00.000"), a
// standard JS przy parsowaniu takiego stringa (bez "Z"/offsetu) domyslnie
// przyjmuje CZAS LOKALNY zamiast UTC — mimo ze w bazie ta wartosc to
// rzeczywisty czas UTC (GETUTCDATE()). Bez poprawki dawalo to np. +2h na
// pasku postepu zaraz po kliknieciu "Rozpocznij" latem (przesuniecie o
// strefe czasowa serwera). Wartosci pobierane normalnie (nie przez FOR JSON)
// maja "Z" doklejane automatycznie przez Date.prototype.toJSON w Express,
// wiec dla nich ta funkcja jest neutralna (regex juz wykrywa "Z" i nic nie zmienia).
function parseUtcDate(value) {
  if (!value) return null;
  const s = String(value);
  const maTuzStrefe = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(maTuzStrefe ? s : s + 'Z');
}

// ============================================================
// GODZINY ROBOCZE — pasek uplywu czasu ma liczyc czas TYLKO w godzinach
// pracy mechanika (pon-pt wg jego harmonogramu, z przerwa obiadowa, oraz
// sobota jesli mechanik w niej pracuje), a nie zegarowe 24h/dobe. Godziny
// sa odczytywane z LOKALNEGO czasu przegladarki (firma dziala w jednej
// lokalizacji, wiec to tozsame z czasem w Polsce - podobnie jak reszta
// tego pliku juz zaklada, patrz komentarz przy parseUtcDate).
// ============================================================

// Domyslny harmonogram, gdy mechanik nie ma jeszcze wlasnej konfiguracji
// (np. stare konto sprzed migracji v20) - odpowiada firmowemu standardowi:
// pon-pt 8:00-17:00 z przerwa 11:00-12:00, sobota 8:00-14:00 bez przerwy.
export const DOMYSLNY_HARMONOGRAM = {
  tydzOd: '08:00',
  tydzDo: '17:00',
  tydzPrzerwaOd: '11:00',
  tydzPrzerwaMin: 60,
  sobOd: '08:00',
  sobDo: '14:00',
  sobPrzerwaOd: null,
  sobPrzerwaMin: 0,
};

// "HH:MM" -> liczba minut od polnocy. Zwraca null dla pustej/niepoprawnej wartosci.
function parseHHMM(str) {
  if (str === null || str === undefined || str === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Wyciaga harmonogram mechanika z pol doklejonych do Job przez backend
// (SELECT_JOBS w routes/jobs.js aliasuje je jako Mech*). Brakujace/puste
// pola tygodniowe spadaja na domyslny harmonogram firmowy.
export function harmonogramZJoba(job) {
  if (!job) return DOMYSLNY_HARMONOGRAM;
  return {
    tydzOd: job.MechGodzTydzOd || DOMYSLNY_HARMONOGRAM.tydzOd,
    tydzDo: job.MechGodzTydzDo || DOMYSLNY_HARMONOGRAM.tydzDo,
    tydzPrzerwaOd: job.MechGodzTydzPrzerwaOd ?? DOMYSLNY_HARMONOGRAM.tydzPrzerwaOd,
    tydzPrzerwaMin: job.MechGodzTydzPrzerwaMin != null ? Number(job.MechGodzTydzPrzerwaMin) : DOMYSLNY_HARMONOGRAM.tydzPrzerwaMin,
    sobOd: job.MechGodzSobOd ?? DOMYSLNY_HARMONOGRAM.sobOd,
    sobDo: job.MechGodzSobDo ?? DOMYSLNY_HARMONOGRAM.sobDo,
    sobPrzerwaOd: job.MechGodzSobPrzerwaOd ?? DOMYSLNY_HARMONOGRAM.sobPrzerwaOd,
    sobPrzerwaMin: job.MechGodzSobPrzerwaMin != null ? Number(job.MechGodzSobPrzerwaMin) : DOMYSLNY_HARMONOGRAM.sobPrzerwaMin,
  };
}

// Dzieli okno pracy [start,end] (w minutach od polnocy) na 1 lub 2 kawalki,
// wycinajac przerwe [przerwaOd, przerwaOd+przerwaMin). PrzerwaMin<=0 albo
// brak godziny przerwy = brak przerwy tego dnia (zwraca jedno pelne okno).
function podzielPrzerwa(start, end, przerwaOd, przerwaMin) {
  if (!przerwaMin || przerwaMin <= 0 || przerwaOd == null) return [[start, end]];
  const przerwaKoniec = przerwaOd + przerwaMin;
  const oknaRaw = [
    [start, Math.min(przerwaOd, end)],
    [Math.max(przerwaKoniec, start), end],
  ];
  return oknaRaw.filter(([s, e]) => e > s);
}

// Zwraca liste okien pracy (w minutach od polnocy) dla KONKRETNEGO dnia
// kalendarzowego wg harmonogramu - pon-pt wg czesci "tydz", sobota wg
// czesci "sob" (pusta lista = wolne, np. brak godzin soboty), niedziela
// zawsze wolna (firma nie pracuje w niedziele).
function oknaDnia(date, harmonogram) {
  const dow = date.getDay(); // 0=niedz .. 6=sob
  if (dow === 0) return [];
  if (dow === 6) {
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

// Liczy ile milisekund PRACY (wg harmonogramu) uplynelo pomiedzy dwoma
// momentami w czasie - pomijajac noce, niedziele, godziny poza grafikiem
// i przerwy. Dziala dzien po dniu (zakres zwykle to najwyzej kilka/kilkanascie
// dni roboty, wiec petla jest tania).
export function roboczeMilisekundyMiedzy(start, end, harmonogram = DOMYSLNY_HARMONOGRAM) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  let total = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const ostatniDzien = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor.getTime() <= ostatniDzien.getTime()) {
    const dzienPoczatek = new Date(cursor);
    const dzienKoniec = new Date(cursor);
    dzienKoniec.setDate(dzienKoniec.getDate() + 1);

    const clampStart = start > dzienPoczatek ? start : dzienPoczatek;
    const clampEnd = end < dzienKoniec ? end : dzienKoniec;

    if (clampEnd > clampStart) {
      for (const [wS, wE] of oknaDnia(cursor, harmonogram)) {
        const oknoStart = new Date(cursor);
        oknoStart.setMinutes(oknoStart.getMinutes() + wS);
        const oknoEnd = new Date(cursor);
        oknoEnd.setMinutes(oknoEnd.getMinutes() + wE);

        const overlapStart = clampStart > oknoStart ? clampStart : oknoStart;
        const overlapEnd = clampEnd < oknoEnd ? clampEnd : oknoEnd;
        if (overlapEnd > overlapStart) total += overlapEnd.getTime() - overlapStart.getTime();
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

// Jak wyzej, ale zwraca od razu godziny (uzywane przez getElapsedInfo/
// getCzynnoscElapsedInfo/getCompletionInfo zamiast prostego odejmowania dat).
function roboczeGodzinyMiedzy(start, end, harmonogram) {
  return roboczeMilisekundyMiedzy(start, end, harmonogram) / 3600000;
}

// Zwraca { elapsedHours, minHours, estimateHours, maxHours, percent, status } dla roboty w trakcie.
// status okresla strefe koloru paska:
//   'ok'           (zielona)  — od 0 do czasu minimalnego
//   'blisko'       (zolta)    — od czasu minimalnego do sredniego
//   'przekroczono' (czerwona) — powyzej czasu sredniego, az do zakonczenia
//   'brak-szacunku'           — robota bez zadnego szacowanego czasu (np. bez predefiniowanej pracy)
// Pasek jest wypelniany LINIOWO wzgledem czasu: percent = uplynelo / (maksymalny
// szacowany czas), wiec dlugosc paska zawsze odpowiada realnemu czasowi (np. 3 z
// 12 min = dokladnie 25%), a nie sztucznemu podzialowi na rowne odcinki na strefe.
export function getElapsedInfo(job, now = new Date()) {
  if (!job?.DataRozpoczecia) return null;
  const start = parseUtcDate(job.DataRozpoczecia);
  const elapsedHours = roboczeGodzinyMiedzy(start, now, harmonogramZJoba(job));
  const estimateHours = job.CzasSzacowanySredni != null ? Number(job.CzasSzacowanySredni) : null;

  if (!estimateHours || estimateHours <= 0) {
    return { elapsedHours, minHours: null, estimateHours: null, maxHours: null, percent: null, status: 'brak-szacunku' };
  }

  const minHours = job.CzasSzacowanyMin != null ? Number(job.CzasSzacowanyMin) : estimateHours;
  const maxHoursRaw = job.CzasSzacowanyMax != null ? Number(job.CzasSzacowanyMax) : null;
  // Podstawa (100% paska) to prawdziwy szacowany czas maksymalny, jesli go
  // znamy. W przeciwnym razie (np. zlecenie zlozone z samych recznych
  // czynnosci bez zakresu min-max) uzywamy WPROST sredniego czasu - tej
  // samej liczby, ktora widzi uzytkownik przy "Szac. czas" - bez sztucznego
  // powiekszania, zeby pasek dochodzil do 100% dokladnie wtedy, gdy uplynie
  // widoczny szacowany czas.
  const basis = (maxHoursRaw && maxHoursRaw > estimateHours) ? maxHoursRaw : estimateHours;

  let status;
  if (elapsedHours <= minHours) {
    status = 'ok';
  } else if (elapsedHours <= estimateHours) {
    status = 'blisko';
  } else {
    status = 'przekroczono';
  }
  const percent = Math.min((elapsedHours / basis) * 100, 100);

  return { elapsedHours, minHours, estimateHours, maxHours: maxHoursRaw, percent, status };
}

// Jak wyzej, ale dla POJEDYNCZEJ CZYNNOSCI na zleceniu (kazda czynnosc ma
// wlasny pasek postepu, niezaleznie od innych na tym samym zleceniu).
// Kolorystyka rozni sie w zaleznosci od tego, czy to praca PREDEFINIOWANA
// czy WLASNA (recznie wpisana):
//   - predefiniowana (ma CzasMin/Sredni/Max): 4 strefy
//       0..min zielony, min..sredni niebieski, sredni..max zolty, >max czerwony
//   - wlasna (tylko przewidywany czas w CzasSredni): 2 strefy
//       0..przewidywany zielony, > przewidywany czerwony
// Tak jak w getElapsedInfo, dlugosc paska jest LINIOWA wzgledem czasu
// (percent = uplynelo / maksymalny-szacowany-czas), a status/kolor okresla
// tylko w ktorej strefie (min/sredni/max) aktualnie jestesmy.
// Zwraca { elapsedHours, minHours, estimateHours, maxHours, percent, status,
//          jestPredefiniowana } albo null, gdy czynnosc jeszcze nie ruszyla.
export function getCzynnoscElapsedInfo(czynnosc, now = new Date(), harmonogram = DOMYSLNY_HARMONOGRAM) {
  if (!czynnosc?.DataRozpoczecia) return null;
  const start = parseUtcDate(czynnosc.DataRozpoczecia);
  const end = czynnosc.DataZakonczenia ? parseUtcDate(czynnosc.DataZakonczenia) : now;
  const elapsedHours = roboczeGodzinyMiedzy(start, end, harmonogram);

  const jestPredefiniowana = czynnosc.PredefiniowanaPracaId != null;
  const sredni = czynnosc.CzasSredni != null ? Number(czynnosc.CzasSredni) : null;

  if (!sredni || sredni <= 0) {
    return { elapsedHours, minHours: null, estimateHours: null, maxHours: null, percent: null, status: 'brak-szacunku', jestPredefiniowana };
  }

  if (!jestPredefiniowana) {
    // Zadanie wlasne: uzytkownik widzi tylko jedna liczbe - przewidywany czas
    // ("~10min"), bez zakresu min-max. Podstawa (100% paska) to WLASNIE ten
    // przewidywany czas, wiec pasek dochodzi do pelna dokladnie w momencie
    // jego uplyniecia. Po przekroczeniu pasek zostaje pelny/czerwony, a
    // dokladna wielkosc przekroczenia pokazuje osobny tekst pod paskiem.
    const status = elapsedHours <= sredni ? 'ok' : 'przekroczono';
    const percent = Math.min((elapsedHours / sredni) * 100, 100);
    return { elapsedHours, minHours: null, estimateHours: sredni, maxHours: null, percent, status, jestPredefiniowana };
  }

  // Zadanie predefiniowane: 4 strefy, podstawa (100% paska) = szacowany czas MAKSYMALNY.
  const minHours = czynnosc.CzasMin != null ? Number(czynnosc.CzasMin) : sredni;
  const maxHoursRaw = czynnosc.CzasMax != null ? Number(czynnosc.CzasMax) : null;
  const redSpan = (maxHoursRaw && maxHoursRaw > sredni)
    ? (maxHoursRaw - sredni)
    : Math.max(sredni - minHours, sredni * 0.3, 0.25);
  const maxHours = maxHoursRaw || (sredni + redSpan);

  let status;
  if (elapsedHours <= minHours) {
    status = 'ok';
  } else if (elapsedHours <= sredni) {
    status = 'w-normie';
  } else if (elapsedHours <= maxHours) {
    status = 'blisko';
  } else {
    status = 'przekroczono';
  }
  const percent = Math.min((elapsedHours / maxHours) * 100, 100);

  return { elapsedHours, minHours, estimateHours: sredni, maxHours: maxHoursRaw, percent, status, jestPredefiniowana };
}

// Zwraca informacje o rzeczywistym czasie wykonania juz ZAKONCZONEJ roboty,
// zeby szef/kierownik widzieli, ile faktycznie trwala i czy przekroczono szacunek.
// { totalHours, estimateHours, przekroczono, roznicaHours } lub null gdy brak danych.
export function getCompletionInfo(job) {
  if (job?.Status !== 'zakonczone' || !job.DataRozpoczecia || !job.DataZakonczenia) return null;
  const start = parseUtcDate(job.DataRozpoczecia);
  const end = parseUtcDate(job.DataZakonczenia);
  const totalHours = roboczeGodzinyMiedzy(start, end, harmonogramZJoba(job));
  if (Number.isNaN(totalHours)) return null;

  const estimateHours = job.CzasSzacowanySredni != null ? Number(job.CzasSzacowanySredni) : null;
  const przekroczono = estimateHours != null && totalHours > estimateHours;

  return {
    totalHours,
    estimateHours,
    przekroczono,
    roznicaHours: estimateHours != null ? totalHours - estimateHours : null,
  };
}
