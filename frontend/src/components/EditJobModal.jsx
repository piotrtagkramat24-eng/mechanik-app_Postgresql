import React, { useState } from 'react';
import JobCzynnosciList from './JobCzynnosciList.jsx';
import { formatCzasSzacowany } from '../utils/jobTimeUtils.js';

// Modal edycji zlecenia. Czynnosci (checklista "co jest do zrobienia") sa
// zarzadzane na biezaco przez JobCzynnosciList (kazda zmiana zapisuje sie
// od razu przez API), a przycisk "Zapisz zmiany" dotyczy tylko krotkiego
// podsumowania (Opis) wyswietlanego na liscie/karcie.
export default function EditJobModal({ job: initialJob, predefiniowane, userId, onConfirm, onCancel }) {
  const [job, setJob] = useState(initialJob);
  const [opis, setOpis] = useState(initialJob.Opis || '');
  const [zapisywanie, setZapisywanie] = useState(false);
  const [blad, setBlad] = useState('');

  async function handleZapisz() {
    if (!opis.trim()) {
      setBlad('Opis roboty nie może być pusty.');
      return;
    }
    setZapisywanie(true);
    setBlad('');
    try {
      await onConfirm(job.Id, { opis: opis.trim() });
    } catch (err) {
      setBlad(err.message || 'Nie udało się zapisać zmian');
    } finally {
      setZapisywanie(false);
    }
  }

  const czas = formatCzasSzacowany(job);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edycja zlecenia</span>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-car">
            <strong>{job.Marka} {job.Model}</strong>
            <span className="kb-card-reg">{job.Rejestracja}</span>
          </p>

          <label className="modal-label">Czynności do wykonania {czas ? `— łącznie ${czas}` : ''}</label>
          <JobCzynnosciList
            job={job}
            predefiniowane={predefiniowane}
            allowAdd
            allowRemove
            userId={userId}
            onChanged={setJob}
          />

          <label className="modal-label" style={{ marginTop: 12 }}>Podsumowanie (widoczne na liście)</label>
          <textarea
            className="modal-textarea"
            rows={3}
            value={opis}
            onChange={(e) => setOpis(e.target.value)}
          />
          {blad && <p className="error-message">{blad}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={zapisywanie}>Zamknij</button>
          <button className="btn btn-primary" onClick={handleZapisz} disabled={zapisywanie}>
            {zapisywanie ? 'Zapisywanie...' : 'Zapisz podsumowanie'}
          </button>
        </div>
      </div>
    </div>
  );
}
