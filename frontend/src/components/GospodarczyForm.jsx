import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import SearchableSelect from './SearchableSelect.jsx';

const PRIORYTETY = ['Wysoki', 'Średni', 'Niski'];

function parseRejestracjeJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.map((r) => r.Rejestracja) : [];
  } catch {
    return [];
  }
}

// editingTask: gdy podane (obiekt zadania z listy), formularz przechodzi w tryb
// edycji istniejacego zadania zamiast dodawania nowego. Typ (cykliczne/jednorazowe)
// nie jest edytowalny — zmiana typu wplywa na logike terminow, wiec pozostaje staly.
export default function GospodarczyForm({ user, pracownicy, cars = [], onCreated, editingTask = null, onCancelEdit }) {
  const isEdit = !!editingTask;

  const [zadanie, setZadanie] = useState('');
  const [lokalizacja, setLokalizacja] = useState('');
  const [typ, setTyp] = useState('cykliczne');
  const [coIleDni, setCoIleDni] = useState('');
  const [priorytet, setPriorytet] = useState('Średni');
  const [pracownikId, setPracownikId] = useState('');
  const [termin, setTermin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Numery rejestracyjne przypisane do zadania (opcjonalnie).
  // Gdy zaznaczone, pracownik gospodarczy bedzie musial przy zakonczeniu
  // zadania oznaczyc Wykonano / Nie wykonano osobno dla kazdego numeru.
  const [dodajRejestracje, setDodajRejestracje] = useState(false);
  const [rejestracjaInput, setRejestracjaInput] = useState('');
  const [rejestracje, setRejestracje] = useState([]);
  const [carPickId, setCarPickId] = useState('');

  // Wypelnij formularz danymi edytowanego zadania
  useEffect(() => {
    if (!editingTask) return;
    setZadanie(editingTask.Zadanie || '');
    setLokalizacja(editingTask.Lokalizacja || '');
    setTyp(editingTask.Typ || 'cykliczne');
    setCoIleDni(editingTask.CoIleDni != null ? String(editingTask.CoIleDni) : '');
    setPriorytet(PRIORYTETY.includes(editingTask.Priorytet) ? editingTask.Priorytet : 'Średni');
    setPracownikId(editingTask.PracownikId != null ? String(editingTask.PracownikId) : '');
    setTermin(
      editingTask.Typ === 'jednorazowe' && editingTask.NastepnyTermin
        ? String(editingTask.NastepnyTermin).slice(0, 10)
        : ''
    );
    const rejLista = parseRejestracjeJson(editingTask.RejestracjeJson);
    setDodajRejestracje(rejLista.length > 0);
    setRejestracje(rejLista);
    setRejestracjaInput('');
    setError('');
    setSuccess('');
  }, [editingTask]);

  function handleAddRejestracja(e) {
    e.preventDefault();
    const val = rejestracjaInput.trim().toUpperCase();
    if (!val) return;
    if (rejestracje.includes(val)) { setRejestracjaInput(''); return; }
    setRejestracje((prev) => [...prev, val]);
    setRejestracjaInput('');
  }

  // Wybor auta juz istniejacego w bazie (Cars) - zamiast wpisywania numeru z palca
  function handlePickCar(carId) {
    setCarPickId(carId);
    const car = cars.find((c) => String(c.Id) === String(carId));
    if (!car) return;
    const val = car.Rejestracja.trim().toUpperCase();
    if (!rejestracje.includes(val)) {
      setRejestracje((prev) => [...prev, val]);
    }
    setCarPickId('');
  }

  const carOptions = cars.map((c) => ({
    value: c.Id,
    label: `${c.Marka} ${c.Model} (${c.Rejestracja})${c.TypPojazdu === 'naczepa' ? ' — naczepa' : ''}`,
    sublabel: c.TypPojazdu === 'naczepa' && c.Kategoria ? c.Kategoria : '',
  }));

  function handleRemoveRejestracja(val) {
    setRejestracje((prev) => prev.filter((r) => r !== val));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!zadanie.trim()) { setError('Podaj nazwę zadania.'); return; }
    if (!pracownikId) { setError('Wybierz pracownika gospodarczego.'); return; }
    if (typ === 'cykliczne' && (!coIleDni || Number(coIleDni) <= 0)) {
      setError('Podaj liczbę dni - co ile dni zadanie ma się powtarzać.');
      return;
    }
    if (dodajRejestracje && rejestracje.length === 0) {
      setError('Dodaj przynajmniej jeden numer rejestracyjny lub odznacz tę opcję.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.updateGospodarczeZadanie(editingTask.Id, {
          zadanie: zadanie.trim(),
          lokalizacja: lokalizacja.trim() || null,
          coIleDni: typ === 'cykliczne' ? Number(coIleDni) : null,
          priorytet,
          pracownikId: Number(pracownikId),
          termin: typ === 'jednorazowe' ? (termin || null) : undefined,
          rejestracje: dodajRejestracje ? rejestracje : [],
        });
        setSuccess('Zmiany zostały zapisane.');
        if (onCreated) await onCreated();
        return;
      }

      await api.createGospodarczeZadanie({
        zadanie: zadanie.trim(),
        lokalizacja: lokalizacja.trim() || null,
        typ,
        coIleDni: typ === 'cykliczne' ? Number(coIleDni) : null,
        priorytet,
        pracownikId: Number(pracownikId),
        userId: user.Id,
        termin: typ === 'jednorazowe' && termin ? termin : null,
        rejestracje: dodajRejestracje ? rejestracje : [],
      });

      setZadanie('');
      setLokalizacja('');
      setCoIleDni('');
      setTermin('');
      setDodajRejestracje(false);
      setRejestracje([]);
      setRejestracjaInput('');
      setSuccess('Zadanie zostało dodane i pojawi się w kalendarzu pracownika od razu.');
      if (onCreated) await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h2>{isEdit ? 'Edycja zadania gospodarczego' : 'Nowe zadanie gospodarcze'}</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Zadanie
          <input
            value={zadanie}
            onChange={(e) => setZadanie(e.target.value)}
            placeholder="np. Skoszenie trawy pod biurem"
            required
          />
        </label>

        <label>
          Lokalizacja / zakres
          <input
            value={lokalizacja}
            onChange={(e) => setLokalizacja(e.target.value)}
            placeholder="np. Pultuska - teren pod biurem"
          />
        </label>

        <label>
          Pracownik gospodarczy
          <select value={pracownikId} onChange={(e) => setPracownikId(e.target.value)} required>
            <option value="">-- wybierz --</option>
            {pracownicy.map((p) => (
              <option key={p.Id} value={p.Id}>{p.FullName}</option>
            ))}
          </select>
          {pracownicy.length === 0 && (
            <span className="form-hint">
              Brak kont z rola "pracownik_gospodarczy" w systemie.
            </span>
          )}
        </label>

        <label>
          Priorytet
          <select value={priorytet} onChange={(e) => setPriorytet(e.target.value)}>
            {PRIORYTETY.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        {!isEdit && (
          <fieldset className="radio-fieldset">
            <span className="radio-fieldset-label">Rodzaj zadania</span>
            <div className="radio-row">
              <label className="radio-option">
                <input type="radio" name="typ" value="cykliczne"
                  checked={typ === 'cykliczne'} onChange={() => setTyp('cykliczne')} />
                Cykliczne (powtarzajace sie)
              </label>
              <label className="radio-option">
                <input type="radio" name="typ" value="jednorazowe"
                  checked={typ === 'jednorazowe'} onChange={() => setTyp('jednorazowe')} />
                Jednorazowe
              </label>
            </div>
          </fieldset>
        )}

        {isEdit && (
          <div className="form-hint">
            Rodzaj zadania: <strong>{typ === 'cykliczne' ? 'Cykliczne (powtarzające się)' : 'Jednorazowe'}</strong>
            {' '}(nie do zmiany po utworzeniu)
          </div>
        )}

        {typ === 'cykliczne' && (
          <label>
            Co ile dni sie powtarza
            <input
              type="number" min="1" value={coIleDni}
              onChange={(e) => setCoIleDni(e.target.value)}
              placeholder="np. 7, 14, 30, 60"
              required
            />
          </label>
        )}

        {typ === 'jednorazowe' && (
          <label>
            Termin wykonania (opcjonalnie)
            <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)} />
          </label>
        )}

        <label className="checkbox-option">
          <input
            type="checkbox"
            checked={dodajRejestracje}
            onChange={(e) => setDodajRejestracje(e.target.checked)}
          />
          Dodaj numery rejestracyjne
        </label>

        {dodajRejestracje && (
          <div className="rejestracje-box">
            <span className="form-hint">
              Pracownik gospodarczy bedzie musial przy zakonczeniu zadania oznaczyc
              Wykonano / Nie wykonano osobno dla kazdego numeru ponizej.
            </span>

            <div className="rejestracje-search-label">
              <label id="rejestracje-search-label-text">Wyszukaj pojazd z bazy</label>
              <SearchableSelect
                id="rejestracje-search-select"
                labelId="rejestracje-search-label-text"
                options={carOptions}
                value={carPickId}
                onChange={handlePickCar}
                placeholder="Szukaj po marce, modelu lub rejestracji..."
                emptyText={cars.length === 0 ? 'Brak pojazdów w bazie' : 'Brak pasujących pojazdów'}
              />
            </div>

            <div className="rejestracje-input-row">
              <input
                value={rejestracjaInput}
                onChange={(e) => setRejestracjaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRejestracja(e); }}
                placeholder="lub wpisz numer recznie, np. WWY12345"
                aria-label="Wpisz numer rejestracyjny ręcznie"
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddRejestracja}>
                Dodaj
              </button>
            </div>
            {rejestracje.length > 0 && (
              <div className="chip-list">
                {rejestracje.map((r) => (
                  <span key={r} className="chip">
                    {r}
                    <button
                      type="button"
                      className="chip-remove"
                      onClick={() => handleRemoveRejestracja(r)}
                      aria-label={`Usun ${r}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="form-actions-row">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Zapisywanie...' : (isEdit ? 'Zapisz zmiany' : 'Utwórz zadanie')}
          </button>
          {isEdit && onCancelEdit && (
            <button type="button" className="btn btn-secondary" onClick={onCancelEdit} disabled={saving}>
              Anuluj
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
