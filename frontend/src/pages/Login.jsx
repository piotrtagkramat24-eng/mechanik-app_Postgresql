import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

// Klucz w localStorage pod ktorym trzymane sa zapamietane dane logowania.
// Uwaga: haslo jest zapisywane w postaci zakodowanej base64 (nie jest to
// szyfrowanie) - to zwykle "zapamietaj mnie" znane z przegladarek, wygodne
// dla uzytkownika, ale nie do konca bezpieczne, gdyby ktos mial dostep do
// tego samego urzadzenia/przegladarki.
const REMEMBER_KEY = 'warsztat_remember';

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      username: data.username || '',
      password: data.password ? atob(data.password) : '',
    };
  } catch {
    return null;
  }
}

function saveRemembered(username, password) {
  localStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({ username, password: btoa(password) })
  );
}

function clearRemembered() {
  localStorage.removeItem(REMEMBER_KEY);
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Przy wejsciu na strone wczytujemy zapamietane dane logowania, jesli byly
  // wczesniej zapisane.
  useEffect(() => {
    const remembered = loadRemembered();
    if (remembered) {
      setUsername(remembered.username);
      setPassword(remembered.password);
      setRememberPassword(true);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.login(username, password);
      if (rememberPassword) {
        saveRemembered(username, password);
      } else {
        clearRemembered();
      }
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="login-logo">🔧</div>
        <h1>Warsztat</h1>
        <p className="login-subtitle">Panel zarządzania — zaloguj się</p>

        <label>
          Login
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="nazwa użytkownika"
            autoFocus
          />
        </label>

        <label>
          Hasło
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        <label className="login-remember">
          <input
            type="checkbox"
            checked={rememberPassword}
            onChange={(e) => setRememberPassword(e.target.checked)}
          />
          Zapamiętaj hasło
        </label>

        {error && <div className="error-message">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Logowanie...' : 'Zaloguj się →'}
        </button>
      </form>
    </div>
  );
}
