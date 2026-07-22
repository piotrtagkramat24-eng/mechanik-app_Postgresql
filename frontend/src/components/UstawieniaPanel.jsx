import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

// Pola formularza godzin pracy wyciagniete z rekordu uzytkownika (kolumny
// Godz* zwracane przez GET /api/users) - patrz DOMYSLNY_HARMONOGRAM w
// jobTimeUtils.js dla domyslnych wartosci firmowych.
function godzinyDraftZUsera(u) {
  return {
    godzTydzOd: u.GodzTydzOd || '08:00',
    godzTydzDo: u.GodzTydzDo || '17:00',
    godzTydzPrzerwaOd: u.GodzTydzPrzerwaOd ?? '11:00',
    godzTydzPrzerwaMin: u.GodzTydzPrzerwaMin != null ? String(u.GodzTydzPrzerwaMin) : '60',
    // sobota moze byc pusta (== nie pracuje w soboty) - '' zamiast null, zeby dzialalo w <input type="time">
    sobotaPracuje: !!(u.GodzSobOd && u.GodzSobDo),
    godzSobOd: u.GodzSobOd || '08:00',
    godzSobDo: u.GodzSobDo || '14:00',
    godzSobPrzerwaOd: u.GodzSobPrzerwaOd ?? '',
    godzSobPrzerwaMin: u.GodzSobPrzerwaMin != null ? String(u.GodzSobPrzerwaMin) : '0',
  };
}

