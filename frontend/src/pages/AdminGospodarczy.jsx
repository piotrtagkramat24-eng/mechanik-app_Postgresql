import React from 'react';
import GospodarczyModule from '../components/GospodarczyModule.jsx';

// Konto administratora ma dostep wylacznie do modulu "Pracownik gospodarczy"
// (te same uprawnienia co szef/kierownik w tym module: dodawanie zadan,
// numery rejestracyjne, kolejnosc, kalendarz), bez dostepu do warsztatu.
export default function AdminGospodarczy({ user }) {
  return (
    <div className="admin-gosp-wrap">
      <GospodarczyModule user={user} />
    </div>
  );
}
