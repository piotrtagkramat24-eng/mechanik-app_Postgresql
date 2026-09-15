import React from 'react';

export default function Header({ user, onLogout }) {
  return (
    <header className="app-header">
      <h1>Warsztat</h1>
      <div className="app-header-user">
        <span>{user.FullName}</span>
        <button className="btn btn-secondary" onClick={onLogout}>
          Wyloguj
        </button>
      </div>
    </header>
  );
}
