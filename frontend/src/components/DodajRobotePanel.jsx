import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import SearchableSelect from './SearchableSelect.jsx';
import JobCard from './JobCard.jsx';
import EditJobModal from './EditJobModal.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';

const POLL_INTERVAL_MS = 4000;

const KATEGORIE_NACZEP = [
  'Plandeka',
  'Chłodnia / Izoterma',
  'Wywrotka',
  'Cysterna',
  'Kontenerowa',
  'Firanka / Kurtyna',
  'Niskopodwoziowa',
  'Inna',
];

// Panel "Dodaj pojazd" + "Dodaj robotę do pojazdu" — z wyszukiwarką pojazdów
// i predefiniowanych prac (z podpowiadanym czasem normatywnym).
// Uzywany zarowno przez szefa (Boss.jsx), jak i kierownika (Manager.jsx),
// ktorzy maja te same uprawnienia do zglaszania robot.
export default function DodajRobotePanel({ user, showJobList = true }) {
  const [jobs, setJobs] = useState([]);
  const [cars, setCars] = useState([]);
  const [predefiniowane, setPredefiniowane] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('wszystkie');
  const [editJob, setEditJob] = useState(null);

  const [marka, setMarka] = useState('');
  const [model, setModel] = useState('');
  const [rejestracja, setRejestracja] = useState('');
  const [typPojazdu, setTypPojazdu] = useState('samochod');
  const [kategoria, setKategoria] = useState('');

  const [carId, setCarId] = useState('');
  const [predefiniowanaPracaId, setPredefiniowanaPracaId] = useState('');
  // Prace wybrane do dodania w jednym kroku — mozna wybrac kilka predefiniowanych
  // prac dla tego samego pojazdu, kazda zostanie zapisana jako osobne zlecenie
  // (z wlasnymi normatywnymi czasami), zeby dalej dalo sie je osobno przydzielac,
  // sledzic i rozliczac.
  const [wybranePrace, setWybranePrace] = useState([]);
  const [opis, setOpis] = useState('');
  const [opisCzas, setOpisCzas] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [jobsData, carsData, predefData] = await Promise.all([
        api.getJobs(),
        api.getCars(),
        api.getPredefiniowanePrace(),
      ]);
      setJobs(jobsData);
      setCars(carsData);
      setPredefiniowane(predefData);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleAddCar(e) {
    e.preventDefault();
    setError('');
    try {
      const newCar = await api.createCar(marka, model, rejestracja, typPojazdu, typPojazdu === 'naczepa' ? kategoria : null);
      setMarka('');
      setModel('');
      setRejestracja('');
      setTypPojazdu('samochod');
      setKategoria('');
      setCarId(String(newCar.Id));
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function handlePickPredefiniowana(id) {
    const pr = predefiniowane.find((p) => String(p.Id) === String(id));
    if (!pr) return;
    setWybranePrace((prev) => (
      prev.some((w) => w.Id === pr.Id) ? prev : [...prev, pr]
    ));
    // Reset kontrolki wyszukiwania, zeby od razu byla gotowa do wyboru kolejnej pracy
    setPredefiniowanaPracaId('');
  }

  function handleRemoveWybranaPraca(id) {
    setWybranePrace((prev) => prev.filter((w) => w.Id !== id));
  }

  async function handleAddJob(e) {
    e.preventDefault();
    setError('');
    if (!carId) {
      setError('Wybierz samochód.');
      return;
    }
    if (wybranePrace.length === 0 && !opis.trim()) {
      setError('Wybierz przynajmniej jedną predefiniowaną pracę lub wpisz własny opis roboty.');
      return;
    }
    if (opis.trim() && (!opisCzas || Number(opisCzas) <= 0)) {
      setError('Podaj przewidywany czas wykonania (w godzinach) dla własnego opisu roboty.');
      return;
    }
    try {
      // Wszystkie wybrane pozycje (predefiniowane prace + ewentualny wlasny
      // opis) tworza JEDNO zlecenie z checklista czynnosci — szacowany czas
      // sumuje sie automatycznie z czasow poszczegolnych pozycji.
      const czynnosci = wybranePrace.map((pr) => ({
        predefiniowanaPracaId: pr.Id,
        nazwa: pr.Nazwa,
        czasMin: pr.CzasMin,
        czasSredni: pr.CzasSredni,
        czasMax: pr.CzasMax,
      }));
      if (opis.trim()) {
        czynnosci.push({ nazwa: opis.trim(), czasSredni: Number(opisCzas) });
      }
      await api.createJob(Number(carId), user.Id, czynnosci);
      setOpis('');
      setOpisCzas('');
      setWybranePrace([]);
      setPredefiniowanaPracaId('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEditJob(jobId, data) {
    await api.updateJob(jobId, data);
    setEditJob(null);
    await refresh();
  }

  async function handleDeleteJob(jobId) {
    setError('');
    try {
      await api.deleteJob(jobId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const carOptions = cars.map((c) => ({
    value: c.Id,
    label: `${c.Marka} ${c.Model} (${c.Rejestracja})${c.TypPojazdu === 'naczepa' ? ' — naczepa' : ''}`,
    sublabel: c.TypPojazdu === 'naczepa' && c.Kategoria ? c.Kategoria : '',
  }));

  const predefOptions = predefiniowane
    .filter((p) => !wybranePrace.some((w) => w.Id === p.Id))
    .map((p) => ({
      value: p.Id,
      label: p.Nazwa,
      sublabel: formatCzasSzacowany({ CzasSzacowanyMin: p.CzasMin, CzasSzacowanySredni: p.CzasSredni, CzasSzacowanyMax: p.CzasMax }),
    }));

  // Zakladki filtrujace tablice mechanikow: wszystkie / przydzielone (jeszcze nie
  // rozpoczete) / w trakcie / zakonczone.
  const STATUS_TABS = [
    { key: 'wszystkie', label: 'Wszystkie', match: () => true },
    { key: 'przydzielone', label: 'Przydzielone', match: (j) => j.Status === 'nowe' || j.Status === 'przydzielone' },
    { key: 'w_trakcie', label: 'W trakcie', match: (j) => j.Status === 'rozpoczete' },
    { key: 'zakonczone', label: 'Zakończone', match: (j) => j.Status === 'zakonczone' },
  ];
  const aktywnyTab = STATUS_TABS.find((t) => t.key === statusFilter) || STATUS_TABS[0];
  const filteredJobs = jobs.filter(aktywnyTab.match);

  return (
    <div className="page">
      {error && <div className="error-message">{error}</div>}

      <div className="panel-grid">
        <section className="panel">
          <h2>Rejestracja pojazdu</h2>
          <form onSubmit={handleAddCar} className="form">
            <label>
              Typ pojazdu
              <select value={typPojazdu} onChange={(e) => setTypPojazdu(e.target.value)}>
                <option value="samochod">Samochód</option>
                <option value="naczepa">Naczepa</option>
              </select>
            </label>
            {typPojazdu === 'naczepa' && (
              <label>
                Kategoria naczepy
                <select value={kategoria} onChange={(e) => setKategoria(e.target.value)} required>
                  <option value="">-- wybierz kategorie --</option>
                  {KATEGORIE_NACZEP.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Marka
              <input value={marka} onChange={(e) => setMarka(e.target.value)} required />
            </label>
            <label>
              Model
              <input value={model} onChange={(e) => setModel(e.target.value)} required />
            </label>
            <label>
              Numer rejestracyjny
              <input
                value={rejestracja}
                onChange={(e) => setRejestracja(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Dodaj pojazd
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Nowe zlecenie serwisowe</h2>
          <form onSubmit={handleAddJob} className="form">
            <div className="field">
              <label id="dodaj-robote-pojazd-label">Pojazd</label>
              <SearchableSelect
                id="dodaj-robote-pojazd"
                labelId="dodaj-robote-pojazd-label"
                options={carOptions}
                value={carId}
                onChange={setCarId}
                placeholder="Szukaj po marce, modelu lub rejestracji..."
                emptyText="Brak pasujących pojazdów"
              />
            </div>
            <div className="field">
              <label id="dodaj-robote-predef-label">Predefiniowane prace (można wybrać kilka)</label>
              <SearchableSelect
                id="dodaj-robote-predef"
                labelId="dodaj-robote-predef-label"
                options={predefOptions}
                value={predefiniowanaPracaId}
                onChange={handlePickPredefiniowana}
                placeholder="Szukaj predefiniowanej pracy i dodaj do listy..."
                emptyText="Brak predefiniowanych prac"
              />
            </div>
            {wybranePrace.length > 0 && (
              <div className="field">
                <label>Wybrane prace ({wybranePrace.length}) — razem utworzą jedno zlecenie z listą czynności</label>
                <div className="wybrane-prace-chips">
                  {wybranePrace.map((pr) => (
                    <span key={pr.Id} className="wybrana-praca-chip">
                      {pr.Nazwa}
                      <span className="wybrana-praca-chip-czas">
                        {formatCzasSzacowany({ CzasSzacowanyMin: pr.CzasMin, CzasSzacowanySredni: pr.CzasSredni, CzasSzacowanyMax: pr.CzasMax })}
                      </span>
                      <button
                        type="button"
                        className="wybrana-praca-chip-remove"
                        onClick={() => handleRemoveWybranaPraca(pr.Id)}
                        title="Usuń z listy"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <label>
              Dodatkowy opis {wybranePrace.length > 0 ? '(opcjonalnie, osobna czynność w tym zleceniu)' : 'zlecenia'}
              <textarea
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                rows={3}
                placeholder={wybranePrace.length > 0 ? 'Np. dodatkowa usterka spoza listy predefiniowanych prac...' : 'Opisz zakres prac do wykonania...'}
              />
            </label>
            {opis.trim() && (
              <label>
                Przewidywany czas wykonania (w godzinach)
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={opisCzas}
                  onChange={(e) => setOpisCzas(e.target.value)}
                  placeholder="np. 1.5"
                  required
                />
              </label>
            )}
            <button className="btn btn-primary" type="submit">
              Utwórz zlecenie{wybranePrace.length > 1 ? ` (${wybranePrace.length} czynności)` : ''}
            </button>
          </form>
        </section>
      </div>

      {showJobList && (
        <section className="panel">
          <h2>Wszystkie zlecenia ({jobs.length})</h2>
          <div className="inner-tabs">
            {STATUS_TABS.map((tab) => {
              const count = jobs.filter(tab.match).length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`inner-tab ${statusFilter === tab.key ? 'inner-tab--active' : ''}`}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>
          <div className="job-list">
            {filteredJobs.length === 0 && <p>Brak robót w tej kategorii.</p>}
            {filteredJobs.map((job) => (
              <JobCard
                key={job.Id}
                job={job}
                onEdit={setEditJob}
                onDelete={handleDeleteJob}
              />
            ))}
          </div>
        </section>
      )}

      {editJob && (
        <EditJobModal
          job={editJob}
          predefiniowane={predefiniowane}
          userId={user.Id}
          onConfirm={handleEditJob}
          onCancel={() => setEditJob(null)}
        />
      )}
    </div>
  );
}
