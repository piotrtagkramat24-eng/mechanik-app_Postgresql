import React from 'react';
import Manager from './Manager.jsx';

// Superadmin ma dostep do WSZYSTKICH zakladek — Warsztat, Do przydzielenia,
// Tablica mechanikow, Moje zlecenia, Dodaj robote, Pracownik gospodarczy
// i Ustawienia (od v15 Ustawienia sa dostepne WYLACZNIE dla tej roli).
export default function SuperAdmin({ user }) {
  return (
    <Manager
      user={user}
      showWarsztat={true}
      showDodaj={true}
      showGospodarczy={true}
      showUstawienia={true}
      showMojeZlecenia={true}
      showRaporty={true}
    />
  );
}
