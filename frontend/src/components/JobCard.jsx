import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import ElapsedTimeBar from './ElapsedTimeBar.jsx';
import JobZdjecie from './JobZdjecie.jsx';
import JobCzynnosciList, { parseCzynnosci } from './JobCzynnosciList.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';

export default function JobCard({
  job,
  children,
  onEdit,
  onDelete,
  predefiniowane,
  allowAddCzynnosc = false,
  allowRemoveCzynnosc = false,
  allowStatusChange = false,
  userId,
  onJobUpdated,
  onStartCzynnosc,
  onFinishCzynnosc,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const czas = formatCzasSzacowany(job);
  // Patrz komentarz w Manager.jsx (KanbanCard) - przy dokladnie 1 czynnosci
  // jej wlasny pasek (w JobCzynnosciList) i zbiorczy pasek dla calego
  // zlecenia pokazywalyby te sama liczbe, wiec zbiorczy chowamy.
  const liczbaCzynnosci = parseCzynnosci(job).length;
  const pokazZbiorczyPasek = liczbaCzynnosci !== 1;

  return (
    <div className="job-card">
      <div className="job-card-top">
        <strong>
          {job.Marka} {job.Model} &middot; {job.Rejestracja}
        </strong>
        <StatusBadge status={job.Status} />
      </div>
      <JobCzynnosciList
        job={job}
        predefiniowane={predefiniowane}
        allowAdd={allowAddCzynnosc}
        allowRemove={allowRemoveCzynnosc}
        allowStatusChange={allowStatusChange}
        userId={userId}
        onChanged={onJobUpdated}
        onStartCzynnosc={onStartCzynnosc}
        onFinishCzynnosc={onFinishCzynnosc}
      />
      <div className="job-card-meta">
        <span>Mechanik: {job.MechanikFullName || '— nieprzydzielony —'}</span>
        <span>Zglosil: {job.UtworzonoPrzezFullName}</span>
        {pokazZbiorczyPasek && czas && (
          <span className="job-card-czas">
            ⏱ {liczbaCzynnosci >= 2 ? 'Szac. czas (łącznie)' : 'Szac. czas'}: {czas}
          </span>
        )}
      </div>
      {pokazZbiorczyPasek && <ElapsedTimeBar job={job} />}
      {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
      {children && <div className="job-card-actions">{children}</div>}

      {(onEdit || onDelete) && (
        <div className="job-card-actions job-card-actions--admin">
          {onEdit && (
            <button className="btn btn-secondary btn-small" onClick={() => onEdit(job)}>
              ✏️ Edytuj
            </button>
          )}
          {onDelete && !confirmingDelete && (
            <button className="btn btn-secondary btn-small" onClick={() => setConfirmingDelete(true)}>
              🗑️ Usuń
            </button>
          )}
          {onDelete && confirmingDelete && (
            <>
              <span className="gosp-confirm-text">Na pewno usunąć?</span>
              <button
                className="btn btn-danger btn-small"
                onClick={() => { setConfirmingDelete(false); onDelete(job.Id); }}
              >
                Tak, usuń
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => setConfirmingDelete(false)}>
                Anuluj
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
