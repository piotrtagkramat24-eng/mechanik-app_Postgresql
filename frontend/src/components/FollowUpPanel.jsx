import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const POLL_MS = 15000;

// Pokazuje "dalsze kroki" po zakonczeniu roboty przez mechanika (Wyposazenie /
// Inspecto / Mycie), z ktorych kazdy jest recznie przypisany do konkretnej
// osoby (patrz backend/routes/followup.js). Renderuje sie tylko jesli
// zalogowany user faktycznie ma takie zadania. Zwarty, jednolinijkowy uklad -
// zeby nie zajmowac duzo miejsca na ekranie.
export default function FollowUpPanel({ user }) {
  const [zadania, setZadania] = useState([]);
  const [zwiniety, setZwiniety] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const dane = await api.getMojeZadaniaPoNaprawie(user.Id);
      setZadania(dane);
    } catch (err) {
      setError(err.message);
    }
  }, [user.Id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleWykonaj(id) {
    setError('');
    try {
      await api.wykonajZadaniePoNaprawie(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (zadania.length === 0) return null;

  return (
    <section className="followup-panel-compact">
      <button className="followup-toggle" onClick={() => setZwiniety((z) => !z)}>
        <span>Do wykonania po naprawie ({zadania.length})</span>
        <span className="followup-toggle-arrow">{zwiniety ? '▸' : '▾'}</span>
      </button>
      {error && <div className="error-message">{error}</div>}
      {!zwiniety && (
        <div className="followup-list-compact">
          {zadania.map((z) => (
            <div key={z.Id} className="followup-row">
              <span className={`followup-typ followup-typ--${z.Typ}`}>{z.TypLabel}</span>
              <span className="followup-row-car"><strong>{z.Marka} {z.Model}</strong> {z.Rejestracja}</span>
              <span className="followup-row-opis" title={z.Opis}>{z.Opis}</span>
              <button className="btn btn-success btn-small" onClick={() => handleWykonaj(z.Id)}>
                ✓ Wykonane
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
