import React, { useState, useMemo } from 'react';

// --- helpers ---
function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function polishWeekday(date) {
  const days = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
  return days[date.getDay()];
}

function polishMonthDay(date) {
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

const PRIORITY_COLOR = {
  wysoki: '#dc2626',
  sredni: '#d97706',
  niski:  '#16a34a',
};

function getPriorityKey(p) {
  return (p || '').toLowerCase()
    .replace('ś', 's').replace('ę', 'e').replace('ó', 'o');
}

// Oblicz wszystkie daty na których zadanie powinno się pojawić w danym zakresie dni
function getTaskDatesInRange(task, days) {
  const result = new Set();
  const firstDay = days[0];
  const lastDay  = days[days.length - 1];

  if (!task.NastepnyTermin) return result;

  const terminStr = typeof task.NastepnyTermin === 'string'
    ? task.NastepnyTermin.slice(0, 10)
    : new Date(task.NastepnyTermin).toISOString().slice(0, 10);

  const termin = new Date(terminStr + 'T00:00:00');
  if (isNaN(termin.getTime())) return result;

  if (task.Typ === 'cykliczne' && task.CoIleDni > 0) {
    // Znajdź pierwszą datę >= firstDay która jest wielokrotnością cyklu od terminu
    const msDzien = 86400000;
    const msFirst = firstDay.getTime();
    const msLast  = lastDay.getTime();
    const msTerm  = termin.getTime();
    const cykl    = task.CoIleDni * msDzien;

    // Znajdź najbliższe wystąpienie >= firstDay
    let msStart;
    if (msTerm <= msFirst) {
      const diff = msFirst - msTerm;
      const steps = Math.ceil(diff / cykl);
      msStart = msTerm + steps * cykl;
    } else {
      msStart = msTerm;
    }

    // Dodaj wszystkie wystąpienia w zakresie
    for (let ms = msStart; ms <= msLast; ms += cykl) {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      result.add(isoDate(d));
    }
  } else {
    // Jednorazowe — tylko NastepnyTermin
    const key = isoDate(termin);
    const keyDate = new Date(key + 'T00:00:00');
    if (keyDate >= firstDay && keyDate <= lastDay) {
      result.add(key);
    }
  }

  return result;
}

// Jeden kafelek zadania w komórce kalendarza
function TaskChip({ task, showPracownik }) {
  const [open, setOpen] = useState(false);
  const colorKey = getPriorityKey(task.Priorytet);
  const color = PRIORITY_COLOR[colorKey] || '#6b7280';
  const isDone = task.Status === 'zakonczone';

  return (
    <div
      className={`cal-chip ${isDone ? 'cal-chip--done' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={() => setOpen(o => !o)}
      title={task.Zadanie}
    >
      <span className="cal-chip-name">{task.Zadanie}</span>
      {showPracownik && task.PracownikFullName && (
        <span className="cal-chip-who">{task.PracownikFullName}</span>
      )}
      {open && (
        <div className="cal-chip-popup" onClick={e => e.stopPropagation()}>
          <strong>{task.Zadanie}</strong>
          {task.Lokalizacja && <div>📍 {task.Lokalizacja}</div>}
          {showPracownik && <div>👤 {task.PracownikFullName}</div>}
          <div>Priorytet: {task.Priorytet}</div>
          <div>Typ: {task.Typ === 'cykliczne' ? `Co ${task.CoIleDni} dni` : 'Jednorazowe'}</div>
          {isDone && <div className="cal-chip-done-label">✓ Zakończone</div>}
          <button className="cal-chip-close" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </div>
  );
}

// Jeden dzień w kalendarzu
function DayCell({ date, tasks, showPracownik, isToday, outside }) {
  return (
    <div className={[
      'cal-cell',
      isToday  ? 'cal-cell--today'   : '',
      isWeekend(date) ? 'cal-cell--weekend' : '',
      outside  ? 'cal-cell--outside' : '',
    ].filter(Boolean).join(' ')}>
      <div className="cal-cell-header">
        <span className="cal-cell-weekday">{polishWeekday(date)}</span>
        <span className="cal-cell-day">{date.getDate()}</span>
        {isToday && <span className="cal-cell-today-dot" />}
      </div>
      <div className="cal-cell-tasks">
        {tasks.length === 0 && <span className="cal-cell-empty">—</span>}
        {tasks.map(t => (
          <TaskChip key={t.Id} task={t} showPracownik={showPracownik} />
        ))}
      </div>
    </div>
  );
}

// --- Główny komponent ---
export default function GospodarczyCalendar({ tasks, showPracownik = false }) {
  const [view, setView]     = useState('7');
  const [offset, setOffset] = useState(0);
  const [listMode, setListMode] = useState(true);

  const today = todayMidnight();

  const { days, title } = useMemo(() => {
    if (view === '7') {
      const start = addDays(today, offset * 7);
      const d = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const label =
        offset === 0  ? 'Ten tydzień' :
        offset === 1  ? 'Następny tydzień' :
        offset === -1 ? 'Poprzedni tydzień' :
        `Tydzień od ${polishMonthDay(start)}`;
      return { days: d, title: label };
    }
    if (view === '30') {
      const start = addDays(today, offset * 30);
      const d = Array.from({ length: 30 }, (_, i) => addDays(start, i));
      const label = offset === 0 ? 'Najbliższe 30 dni' : `30 dni od ${polishMonthDay(start)}`;
      return { days: d, title: label };
    }
    // widok miesięczny
    const base      = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const monthName = base.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    const firstDay  = new Date(base.getFullYear(), base.getMonth(), 1);
    const lastDay   = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const startPad  = (firstDay.getDay() + 6) % 7;
    const endPad    = (7 - lastDay.getDay()) % 7;
    const d = [
      ...Array.from({ length: startPad }, (_, i) => addDays(firstDay, -(startPad - i))),
      ...Array.from({ length: lastDay.getDate() }, (_, i) => new Date(base.getFullYear(), base.getMonth(), i + 1)),
      ...Array.from({ length: endPad }, (_, i) => addDays(lastDay, i + 1)),
    ];
    return { days: d, title: monthName };
  }, [view, offset]);

  // Mapa: ISO-data → zadania — z rozwinięciem cyklicznych na każdy dzień cyklu
  const tasksByDate = useMemo(() => {
    if (days.length === 0) return {};
    const map = {};
    tasks.forEach(task => {
      const dates = getTaskDatesInRange(task, days);
      dates.forEach(key => {
        if (!map[key]) map[key] = [];
        // unikaj duplikatów tego samego zadania w tym samym dniu
        if (!map[key].find(t => t.Id === task.Id)) {
          map[key].push(task);
        }
      });
    });
    return map;
  }, [tasks, days]);

  const currentMonth = view === 'month'
    ? new Date(today.getFullYear(), today.getMonth() + offset, 1).getMonth()
    : null;

  const isMonthView  = view === 'month';
  const weekHeaders  = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
  const todayStr     = isoDate(today);

  return (
    <div className="cal-root">
      {/* Toolbar */}
      <div className="cal-toolbar">
        <div className="cal-view-btns">
          {[
            { key: '7',     label: '7 dni' },
            { key: '30',    label: '30 dni' },
            { key: 'month', label: 'Miesiąc' },
          ].map(v => (
            <button
              key={v.key}
              className={`period-filter-btn ${view === v.key ? 'period-filter-btn--active' : ''}`}
              onClick={() => { setView(v.key); setOffset(0); }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="cal-toolbar-right">
          <button
            className={`cal-layout-btn ${listMode ? 'cal-layout-btn--active' : ''}`}
            onClick={() => setListMode(m => !m)}
            title={listMode ? 'Widok siatki' : 'Widok listy'}
          >
            {listMode ? '⊞' : '☰'}
          </button>
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={() => setOffset(o => o - 1)}>‹</button>
            <span className="cal-nav-title">{title}</span>
            <button className="cal-nav-btn" onClick={() => setOffset(o => o + 1)}>›</button>
            {offset !== 0 && (
              <button className="cal-nav-btn cal-nav-today" onClick={() => setOffset(0)}>
                Dzisiaj
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nagłówki dni tygodnia (tylko widok miesięczny, siatka) */}
      {isMonthView && !listMode && (
        <div className="cal-week-headers">
          {weekHeaders.map(h => <div key={h} className="cal-week-header">{h}</div>)}
        </div>
      )}

      {/* Widok listy (pionowy) */}
      {listMode ? (
        <div className="cal-list">
          {days
            .filter(date => !(isMonthView && date.getMonth() !== currentMonth))
            .map(date => {
              const key      = isoDate(date);
              const dayTasks = tasksByDate[key] || [];
              const isToday  = key === todayStr;
              const weekend  = isWeekend(date);
              return (
                <div key={key} className={[
                  'cal-list-row',
                  isToday  ? 'cal-list-row--today'   : '',
                  weekend  ? 'cal-list-row--weekend'  : '',
                  dayTasks.length > 0 ? 'cal-list-row--has-tasks' : '',
                ].filter(Boolean).join(' ')}>
                  <div className="cal-list-date">
                    <span className="cal-list-weekday">{polishWeekday(date)}</span>
                    <span className="cal-list-day">{date.getDate()}</span>
                    <span className="cal-list-month">{date.toLocaleDateString('pl-PL', { month: 'short' })}</span>
                    {isToday && <span className="cal-list-today-badge">dziś</span>}
                  </div>
                  <div className="cal-list-tasks">
                    {dayTasks.length === 0
                      ? <span className="cal-list-empty">Brak zadań</span>
                      : dayTasks.map(t => (
                          <TaskChip key={t.Id} task={t} showPracownik={showPracownik} />
                        ))
                    }
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        /* Siatka dni */
        <div className={`cal-grid cal-grid--${view}`}>
          {days.map(date => {
            const key      = isoDate(date);
            const dayTasks = tasksByDate[key] || [];
            const outside  = isMonthView && date.getMonth() !== currentMonth;
            return (
              <DayCell
                key={key}
                date={date}
                tasks={dayTasks}
                showPracownik={showPracownik}
                isToday={key === todayStr}
                outside={outside}
              />
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-legend-dot" style={{background:'#dc2626'}} />Wysoki</span>
        <span className="cal-legend-item"><span className="cal-legend-dot" style={{background:'#d97706'}} />Średni</span>
        <span className="cal-legend-item"><span className="cal-legend-dot" style={{background:'#16a34a'}} />Niski</span>
        {showPracownik && <span className="cal-legend-note">Kliknij zadanie, aby zobaczyć szczegóły</span>}
      </div>
    </div>
  );
}
