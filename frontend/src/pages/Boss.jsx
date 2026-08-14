import React from 'react';
import Manager from './Manager.jsx';

// Szef widzi: Warsztat, Do przydzielenia, Tablica mechaników, Dodaj robotę,
// Pracownik gospodarczy. BEZ Ustawień (od v15 Ustawienia sa tylko dla superadmina).
// Korzysta z tego samego komponentu co kierownik (Manager.jsx), zeby uniknac
// duplikowania logiki przydzielania/tablicy mechanikow — rozni je tylko to,
// ktore zakladki sa widoczne.
export default function Boss({ user }) {
  return (
    <Manager
      user={user}
      showWarsztat={true}
      showDodaj={true}
      showGospodarczy={true}
      showUstawienia={false}
      showMojeZlecenia={false}
      showRaporty={true}
    />
  );
}
