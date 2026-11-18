import React from 'react';
import Icon from './Icon.jsx';

// Pasek gorny w stylu WikiOps: kwadratowe logo z ikona + nazwa w Space Mono.
export default function Header({ user, onLogout }) {
  const initials = (user.FullName || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="app-brand-logo" aria-hidden="true"><Icon name="wrench" size={17} strokeWidth={2.2} /></span>
        <h1 className="app-brand-name">Warsz<span>tat</span></h1>
      </div>
      <div className="app-header-user">
        <span className="app-header-avatar" aria-hidden="true">{initials}</span>
        <span className="app-header-name">{user.FullName}</span>
        <button className="btn btn-ghost btn-small" onClick={onLogout}>
          <Icon name="logout" size={15} /> Wyloguj
        </button>
      </div>
    </header>
  );
}
