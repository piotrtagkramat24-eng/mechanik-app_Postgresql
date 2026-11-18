import React from 'react';
import Icon from './Icon.jsx';
import StatusBadge from './StatusBadge.jsx';
import ElapsedTimeBar from './ElapsedTimeBar.jsx';
import JobZdjecie from './JobZdjecie.jsx';
import JobCzynnosciList, { parseCzynnosci } from './JobCzynnosciList.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
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
  const czas = formatCzasSzacowany(job);
  // Patrz komentarz w Manager.jsx (KanbanCard) - przy dokladnie 1 czynnosci
  // jej wlasny pasek (w JobCzynnosciList) i zbiorczy pasek dla calego
  // zlecenia pokazywalyby te sama liczbe, wiec zbiorczy chowamy.
  const liczbaCzynnosci = parseCzynnosci(job).length;
  const pokazZbiorczyPasek = liczbaCzynnosci !== 1;

  async function handleDelete() {
    const ok = await confirmDialog({
      title: 'Usunąć tę robotę?',
      message: `${job.Marka} ${job.Model} ${job.Rejestracja} — tej operacji nie można cofnąć.`,
      confirmLabel: 'Usuń robotę',
      danger: true,
    });
    if (ok) onDelete(job.Id);
  }

  return (
    <article className={`job-card job-card--${job.Status}`}>
      <header className="job-card-top">
        <div className="job-card-heading">
          <span className="job-card-title">{job.Marka} {job.Model}</span>
          <span className="plate">{job.Rejestracja}</span>
        </div>
        <StatusBadge status={job.Status} />
      </header>

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

      {pokazZbiorczyPasek && <ElapsedTimeBar job={job} />}
      {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
      {children && <div className="job-card-actions">{children}</div>}

      <footer className="job-card-foot">
        <div className="job-card-meta">
          <span className="meta-chip" title="Mechanik">
            <Icon name="wrench" size={13} /> {job.MechanikFullName || 'nieprzydzielony'}
          </span>
          <span className="meta-chip" title="Zgłosił">
            <Icon name="user" size={13} /> {job.UtworzonoPrzezFullName}
          </span>
          {pokazZbiorczyPasek && czas && (
            <span className="meta-chip meta-chip--accent" title={liczbaCzynnosci >= 2 ? 'Szacowany czas łącznie' : 'Szacowany czas'}>
              <Icon name="clock" size={13} /> {czas}
            </span>
          )}
        </div>
        {(onEdit || onDelete) && (
          <div className="job-card-tools">
            {onEdit && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => onEdit(job)}>
                <Icon name="pencil" size={14} /> Edytuj
              </button>
            )}
            {onDelete && (
              <button type="button" className="btn btn-ghost btn-small btn-ghost--danger" onClick={handleDelete}>
                <Icon name="trash" size={14} /> Usuń
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
