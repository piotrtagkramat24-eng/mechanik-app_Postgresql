import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import GospodarczyCalendar from '../components/GospodarczyCalendar.jsx';
import PriorityBadge from '../components/PriorityBadge.jsx';
import FollowUpPanel from '../components/FollowUpPanel.jsx';

const POLL_INTERVAL_MS = 5000;

function todayISO() { return new Date().toISOString().slice(0, 10); }

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TASK_ICONS = {
  sprzatanie: '🧹', konserwacja: '🔧', dostawa: '📦',
  mycie: '🚿', kontrola: '🔍', default: '📋',
};
function taskIcon(name) {
  const n = (name || '').toLowerCase();
  for (const [key, icon] of Object.entries(TASK_ICONS)) {
    if (n.includes(key)) return icon;
  }
  return TASK_ICONS.default;
}

// Karta zadania — wyszarzala gdy wykonane (cykliczne po wykonaniu czeka na nowy termin)
function TodayCard({ task, onWykonaj }) {
  const [dataWyk, setDataWyk] = useState(todayISO());
  const isDone = task.Status === 'zakonczone';

  const rejestracje = useMemo(() => {
    if (!task.RejestracjeJson) return [];
    try {
      const parsed = typeof task.RejestracjeJson === 'string'
        ? JSON.parse(task.RejestracjeJson)
        : task.RejestracjeJson;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [task.RejestracjeJson]);

  // Status Wykonano/Nie wykonano dla kazdego numeru rejestracyjnego,
  // ktory pracownik musi uzupelnic przed zapisaniem wykonania zadania.
  const [statusy, setStatusy] = useState({});

  function setStatusRej(rejId, val) {
    setStatusy(prev => ({ ...prev, [rejId]: val }));
  }

  const wszystkieOznaczone = rejestracje.length === 0
    || rejestracje.every(r => statusy[r.Id] === true || statusy[r.Id] === false);

  // Cykliczne uznajemy za "wykonane w tym cyklu" gdy DataOstatniegoWykonania >= dzisiaj
  const todayStr = todayISO();
  const lastExec = task.DataOstatniegoWykonania
    ? (typeof task.DataOstatniegoWykonania === 'string'
        ? task.DataOstatniegoWykonania.slice(0, 10)
        : new Date(task.DataOstatniegoWykonania).toISOString().slice(0, 10))
    : null;
  const wykonaneWCyklu = task.Typ === 'cykliczne' && lastExec && lastExec >= todayStr;

  const wyszarzale = isDone || wykonaneWCyklu;

  const priorytet = (task.Priorytet || '').toLowerCase();
  const dni = task.DniDoTerminu;

  function handleZapisz() {
    const rejestracjeWykonanie = rejestracje.map(r => ({
      rejestracjaId: r.Id,
      wykonano: statusy[r.Id] === true,
    }));
    onWykonaj(task.Id, dataWyk, rejestracjeWykonanie);
  }

  let termBadge = null;
  if (wyszarzale) {
    termBadge = <span className="done-badge">✓ Wykonane</span>;
  } else if (dni !== null && dni !== undefined) {
    if (dni < 0)      termBadge = <span className="overdue-badge">⚠ Przeterminowane o {Math.abs(dni)} dni</span>;
    else if (dni === 0) termBadge = <span className="today-badge">⏰ Termin dzisiaj</span>;
  }

  return (
    <div className={`gosp-today-card gosp-today-card--${wyszarzale ? 'done' : priorytet}`}>
      <div className="gosp-today-card-icon">{taskIcon(task.Zadanie)}</div>
      <div className="gosp-today-card-body">
        <div className="gosp-today-card-title">
          {task.Zadanie}
          <PriorityBadge priorytet={task.Priorytet} />
          <span className="type-badge">
            {task.Typ === 'cykliczne' ? `Co ${task.CoIleDni} dni` : 'Jednorazowe'}
          </span>
          {termBadge}
        </div>
        <div className="gosp-today-card-meta">
          {task.Lokalizacja && <span>📍 {task.Lokalizacja}</span>}
          <span>Następny termin: {formatDate(task.NastepnyTermin)}</span>
          <span>Ostatnio: {formatDate(task.DataOstatniegoWykonania)}</span>
        </div>

        {rejestracje.length > 0 && !wyszarzale && (
          <div className="rejestracje-checklist">
            <div className="rejestracje-checklist-label">Oznacz dla każdego numeru rejestracyjnego:</div>
            {rejestracje.map(r => (
              <div key={r.Id} className="rejestracje-checklist-row">
                <span className="rejestracje-checklist-plate">{r.Rejestracja}</span>
                <div className="rejestracje-checklist-btns">
                  <button
                    type="button"
                    className={`btn-toggle btn-toggle--ok ${statusy[r.Id] === true ? 'btn-toggle--active' : ''}`}
                    onClick={() => setStatusRej(r.Id, true)}
                  >
                    ✓ Wykonano
                  </button>
                  <button
                    type="button"
                    className={`btn-toggle btn-toggle--bad ${statusy[r.Id] === false ? 'btn-toggle--active' : ''}`}
                    onClick={() => setStatusRej(r.Id, false)}
                  >
                    ✗ Nie wykonano
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {onWykonaj && !wyszarzale && (
          <div className="gosp-today-card-actions">
            <div className="gosp-date-label">
              <span>Data wykonania</span>
              <input type="date" value={dataWyk} onChange={e => setDataWyk(e.target.value)} />
            </div>
            <button
              className="btn btn-success"
              onClick={handleZapisz}
              disabled={!wszystkieOznaczone}
              title={!wszystkieOznaczone ? 'Zaznacz „Wykonano” lub „Nie wykonano” dla każdego numeru rejestracyjnego' : ''}
            >
              ✓ Oznacz jako wykonane
            </button>
          </div>
        )}
        {wyszarzale && wykonaneWCyklu && !isDone && (
          <div className="gosp-done-hint">Następny termin: {formatDate(task.NastepnyTermin)}</div>
        )}
      </div>
    </div>
  );
}

function StatsRow({ tasks }) {
  const todayStr = todayISO();
  const przeterminowane = tasks.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu < 0 && t.Status === 'aktywne').length;
  const dzisiaj = tasks.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu === 0 && t.Status === 'aktywne').length;
  const tenTydzien = tasks.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu > 0 && t.DniDoTerminu <= 7 && t.Status === 'aktywne').length;
  const zakonczone = tasks.filter(t => t.Status === 'zakonczone').length;

  return (
    <div className="gosp-stats-row">
      <div className="gosp-stat-card">
        <div className={`gosp-stat-value${przeterminowane > 0 ? ' gosp-stat-value--red' : ''}`}>{przeterminowane}</div>
        <div className="gosp-stat-label">Przeterminowane</div>
      </div>
      <div className="gosp-stat-card">
        <div className={`gosp-stat-value${dzisiaj > 0 ? ' gosp-stat-value--amber' : ''}`}>{dzisiaj}</div>
        <div className="gosp-stat-label">Na dziś</div>
      </div>
      <div className="gosp-stat-card">
        <div className={`gosp-stat-value${tenTydzien > 0 ? ' gosp-stat-value--blue' : ''}`}>{tenTydzien}</div>
        <div className="gosp-stat-label">Ten tydzień</div>
      </div>
      <div className="gosp-stat-card">
        <div className="gosp-stat-value gosp-stat-value--green">{zakonczone}</div>
        <div className="gosp-stat-label">Zakończone</div>
      </div>
    </div>
  );
}

// Przycisk widoku z ikoną
function ViewBtn({ active, onClick, children }) {
  return (
    <button
      className={`gosp-view-btn ${active ? 'gosp-view-btn--active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Gospodarczy({ user }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [widok, setWidok] = useState('dzisiaj'); // 'dzisiaj' | '7dni' | '30dni' | 'kalendarz'

  const refresh = useCallback(async () => {
    try {
      const data = await api.getGospodarczeZadaniaPracownika(user.Id);
      setTasks(data);
    } catch (err) { setError(err.message); }
  }, [user.Id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleWykonaj(id, dataWykonania, rejestracjeWykonanie) {
    setError('');
    try { await api.wykonajGospodarczeZadanie(id, dataWykonania, user.Id, rejestracjeWykonanie); await refresh(); }
    catch (err) { setError(err.message); }
  }

  const todayStr = todayISO();

  // Wszystkie aktywne (cykliczne zawsze widoczne)
  const aktywne = tasks.filter(t => t.Status === 'aktywne');
  const calendarTasks = tasks.filter(t => t.NastepnyTermin);

  // Filtruj wg widoku
  const tasksForView = useMemo(() => {
    let base = aktywne;
    if (widok === 'dzisiaj') {
      base = aktywne.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu <= 0);
    } else if (widok === '7dni') {
      base = aktywne.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu <= 7);
    } else if (widok === '30dni') {
      base = aktywne.filter(t => t.DniDoTerminu !== null && t.DniDoTerminu <= 30);
    }
    // Sortuj: wykonane w cyklu na koniec, potem wg terminu
    return [...base].sort((a, b) => {
      const aDone = a.DataOstatniegoWykonania
        ? (typeof a.DataOstatniegoWykonania === 'string'
            ? a.DataOstatniegoWykonania.slice(0, 10)
            : new Date(a.DataOstatniegoWykonania).toISOString().slice(0, 10)) >= todayStr
        : false;
      const bDone = b.DataOstatniegoWykonania
        ? (typeof b.DataOstatniegoWykonania === 'string'
            ? b.DataOstatniegoWykonania.slice(0, 10)
            : new Date(b.DataOstatniegoWykonania).toISOString().slice(0, 10)) >= todayStr
        : false;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.DniDoTerminu ?? 9999) - (b.DniDoTerminu ?? 9999);
    });
  }, [aktywne, widok, todayStr]);

  const dateLabel = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

  const viewLabels = {
    dzisiaj: `Dziś i przeterminowane — ${dateLabel}`,
    '7dni': 'Zadania na najbliższe 7 dni',
    '30dni': 'Zadania na najbliższe 30 dni',
    kalendarz: 'Kalendarz',
  };

  return (
    <div className="page">
      {error && <div className="error-message">{error}</div>}

      <StatsRow tasks={tasks} />

      {/* Przełącznik widoku — główne przyciski na stronie pracownika */}
      <div className="gosp-view-switcher">
        <ViewBtn active={widok === 'dzisiaj'} onClick={() => setWidok('dzisiaj')}>⚡ Dziś</ViewBtn>
        <ViewBtn active={widok === '7dni'} onClick={() => setWidok('7dni')}>📅 7 dni</ViewBtn>
        <ViewBtn active={widok === '30dni'} onClick={() => setWidok('30dni')}>🗓️ 30 dni</ViewBtn>
        <ViewBtn active={widok === 'kalendarz'} onClick={() => setWidok('kalendarz')}>📆 Kalendarz</ViewBtn>
      </div>

      <FollowUpPanel user={user} />

      {widok !== 'kalendarz' && (
        <section className="panel">
          <h2>{viewLabels[widok]}</h2>
          {tasksForView.length === 0 ? (
            <div className="gosp-empty-day">
              <div className="gosp-empty-day-icon">✅</div>
              <div className="gosp-empty-day-title">Brak zadań do wykonania</div>
              <div className="gosp-empty-day-sub">Wszystkie zadania w tym zakresie zostały wykonane.</div>
            </div>
          ) : (
            <div className="gosp-today-grid">
              {tasksForView.map(t => (
                <TodayCard key={t.Id} task={t} onWykonaj={handleWykonaj} />
              ))}
            </div>
          )}
        </section>
      )}

      {widok === 'kalendarz' && (
        <section className="panel">
          <p className="panel-hint">Twoje zadania na osi czasu — kliknij zadanie, aby zobaczyć szczegóły.</p>
          <GospodarczyCalendar tasks={calendarTasks} showPracownik={false} />
        </section>
      )}
    </div>
  );
}
