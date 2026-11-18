import React, { useEffect, useState, useCallback } from 'react';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import SearchableSelect from './SearchableSelect.jsx';
import JobCard from './JobCard.jsx';
import EditJobModal from './EditJobModal.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';
import { startPollingWhenVisible } from '../utils/pollWhenVisible.js';

const POLL_INTERVAL_MS = 300000; // 5 min - istotne zdarzenia (przydzielenie, zakonczenie) i tak trafiaja mailem

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

  // Zakonczone zlecenia (pelna historia) sa pobierane WYLACZNIE na zadanie -
  // dopiero gdy ktos faktycznie klinie zakladke "Zakonczone" ponizej, a nie
  // przy kazdym pollu co 4s razem z reszta - patrz handleKlikStatusTab.
  const [completedJobs, setCompletedJobs] = useState([]);
  const [completedLoading, setCompletedLoading] = useState(false);

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
      const wywolania = [api.getCars(), api.getPredefiniowanePrace()];
      // Lista zlecen (i jej poll co kilka sekund) ma sens tylko gdy jest
      // w ogole wyswietlana - zakladka "Dodaj robote" (showJobList=false)
      // pokazuje wylacznie formularze, wiec wczesniej niepotrzebnie sciagala
      // te sama liste co zakladka "Warsztat" w tle, bez zadnego pozytku.
      if (showJobList) wywolania.push(api.getJobs());

      const [carsData, predefData, jobsData] = await Promise.all(wywolania);
      setCars(carsData);
      setPredefiniowane(predefData);
      if (showJobList) setJobs(jobsData);
    } catch (err) {
      setError(err.message);
    }
  }, [showJobList]);

  useEffect(() => {
    refresh();
    return startPollingWhenVisible(refresh, POLL_INTERVAL_MS);
  }, [refresh]);

  // Historia zakonczonych zlecen - pobierana dopiero przy wejsciu w ta
  // zakladke (patrz STATUS_TABS/handleKlikStatusTab nizej), nie w refresh().
  const fetchCompleted = useCallback(async () => {
    setCompletedLoading(true);
    try {
      setCompletedJobs(await api.getJobs(true));
    } catch (err) {
      setError(err.message);
    } finally {
      setCompletedLoading(false);
    }
  }, []);

  function handleKlikStatusTab(key) {
    setStatusFilter(key);
    if (key === 'zakonczone') fetchCompleted();
  }

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
  // "zakonczone" ma osobne zrodlo danych (completedJobs, pobierane na zadanie) -
  // jobs nie zawiera juz zakonczonych wcale (patrz refresh() i api.getJobs()).
  const filteredJobs = statusFilter === 'zakonczone' ? completedJobs : jobs.filter(aktywnyTab.match);

  return (
    <div className="page">
      {error && <div className="error-message">{error}</div>}

      <div className="panel-grid">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-head-icon"><Icon name="car" size={18} /></span>
            <div className="panel-head-text">
              <h2>Rejestracja pojazdu</h2>
              <p className="panel-head-sub">Dodaj auto lub naczepę do bazy, żeby móc otworzyć dla niej zlecenie.</p>
            </div>
          </div>
          <form onSubmit={handleAddCar} className="form form--wide">
            <div className="field">
              <span className="field-label" id="typ-pojazdu-label">Typ pojazdu</span>
              <div className="segmented" role="radiogroup" aria-labelledby="typ-pojazdu-label">
                {[
                  { value: 'samochod', label: 'Samochód', icon: 'car' },
                  { value: 'naczepa', label: 'Naczepa', icon: 'truck' },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={typPojazdu === t.value}
                    className={`segmented-btn ${typPojazdu === t.value ? 'segmented-btn--active' : ''}`}
                    onClick={() => setTypPojazdu(t.value)}
                  >
                    <Icon name={t.icon} size={16} /> {t.label}
                  </button>
                ))}
              </div>
            </div>
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
            <div className="form-row-2">
              <label>
                Marka
                <input value={marka} onChange={(e) => setMarka(e.target.value)} placeholder="np. Mercedes-Benz" required />
              </label>
              <label>
                Model
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="np. Actros" required />
              </label>
            </div>
            <label>
              Numer rejestracyjny
              <input
                className="input-plate"
                value={rejestracja}
                onChange={(e) => setRejestracja(e.target.value)}
                placeholder="WX 12345"
                autoCapitalize="characters"
                required
              />
            </label>
            <div className="form-footer">
              <button className="btn btn-primary" type="submit">
                <Icon name="plus" size={16} /> Dodaj pojazd
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-head-icon"><Icon name="file-plus" size={18} /></span>
            <div className="panel-head-text">
              <h2>Nowe zlecenie serwisowe</h2>
              <p className="panel-head-sub">Wybierz pojazd i prace do wykonania — zlecenie trafi do „Do przydzielenia”.</p>
            </div>
          </div>
          <form onSubmit={handleAddJob} className="form form--wide">
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
                        aria-label={`Usuń ${pr.Nazwa} z listy`}
                      >
                        <Icon name="x" size={13} />
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
            <div className="form-footer">
              <button className="btn btn-primary" type="submit">
                <Icon name="check" size={16} /> Utwórz zlecenie{wybranePrace.length > 1 ? ` (${wybranePrace.length} czynności)` : ''}
              </button>
            </div>
          </form>
        </section>
      </div>

      {showJobList && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-head-icon"><Icon name="clipboard" size={18} /></span>
            <div className="panel-head-text">
              <h2>Zlecenia aktywne <span className="panel-head-count">{jobs.length}</span></h2>
              <p className="panel-head-sub">Wszystkie otwarte zlecenia warsztatu — od nowych po te w trakcie.</p>
            </div>
          </div>
          <div className="inner-tabs">
            {STATUS_TABS.map((tab) => {
              // "zakonczone" liczone z osobnego, pobieranego na zadanie zrodla -
              // zanim ktos tam wejdzie pierwszy raz, licznik po prostu nie jest
              // jeszcze znany (pokazujemy "…" zamiast mylacego "0").
              const count = tab.key === 'zakonczone'
                ? (completedLoading || completedJobs.length > 0 || statusFilter === 'zakonczone' ? completedJobs.length : '…')
                : jobs.filter(tab.match).length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`inner-tab ${statusFilter === tab.key ? 'inner-tab--active' : ''}`}
                  onClick={() => handleKlikStatusTab(tab.key)}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>
          <div className="job-list">
            {statusFilter === 'zakonczone' && completedLoading && <p className="empty-hint">Wczytywanie…</p>}
            {!(statusFilter === 'zakonczone' && completedLoading) && filteredJobs.length === 0 && <p className="empty-hint">Brak robót w tej kategorii.</p>}
            {!(statusFilter === 'zakonczone' && completedLoading) && filteredJobs.map((job) => (
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
