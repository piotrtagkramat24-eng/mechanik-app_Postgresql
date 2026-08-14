import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../api.js';
import { formatGodziny } from '../utils/jobTimeUtils.js';

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

// Buduje i pobiera plik CSV z podanych wierszy (do otwarcia w Excelu).
//
// Uwaga (formula injection w Excelu): jesli komorka CSV zaczyna sie od
// =, +, -, @ (lub tabulatora/CR), Excel przy otwieraniu pliku PRZELICZA jej
// zawartosc jak formule — NIEZALEZNIE od tego, ze pole jest w CSV ujete w
// cudzyslow (cudzyslow to tylko oddzielenie pol, a nie "wymuszenie tekstu").
// Np. czynnosc "-jest po MB Marki" trafia do Excela jako formula "=-jest po
// MB Marki", ktorej nie da sie policzyc -> komorka pokazuje #NAME?, a caly
// wiersz sprawia wrazenie "rozjechanego" wzgledem nagłowkow. Zabezpieczamy
// sie dopisujac na poczatku apostrof — Excel wtedy traktuje pole jako zwykly
// tekst i sam apostrof nie jest widoczny w komorce (dokladnie tak samo jak
// przy recznym wpisywaniu tekstu zaczynajacego sie od minusa do Excela).
const CSV_ZNAKI_FORMULY = ['=', '+', '-', '@', '\t', '\r'];
function csvBezpiecznaWartosc(v) {
  const s = String(v ?? '');
  return CSV_ZNAKI_FORMULY.some((znak) => s.startsWith(znak)) ? `'${s}` : s;
}
function pobierzCsv(nazwaPliku, naglowki, wiersze) {
  const escape = (v) => `"${csvBezpiecznaWartosc(v).replace(/"/g, '""')}"`;
  const tresc = [naglowki.map(escape).join(';'), ...wiersze.map((w) => w.map(escape).join(';'))].join('\r\n');
  const blob = new Blob(['\ufeff' + tresc], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazwaPliku;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

export default function Raporty() {
  const [zakladka, setZakladka] = useState('mechanicy');
  const [od, setOd] = useState(przedDniamiISO(30));
  const [do_, setDo] = useState(todayISO());
  const [wierszeMechanicy, setWierszeMechanicy] = useState([]);
  const [wierszeGospodarczy, setWierszeGospodarczy] = useState([]);
  const [ladowanie, setLadowanie] = useState(false);
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

  const agregatMechanicy = agregujMechanicy(wierszeMechanicy);
  const agregatCzynnosci = agregujCzynnosci(wierszeMechanicy);
  const agregatGospodarczy = agregujGospodarczy(wierszeGospodarczy);

  function eksportujMechanicy() {
    pobierzCsv(
      `raport-mechanicy_${od}_${do_}.csv`,
      ['Mechanik', 'Pojazd', 'Rejestracja', 'Czynność', 'Rozpoczęto', 'Zakończono', 'Czas rzeczywisty (h)', 'Czas szacowany (h)'],
      wierszeMechanicy.map((w) => [
        w.MechanikFullName, `${w.Marka} ${w.Model}`, w.Rejestracja, w.Nazwa,
        formatDataGodzina(w.DataRozpoczecia), formatDataGodzina(w.DataZakonczenia),
        w.CzasRzeczywistyGodziny != null ? Number(w.CzasRzeczywistyGodziny).toFixed(2) : '',
        w.CzasSzacowanySredni != null ? Number(w.CzasSzacowanySredni).toFixed(2) : '',
      ])
    );
  }

  function eksportujGospodarczy() {
    pobierzCsv(
      `raport-gospodarczy_${od}_${do_}.csv`,
      ['Pracownik', 'Zadanie', 'Lokalizacja', 'Data wykonania', 'Numery rejestracyjne'],
      wierszeGospodarczy.map((w) => [
        w.PracownikFullName, w.Zadanie, w.Lokalizacja || '', formatData(w.DataWykonania),
        parseRejestracjeWykonania(w).map((r) => r.numer).join(', '),
      ])
    );
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
        <div className="raporty-quick-ranges">
          <button className="btn btn-secondary btn-small" onClick={() => { setOd(przedDniamiISO(7)); setDo(todayISO()); }}>7 dni</button>
          <button className="btn btn-secondary btn-small" onClick={() => { setOd(przedDniamiISO(30)); setDo(todayISO()); }}>30 dni</button>
          <button className="btn btn-secondary btn-small" onClick={() => { setOd(przedDniamiISO(90)); setDo(todayISO()); }}>90 dni</button>
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

      {!ladowanie && zakladka === 'mechanicy' && agregatMechanicy.length > 0 && (
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
                <XAxis type="number" tickFormatter={(v) => `${v}h`} />
                <YAxis type="category" dataKey="nazwa" width={140} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${v} h`} />
                <Legend />
                <Bar dataKey="Czas rzeczywisty (h)" fill="#2952cc" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Czas szacowany (h)" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {!ladowanie && zakladka === 'mechanicy' && agregatCzynnosci.length > 0 && (
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
                <XAxis type="number" tickFormatter={(v) => `${v}h`} />
                <YAxis type="category" dataKey="nazwa" width={200} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${v} h`} />
                <Legend />
                <Bar dataKey="Śr. czas rzeczywisty (h)" fill="#2952cc" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Śr. czas szacowany (h)" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {!ladowanie && zakladka === 'mechanicy' && (
        <section className="panel raporty-panel">
          <div className="raporty-panel-header">
            <h2>Podsumowanie — {agregatMechanicy.length} {agregatMechanicy.length === 1 ? 'mechanik' : 'mechaników'}, {wierszeMechanicy.length} wykonanych czynności</h2>
            {wierszeMechanicy.length > 0 && (
              <button className="btn btn-secondary btn-small" onClick={eksportujMechanicy}>⬇ Eksportuj do CSV</button>
            )}
          </div>

          {agregatMechanicy.length === 0 ? (
            <p>Brak zakończonych zleceń w wybranym okresie.</p>
          ) : (
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
                        {rozwinieta === a.id && (
                          <tr className="raporty-detail-row">
                            <td colSpan={5}>
                              <table className="raporty-detail-table">
                                <thead>
                                  <tr>
                                    <th>Pojazd</th>
                                    <th>Czynność</th>
                                    <th>Zakończono</th>
                                    <th>Czas rzeczywisty</th>
                                    <th>Czas szacowany</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {wierszeMechanicy.filter((w) => w.MechanikId === a.id).map((w) => (
                                    <tr key={w.CzynnoscId}>
                                      <td>{w.Marka} {w.Model} · {w.Rejestracja}</td>
                                      <td>{w.Nazwa}</td>
                                      <td>{formatDataGodzina(w.DataZakonczenia)}</td>
                                      <td>{w.CzasRzeczywistyGodziny != null ? formatGodziny(w.CzasRzeczywistyGodziny) : '—'}</td>
                                      <td>{w.CzasSzacowanySredni != null ? formatGodziny(w.CzasSzacowanySredni) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!ladowanie && zakladka === 'gospodarczy' && (
        <section className="panel raporty-panel">
          <div className="raporty-panel-header">
            <h2>Podsumowanie — {agregatGospodarczy.length} {agregatGospodarczy.length === 1 ? 'pracownik' : 'pracowników'}, {wierszeGospodarczy.length} wykonań</h2>
            {wierszeGospodarczy.length > 0 && (
              <button className="btn btn-secondary btn-small" onClick={eksportujGospodarczy}>⬇ Eksportuj do CSV</button>
            )}
          </div>

          {agregatGospodarczy.length === 0 ? (
            <p>Brak wykonanych zadań gospodarczych w wybranym okresie.</p>
          ) : (
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
          )}
        </section>
      )}
    </div>
  );
}
