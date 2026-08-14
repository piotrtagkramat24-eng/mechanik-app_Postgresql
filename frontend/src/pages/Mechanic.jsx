import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import JobCard from '../components/JobCard.jsx';
import CollapsiblePanel from '../components/CollapsiblePanel.jsx';
import JobZdjecie from '../components/JobZdjecie.jsx';
import FollowUpPanel from '../components/FollowUpPanel.jsx';

const POLL_INTERVAL_MS = 4000;

// Zmniejsza zdjecie z aparatu telefonu przed wyslaniem na serwer (max szerokosc
// 1000px, jpeg q=0.65) - surowe zdjecia z telefonu to kilka MB, co zapchaloby
// baze i spowolnilo ladowanie listy robot.
function resizeImageFile(file, maxWidth = 1000, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Nie udało się odczytać obrazu'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ZakonczModal({ job, onConfirm, onCancel }) {
  const [opis, setOpis] = useState('');
  const [zdjecie, setZdjecie] = useState(null);
  const [zdjecieBlad, setZdjecieBlad] = useState('');
  const [przetwarzanieZdjecia, setPrzetwarzanieZdjecia] = useState(false);
  const [wysylanie, setWysylanie] = useState(false);

  async function handleWybierzZdjecie(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setZdjecieBlad('');
    setPrzetwarzanieZdjecia(true);
    try {
      const dataUrl = await resizeImageFile(file);
      setZdjecie(dataUrl);
    } catch (err) {
      setZdjecieBlad(err.message || 'Nie udało się wczytać zdjęcia');
    } finally {
      setPrzetwarzanieZdjecia(false);
    }
  }

  async function handleConfirm() {
    setWysylanie(true);
    try {
      await onConfirm(opis, zdjecie);
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Zakończ zlecenie</span>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-car">
            <strong>{job.Marka} {job.Model}</strong>
            <span className="kb-card-reg">{job.Rejestracja}</span>
          </p>
          <label className="modal-label">Co do zgłoszenia <span className="modal-optional">(opcjonalnie)</span></label>
          <textarea
            className="modal-textarea"
            rows={4}
            placeholder="Uwagi, usterki, braki do zgłoszenia szefowi/kierownikowi. NIE wpisuj tu listy wymienionych części."
            value={opis}
            onChange={e => setOpis(e.target.value)}
            autoFocus
          />

          <label className="modal-label" style={{ marginTop: 12 }}>Zdjęcie <span className="modal-optional">(opcjonalnie)</span></label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleWybierzZdjecie}
          />
          {przetwarzanieZdjecia && <p className="modal-hint">Wczytywanie zdjęcia...</p>}
          {zdjecieBlad && <p className="error-message">{zdjecieBlad}</p>}
          {zdjecie && !przetwarzanieZdjecia && (
            <div className="modal-zdjecie-preview">
              <img src={zdjecie} alt="Podgląd zdjęcia" />
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setZdjecie(null)}>
                Usuń zdjęcie
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={wysylanie}>Anuluj</button>
          <button className="btn btn-success" onClick={handleConfirm} disabled={wysylanie || przetwarzanieZdjecia}>
            {wysylanie ? 'Zapisywanie...' : '✓ Zakończ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Mechanic({ user, embedded = false }) {
  const [jobs, setJobs] = useState([]);
  const [predefiniowane, setPredefiniowane] = useState([]);
  const [error, setError] = useState('');
  const [zakonczJob, setZakonczJob] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getJobsForMechanik(user.Id);
      setJobs(data);
    } catch (err) {
      setError(err.message);
    }
  }, [user.Id]);

  useEffect(() => {
    refresh();
    api.getPredefiniowanePrace().then(setPredefiniowane).catch(() => {});
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleStatus(jobId, status) {
    setError('');
    try {
      await api.setStatus(jobId, status);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  // Mechanik rozpoczyna POJEDYNCZA czynnosc w obrebie zlecenia (kazda ma
  // wlasny pasek postepu, niezaleznie od pozostalych na tym samym zleceniu).
  async function handleStartCzynnosc(jobId, czynnoscId) {
    setError('');
    try {
      await api.setCzynnoscStatus(jobId, czynnoscId, 'rozpoczete');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  // Konczy POJEDYNCZA czynnosc. Jesli to OSTATNIA niezakonczona czynnosc na
  // zleceniu, jej zakonczenie konczy cale zlecenie - wiec zamiast konczyc od
  // razu, otwieramy ten sam modal co przy "Zakoncz" (opis + zdjecie).
  function handleFinishCzynnosc(job, czynnoscId, jestOstatnia) {
    if (jestOstatnia) {
      setZakonczJob({ ...job, _czynnoscId: czynnoscId });
    } else {
      setError('');
      api.setCzynnoscStatus(job.Id, czynnoscId, 'zakonczone')
        .then(refresh)
        .catch((err) => setError(err.message));
    }
  }

  async function handleZakoncz(opis, zdjecie) {
    if (!zakonczJob) return;
    setError('');
    try {
      if (zakonczJob._czynnoscId) {
        await api.setCzynnoscStatus(zakonczJob.Id, zakonczJob._czynnoscId, 'zakonczone', opis.trim() || undefined, zdjecie || undefined);
      } else {
        await api.setStatus(zakonczJob.Id, 'zakonczone', opis.trim() || undefined, zdjecie || undefined);
      }
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setZakonczJob(null);
    }
  }

  const przydzielone = jobs.filter((j) => j.Status === 'przydzielone');
  const wTrakcie = jobs.filter((j) => j.Status === 'rozpoczete');
  const zakonczone = jobs.filter((j) => j.Status === 'zakonczone');

  return (
    <div className="page">
      {error && <div className="error-message">{error}</div>}

      {zakonczJob && (
        <ZakonczModal
          job={zakonczJob}
          onConfirm={handleZakoncz}
          onCancel={() => setZakonczJob(null)}
        />
      )}

      {!embedded && <FollowUpPanel user={user} />}

      {/* 1. W trakcie */}
      <CollapsiblePanel title="W trakcie" count={wTrakcie.length} defaultOpen={true}>
        {wTrakcie.length === 0 && <p>Nie masz aktualnie rozpoczętych zleceń.</p>}
        {wTrakcie.map((job) => (
          <JobCard
            key={job.Id}
            job={job}
            predefiniowane={predefiniowane}
            allowAddCzynnosc
            allowStatusChange
            userId={user.Id}
            onJobUpdated={refresh}
            onStartCzynnosc={(czynnoscId) => handleStartCzynnosc(job.Id, czynnoscId)}
            onFinishCzynnosc={(czynnoscId, jestOstatnia) => handleFinishCzynnosc(job, czynnoscId, jestOstatnia)}
          />
        ))}
      </CollapsiblePanel>

      {/* 2. Zakończone — zaraz pod "W trakcie" */}
      <CollapsiblePanel title="Zakończone" count={zakonczone.length} defaultOpen={false}>
        {zakonczone.length === 0 && <p>Brak zakończonych zleceń.</p>}
        {zakonczone.map((job) => (
          <div key={job.Id} className="job-card job-card--done">
            <div className="job-card-top">
              <strong>{job.Marka} {job.Model} · {job.Rejestracja}</strong>
              <span className="job-done-date">
                {job.DataZakonczenia
                  ? new Date(job.DataZakonczenia).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : ''}
              </span>
            </div>
            <p className="job-card-opis">{job.Opis}</p>
            {job.OpisWykonania && (
              <div className="job-wykonanie-box">
                <span className="job-wykonanie-label">📝 Do zgłoszenia:</span>
                <span className="job-wykonanie-text">{job.OpisWykonania}</span>
              </div>
            )}
            {job.MaZdjecie ? <JobZdjecie jobId={job.Id} /> : null}
          </div>
        ))}
      </CollapsiblePanel>

      {/* 3. Przydzielone */}
      <CollapsiblePanel title="Przydzielone" count={przydzielone.length} defaultOpen={true}>
        {przydzielone.length === 0 && <p>Brak zleceń czekających na rozpoczęcie.</p>}
        {przydzielone.map((job) => (
          <JobCard
            key={job.Id}
            job={job}
            predefiniowane={predefiniowane}
            allowStatusChange
            userId={user.Id}
            onJobUpdated={refresh}
            onStartCzynnosc={(czynnoscId) => handleStartCzynnosc(job.Id, czynnoscId)}
            onFinishCzynnosc={(czynnoscId, jestOstatnia) => handleFinishCzynnosc(job, czynnoscId, jestOstatnia)}
          />
        ))}
      </CollapsiblePanel>
    </div>
  );
}
