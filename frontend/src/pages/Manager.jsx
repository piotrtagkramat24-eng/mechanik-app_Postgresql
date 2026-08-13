import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import GospodarczyModule from '../components/GospodarczyModule.jsx';
import ElapsedTimeBar from '../components/ElapsedTimeBar.jsx';
import DodajRobotePanel from '../components/DodajRobotePanel.jsx';
import Mechanic from './Mechanic.jsx';
import EditJobModal from '../components/EditJobModal.jsx';
import JobZdjecie from '../components/JobZdjecie.jsx';
import JobCzynnosciList, { parseCzynnosci } from '../components/JobCzynnosciList.jsx';
import FollowUpPanel from '../components/FollowUpPanel.jsx';
import UstawieniaPanel from '../components/UstawieniaPanel.jsx';
import Raporty from './Raporty.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';

const POLL_INTERVAL_MS = 5000;

const TAB_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea',
  '#0891b2', '#dc2626', '#0d9488', '#c2410c',
];

// Skrocony opis zlecenia do karty na tablicy
function KanbanCard({ job, colMechanikId, mechanicy, onMove, onReassign, isDragging, dragHandlers, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Gdy zlecenie ma tylko JEDNA czynnosc, jej wlasny pasek (pokazywany przez
  // JobCzynnosciList wyzej) i pasek zbiorczy dla calego zlecenia pokazywalyby
  // dokladnie te sama liczbe - wiec zbiorczy pasek pokazujemy tylko przy 0
  // czynnosci (stare zlecenia bez rozbicia, gdzie to jedyny pasek) albo przy
  // 2+ czynnosciach (wtedy ma sens jako podsumowanie calego zlecenia).
  const liczbaCzynnosci = parseCzynnosci(job).length;
  const pokazZbiorczyPasek = liczbaCzynnosci !== 1;

  return (
    <div
      className={`kb-card ${isDragging ? 'kb-card--dragging' : ''}`}
      {...dragHandlers}
    >
      <div className="kb-card-drag-handle" title="Przeciągnij aby zmienić kolejność lub mechanika">
        ⠿
      </div>
      <div className="kb-card-body">
        <div className="kb-card-title">
          {job.Marka} {job.Model}
          <span className="kb-card-reg">{job.Rejestracja}</span>
        </div>
        <div className="kb-card-opis"><JobCzynnosciList job={job} /></div>
        {pokazZbiorczyPasek && formatCzasSzacowany(job) && (
          <div className="kb-card-czas">
            ⏱ {liczbaCzynnosci >= 2 ? 'Szac. czas (łącznie)' : 'Szac. czas'}: {formatCzasSzacowany(job)}
          </div>
        )}
        {pokazZbiorczyPasek && <ElapsedTimeBar job={job} />}
        {job.OpisWykonania && (
          <div className="kb-card-wykonanie"><span className="kb-card-wykonanie-label">📝 Do zgłoszenia:</span> {job.OpisWykonania}</div>
        )}
        {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
        <div className="kb-card-footer">
          <StatusBadge status={job.Status} />
          <span className="kb-card-zglosil">zgł. {job.UtworzonoPrzezFullName}</span>
          <div className="kb-card-actions">
            <button
              className="kb-arrow-btn"
              onClick={() => onMove(job.Id, 'up')}
              title="Wyżej w kolejce"
            >▲</button>
            <button
              className="kb-arrow-btn"
              onClick={() => onMove(job.Id, 'down')}
              title="Niżej w kolejce"
            >▼</button>
            {/* Przypisz do innego mechanika */}
            <div className="kb-reassign-wrap" ref={menuRef}>
              <button
                className="kb-arrow-btn kb-arrow-btn--reassign"
                onClick={() => setMenuOpen(o => !o)}
                title="Zmień mechanika"
              >↔</button>
              {menuOpen && (
                <div className="kb-reassign-menu">
                  <div className="kb-reassign-title">Przenieś do:</div>
                  {mechanicy
                    .filter(m => m.Id !== colMechanikId)
                    .map(m => (
                      <button
                        key={m.Id}
                        className="kb-reassign-option"
                        onClick={() => { onReassign(job.Id, m.Id); setMenuOpen(false); }}
                      >
                        {m.FullName}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {onEdit && (
              <button className="kb-arrow-btn" onClick={() => onEdit(job)} title="Edytuj robotę">✏️</button>
            )}
            {onDelete && !confirmingDelete && (
              <button className="kb-arrow-btn" onClick={() => setConfirmingDelete(true)} title="Usuń robotę">🗑️</button>
            )}
            {onDelete && confirmingDelete && (
              <span className="kb-delete-confirm">
                Czy na pewno?
                <button className="btn btn-danger btn-small" onClick={() => { setConfirmingDelete(false); onDelete(job.Id); }}>Tak, usuń</button>
                <button className="btn btn-secondary btn-small" onClick={() => setConfirmingDelete(false)}>Anuluj</button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PO_NAPRAWIE_IKONY = { wyposazenie: '📦', mycie: '🚿' };
const PO_NAPRAWIE_ETYKIETY = { wyposazenie: 'Wyposażenie + Inspecto', mycie: 'Mycie' };

// Male znaczniki na karcie ZAKONCZONEGO zlecenia pokazujace, czy dalsze kroki
// (Wyposazenie / Inspecto / Mycie) zostaly juz wykonane przez przypisanego
// mechanika, czy jeszcze na niego czekaja. Renderuje sie tylko jesli dla
// danego zlecenia w ogole powstaly takie zadania (nie kazde zlecenie je ma -
// np. gdy dla danego typu nikt nie jest przypisany w Ustawieniach).
function PoNaprawieStatusBadges({ jobId, statusPoNaprawiePerJob }) {
  const status = statusPoNaprawiePerJob[jobId];
  if (!status) return null;
  const typy = Object.keys(status);
  if (typy.length === 0) return null;
  return (
    <div className="kb-done-ponaprawie-status">
      {typy.map(typ => (
        <span
          key={typ}
          className={`kb-done-ponaprawie-badge ${status[typ].wykonano ? 'kb-done-ponaprawie-badge--ok' : 'kb-done-ponaprawie-badge--pending'}`}
          title={PO_NAPRAWIE_ETYKIETY[typ] || typ}
        >
          {PO_NAPRAWIE_IKONY[typ] || '🔔'} {PO_NAPRAWIE_ETYKIETY[typ] || typ}: {status[typ].wykonano ? '✓ wykonane' : '⏳ czeka na mechanika'}
        </span>
      ))}
    </div>
  );
}

// Karta zadania "po naprawie" (Wyposazenie / Inspecto / Mycie) - wyswietlana w
// kolumnie mechanika na tablicy Kanban jak prawdziwe zadanie do wykonania,
// a nie tylko jako ikona w naglowku kolumny.
//
// Uwaga: to jest widok KIEROWNIKA/SZEFA na tablicy mechanikow - mechanik sam
// oznacza zadanie jako wykonane ze swojego panelu "Do wykonania po naprawie"
// (patrz FollowUpPanel.jsx), ale kierownik/szef moze je tutaj usunac z tablicy
// (np. gdy powstalo przez pomylke albo juz nie jest potrzebne).
function PoNaprawieCard({ zadanie, onDelete }) {
  function handleDelete() {
    if (!window.confirm(`Usunąć zadanie „${zadanie.TypLabel || zadanie.Typ}” (${zadanie.Marka} ${zadanie.Model} ${zadanie.Rejestracja}) z tablicy?`)) {
      return;
    }
    onDelete(zadanie.Id);
  }

  return (
    <div className={`kb-card kb-card--ponaprawie kb-card--ponaprawie-${zadanie.Typ}`}>
      <div className="kb-card-body">
        <div className="kb-card-title">
          <span className="kb-card-ponaprawie-ikona">{PO_NAPRAWIE_IKONY[zadanie.Typ] || '🔔'}</span>
          {zadanie.TypLabel || zadanie.Typ}
          <span className="kb-card-reg">{zadanie.Rejestracja}</span>
        </div>
        <div className="kb-card-opis">{zadanie.Marka} {zadanie.Model}{zadanie.Opis ? ` — ${zadanie.Opis}` : ''}</div>
        <div className="kb-card-footer">
          <span className="kb-card-ponaprawie-status" title="Może oznaczyć jako wykonane wyłącznie przypisany mechanik">
            ⏳ Czeka na wykonanie przez mechanika
          </span>
          {onDelete && (
            <button
              type="button"
              className="kb-card-ponaprawie-usun"
              title="Usuń to zadanie z tablicy"
              onClick={handleDelete}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ mechanik, color, jobs, allMechanicy, poNaprawie = [], statusPoNaprawiePerJob = {}, onMove, onReassign, onDropJob, isDropTarget, filterMode = 'wszystkie', onEdit, onDelete, onDeletePoNaprawie }) {
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const columnRef = useRef(null);

  // W trybie "wszystkie" dzielimy na aktywne (z drag&drop + kolejnoscia) i zwijana
  // sekcje zakonczonych. Gdy wybrany jest konkretny filtr statusu, `jobs` jest juz
  // wczesniej przefiltrowane przez rodzica, wiec pokazujemy je wprost, bez
  // przeciagania (zeby nie psuc globalnej kolejnosci priorytetow liczonej na
  // pelnej liscie aktywnych zlecen).
  const czyWszystkie = filterMode === 'wszystkie';
  // "W trakcie" (rozpoczete) maja byc widoczne najwyzej w kolumnie - reszta
  // (przydzielone) zostaje posortowana wg kolejnosci priorytetow jak dotychczas.
  const activeJobsRaw = czyWszystkie ? jobs.filter(j => j.Status !== 'zakonczone') : jobs;
  const activeJobs = czyWszystkie
    ? [...activeJobsRaw].sort((a, b) => (a.Status === 'rozpoczete' ? 0 : 1) - (b.Status === 'rozpoczete' ? 0 : 1))
    : activeJobsRaw;
  const doneJobs = czyWszystkie ? jobs.filter(j => j.Status === 'zakonczone') : [];

  // Ikony stanu zamiast liczby zlecen przy nazwisku:
  //  - 🔧 mechanik ma cos aktualnie w trakcie (Status='rozpoczete')
  //  - 📦 czeka na niego niewykonane zadanie Wyposazenie + Inspecto po naprawie
  //  - 🚿 czeka na niego niewykonane zadanie Mycie po naprawie
  //  - 🟢 nic z powyzszego - wolny
  const pracujeTeraz = jobs.some(j => j.Status === 'rozpoczete');
  const maWyposazenie = poNaprawie.some(p => p.Typ === 'wyposazenie');
  const maMycie = poNaprawie.some(p => p.Typ === 'mycie');

  function handleDragStart(e, job) {
    setDraggingId(job.Id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('jobId', String(job.Id));
    e.dataTransfer.setData('fromMechanikId', String(mechanik.Id));
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverIndex(null);
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault();
    const jobId = Number(e.dataTransfer.getData('jobId'));
    const fromMechanikId = Number(e.dataTransfer.getData('fromMechanikId'));
    setDragOverIndex(null);
    onDropJob(jobId, fromMechanikId, mechanik.Id, targetIndex, activeJobs);
  }

  function handleColumnDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleColumnDrop(e) {
    e.preventDefault();
    const jobId = Number(e.dataTransfer.getData('jobId'));
    const fromMechanikId = Number(e.dataTransfer.getData('fromMechanikId'));
    setDragOverIndex(null);
    onDropJob(jobId, fromMechanikId, mechanik.Id, activeJobs.length, activeJobs);
  }

  const initials = mechanik.FullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      className={`kb-column ${isDropTarget ? 'kb-column--drop-target' : ''}`}
      ref={columnRef}
      onDragOver={handleColumnDragOver}
      onDrop={handleColumnDrop}
    >
      {/* Nagłówek kolumny */}
      <div className="kb-column-header" style={{ borderTopColor: color }}>
        <div className="kb-col-avatar" style={{ background: color }}>{initials}</div>
        <div className="kb-col-name">{mechanik.FullName}</div>
        <div className="kb-col-status-icons">
          {pracujeTeraz && <span title="W trakcie pracy" className="kb-col-icon">🔧</span>}
          {maWyposazenie && <span title="Do zrobienia: Wyposażenie + Inspecto" className="kb-col-icon">📦</span>}
          {maMycie && <span title="Do zrobienia: Mycie" className="kb-col-icon">🚿</span>}
          {!pracujeTeraz && !maWyposazenie && !maMycie && (
            <span title="Wolny" className="kb-col-icon kb-col-icon--free">🟢</span>
          )}
        </div>
      </div>

      {/* Zadania po naprawie sa ZAWSZE niewykonane (backend zwraca tylko
          Wykonano=0 - patrz GET /followup/wszystkie), wiec nie maja czego
          szukac w zakladce "Zakonczone" - pokazujemy je tylko poza nia. */}
      {filterMode !== 'zakonczone' && poNaprawie.length > 0 && (
        <div className="kb-column-ponaprawie">
          {poNaprawie.map(z => (
            <PoNaprawieCard key={`pn-${z.Id}`} zadanie={z} onDelete={onDeletePoNaprawie} />
          ))}
        </div>
      )}

      {czyWszystkie && (
        <>
          {/* Aktywne zlecenia */}
          <div className="kb-column-body">
            {activeJobs.length === 0 && poNaprawie.length === 0 && (
              <div className="kb-empty">Brak zleceń</div>
            )}
            {activeJobs.map((job, idx) => (
              <React.Fragment key={job.Id}>
                <div
                  className={`kb-drop-zone ${dragOverIndex === idx ? 'kb-drop-zone--active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                />
                <KanbanCard
                  job={job}
                  colMechanikId={mechanik.Id}
                  mechanicy={allMechanicy}
                  onMove={onMove}
                  onReassign={onReassign}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  isDragging={draggingId === job.Id}
                  dragHandlers={{
                    draggable: true,
                    onDragStart: (e) => handleDragStart(e, job),
                    onDragEnd: handleDragEnd,
                  }}
                />
              </React.Fragment>
            ))}
            <div
              className={`kb-drop-zone ${dragOverIndex === activeJobs.length ? 'kb-drop-zone--active' : ''}`}
              onDragOver={(e) => handleDragOver(e, activeJobs.length)}
              onDrop={(e) => handleDrop(e, activeJobs.length)}
            />
          </div>

          {/* Zakończone — zwijane przez React state */}
          {doneJobs.length > 0 && (
            <div className="kb-done-section">
              <button
                className="kb-done-summary"
                onClick={() => setDoneOpen(o => !o)}
              >
                <span className={`kb-done-arrow ${doneOpen ? 'kb-done-arrow--open' : ''}`}>▸</span>
                {'\u2713'} Zakończone ({doneJobs.length})
              </button>
              {doneOpen && (
                <div className="kb-done-list">
                  {doneJobs.map(job => (
                    <div key={job.Id} className="kb-card kb-card--done">
                      <div className="kb-card-body">
                        <div className="kb-card-title">
                          {job.Marka} {job.Model}
                          <span className="kb-card-reg">{job.Rejestracja}</span>
                          {job.DataZakonczenia && (
                            <span className="kb-done-date">
                              {new Date(job.DataZakonczenia).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        <div className="kb-card-opis kb-card-opis--done">{job.Opis}</div>
                        <ElapsedTimeBar job={job} />
                        <PoNaprawieStatusBadges jobId={job.Id} statusPoNaprawiePerJob={statusPoNaprawiePerJob} />
                        {job.OpisWykonania && (
                          <div className="kb-card-wykonanie">
                            <span className="kb-card-wykonanie-label">📝 Do zgłoszenia:</span> {job.OpisWykonania}
                          </div>
                        )}
                        {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
                        {onDelete && (
                          <button
                            className="btn btn-secondary btn-small kb-done-delete"
                            onClick={() => { if (window.confirm('Czy na pewno chcesz usunąć tę robotę? Tej operacji nie można cofnąć.')) onDelete(job.Id); }}
                          >
                            🗑️ Usuń
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Widok przefiltrowany do jednego statusu — plaska lista, bez przeciagania
          (kolejnosc/priorytet liczony jest globalnie, wiec przy zawezonym widoku
          przeciaganie moglyby dawac mylace wyniki; strzalki gora/dol dalej dzialaja). */}
      {!czyWszystkie && filterMode === 'zakonczone' && (
        <div className="kb-column-body">
          {jobs.length === 0 && <div className="kb-empty">Brak zleceń</div>}
          {jobs.map(job => (
            <div key={job.Id} className="kb-card kb-card--done">
              <div className="kb-card-body">
                <div className="kb-card-title">
                  {job.Marka} {job.Model}
                  <span className="kb-card-reg">{job.Rejestracja}</span>
                  {job.DataZakonczenia && (
                    <span className="kb-done-date">
                      {new Date(job.DataZakonczenia).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="kb-card-opis kb-card-opis--done">{job.Opis}</div>
                <ElapsedTimeBar job={job} />
                <PoNaprawieStatusBadges jobId={job.Id} statusPoNaprawiePerJob={statusPoNaprawiePerJob} />
                {job.OpisWykonania && (
                  <div className="kb-card-wykonanie">
                    <span className="kb-card-wykonanie-label">📝 Do zgłoszenia:</span> {job.OpisWykonania}
                  </div>
                )}
                {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
                {onDelete && (
                  <button
                    className="btn btn-secondary btn-small kb-done-delete"
                    onClick={() => { if (window.confirm('Czy na pewno chcesz usunąć tę robotę? Tej operacji nie można cofnąć.')) onDelete(job.Id); }}
                  >
                    🗑️ Usuń
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!czyWszystkie && filterMode !== 'zakonczone' && (
        <div className="kb-column-body">
          {jobs.length === 0 && <div className="kb-empty">Brak zleceń</div>}
          {jobs.map(job => (
            <KanbanCard
              key={job.Id}
              job={job}
              colMechanikId={mechanik.Id}
              mechanicy={allMechanicy}
              onMove={onMove}
              onReassign={onReassign}
              onEdit={onEdit}
              onDelete={onDelete}
              isDragging={false}
              dragHandlers={{}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Manager / Boss / SuperAdmin korzystaja z tego samego komponentu — roznica
// miedzy rolami to tylko to, ktore zakladki sa widoczne (patrz Boss.jsx,
// Manager-uzycie w App.jsx i SuperAdmin.jsx) oraz to, czy sam zalogowany
// uzytkownik (kierownik) ma tez byc traktowany jak mechanik.
//
// Propsy:
//   showWarsztat     - zakladka "Warsztat" (dodaj pojazd + robota + pelna lista) - dla szefa/superadmina
//   showDodaj        - zakladka "Dodaj robote" (bez pelnej listy, tylko formularz)
//   showGospodarczy  - zakladka "Pracownik gospodarczy"
//   showUstawienia   - zakladka "Ustawienia" (od v15: TYLKO superadmin)
//   showMojeZlecenia - zakladka "Moje zlecenia" (dla kierownika, ktory tez pracuje jako mechanik
//                      i moze sam siebie przydzielic do roboty dodanej przez szefa)
//   mechanicRoles    - role pobierane jako "mechanicy" do przydzielania/tablicy
//                      (domyslnie mechanik + kierownik, bo kierownik tez pracuje jako mechanik)
export default function Manager({
  user,
  showWarsztat = false,
  showDodaj = true,
  showGospodarczy = true,
  showUstawienia = true,
  showMojeZlecenia = false,
  showRaporty = false,
  mechanicRoles = 'mechanik,kierownik',
}) {
  const [jobs, setJobs] = useState([]);
  const [mechanicy, setMechanicy] = useState([]);
  const [predefiniowane, setPredefiniowane] = useState([]);
  const [zadaniaPoNaprawie, setZadaniaPoNaprawie] = useState([]);
  const [statusZadanPoNaprawie, setStatusZadanPoNaprawie] = useState([]);
  const [wybor, setWybor] = useState({});
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('nowe');
  const [kanbanFilter, setKanbanFilter] = useState('wszystkie');
  // Sortowanie/filtrowanie zakonczonych zlecen na Tablicy mechanikow (patrz
  // getJobsForMechanik nizej) - domyslnie sortujemy wg daty DODANIA, malejaco
  // (najnowsze na gorze). Mozna przelaczyc pole (data dodania / rozpoczecia /
  // zakonczenia) oraz kierunek (malejaco/rosnaco) niezaleznie, a takze zawezic
  // wyszukiwanie do zlecen od podanego dnia. Panel z tymi ustawieniami jest
  // widoczny globalnie na calej tablicy (niezaleznie od wybranej zakladki
  // Wszystkie/Przydzielone/W trakcie/Zakonczone).
  const [doneSortField, setDoneSortField] = useState('DataUtworzenia');
  const [doneSortDir, setDoneSortDir] = useState('desc'); // 'desc' = malejaco (najnowsze pierwsze), 'asc' = rosnaco
  const [doneOdDate, setDoneOdDate] = useState('');
  const [dropTargetId, setDropTargetId] = useState(null);
  const [editJob, setEditJob] = useState(null);
  const pollPaused = useRef(false);

  const refresh = useCallback(async () => {
    if (pollPaused.current) return;
    try {
      const [jobsData, mechanicyData, predefData, poNaprawieData, statusPoNaprawieData] = await Promise.all([
        api.getJobs(),
        api.getUsers(mechanicRoles),
        api.getPredefiniowanePrace(),
        api.getWszystkieZadaniaPoNaprawie(),
        api.getStatusZadanPoNaprawie(),
      ]);
      setJobs(jobsData);
      setMechanicy(mechanicyData);
      setPredefiniowane(predefData);
      setZadaniaPoNaprawie(poNaprawieData);
      setStatusZadanPoNaprawie(statusPoNaprawieData);
    } catch (err) {
      setError(err.message);
    }
  }, [mechanicRoles]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

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

  async function handleDeletePoNaprawie(id) {
    setError('');
    try {
      await api.usunZadaniePoNaprawie(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMove(jobId, direction) {
    setError('');
    try {
      await api.setPriority(jobId, direction);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReassign(jobId, newMechanikId) {
    setError('');
    try {
      await api.assignMechanik(jobId, newMechanikId);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssign(jobId) {
    setError('');
    const mechanikId = wybor[jobId];
    if (!mechanikId) { setError('Wybierz mechanika przed przydzieleniem.'); return; }
    try {
      await api.assignMechanik(jobId, Number(mechanikId));
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  // Drag & drop między kolumnami / reorder w kolumnie
  async function handleDropJob(jobId, fromMechanikId, toMechanikId, targetIndex, targetColJobs) {
    pollPaused.current = true;
    setError('');
    try {
      // 1. Jeśli inny mechanik — zmień przypisanie
      if (fromMechanikId !== toMechanikId) {
        await api.assignMechanik(jobId, toMechanikId);
      }

      // 2. Przesuń do właściwej pozycji w kolejce (seria wywołań up/down)
      //    Pobierz świeże dane po ewentualnym reassign
      const freshJobs = await api.getJobs();

      // Aktywne roboty docelowego mechanika po reassign, posortowane wg Priorytet
      const colActive = freshJobs
        .filter(j => j.MechanikId === toMechanikId && j.Status !== 'zakonczone')
        .sort((a, b) => a.Priorytet - b.Priorytet);

      const currentIndex = colActive.findIndex(j => j.Id === jobId);
      if (currentIndex === -1) { await refresh(); return; }

      // Wszystkie aktywne niezakończone (globalny sort priorytet)
      const allActive = freshJobs
        .filter(j => j.Status !== 'zakonczone')
        .sort((a, b) => a.Priorytet - b.Priorytet);

      const globalIdx = allActive.findIndex(j => j.Id === jobId);

      // Wyznacz cel: chcemy być przed colActive[targetIndex] (lub na końcu)
      let targetJob = targetIndex < colActive.length && colActive[targetIndex].Id !== jobId
        ? colActive[targetIndex]
        : null;

      // Liczba ruchów w górę/dół w globalnej kolejce
      if (targetJob) {
        const globalTargetIdx = allActive.findIndex(j => j.Id === targetJob.Id);
        const steps = globalTargetIdx - globalIdx;
        const dir = steps > 0 ? 'down' : 'up';
        for (let i = 0; i < Math.abs(steps); i++) {
          await api.setPriority(jobId, dir);
        }
      }

      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      pollPaused.current = false;
    }
  }

  const noweJobs = jobs.filter(j => j.Status === 'nowe');

  // Mapa JobId -> { [typ]: { wykonano, dataWykonania } } na podstawie
  // statusZadanPoNaprawie (WSZYSTKIE zadania, nie tylko niewykonane) - uzywana
  // do pokazania na karcie zakonczonego zlecenia informacji, czy Wyposazenie+
  // Inspecto / Mycie zostaly juz wykonane przez mechanika.
  const statusPoNaprawiePerJob = {};
  for (const z of statusZadanPoNaprawie) {
    if (!statusPoNaprawiePerJob[z.JobId]) statusPoNaprawiePerJob[z.JobId] = {};
    statusPoNaprawiePerJob[z.JobId][z.Typ] = { wykonano: !!z.Wykonano, dataWykonania: z.DataWykonania };
  }

  // Filtry zakladek na "Tablicy mechanikow": wszystkie / przydzielone (jeszcze
  // nie rozpoczete) / w trakcie / zakonczone.
  const KANBAN_FILTERS = [
    { key: 'wszystkie', label: 'Wszystkie' },
    { key: 'przydzielone', label: 'Przydzielone' },
    { key: 'w_trakcie', label: 'W trakcie' },
    { key: 'zakonczone', label: 'Zakończone' },
  ];
  function matchesKanbanFilter(job, filter) {
    if (filter === 'wszystkie') return true;
    if (filter === 'przydzielone') return job.Status === 'przydzielone';
    if (filter === 'w_trakcie') return job.Status === 'rozpoczete';
    if (filter === 'zakonczone') return job.Status === 'zakonczone';
    return true;
  }

  // Zlecenie "pasuje" do filtra daty zakonczonych (doneOdDate) jesli jego pole
  // wskazane w doneSortField jest >= wybranego dnia. Aktywne (niezakonczone)
  // zlecenia nigdy nie sa odfiltrowywane przez ten filtr - dotyczy tylko zakonczonych.
  function pasujeDoFiltraZakonczonych(job) {
    if (job.Status !== 'zakonczone' || !doneOdDate) return true;
    const wartosc = job[doneSortField];
    if (!wartosc) return true;
    return new Date(wartosc) >= new Date(doneOdDate);
  }

  function getJobsForMechanik(mechanikId) {
    const kierunek = doneSortDir === 'asc' ? 1 : -1;
    return jobs
      .filter(j => j.MechanikId === mechanikId)
      .filter(pasujeDoFiltraZakonczonych)
      .sort((a, b) => {
        if (a.Status === 'zakonczone' && b.Status !== 'zakonczone') return 1;
        if (a.Status !== 'zakonczone' && b.Status === 'zakonczone') return -1;
        // Dwa zakonczone zlecenia - sortuj wg wybranego pola daty i kierunku
        // (zamiast dawnego, mylacego sortowania po nieaktualnym juz
        // Priorytet z czasow, gdy zlecenie bylo jeszcze aktywne w kolejce).
        if (a.Status === 'zakonczone' && b.Status === 'zakonczone') {
          return kierunek * (new Date(a[doneSortField] || 0) - new Date(b[doneSortField] || 0));
        }
        return a.Priorytet - b.Priorytet;
      });
  }

  return (
    <div className="manager-root">
      {error && <div className="error-message mgr-error">{error}</div>}

      {/* Główne taby — widoczność zależy od roli (patrz propsy komponentu) */}
      <div className="mgr-tabs">
        {showWarsztat && (
          <button
            className={`mgr-tab ${activeTab === 'warsztat' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('warsztat')}
          >
            🔧 Warsztat
          </button>
        )}
        <button
          className={`mgr-tab ${activeTab === 'nowe' ? 'mgr-tab--active' : ''}`}
          onClick={() => setActiveTab('nowe')}
        >
          ✦ Do przydzielenia
          {noweJobs.length > 0 && (
            <span className="mgr-tab-badge">{noweJobs.length}</span>
          )}
        </button>
        <button
          className={`mgr-tab ${activeTab === 'kanban' ? 'mgr-tab--active' : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          📋 Tablica mechaników
        </button>
        {showMojeZlecenia && (
          <button
            className={`mgr-tab ${activeTab === 'moje' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('moje')}
          >
            🔩 Moje zlecenia
          </button>
        )}
        {showDodaj && (
          <button
            className={`mgr-tab ${activeTab === 'dodaj' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('dodaj')}
          >
            + Nowe zlecenie
          </button>
        )}
        {showGospodarczy && (
          <button
            className={`mgr-tab ${activeTab === 'gospodarczy' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('gospodarczy')}
          >
            🧹 Pracownik gospodarczy
          </button>
        )}
        {showRaporty && (
          <button
            className={`mgr-tab ${activeTab === 'raporty' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('raporty')}
          >
            📊 Raporty
          </button>
        )}
        {showUstawienia && (
          <button
            className={`mgr-tab ${activeTab === 'ustawienia' ? 'mgr-tab--active' : ''}`}
            onClick={() => setActiveTab('ustawienia')}
          >
            ⚙️ Ustawienia
          </button>
        )}
      </div>

      <FollowUpPanel user={user} />

      {/* TAB: Warsztat (dodaj pojazd + robotę + pełna lista wszystkich robót) */}
      {showWarsztat && activeTab === 'warsztat' && (
        <div className="mgr-tab-content">
          <DodajRobotePanel user={user} showJobList={true} />
        </div>
      )}

      {/* TAB: Dodaj robotę / pojazd */}
      {showDodaj && activeTab === 'dodaj' && (
        <div className="mgr-tab-content">
          <DodajRobotePanel user={user} showJobList={false} />
        </div>
      )}

      {/* TAB: Do przydzielenia */}
      {activeTab === 'nowe' && (
        <div className="mgr-tab-content">
        <div className="page">
          <div className="panel">
            <p className="panel-hint">
              Strzałkami możesz zmienić kolejność wykonania w kolejce.
            </p>
            <div className="job-list">
              {noweJobs.length === 0 && <p>✓ Brak nowych zleceń do przydzielenia.</p>}
              {noweJobs.map(job => (
                <div key={job.Id} className="job-card">
                  <div className="job-card-top">
                    <strong>{job.Marka} {job.Model} · {job.Rejestracja}</strong>
                    <StatusBadge status={job.Status} />
                  </div>
                  <p className="job-card-opis">{job.Opis}</p>
                  <div className="job-card-meta">
                    <span>Zgłosił: {job.UtworzonoPrzezFullName}</span>
                    {formatCzasSzacowany(job) && (
                      <span className="job-card-czas">⏱ Szac. czas: {formatCzasSzacowany(job)}</span>
                    )}
                  </div>
                  <div className="job-card-actions">
                    <select
                      value={wybor[job.Id] || ''}
                      onChange={e => setWybor({ ...wybor, [job.Id]: e.target.value })}
                    >
                      <option value="">-- wybierz mechanika --</option>
                      {mechanicy.map(m => (
                        <option key={m.Id} value={m.Id}>{m.FullName}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" onClick={() => handleAssign(job.Id)}>
                      Przydziel
                    </button>
                  </div>
                  <div className="priority-nudge">
                    <button className="priority-nudge-btn" onClick={() => handleMove(job.Id, 'up')} title="Wyżej w kolejce">
                      ↑
                    </button>
                    <span className="priority-nudge-label">kolejność</span>
                    <button className="priority-nudge-btn" onClick={() => handleMove(job.Id, 'down')} title="Niżej w kolejce">
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* TAB: Tablica Kanban */}
      {activeTab === 'kanban' && (
        <div className="kb-board-wrap">
          <div className="inner-tabs kb-filter-tabs">
            {KANBAN_FILTERS.map((f) => {
              const count = jobs.filter(j => matchesKanbanFilter(j, f.key)).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  className={`inner-tab ${kanbanFilter === f.key ? 'inner-tab--active' : ''}`}
                  onClick={() => setKanbanFilter(f.key)}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Panel sortowania/filtrowania zakonczonych zlecen - widoczny GLOBALNIE
              na calej tablicy, niezaleznie od wybranej zakladki powyzej, zeby
              ustawienia nie "znikaly" przy przelaczaniu Wszystkie/Przydzielone/
              W trakcie/Zakonczone. Dotyczy porzadku i widocznosci zakonczonych
              zlecen w kolumnach mechanikow. */}
          <div className="kb-done-filters">
            <label>
              Sortuj zakończone wg
              <select value={doneSortField} onChange={e => setDoneSortField(e.target.value)}>
                <option value="DataUtworzenia">daty dodania</option>
                <option value="DataRozpoczecia">daty rozpoczęcia</option>
                <option value="DataZakonczenia">daty zakończenia</option>
              </select>
            </label>
            <label>
              Kierunek
              <select value={doneSortDir} onChange={e => setDoneSortDir(e.target.value)}>
                <option value="desc">malejąco (najnowsze na górze)</option>
                <option value="asc">rosnąco (najstarsze na górze)</option>
              </select>
            </label>
            <label>
              Od dnia
              <input type="date" value={doneOdDate} onChange={e => setDoneOdDate(e.target.value)} />
            </label>
            {doneOdDate && (
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setDoneOdDate('')}>
                Wyczyść datę
              </button>
            )}
            <span className="kb-done-filters-hint">
              Domyślnie: najnowsze wg daty dodania na górze. Filtr działa we wszystkich zakładkach tablicy.
            </span>
          </div>

          <div className="kb-board">
            {mechanicy.map((m, i) => (
              <KanbanColumn
                key={m.Id}
                mechanik={m}
                color={TAB_COLORS[i % TAB_COLORS.length]}
                jobs={getJobsForMechanik(m.Id).filter(j => matchesKanbanFilter(j, kanbanFilter))}
                allMechanicy={mechanicy}
                poNaprawie={zadaniaPoNaprawie.filter(p => p.UserId === m.Id)}
                statusPoNaprawiePerJob={statusPoNaprawiePerJob}
                onMove={handleMove}
                onReassign={handleReassign}
                onDropJob={handleDropJob}
                isDropTarget={dropTargetId === m.Id}
                filterMode={kanbanFilter}
                onEdit={setEditJob}
                onDelete={handleDeleteJob}
                onDeletePoNaprawie={handleDeletePoNaprawie}
              />
            ))}
            {mechanicy.length === 0 && (
              <p style={{ padding: 24, color: '#888' }}>Brak mechaników w systemie.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB: Moje zlecenia (kierownik pracuje też jako mechanik — może sam
          siebie przydzielić do roboty dodanej przez szefa i ją realizować) */}
      {showMojeZlecenia && activeTab === 'moje' && (
        <div className="mgr-tab-content">
          <Mechanic user={user} embedded />
        </div>
      )}

      {showGospodarczy && activeTab === 'gospodarczy' && (
        <div className="boss-gosp-wrap">
          <GospodarczyModule user={user} />
        </div>
      )}

      {showRaporty && activeTab === 'raporty' && (
        <div className="mgr-tab-content">
          <Raporty />
        </div>
      )}

      {showUstawienia && activeTab === 'ustawienia' && (
        <div className="mgr-tab-content">
          <div className="page">
            <UstawieniaPanel />
          </div>
        </div>
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
