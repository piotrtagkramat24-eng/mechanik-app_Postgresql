import React from 'react';

const ROLE_LABELS = {
  superadmin:            'Superadmin',
  szef:                  'Szef',
  kierownik:             'Kierownik',
  mechanik:              'Mechanik',
  pracownik_gospodarczy: 'Pracownik gospodarczy',
  administrator:         'Administrator',
};

const ROLE_ICONS = {
  superadmin:            '⭐',
  szef:                  '👑',
  kierownik:             '📊',
  mechanik:              '🔩',
  pracownik_gospodarczy: '🧹',
  administrator:         '🛠️',
};

export default function Header({ user, onLogout }) {
  return (
    <header className="app-header">
      <div>
        <h1>Warsztat</h1>

      </div>
      <div className="app-header-user">
        <span>{user.FullName}</span>
        <button className="btn btn-secondary" onClick={onLogout}>
          Wyloguj
        </button>
      </div>
    </header>
  );
}
