import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';
import GospodarczyForm from './GospodarczyForm.jsx';
import GospodarczyTaskCard from './GospodarczyTaskCard.jsx';
import GospodarczyCalendar from './GospodarczyCalendar.jsx';

const POLL_INTERVAL_MS = 6000;

// Karta zadania z przyciskami kolejnosci (strzalki + drag)
function GospodarczyTaskCardSorted({ task, showPracownik, onDelete, onEdit, onMove, onDragStart, onDragOver, onDrop, isDragging, isDropTarget }) {
  const cardRef = useRef(null);

  return (
    <div
      ref={cardRef}
      className={`gosp-sortable-row ${isDragging ? 'gosp-sortable-row--dragging' : ''} ${isDropTarget ? 'gosp-sortable-row--droptarget' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(task.Id); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(task.Id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(task.Id); }}
    >
      <div className="gosp-sort-handle" title="Przeciągnij, aby zmienić kolejność">⠿</div>
      <div className="gosp-sort-arrows">
        <button className="kb-arrow-btn" onClick={() => onMove(task.Id, 'up')} title="Wyżej">▲</button>
        <button className="kb-arrow-btn" onClick={() => onMove(task.Id, 'down')} title="Niżej">▼</button>
      </div>
      <div className="gosp-sort-card-wrap">
        <GospodarczyTaskCard task={task} showPracownik={showPracownik} onDelete={onDelete} onEdit={onEdit} />
      </div>
    </div>
  );
}

export default function GospodarczyModule({ user }) {
  const [innerTab, setInnerTab] = useState('lista');
  const [tasks, setTasks] = useState([]);
  const [pracownicy, setPracownicy] = useState([]);
  const [cars, setCars] = useState([]);
  const [pracownikFilter, setPracownikFilter] = useState('wszyscy');
  const [error, setError] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [tasksData, pracownicyData, carsData] = await Promise.all([
        api.getGospodarczeZadania(),
        api.getUsers('pracownik_gospodarczy'),
        api.getCars(),
      ]);
      setTasks(tasksData);
      setPracownicy(pracownicyData);
      setCars(carsData);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleDelete(id) {
    setError('');
    try { await api.deleteGospodarczeZadanie(id); await refresh(); }
    catch (err) { setError(err.message); }
  }

  function handleEdit(task) {
    setEditingTask(task);
    setInnerTab('dodaj');
  }

  function handleCancelEdit() {
    setEditingTask(null);
    setInnerTab('lista');
  }

  async function handleMove(id, direction) {
    setError('');
    try { await api.changeGospodarczeKolejnosc(id, direction); await refresh(); }
    catch (err) { setError(err.message); }
  }

  async function handleDropOnTarget(targetId) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDropTargetId(null); return; }
    // Oblicz kierunek: przesun draggingId do pozycji targetId
    const aktywne = tasks.filter(t => t.Status !== 'zakonczone' && t.Aktywny);
    const srcIdx = aktywne.findIndex(t => t.Id === draggingId);
    const dstIdx = aktywne.findIndex(t => t.Id === targetId);
    if (srcIdx === -1 || dstIdx === -1) { setDraggingId(null); setDropTargetId(null); return; }

    // Wykonaj tyle 'up' lub 'down' ile potrzeba (seryjnie)
    const steps = dstIdx - srcIdx;
    const direction = steps > 0 ? 'down' : 'up';
    const count = Math.abs(steps);
    try {
      for (let i = 0; i < count; i++) {
        await api.changeGospodarczeKolejnosc(draggingId, direction);
      }
      await refresh();
    } catch (err) { setError(err.message); }
    setDraggingId(null);
    setDropTargetId(null);
  }

  const filtered = pracownikFilter === 'wszyscy'
    ? tasks
    : tasks.filter(t => String(t.PracownikId) === pracownikFilter);

  const aktywne = filtered.filter(t => t.Status === 'aktywne');
  const zakonczone = filtered.filter(t => t.Status === 'zakonczone');

  const calendarTasks = filtered.filter(t => t.NastepnyTermin);

  return (
    <div className="page">
      {error && <div className="error-message">{error}</div>}

      <div className="inner-tabs">
        <button className={`inner-tab ${innerTab === 'lista' ? 'inner-tab--active' : ''}`}
          onClick={() => { setEditingTask(null); setInnerTab('lista'); }}>📋 Lista zadań</button>
        <button className={`inner-tab ${innerTab === 'kalendarz' ? 'inner-tab--active' : ''}`}
          onClick={() => { setEditingTask(null); setInnerTab('kalendarz'); }}>📅 Kalendarz</button>
        <button className={`inner-tab ${innerTab === 'dodaj' ? 'inner-tab--active' : ''}`}
          onClick={() => { setEditingTask(null); setInnerTab('dodaj'); }}>+ Nowe zadanie</button>
      </div>

      {innerTab === 'dodaj' && (
        <GospodarczyForm
          user={user}
          pracownicy={pracownicy}
          cars={cars}
          editingTask={editingTask}
          onCancelEdit={handleCancelEdit}
          onCreated={() => { refresh(); setEditingTask(null); setInnerTab('lista'); }}
        />
      )}

      {innerTab === 'kalendarz' && (
        <>
          <section className="panel">
            <div className="gosp-filters">
              <label className="gosp-filter-select">
                Pracownik
                <select value={pracownikFilter} onChange={e => setPracownikFilter(e.target.value)}>
                  <option value="wszyscy">Wszyscy pracownicy</option>
                  {pracownicy.map(p => <option key={p.Id} value={String(p.Id)}>{p.FullName}</option>)}
                </select>
              </label>
            </div>
          </section>
          <section className="panel">
            <GospodarczyCalendar tasks={calendarTasks} showPracownik={true} />
          </section>
        </>
      )}

      {innerTab === 'lista' && (
        <>
          <section className="panel">
            <div className="gosp-filters">
              <label className="gosp-filter-select">
                Pracownik
                <select value={pracownikFilter} onChange={e => setPracownikFilter(e.target.value)}>
                  <option value="wszyscy">Wszyscy pracownicy</option>
                  {pracownicy.map(p => <option key={p.Id} value={String(p.Id)}>{p.FullName}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="panel">
            <h2>Kolejność zadań ({aktywne.length})</h2>
            <p className="panel-hint">Przeciągnij lub użyj strzałek ▲▼ aby zmienić kolejność wykonywania.</p>
            {aktywne.length === 0 && <p>Brak aktywnych zadań.</p>}
            <div className="gosp-sort-list"
              onDragLeave={() => setDropTargetId(null)}>
              {aktywne.map(t => (
                <GospodarczyTaskCardSorted
                  key={t.Id}
                  task={t}
                  showPracownik
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onMove={handleMove}
                  onDragStart={(id) => setDraggingId(id)}
                  onDragOver={(id) => setDropTargetId(id)}
                  onDrop={handleDropOnTarget}
                  isDragging={draggingId === t.Id}
                  isDropTarget={dropTargetId === t.Id && draggingId !== t.Id}
                />
              ))}
            </div>
          </section>

          {zakonczone.length > 0 && (
            <details className="panel gosp-details">
              <summary>Zakonczone - jednorazowe ({zakonczone.length})</summary>
              <div className="job-list">
                {zakonczone.map(t => (
                  <GospodarczyTaskCard key={t.Id} task={t} showPracownik onDelete={handleDelete} onEdit={handleEdit} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
