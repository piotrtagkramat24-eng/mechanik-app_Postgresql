import React, { useState, useEffect } from 'react';
import PriorityBadge from './PriorityBadge.jsx';
import { api } from '../api.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL');
}

function terminLabel(task) {
  if (task.DniDoTerminu === null || task.DniDoTerminu === undefined) return null;
  const dni = task.DniDoTerminu;
  if (dni < 0) return { text: `przeterminowane o ${Math.abs(dni)} dni`, cls: 'termin-overdue' };
  if (dni === 0) return { text: 'termin: dzis', cls: 'termin-today' };
  if (dni <= 7) return { text: `za ${dni} dni`, cls: 'termin-soon' };
  return { text: `za ${dni} dni`, cls: 'termin-far' };
}

export default function GospodarczyTaskCard({
  task,
  showPracownik = false,
  onWykonaj,
  onDelete,
  onEdit,
}) {
  const [data, setData] = useState(todayISO());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [ostatnieWykonanie, setOstatnieWykonanie] = useState(null);
  const [rejDzisiaj, setRejDzisiaj] = useState([]);
  const [rejDzisiajInput, setRejDzisiajInput] = useState('');
  const [rejDzisiajOtwarte, setRejDzisiajOtwarte] = useState(false);
  const [rejDzisiajZapisywanie, setRejDzisiajZapisywanie] = useState(false);

  const jestCykliczne = task.Typ === 'cykliczne';

  // Dzisiejsze numery rejestracyjne (np. dla cyklicznego "Sprzatanie") — NIE
  // przechodza z dnia na dzien, wpisywane od nowa kazdego dnia (patrz backend
  // /api/gospodarcze/:id/rejestracje-dzisiaj).
  useEffect(() => {
    if (!jestCykliczne) return;
    if (task.RejestracjeDzisiajRaw) {
      try {
        const parsed = JSON.parse(task.RejestracjeDzisiajRaw);
        setRejDzisiaj(Array.isArray(parsed) ? parsed : []);
      } catch { setRejDzisiaj([]); }
    } else {
      setRejDzisiaj([]);
    }
  }, [jestCykliczne, task.RejestracjeDzisiajRaw]);

  async function handleZapiszRejDzisiaj(nowaLista) {
    setRejDzisiajZapisywanie(true);
    try {
      await api.setRejestracjeDzisiaj(task.Id, nowaLista);
      setRejDzisiaj(nowaLista);
    } catch {
      // cicho — pole i tak pokazuje aktualny stan lokalny
    } finally {
      setRejDzisiajZapisywanie(false);
    }
  }

  function handleDodajRejDzisiaj() {
    const wartosc = rejDzisiajInput.trim().toUpperCase();
    if (!wartosc || rejDzisiaj.includes(wartosc)) { setRejDzisiajInput(''); return; }
    const nowaLista = [...rejDzisiaj, wartosc];
    setRejDzisiajInput('');
    handleZapiszRejDzisiaj(nowaLista);
  }

  function handleUsunRejDzisiaj(numer) {
    handleZapiszRejDzisiaj(rejDzisiaj.filter((r) => r !== numer));
  }

  const termin = terminLabel(task);
  const jestZakonczone = task.Status === 'zakonczone';

  let rejestracje = [];
  if (task.RejestracjeJson) {
    try {
      const parsed = typeof task.RejestracjeJson === 'string'
        ? JSON.parse(task.RejestracjeJson)
        : task.RejestracjeJson;
      rejestracje = Array.isArray(parsed) ? parsed : [];
    } catch { /* ignore */ }
  }

  const maNumeryRejestracyjne = rejestracje.length > 0;

  // Pobierz ostatnie wykonanie (Wykonano/Nie wykonano per numer), zeby pokazac
  // znaczek od razu przy chipie, bez klikania czegokolwiek.
  useEffect(() => {
    if (!maNumeryRejestracyjne) return;
    let anulowano = false;
    (async () => {
      try {
        const historia = await api.getGospodarczeHistoria(task.Id);
        if (anulowano) return;
        const ostatnie = Array.isArray(historia) && historia.length > 0 ? historia[0] : null;
        if (!ostatnie) { setOstatnieWykonanie(null); return; }
        let rejWyk = [];
        if (ostatnie.RejestracjeWykonanieJson) {
          try {
            const parsed = typeof ostatnie.RejestracjeWykonanieJson === 'string'
              ? JSON.parse(ostatnie.RejestracjeWykonanieJson)
              : ostatnie.RejestracjeWykonanieJson;
            rejWyk = Array.isArray(parsed) ? parsed : [];
          } catch { rejWyk = []; }
        }
        const mapa = {};
        rejWyk.forEach((r) => { mapa[r.RejestracjaId] = !!r.Wykonano; });
        setOstatnieWykonanie(mapa);
      } catch {
        // Brak historii nie jest bledem krytycznym — po prostu nie pokazemy znacznikow.
        if (!anulowano) setOstatnieWykonanie(null);
      }
    })();
    return () => { anulowano = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.Id, task.DataOstatniegoWykonania]);

  return (
    <div className={`gosp-card ${jestZakonczone ? 'gosp-card--done' : ''}`}>
      <div className="gosp-card-top">
        <strong className="gosp-card-title">{task.Zadanie}</strong>
        <div className="gosp-card-badges">
          <PriorityBadge priorytet={task.Priorytet} />
          <span className="type-badge">
            {task.Typ === 'cykliczne' ? `Co ${task.CoIleDni} dni` : 'Jednorazowe'}
          </span>
          {jestZakonczone && <span className="status-badge status-zakonczone">Zakończone</span>}
        </div>
      </div>

      {task.Lokalizacja && <p className="gosp-card-lokalizacja">📍 {task.Lokalizacja}</p>}

      {jestCykliczne && !jestZakonczone && (
        <div className="gosp-rej-dzisiaj">
          <button
            type="button"
            className="gosp-rej-dzisiaj-toggle"
            onClick={() => setRejDzisiajOtwarte((o) => !o)}
          >
            📋 Dzisiejsze numery ({rejDzisiaj.length}) {rejDzisiajOtwarte ? '▾' : '▸'}
          </button>
          {rejDzisiajOtwarte && (
            <div className="gosp-rej-dzisiaj-body">
              <p className="form-hint">
                Numery na dziś — nie przechodzą na jutro, wpisz od nowa gdy trzeba.
              </p>
              {rejDzisiaj.length > 0 && (
                <div className="chip-list">
                  {rejDzisiaj.map((r) => (
                    <span key={r} className="chip chip--rejestracja">
                      {r}
                      <button type="button" className="chip-remove" onClick={() => handleUsunRejDzisiaj(r)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="gosp-rej-dzisiaj-input-row">
                <input
                  type="text"
                  placeholder="np. WZ12345"
                  value={rejDzisiajInput}
                  onChange={(e) => setRejDzisiajInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDodajRejDzisiaj(); } }}
                  disabled={rejDzisiajZapisywanie}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleDodajRejDzisiaj}
                  disabled={rejDzisiajZapisywanie || !rejDzisiajInput.trim()}
                >
                  Dodaj
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {rejestracje.length > 0 && (
        <div className="chip-list chip-list--rejestracje">
          {rejestracje.map((r) => {
            const wykonano = ostatnieWykonanie ? ostatnieWykonanie[r.Id] : undefined;
            const znanyStatus = wykonano !== undefined;
            const cls = !znanyStatus
              ? 'chip--rejestracja'
              : wykonano ? 'chip--wykonano' : 'chip--niewykonano';
            return (
              <span key={r.Id} className={`chip ${cls}`}>
                {znanyStatus && (wykonano ? '✓ ' : '✗ ')}
                {r.Rejestracja}
              </span>
            );
          })}
        </div>
      )}

      <div className="gosp-card-meta">
        {showPracownik && <span>Pracownik: {task.PracownikFullName}</span>}
        <span>Ostatnio wykonano: {formatDate(task.DataOstatniegoWykonania)}</span>
        <span>Nastepny termin: {formatDate(task.NastepnyTermin)}</span>
        {termin && !jestZakonczone && (
          <span className={`termin-label ${termin.cls}`}>{termin.text}</span>
        )}
        <span>Dodal: {task.UtworzonoPrzezFullName}</span>
      </div>

      {onWykonaj && !jestZakonczone && (
        <div className="gosp-card-actions">
          <label className="gosp-date-label">
            Data wykonania
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <button className="btn btn-success" onClick={() => onWykonaj(task.Id, data)}>
            Oznacz jako wykonane
          </button>
        </div>
      )}

      {(onEdit || onDelete) && (
        <div className="gosp-card-actions">
          {onEdit && !confirmingDelete && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => onEdit(task)}
            >
              ✎ Edytuj
            </button>
          )}
          {onDelete && !confirmingDelete && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setConfirmingDelete(true)}
            >
              Usun zadanie
            </button>
          )}
          {onDelete && confirmingDelete && (
            <>
              <span className="gosp-confirm-text">Czy na pewno usunąć?</span>
              <button
                className="btn btn-danger btn-small"
                onClick={() => {
                  setConfirmingDelete(false);
                  onDelete(task.Id);
                }}
              >
                Tak, usun
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setConfirmingDelete(false)}
              >
                Anuluj
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
