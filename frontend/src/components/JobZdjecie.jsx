import React, { useState } from 'react';
import { api } from '../api.js';

// Przycisk + lightbox do podgladu zdjecia dolaczonego przez mechanika przy
// zakonczeniu roboty. Zdjecie NIE jest czescia listy robot (zeby jej nie
// spowalniac), wiec pobieramy je dopiero po kliknieciu.
export default function JobZdjecie({ jobId }) {
  const [otwarte, setOtwarte] = useState(false);
  const [zdjecie, setZdjecie] = useState(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState('');

  async function otworz() {
    setOtwarte(true);
    if (zdjecie) return;
    setLadowanie(true);
    setBlad('');
    try {
      const dane = await api.getJobZdjecie(jobId);
      setZdjecie(dane.zdjecie);
    } catch (err) {
      setBlad(err.message || 'Nie udało się wczytać zdjęcia');
    } finally {
      setLadowanie(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-small job-zdjecie-btn" onClick={otworz}>
        📷 Zobacz zdjęcie
      </button>

      {otwarte && (
        <div className="modal-overlay" onClick={() => setOtwarte(false)}>
          <div className="modal-box modal-box--zdjecie" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Zdjęcie</span>
              <button className="modal-close" onClick={() => setOtwarte(false)}>✕</button>
            </div>
            <div className="modal-body">
              {ladowanie && <p className="modal-hint">Wczytywanie...</p>}
              {blad && <p className="error-message">{blad}</p>}
              {zdjecie && <img src={zdjecie} alt="Zdjęcie zgłoszenia" className="modal-zdjecie-full" />}
              {!ladowanie && !blad && !zdjecie && <p className="modal-hint">Brak zdjęcia.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
