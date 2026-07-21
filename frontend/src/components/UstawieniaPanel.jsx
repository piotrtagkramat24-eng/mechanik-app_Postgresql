import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

export default function UstawieniaPanel() {
  const [users, setUsers] = useState([]);
  const [emailDrafts, setEmailDrafts] = useState({});
  const [powiadomienia, setPowiadomienia] = useState([]);
  const [error, setError] = useState('');
  const [zapisano, setZapisano] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [wszyscy, powRes] = await Promise.all([
        api.getUsers(),
        api.getPowiadomieniaOdbiorcy(),
      ]);
      setUsers(wszyscy);
      setEmailDrafts(Object.fromEntries(wszyscy.map(u => [u.Id, u.Email || ''])));
      setPowiadomienia(powRes.filter(u => u.Aktywny).map(u => u.Id));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function pokazZapisano(msg) {
    setZapisano(msg);
    setTimeout(() => setZapisano(''), 2500);
  }

  async function handleZapiszEmail(userId) {
    setError('');
    try {
      await api.setUserEmail(userId, emailDrafts[userId] || '');
      pokazZapisano('Zapisano adres e-mail.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTogglePowiadomienie(userId) {
    const nowa = powiadomienia.includes(userId)
      ? powiadomienia.filter(id => id !== userId)
      : [...powiadomienia, userId];
    setPowiadomienia(nowa);
    setError('');
    try {
      await api.setPowiadomieniaOdbiorcy(nowa);
      pokazZapisano('Zapisano odbiorców powiadomień.');
    } catch (err) {
      setError(err.message);
    }
  }

  // Przelacza, czy dany mechanik rowniez wykonuje dalsze kroki po naprawie
  // (Wyposazenie/Inspecto/Mycie). System sam wybiera najlepiej dostepnego
  // z grona mechanikow oznaczonych tutaj — patrz backend/routes/followup.js.
  async function handleToggleDodatkowePrace(userId, aktualnaWartosc) {
    const nowaWartosc = !aktualnaWartosc;
    setUsers(prev => prev.map(u => u.Id === userId ? { ...u, WykonujeDodatkowePrace: nowaWartosc } : u));
    setError('');
    try {
      await api.setDodatkowePraceMechanika(userId, nowaWartosc);
      pokazZapisano('Zapisano przypisanie.');
    } catch (err) {
      setError(err.message);
      // cofnij zmiane lokalnie, jesli zapis sie nie udal
      setUsers(prev => prev.map(u => u.Id === userId ? { ...u, WykonujeDodatkowePrace: aktualnaWartosc } : u));
    }
  }

  const szefKierownik = users.filter(u => u.Role === 'szef' || u.Role === 'kierownik');
  const mechanicy = users.filter(u => u.Role === 'mechanik');

  return (
    <div className="ustawienia-wrap">
      {error && <div className="error-message">{error}</div>}
      {zapisano && <div className="success-message">{zapisano}</div>}

      <section className="panel">
        <h2>Adresy e-mail użytkowników</h2>
        <p className="panel-hint">Potrzebne do wysyłki powiadomień o nowych i zakończonych zadaniach.</p>
        <div className="ustawienia-email-list">
          {users.map(u => (
            <div key={u.Id} className="ustawienia-email-row">
              <span className="ustawienia-email-name">{u.FullName}</span>
              <input
                type="email"
                placeholder="adres@email.pl"
                value={emailDrafts[u.Id] ?? ''}
                onChange={(e) => setEmailDrafts(d => ({ ...d, [u.Id]: e.target.value }))}
              />
              <button className="btn btn-secondary btn-small" onClick={() => handleZapiszEmail(u.Id)}>
                Zapisz
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Powiadomienia mailowe o zakończonych robotach</h2>
        <p className="panel-hint">
          Zaznacz, kto ma dostawać maila, gdy mechanik zakończy robotę. Jeśli nikogo nie zaznaczysz,
          mail dostaną domyślnie wszyscy z rolą szef/kierownik.
        </p>
        <div className="ustawienia-checkbox-list">
          {szefKierownik.map(u => (
            <label key={u.Id} className="checkbox-option">
              <input
                type="checkbox"
                checked={powiadomienia.includes(u.Id)}
                onChange={() => handleTogglePowiadomienie(u.Id)}
              />
              {u.FullName} <span className="ustawienia-rola">({u.Role})</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Dalsze kroki po zakończeniu roboty (Wyposażenie i Inspecto / Mycie)</h2>
        <p className="panel-hint">
          Gdy mechanik zakończy robotę, pojazd jest mechanicznie gotowy, ale zostaje jeszcze do zrobienia:
          Wyposażenie i Inspecto oraz Mycie. Zaznacz poniżej mechaników, którzy — oprócz napraw — również
          wykonują te prace. System wybiera jedną osobę z tego grona i przypisuje jej OBA zadania razem
          (nie rozdziela ich na dwie różne osoby): najpierw kogoś, kto nie ma nic przydzielonego, potem
          kogoś bez niczego „w trakcie”, a na końcu osobę z najmniejszym obciążeniem. Mechanicy
          niezaznaczeni tutaj dostają wyłącznie naprawy.
        </p>
        <div className="ustawienia-checkbox-list">
          {mechanicy.length === 0 && <p>Brak kont z rolą „mechanik” w systemie.</p>}
          {mechanicy.map(u => (
            <label key={u.Id} className="checkbox-option">
              <input
                type="checkbox"
                checked={!!u.WykonujeDodatkowePrace}
                onChange={() => handleToggleDodatkowePrace(u.Id, !!u.WykonujeDodatkowePrace)}
              />
              {u.FullName}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
