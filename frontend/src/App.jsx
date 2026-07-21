import React, { useState } from 'react';
import Login from './pages/Login.jsx';
import Boss from './pages/Boss.jsx';
import Manager from './pages/Manager.jsx';
import Mechanic from './pages/Mechanic.jsx';
import Gospodarczy from './pages/Gospodarczy.jsx';
import AdminGospodarczy from './pages/AdminGospodarczy.jsx';
import SuperAdmin from './pages/SuperAdmin.jsx';
import Header from './components/Header.jsx';

const STORAGE_KEY = 'warsztat_user';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  function handleLogin(loggedUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
    setUser(loggedUser);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <Header user={user} onLogout={handleLogout} />
      {user.Role === 'superadmin' && <SuperAdmin user={user} />}
      {user.Role === 'szef' && <Boss user={user} />}
      {user.Role === 'kierownik' && (
        <Manager
          user={user}
          showWarsztat={false}
          showDodaj={false}
          showGospodarczy={true}
          showUstawienia={false}
          showMojeZlecenia={true}
        />
      )}
      {user.Role === 'mechanik' && <Mechanic user={user} />}
      {user.Role === 'pracownik_gospodarczy' && <Gospodarczy user={user} />}
      {user.Role === 'administrator' && <AdminGospodarczy user={user} />}
    </>
  );
}
