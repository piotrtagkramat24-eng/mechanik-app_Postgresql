import React, { useState } from 'react';
import { api } from '../api.js';
import SearchableSelect from './SearchableSelect.jsx';
import CzynnoscElapsedBar from './CzynnoscElapsedBar.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';

// Parsuje kolumne CzynnosciJson (FOR JSON PATH z backendu) na tablice obiektow
// [{ Id, Nazwa, CzasMin, CzasSredni, CzasMax, PredefiniowanaPracaId, Status,
//    DataRozpoczecia, DataZakonczenia }, ...]
export function parseCzynnosci(job) {
  if (!job || !job.CzynnosciJson) return [];
  try {
    const parsed = typeof job.CzynnosciJson === 'string' ? JSON.parse(job.CzynnosciJson) : job.CzynnosciJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Checklista "co jest do zrobienia" na zleceniu — lista czynnosci zamiast
// jednego zbiorczego opisu, kazda z wlasnym paskiem postepu.
//
// allowAdd     - mozna dopisac kolejna czynnosc (z listy predefiniowanych
//                prac albo wlasna, z WYMAGANYM przewidywanym czasem)
// allowRemove  - mozna usunac pomylkowo dodana pozycje
// allowStatusChange - pokazuje przyciski Rozpocznij/Zakoncz DLA KAZDEJ
//                czynnosci z osobna. Koniecznie potrzebne onStartCzynnosc/
//                onFinishCzynnosc, bo zakonczenie OSTATNIEJ czynnosci konczy
//                cale zlecenie (i tam trzeba zebrac opis+zdjecie), wiec ta
//                decyzja zostaje po stronie rodzica (patrz Mechanic.jsx).
export default function JobCzynnosciList({
  job,
  predefiniowane = [],
  allowAdd = false,
  allowRemove = false,
  allowStatusChange = false,
  userId,
  onChanged,
  onStartCzynnosc,
  onFinishCzynnosc,
}) {
  const czynnosci = parseCzynnosci(job);
  const [wybrana, setWybrana] = useState('');
  const [wlasna, setWlasna] = useState('');
  const [wlasnyCzas, setWlasnyCzas] = useState('');
  const [zapisywanie, setZapisywanie] = useState(false);
  const [error, setError] = useState('');

  const predefOptions = predefiniowane.map((p) => ({
    value: p.Id,
    label: p.Nazwa,
    sublabel: formatCzasSzacowany({ CzasSzacowanyMin: p.CzasMin, CzasSzacowanySredni: p.CzasSredni, CzasSzacowanyMax: p.CzasMax }),
  }));

  async function handleAddPredef(id) {
    const pr = predefiniowane.find((p) => String(p.Id) === String(id));
    if (!pr) return;
    setError('');
    setZapisywanie(true);
    try {
      const updated = await api.addJobCzynnosc(job.Id, { predefiniowanaPracaId: pr.Id, userId });
      setWybrana('');
      if (onChanged) onChanged(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setZapisywanie(false);
    }
  }

  async function handleAddWlasna() {
    if (!wlasna.trim()) return;
    if (!wlasnyCzas || Number(wlasnyCzas) <= 0) {
      setError('Podaj przewidywany czas wykonania (w godzinach) dla własnej czynności');
      return;
    }
    setError('');
    setZapisywanie(true);
    try {
      const updated = await api.addJobCzynnosc(job.Id, {
        nazwa: wlasna.trim(),
        czasSredni: Number(wlasnyCzas),
        userId,
      });
      setWlasna('');
      setWlasnyCzas('');
      if (onChanged) onChanged(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setZapisywanie(false);
    }
  }

  async function handleRemove(czynnoscId) {
    setError('');
    try {
      const updated = await api.removeJobCzynnosc(job.Id, czynnoscId);
      if (onChanged) onChanged(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  const niezakonczone = czynnosci.filter((c) => c.Status !== 'zakonczone').length;

  // Brak zapisanych czynnosci (np. bardzo stare dane) i nic do dodania —
  // zachowaj sie jak dawniej i pokaz sam opis, zeby nic nie zniknelo.
  if (czynnosci.length === 0 && !allowAdd) {
    return <p className="job-card-opis">{job.Opis}</p>;
  }

  return (
    <div className="job-czynnosci">
      {czynnosci.length > 0 && (
        <ul className="job-czynnosci-list">
          {czynnosci.map((cz) => {
            const czas = formatCzasSzacowany({ CzasSzacowanyMin: cz.CzasMin, CzasSzacowanySredni: cz.CzasSredni, CzasSzacowanyMax: cz.CzasMax });
            const zakonczona = cz.Status === 'zakonczone';
            return (
              <li key={cz.Id} className={`job-czynnosci-item ${zakonczona ? 'job-czynnosci-item--zakonczone' : ''}`}>
                <span className="job-czynnosci-dot">{zakonczona ? '✓' : '•'}</span>
                <span className="job-czynnosci-nazwa">{cz.Nazwa}</span>
                {czas && <span className="job-czynnosci-czas">{czas}</span>}
                {allowRemove && (
                  <button
                    type="button"
                    className="job-czynnosci-remove"
                    onClick={() => handleRemove(cz.Id)}
                    title="Usuń czynność"
                  >
                    ×
                  </button>
                )}
                {cz.DataRozpoczecia && <CzynnoscElapsedBar czynnosc={cz} />}
                {allowStatusChange && !zakonczona && (
                  <div className="job-czynnosci-item-actions">
                    {cz.Status === 'oczekuje' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => onStartCzynnosc && onStartCzynnosc(cz.Id)}
                      >
                        Rozpocznij
                      </button>
                    )}
                    {cz.Status === 'rozpoczete' && (
                      <button
                        type="button"
                        className="btn btn-success btn-small"
                        onClick={() => onFinishCzynnosc && onFinishCzynnosc(cz.Id, niezakonczone === 1)}
                      >
                        Zakończ
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {allowAdd && (
        <div className="job-czynnosci-add">
          {error && <div className="error-message">{error}</div>}
          <SearchableSelect
            options={predefOptions}
            value={wybrana}
            onChange={handleAddPredef}
            placeholder="+ dodaj czynność z listy predefiniowanych..."
            emptyText="Brak predefiniowanych prac"
            disabled={zapisywanie}
          />
          <div className="job-czynnosci-add-wlasna">
            <input
              type="text"
              placeholder="albo wpisz własną czynność..."
              value={wlasna}
              onChange={(e) => setWlasna(e.target.value)}
              disabled={zapisywanie}
            />
            <input
              type="number"
              step="0.25"
              min="0.25"
              className="job-czynnosci-add-wlasna-czas"
              placeholder="czas (h)"
              value={wlasnyCzas}
              onChange={(e) => setWlasnyCzas(e.target.value)}
              disabled={zapisywanie}
              title="Przewidywany czas wykonania w godzinach — wymagane dla własnej czynności"
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleAddWlasna}
              disabled={zapisywanie || !wlasna.trim() || !wlasnyCzas}
            >
              Dodaj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