export default function UstawieniaPanel() {
  const [users, setUsers] = useState([]);
  const [emailDrafts, setEmailDrafts] = useState({});
  const [hasloDrafts, setHasloDrafts] = useState({});
  const [powiadomienia, setPowiadomienia] = useState([]);
  const [godzinyDrafts, setGodzinyDrafts] = useState({});
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
      setGodzinyDrafts(Object.fromEntries(wszyscy.map(u => [u.Id, godzinyDraftZUsera(u)])));
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

  // Superadmin recznie ustawia nowe haslo wybranemu uzytkownikowi (np. gdy
  // ktos zapomni swojego) - trafia do backendu zahaszowane (bcrypt), patrz
  // PUT /api/users/:id/password w backend/routes/users.js.
  async function handleZapiszHaslo(userId) {
    setError('');
    const nowe = (hasloDrafts[userId] || '').trim();
    if (nowe.length < 6) {
      setError('Nowe hasło musi mieć co najmniej 6 znaków.');
      return;
    }
    try {
      await api.setUserPassword(userId, nowe);
      setHasloDrafts(d => ({ ...d, [userId]: '' }));
      pokazZapisano('Ustawiono nowe hasło.');
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

  function handleZmienGodziny(userId, pole, wartosc) {
    setGodzinyDrafts(d => ({ ...d, [userId]: { ...d[userId], [pole]: wartosc } }));
  }

  // Zapisuje godziny pracy mechanika (dynamiczny harmonogram uzywany przez
  // pasek uplywu czasu na Tablicy mechanikow - patrz jobTimeUtils.js).
  // Gdy "sobotaPracuje" jest odznaczone, wysylamy null dla godzin soboty -
  // oznacza to, ze mechanik w ogole nie pracuje w tym dniu.
  async function handleZapiszGodziny(userId) {
    setError('');
    const draft = godzinyDrafts[userId];
    if (!draft) return;
    try {
      await api.setGodzinyPracyMechanika(userId, {
        godzTydzOd: draft.godzTydzOd,
        godzTydzDo: draft.godzTydzDo,
        godzTydzPrzerwaOd: Number(draft.godzTydzPrzerwaMin) > 0 ? draft.godzTydzPrzerwaOd : null,
        godzTydzPrzerwaMin: Number(draft.godzTydzPrzerwaMin) || 0,
        godzSobOd: draft.sobotaPracuje ? draft.godzSobOd : null,
        godzSobDo: draft.sobotaPracuje ? draft.godzSobDo : null,
        godzSobPrzerwaOd: draft.sobotaPracuje && Number(draft.godzSobPrzerwaMin) > 0 ? draft.godzSobPrzerwaOd : null,
        godzSobPrzerwaMin: draft.sobotaPracuje ? (Number(draft.godzSobPrzerwaMin) || 0) : 0,
      });
      pokazZapisano('Zapisano godziny pracy.');
    } catch (err) {
      setError(err.message);
    }
  }

  const szefKierownik = users.filter(u => u.Role === 'szef' || u.Role === 'kierownik');
  const mechanicy = users.filter(u => u.Role === 'mechanik');
  // Kierownik tez moze miec przydzielone wlasne zlecenia ("Moje zlecenia" /
  // Tablica mechanikow), wiec godziny pracy konfigurujemy dla obu rol.
  const mechanicyIKierownicy = users.filter(u => u.Role === 'mechanik' || u.Role === 'kierownik');

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
        <h2>Reset hasła użytkownika</h2>
        <p className="panel-hint">
          Ustaw nowe hasło dla wybranego konta (np. gdy ktoś zapomni swojego). Hasło musi mieć co
          najmniej 6 znaków. Nowe hasło zostaje od razu zahaszowane i nigdzie nie jest zapisywane
          jawnym tekstem — przekaż je danej osobie bezpośrednio (np. ustnie).
        </p>
        <div className="ustawienia-email-list">
          {users.map(u => (
            <div key={u.Id} className="ustawienia-email-row">
              <span className="ustawienia-email-name">
                {u.FullName} <span className="ustawienia-rola">({u.Role})</span>
              </span>
              <input
                type="text"
                placeholder="nowe hasło (min. 6 znaków)"
                value={hasloDrafts[u.Id] ?? ''}
                onChange={(e) => setHasloDrafts(d => ({ ...d, [u.Id]: e.target.value }))}
              />
              <button className="btn btn-secondary btn-small" onClick={() => handleZapiszHaslo(u.Id)}>
                Ustaw hasło
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

      <section className="panel">
        <h2>Godziny pracy mechaników</h2>
        <p className="panel-hint">
          Pasek upływu czasu na Tablicy mechaników liczy czas trwania roboty wg RZECZYWISTYCH godzin
          pracy danej osoby (a nie zegarowych 24h) — pomijając noce, przerwę obiadową i dni wolne.
          Przerwę możesz ustawić na 0 minut, jeśli danego dnia nie obowiązuje. Sobotę można całkiem
          wyłączyć, jeśli dana osoba w soboty nie pracuje.
        </p>
        <div className="ustawienia-godziny-list">
          {mechanicyIKierownicy.length === 0 && <p>Brak kont z rolą „mechanik” lub „kierownik” w systemie.</p>}
          {mechanicyIKierownicy.map(u => {
            const d = godzinyDrafts[u.Id];
            if (!d) return null;
            return (
              <div key={u.Id} className="ustawienia-godziny-card">
                <div className="ustawienia-godziny-nazwa">{u.FullName} <span className="ustawienia-rola">({u.Role})</span></div>

                <div className="ustawienia-godziny-blok">
                  <div className="ustawienia-godziny-blok-tytul">Poniedziałek–piątek</div>
                  <div className="ustawienia-godziny-rzad">
                    <label>Od <input type="time" value={d.godzTydzOd} onChange={e => handleZmienGodziny(u.Id, 'godzTydzOd', e.target.value)} /></label>
                    <label>Do <input type="time" value={d.godzTydzDo} onChange={e => handleZmienGodziny(u.Id, 'godzTydzDo', e.target.value)} /></label>
                  </div>
                  <div className="ustawienia-godziny-rzad">
                    <label>Przerwa od <input type="time" value={d.godzTydzPrzerwaOd || ''} disabled={Number(d.godzTydzPrzerwaMin) <= 0} onChange={e => handleZmienGodziny(u.Id, 'godzTydzPrzerwaOd', e.target.value)} /></label>
                    <label>Ile minut <input type="number" min="0" step="5" className="ustawienia-godziny-min" value={d.godzTydzPrzerwaMin} onChange={e => handleZmienGodziny(u.Id, 'godzTydzPrzerwaMin', e.target.value)} /></label>
                    <span className="ustawienia-godziny-podpowiedz">0 = brak przerwy w tygodniu</span>
                  </div>
                </div>

                <div className="ustawienia-godziny-blok">
                  <div className="ustawienia-godziny-blok-tytul">
                    <label className="checkbox-option checkbox-option--inline">
                      <input
                        type="checkbox"
                        checked={d.sobotaPracuje}
                        onChange={e => handleZmienGodziny(u.Id, 'sobotaPracuje', e.target.checked)}
                      />
                      Pracuje w soboty
                    </label>
                  </div>
                  {d.sobotaPracuje && (
                    <>
                      <div className="ustawienia-godziny-rzad">
                        <label>Od <input type="time" value={d.godzSobOd} onChange={e => handleZmienGodziny(u.Id, 'godzSobOd', e.target.value)} /></label>
                        <label>Do <input type="time" value={d.godzSobDo} onChange={e => handleZmienGodziny(u.Id, 'godzSobDo', e.target.value)} /></label>
                      </div>
                      <div className="ustawienia-godziny-rzad">
                        <label>Przerwa od <input type="time" value={d.godzSobPrzerwaOd || ''} disabled={Number(d.godzSobPrzerwaMin) <= 0} onChange={e => handleZmienGodziny(u.Id, 'godzSobPrzerwaOd', e.target.value)} /></label>
                        <label>Ile minut <input type="number" min="0" step="5" className="ustawienia-godziny-min" value={d.godzSobPrzerwaMin} onChange={e => handleZmienGodziny(u.Id, 'godzSobPrzerwaMin', e.target.value)} /></label>
                        <span className="ustawienia-godziny-podpowiedz">0 = brak przerwy w sobotę</span>
                      </div>
                    </>
                  )}
                </div>

                <button className="btn btn-secondary btn-small" onClick={() => handleZapiszGodziny(u.Id)}>
                  Zapisz godziny
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
