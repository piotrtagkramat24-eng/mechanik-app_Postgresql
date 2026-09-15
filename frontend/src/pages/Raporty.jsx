import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../api.js';
import { formatGodziny } from '../utils/jobTimeUtils.js';
import { pobierzXlsx } from '../utils/excelExport.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function przedDniamiISO(dni) {
  return new Date(Date.now() - dni * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatData(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDataGodzina(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function formatDzienEtykieta(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function agregujMechanicy(wiersze) {
  const mapa = new Map();
  for (const w of wiersze) {
    if (!w.MechanikId) continue;
    if (!mapa.has(w.MechanikId)) {
      mapa.set(w.MechanikId, {
        id: w.MechanikId,
        nazwa: w.MechanikFullName,
        liczbaCzynnosci: 0,
        sumaRzeczywista: 0,
        sumaSzacowana: 0,
      });
    }
    const wpis = mapa.get(w.MechanikId);
    wpis.liczbaCzynnosci += 1;
    wpis.sumaRzeczywista += Number(w.CzasRzeczywistyGodziny) || 0;
    wpis.sumaSzacowana += Number(w.CzasSzacowanySredni) || 0;
  }
  return Array.from(mapa.values()).sort((a, b) => b.liczbaCzynnosci - a.liczbaCzynnosci);
}

// Sredni czas rzeczywisty i szacowany PER RODZAJ CZYNNOSCI (nie per mechanik) -
// pozwala zobaczyc, ktore czynnosci systematycznie trwaja dluzej/krocej niz
// norma. Ograniczone do TOP N najczesciej wykonywanych czynnosci w okresie,
// zeby wykres pozostal czytelny.
function agregujCzynnosci(wiersze, limit = 10) {
  const mapa = new Map();
  for (const w of wiersze) {
    const klucz = w.Nazwa || '—';
    if (!mapa.has(klucz)) {
      mapa.set(klucz, { nazwa: klucz, liczba: 0, sumaRzeczywista: 0, liczbaRzeczywista: 0, sumaSzacowana: 0, liczbaSzacowana: 0 });
    }
    const wpis = mapa.get(klucz);
    wpis.liczba += 1;
    if (w.CzasRzeczywistyGodziny != null) {
      wpis.sumaRzeczywista += Number(w.CzasRzeczywistyGodziny) || 0;
      wpis.liczbaRzeczywista += 1;
    }
    if (w.CzasSzacowanySredni != null) {
      wpis.sumaSzacowana += Number(w.CzasSzacowanySredni) || 0;
      wpis.liczbaSzacowana += 1;
    }
  }
  return Array.from(mapa.values())
    .map((w) => ({
      nazwa: w.nazwa,
      liczba: w.liczba,
      sredniaRzeczywista: w.liczbaRzeczywista > 0 ? w.sumaRzeczywista / w.liczbaRzeczywista : 0,
      sredniaSzacowana: w.liczbaSzacowana > 0 ? w.sumaSzacowana / w.liczbaSzacowana : 0,
    }))
    .sort((a, b) => b.liczba - a.liczba)
    .slice(0, limit);
}

// Parsuje numery rejestracyjne dla jednego wykonania — albo ze stalej listy
// z osobnym wykonano/nie-wykonano (RejestracjeWykonanieJson), albo, gdy jej
// brak, z listy wpisanej na dany dzien dla zadan cyklicznych (RejestracjeDniaRaw).
function parseRejestracjeWykonania(w) {
  if (w.RejestracjeWykonanieJson) {
    try {
      const parsed = JSON.parse(w.RejestracjeWykonanieJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((r) => ({ numer: r.Rejestracja, wykonano: !!r.Wykonano }));
      }
    } catch { /* ignoruj, sprobuj dziennej listy */ }
  }
  if (w.RejestracjeDniaRaw) {
    try {
      const parsed = JSON.parse(w.RejestracjeDniaRaw);
      if (Array.isArray(parsed)) return parsed.map((numer) => ({ numer, wykonano: null }));
    } catch { /* brak danych */ }
  }
  return [];
}

// Zlecenia JEDNEGO mechanika w chronologicznej kolejnosci zakonczenia -
// czas rzeczywisty i szacowany obok siebie, zeby na wykresie od razu bylo
// widac PRZY KTORYM zleceniu czas rzeczywisty odbiegal od szacowanego
// (a nie tylko sama suma/srednia za caly okres).
function daneZlecenMechanika(wiersze, mechanikId) {
  return wiersze
    .filter((w) => w.MechanikId === mechanikId)
    .slice()
    .sort((a, b) => new Date(a.DataZakonczenia) - new Date(b.DataZakonczenia))
    .map((w, i) => {
      const rzeczywisty = w.CzasRzeczywistyGodziny != null ? Number(Number(w.CzasRzeczywistyGodziny).toFixed(2)) : null;
      const szacowany = w.CzasSzacowanySredni != null ? Number(Number(w.CzasSzacowanySredni).toFixed(2)) : null;
      return {
        indeks: i + 1,
        etykieta: formatDataGodzina(w.DataZakonczenia),
        nazwa: w.Nazwa,
        pojazd: `${w.Marka} ${w.Model} · ${w.Rejestracja}`,
        rzeczywisty,
        szacowany,
        odchylenie: (rzeczywisty != null && szacowany != null) ? Number((rzeczywisty - szacowany).toFixed(2)) : null,
      };
    });
}

function MechanikZlecenieTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="raporty-chart-tooltip">
      <div className="raporty-chart-tooltip-title">{d.nazwa}</div>
      <div className="raporty-chart-tooltip-sub">{d.pojazd} · {d.etykieta}</div>
      <div>Czas rzeczywisty: <strong>{d.rzeczywisty != null ? `${d.rzeczywisty} h` : '—'}</strong></div>
      <div>Czas szacowany: <strong>{d.szacowany != null ? `${d.szacowany} h` : '—'}</strong></div>
      {d.odchylenie != null && (
        <div className={d.odchylenie > 0 ? 'raporty-odchylenie-plus' : 'raporty-odchylenie-minus'}>
          Odchylenie: {d.odchylenie > 0 ? '+' : ''}{d.odchylenie} h
        </div>
      )}
    </div>
  );
}

function agregujGospodarczy(wiersze) {
  const mapa = new Map();
  for (const w of wiersze) {
    if (!w.PracownikId) continue;
    if (!mapa.has(w.PracownikId)) {
      mapa.set(w.PracownikId, { id: w.PracownikId, nazwa: w.PracownikFullName, liczbaWykonan: 0 });
    }
    mapa.get(w.PracownikId).liczbaWykonan += 1;
  }
  return Array.from(mapa.values()).sort((a, b) => b.liczbaWykonan - a.liczbaWykonan);
}

// Buduje serie dzienna w calym wybranym zakresie (wypelniajac zerami dni bez
// zadnej aktywnosci), zeby wykres trendu mial ciagla linie/obszar zamiast
// przeskakiwac tylko po dniach z danymi.
function agregujTrend(wiersze, poleDaty, od, do_) {
  const mapa = new Map();
  for (const w of wiersze) {
    const wartosc = w[poleDaty];
    if (!wartosc) continue;
    const dzien = String(wartosc).slice(0, 10);
    if (!mapa.has(dzien)) mapa.set(dzien, { liczba: 0, godziny: 0 });
    const wpis = mapa.get(dzien);
    wpis.liczba += 1;
    if (w.CzasRzeczywistyGodziny != null) wpis.godziny += Number(w.CzasRzeczywistyGodziny) || 0;
  }

  const wynik = [];
  const kursor = new Date(od + 'T00:00:00');
  const koniec = new Date(do_ + 'T00:00:00');
  while (kursor <= koniec) {
    const iso = kursor.toISOString().slice(0, 10);
    const wpis = mapa.get(iso);
    wynik.push({
      dzien: iso,
      etykieta: formatDzienEtykieta(iso),
      liczba: wpis ? wpis.liczba : 0,
      godziny: wpis ? Number(wpis.godziny.toFixed(2)) : 0,
    });
    kursor.setDate(kursor.getDate() + 1);
  }
  return wynik;
}

const ZAKRESY_SZYBKIE = [
  { dni: 7, etykieta: '7 dni' },
  { dni: 30, etykieta: '30 dni' },
  { dni: 90, etykieta: '90 dni' },
];

function KpiCard({ label, value, sub, tone }) {
  return (
    <div className={`raporty-kpi-card ${tone ? `raporty-kpi-card--${tone}` : ''}`}>
      <div className="raporty-kpi-value">{value}</div>
      <div className="raporty-kpi-label">{label}</div>
      {sub && <div className="raporty-kpi-sub">{sub}</div>}
    </div>
  );
}

export default function Raporty() {
  const [zakladka, setZakladka] = useState('mechanicy');
  const [od, setOd] = useState(przedDniamiISO(30));
  const [do_, setDo] = useState(todayISO());
  const [wierszeMechanicy, setWierszeMechanicy] = useState([]);
  const [wierszeGospodarczy, setWierszeGospodarczy] = useState([]);
  const [ladowanie, setLadowanie] = useState(false);
  const [eksportowanie, setEksportowanie] = useState(false);
  const [error, setError] = useState('');
  const [rozwinieta, setRozwinieta] = useState(null);

  const generuj = useCallback(async () => {
    setLadowanie(true);
    setError('');
    try {
      const [mech, gosp] = await Promise.all([
        api.getRaportMechanicy(od, do_),
        api.getRaportGospodarczy(od, do_),
      ]);
      setWierszeMechanicy(mech);
      setWierszeGospodarczy(gosp);
    } catch (err) {
      setError(err.message);
    } finally {
      setLadowanie(false);
    }
  }, [od, do_]);

  useEffect(() => { generuj(); }, [generuj]);

  const agregatMechanicy = useMemo(() => agregujMechanicy(wierszeMechanicy), [wierszeMechanicy]);
  const agregatCzynnosci = useMemo(() => agregujCzynnosci(wierszeMechanicy), [wierszeMechanicy]);
  const agregatGospodarczy = useMemo(() => agregujGospodarczy(wierszeGospodarczy), [wierszeGospodarczy]);
  const trendMechanicy = useMemo(() => agregujTrend(wierszeMechanicy, 'DataZakonczenia', od, do_), [wierszeMechanicy, od, do_]);
  const trendGospodarczy = useMemo(() => agregujTrend(wierszeGospodarczy, 'DataWykonania', od, do_), [wierszeGospodarczy, od, do_]);

  const sumaRzeczywista = agregatMechanicy.reduce((s, a) => s + a.sumaRzeczywista, 0);
  const sumaSzacowana = agregatMechanicy.reduce((s, a) => s + a.sumaSzacowana, 0);
  const odchylenieLaczne = sumaRzeczywista - sumaSzacowana;
  const maSzacowanieLaczne = sumaSzacowana > 0;

  const aktywnyZakresDni = Math.round((new Date(do_) - new Date(od)) / 86400000);

  async function eksportujMechanicy() {
    setEksportowanie(true);
    try {
      await pobierzXlsx(`raport-mechanicy_${od}_${do_}.xlsx`, [{
        nazwa: 'Mechanicy',
        kolumny: [
          { naglowek: 'Mechanik', klucz: 'mechanik', szerokosc: 22 },
          { naglowek: 'Pojazd', klucz: 'pojazd', szerokosc: 20 },
          { naglowek: 'Rejestracja', klucz: 'rejestracja', szerokosc: 14 },
          { naglowek: 'Czynność', klucz: 'czynnosc', szerokosc: 30 },
          { naglowek: 'Rozpoczęto', klucz: 'rozpoczeto', szerokosc: 18, numFmt: 'dd.mm.yyyy hh:mm' },
          { naglowek: 'Zakończono', klucz: 'zakonczono', szerokosc: 18, numFmt: 'dd.mm.yyyy hh:mm' },
          { naglowek: 'Czas rzeczywisty (h)', klucz: 'czasRzeczywisty', szerokosc: 16, numFmt: '0.00' },
          { naglowek: 'Czas szacowany (h)', klucz: 'czasSzacowany', szerokosc: 16, numFmt: '0.00' },
          { naglowek: 'Odchylenie (h)', klucz: 'odchylenie', szerokosc: 14, numFmt: '+0.00;-0.00;0.00' },
        ],
        wiersze: wierszeMechanicy.map((w) => ({
          mechanik: w.MechanikFullName || '—',
          pojazd: `${w.Marka} ${w.Model}`,
          rejestracja: w.Rejestracja,
          czynnosc: w.Nazwa,
          rozpoczeto: w.DataRozpoczecia ? new Date(w.DataRozpoczecia) : null,
          zakonczono: w.DataZakonczenia ? new Date(w.DataZakonczenia) : null,
          czasRzeczywisty: w.CzasRzeczywistyGodziny != null ? Number(w.CzasRzeczywistyGodziny) : null,
          czasSzacowany: w.CzasSzacowanySredni != null ? Number(w.CzasSzacowanySredni) : null,
          odchylenie: (w.CzasRzeczywistyGodziny != null && w.CzasSzacowanySredni != null)
            ? Number(w.CzasRzeczywistyGodziny) - Number(w.CzasSzacowanySredni)
            : null,
        })),
      }]);
    } catch (err) {
      setError('Nie udało się wygenerować pliku Excel: ' + err.message);
    } finally {
      setEksportowanie(false);
    }
  }

  async function eksportujGospodarczy() {
    setEksportowanie(true);
    try {
      await pobierzXlsx(`raport-gospodarczy_${od}_${do_}.xlsx`, [{
        nazwa: 'Gospodarczy',
        kolumny: [
          { naglowek: 'Pracownik', klucz: 'pracownik', szerokosc: 22 },
          { naglowek: 'Zadanie', klucz: 'zadanie', szerokosc: 30 },
          { naglowek: 'Lokalizacja', klucz: 'lokalizacja', szerokosc: 20 },
          { naglowek: 'Data wykonania', klucz: 'dataWykonania', szerokosc: 16, numFmt: 'dd.mm.yyyy' },
          { naglowek: 'Numery rejestracyjne', klucz: 'rejestracje', szerokosc: 28 },
        ],
        wiersze: wierszeGospodarczy.map((w) => ({
          pracownik: w.PracownikFullName || '—',
          zadanie: w.Zadanie,
          lokalizacja: w.Lokalizacja || '',
          dataWykonania: w.DataWykonania ? new Date(w.DataWykonania) : null,
          rejestracje: parseRejestracjeWykonania(w).map((r) => r.numer).join(', '),
        })),
      }]);
    } catch (err) {
      setError('Nie udało się wygenerować pliku Excel: ' + err.message);
    } finally {
      setEksportowanie(false);
    }
  }

  return (
    <div className="page raporty-page">
      <h1 className="page-title">Raporty pracy</h1>
      <p className="page-subtitle">
        Zestawienie wykonanej pracy warsztatowej oraz zadań gospodarczych w wybranym okresie.
      </p>

      <div className="raporty-toolbar">
        <label className="raporty-date-field">
          Od
          <input type="date" value={od} max={do_} onChange={(e) => setOd(e.target.value)} />
        </label>
        <label className="raporty-date-field">
          Do
          <input type="date" value={do_} min={od} max={todayISO()} onChange={(e) => setDo(e.target.value)} />
        </label>
        <div className="raporty-segmented">
          {ZAKRESY_SZYBKIE.map((z) => (
            <button
              key={z.dni}
              type="button"
              className={`raporty-segmented-btn ${aktywnyZakresDni === z.dni ? 'raporty-segmented-btn--active' : ''}`}
              onClick={() => { setOd(przedDniamiISO(z.dni)); setDo(todayISO()); }}
            >
              {z.etykieta}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="inner-tabs">
        <button className={`inner-tab ${zakladka === 'mechanicy' ? 'inner-tab--active' : ''}`} onClick={() => setZakladka('mechanicy')}>
          🔧 Mechanicy
        </button>
        <button className={`inner-tab ${zakladka === 'gospodarczy' ? 'inner-tab--active' : ''}`} onClick={() => setZakladka('gospodarczy')}>
          🧹 Pracownik gospodarczy
        </button>
      </div>

      {ladowanie && <p className="raporty-loading">Wczytywanie danych…</p>}

      {!ladowanie && zakladka === 'mechanicy' && (
        <>
          <div className="raporty-kpi-grid">
            <KpiCard label="Wykonane czynności" value={wierszeMechanicy.length} />
            <KpiCard label="Mechanicy" value={agregatMechanicy.length} />
            <KpiCard label="Czas rzeczywisty łącznie" value={formatGodziny(sumaRzeczywista)} />
            <KpiCard
              label="Odchylenie od normy"
              value={maSzacowanieLaczne ? `${odchylenieLaczne > 0 ? '+' : ''}${formatGodziny(odchylenieLaczne)}` : '—'}
              tone={!maSzacowanieLaczne ? undefined : (odchylenieLaczne > 0 ? 'red' : 'green')}
            />
          </div>

          {wierszeMechanicy.length === 0 ? (
            <section className="panel raporty-panel">
              <p className="raporty-empty">Brak zakończonych zleceń w wybranym okresie.</p>
            </section>
          ) : (
            <>
              <section className="panel raporty-panel">
                <div className="raporty-panel-header">
                  <h2>Wykonana praca w czasie</h2>
                </div>
                <div className="raporty-chart-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trendMechanicy} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="raportyTrendMechanicy" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b72f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b72f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="etykieta" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} width={40} />
                      <Tooltip formatter={(v) => [`${v} h`, 'Czas rzeczywisty']} labelFormatter={(l) => l} />
                      <Area type="monotone" dataKey="godziny" name="Czas rzeczywisty (h)" stroke="#3b72f6" strokeWidth={2} fill="url(#raportyTrendMechanicy)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {agregatMechanicy.length > 0 && (
                <section className="panel raporty-panel">
                  <div className="raporty-panel-header">
                    <h2>Czas rzeczywisty a czas szacowany — per mechanik</h2>
                  </div>
                  <div className="raporty-chart-wrap">
                    <ResponsiveContainer width="100%" height={Math.max(220, agregatMechanicy.length * 46)}>
                      <BarChart
                        data={agregatMechanicy.map((a) => ({
                          nazwa: a.nazwa,
                          'Czas rzeczywisty (h)': Number(a.sumaRzeczywista.toFixed(2)),
                          'Czas szacowany (h)': Number(a.sumaSzacowana.toFixed(2)),
                        }))}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `${v}h`} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="nazwa" width={140} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => `${v} h`} />
                        <Legend />
                        <Bar dataKey="Czas rzeczywisty (h)" fill="#3b72f6" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Czas szacowany (h)" fill="#e08c00" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {agregatCzynnosci.length > 0 && (
                <section className="panel raporty-panel">
                  <div className="raporty-panel-header">
                    <h2>Średni czas rzeczywisty a szacowany — TOP {agregatCzynnosci.length} czynności</h2>
                  </div>
                  <div className="raporty-chart-wrap">
                    <ResponsiveContainer width="100%" height={Math.max(220, agregatCzynnosci.length * 46)}>
                      <BarChart
                        data={agregatCzynnosci.map((a) => ({
                          nazwa: a.nazwa,
                          'Śr. czas rzeczywisty (h)': Number(a.sredniaRzeczywista.toFixed(2)),
                          'Śr. czas szacowany (h)': Number(a.sredniaSzacowana.toFixed(2)),
                        }))}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `${v}h`} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="nazwa" width={200} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => `${v} h`} />
                        <Legend />
                        <Bar dataKey="Śr. czas rzeczywisty (h)" fill="#3b72f6" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Śr. czas szacowany (h)" fill="#e08c00" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              <section className="panel raporty-panel">
                <div className="raporty-panel-header">
                  <h2>Szczegóły — {agregatMechanicy.length} {agregatMechanicy.length === 1 ? 'mechanik' : 'mechaników'}, {wierszeMechanicy.length} wykonanych czynności</h2>
                  <button className="btn btn-secondary btn-small" onClick={eksportujMechanicy} disabled={eksportowanie}>
                    {eksportowanie ? 'Generowanie…' : '⬇ Eksportuj do Excela'}
                  </button>
                </div>

                <div className="raporty-table-wrap">
                  <table className="raporty-table">
                    <thead>
                      <tr>
                        <th>Mechanik</th>
                        <th>Wykonane czynności</th>
                        <th>Czas rzeczywisty</th>
                        <th>Czas szacowany</th>
                        <th>Odchylenie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agregatMechanicy.map((a) => {
                        const roznica = a.sumaRzeczywista - a.sumaSzacowana;
                        const maSzacowanie = a.sumaSzacowana > 0;
                        return (
                          <React.Fragment key={a.id}>
                            <tr className="raporty-row-clickable" onClick={() => setRozwinieta(rozwinieta === a.id ? null : a.id)}>
                              <td><strong>{a.nazwa}</strong></td>
                              <td>{a.liczbaCzynnosci}</td>
                              <td>{formatGodziny(a.sumaRzeczywista)}</td>
                              <td>{maSzacowanie ? formatGodziny(a.sumaSzacowana) : '—'}</td>
                              <td>
                                {maSzacowanie ? (
                                  <span className={roznica > 0 ? 'raporty-odchylenie-plus' : 'raporty-odchylenie-minus'}>
                                    {roznica > 0 ? '+' : ''}{formatGodziny(roznica)}
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                            {rozwinieta === a.id && (() => {
                              const daneZlecen = daneZlecenMechanika(wierszeMechanicy, a.id);
                              return (
                                <tr className="raporty-detail-row">
                                  <td colSpan={5}>
                                    <div className="raporty-detail-chart-wrap">
                                      <div className="raporty-detail-chart-title">Zlecenia w czasie — {a.nazwa}</div>
                                      <ResponsiveContainer width="100%" height={180}>
                                        <LineChart data={daneZlecen} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                          <XAxis dataKey="indeks" tick={{ fontSize: 11 }} tickFormatter={(v) => `#${v}`} />
                                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} width={40} />
                                          <Tooltip content={<MechanikZlecenieTooltip />} />
                                          <Legend />
                                          <Line type="monotone" dataKey="rzeczywisty" name="Czas rzeczywisty (h)" stroke="#3b72f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                                          <Line type="monotone" dataKey="szacowany" name="Czas szacowany (h)" stroke="#e08c00" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                    <table className="raporty-detail-table">
                                      <thead>
                                        <tr>
                                          <th>Pojazd</th>
                                          <th>Czynność</th>
                                          <th>Zakończono</th>
                                          <th>Czas rzeczywisty</th>
                                          <th>Czas szacowany</th>
                                          <th>Odchylenie</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {wierszeMechanicy.filter((w) => w.MechanikId === a.id).map((w) => {
                                          const maOba = w.CzasRzeczywistyGodziny != null && w.CzasSzacowanySredni != null;
                                          const roznicaZlecenia = maOba ? Number(w.CzasRzeczywistyGodziny) - Number(w.CzasSzacowanySredni) : null;
                                          return (
                                            <tr key={w.CzynnoscId}>
                                              <td>{w.Marka} {w.Model} · {w.Rejestracja}</td>
                                              <td>{w.Nazwa}</td>
                                              <td>{formatDataGodzina(w.DataZakonczenia)}</td>
                                              <td>{w.CzasRzeczywistyGodziny != null ? formatGodziny(w.CzasRzeczywistyGodziny) : '—'}</td>
                                              <td>{w.CzasSzacowanySredni != null ? formatGodziny(w.CzasSzacowanySredni) : '—'}</td>
                                              <td>
                                                {maOba ? (
                                                  <span className={roznicaZlecenia > 0 ? 'raporty-odchylenie-plus' : 'raporty-odchylenie-minus'}>
                                                    {roznicaZlecenia > 0 ? '+' : ''}{formatGodziny(roznicaZlecenia)}
                                                  </span>
                                                ) : '—'}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {!ladowanie && zakladka === 'gospodarczy' && (
        <>
          <div className="raporty-kpi-grid">
            <KpiCard label="Wykonania" value={wierszeGospodarczy.length} />
            <KpiCard label="Pracownicy" value={agregatGospodarczy.length} />
            <KpiCard
              label="Śr. wykonań / pracownika"
              value={agregatGospodarczy.length > 0 ? (wierszeGospodarczy.length / agregatGospodarczy.length).toFixed(1) : '—'}
            />
          </div>

          {wierszeGospodarczy.length === 0 ? (
            <section className="panel raporty-panel">
              <p className="raporty-empty">Brak wykonanych zadań gospodarczych w wybranym okresie.</p>
            </section>
          ) : (
            <>
              <section className="panel raporty-panel">
                <div className="raporty-panel-header">
                  <h2>Wykonania w czasie</h2>
                </div>
                <div className="raporty-chart-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trendGospodarczy} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="raportyTrendGosp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#18a058" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#18a058" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="etykieta" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                      <Tooltip formatter={(v) => [v, 'Wykonania']} labelFormatter={(l) => l} />
                      <Area type="monotone" dataKey="liczba" name="Wykonania" stroke="#18a058" strokeWidth={2} fill="url(#raportyTrendGosp)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel raporty-panel">
                <div className="raporty-panel-header">
                  <h2>Szczegóły — {agregatGospodarczy.length} {agregatGospodarczy.length === 1 ? 'pracownik' : 'pracowników'}, {wierszeGospodarczy.length} wykonań</h2>
                  <button className="btn btn-secondary btn-small" onClick={eksportujGospodarczy} disabled={eksportowanie}>
                    {eksportowanie ? 'Generowanie…' : '⬇ Eksportuj do Excela'}
                  </button>
                </div>

                <div className="raporty-table-wrap">
                  <table className="raporty-table">
                    <thead>
                      <tr>
                        <th>Pracownik</th>
                        <th>Wykonane zadania</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agregatGospodarczy.map((a) => (
                        <React.Fragment key={a.id}>
                          <tr className="raporty-row-clickable" onClick={() => setRozwinieta(rozwinieta === a.id ? null : `g${a.id}`)}>
                            <td><strong>{a.nazwa}</strong></td>
                            <td>{a.liczbaWykonan}</td>
                          </tr>
                          {rozwinieta === `g${a.id}` && (
                            <tr className="raporty-detail-row">
                              <td colSpan={2}>
                                <table className="raporty-detail-table">
                                  <thead>
                                    <tr>
                                      <th>Zadanie</th>
                                      <th>Lokalizacja</th>
                                      <th>Data wykonania</th>
                                      <th>Numery rejestracyjne</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {wierszeGospodarczy.filter((w) => w.PracownikId === a.id).map((w) => {
                                      const rejestracje = parseRejestracjeWykonania(w);
                                      return (
                                        <tr key={w.Id}>
                                          <td>{w.Zadanie}</td>
                                          <td>{w.Lokalizacja || '—'}</td>
                                          <td>{formatData(w.DataWykonania)}</td>
                                          <td>
                                            {rejestracje.length === 0 ? '—' : (
                                              <div className="raporty-rejestracje-chips">
                                                {rejestracje.map((r) => (
                                                  <span
                                                    key={r.numer}
                                                    className={`chip chip--rejestracja ${r.wykonano === true ? 'chip--wykonano' : r.wykonano === false ? 'chip--niewykonano' : ''}`}
                                                  >
                                                    {r.numer}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
