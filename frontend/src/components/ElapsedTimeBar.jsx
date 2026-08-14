import React, { useEffect, useState } from 'react';
import { getElapsedInfo, getCompletionInfo, formatGodziny } from '../utils/jobTimeUtils.js';

// Pasek pokazujacy uplyw czasu od rozpoczecia roboty przez mechanika,
// wzgledem szacowanego (normatywnego) czasu wykonania.
// Odswieza sie sam co 30 sekund, bez potrzeby przeladowania strony.
// Dla zakonczonych robot pokazuje zamiast paska podsumowanie: rzeczywisty
// czas wykonania i — jesli zostal przekroczony szacowany czas — wyrazne
// ostrzezenie z wykrzyknikiem, widoczne u szefa/kierownika.
export default function ElapsedTimeBar({ job }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (job.Status === 'zakonczone') {
    const completion = getCompletionInfo(job);
    if (!completion) return null;
    return (
      <div className={`completion-info${completion.przekroczono ? ' completion-info--przekroczono' : ''}`}>
        <span className="completion-info-czas">Czas wykonania: {formatGodziny(completion.totalHours)}</span>
        {completion.przekroczono && (
          <span className="completion-info-warning">
            ⚠ Przekroczono szac. czas o {formatGodziny(completion.roznicaHours)}
          </span>
        )}
      </div>
    );
  }

  if (job.Status !== 'rozpoczete' || !job.DataRozpoczecia) return null;

  const info = getElapsedInfo(job, now);
  if (!info) return null;

  const { elapsedHours, estimateHours, percent, status } = info;

  return (
    <div className={`elapsed-bar elapsed-bar--${status}`}>
      <div className="elapsed-bar-track">
        <div
          className="elapsed-bar-fill"
          style={{ width: `${percent != null ? percent : 12}%` }}
        />
      </div>
      <div className="elapsed-bar-label">
        {status === 'brak-szacunku' ? (
          <>W trakcie od {formatGodziny(elapsedHours)}</>
        ) : status === 'przekroczono' ? (
          <>Przekroczono szac. czas o {formatGodziny(elapsedHours - estimateHours)} (trwa {formatGodziny(elapsedHours)})</>
        ) : (
          <>W trakcie: {formatGodziny(elapsedHours)} / szac. {formatGodziny(estimateHours)}</>
        )}
      </div>
    </div>
  );
}
