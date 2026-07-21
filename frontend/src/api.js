const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getUsers: (role) => request('/users' + (role ? `?role=${role}` : '')),
  getCars: () => request('/cars'),
  postCar: (data) => request('/cars', { method: 'POST', body: JSON.stringify(data) }),
  createCar: (marka, model, rejestracja, typPojazdu, kategoria) =>
    request('/cars', { method: 'POST', body: JSON.stringify({ marka, model, rejestracja, typPojazdu, kategoria }) }),

  getPredefiniowanePrace: () => request('/predefiniowane-prace'),

  getJobs: () => request('/jobs'),
  getJobsMechanik: (id) => request(`/jobs/mechanik/${id}`),
  getJobsForMechanik: (id) => request(`/jobs/mechanik/${id}`),
  postJob: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  // czynnosci: [{ predefiniowanaPracaId?, nazwa, czasMin?, czasSredni?, czasMax? }, ...]
  createJob: (carId, userId, czynnosci) =>
    request('/jobs', { method: 'POST', body: JSON.stringify({ carId, userId, czynnosci }) }),
  addJobCzynnosc: (jobId, data) =>
    request(`/jobs/${jobId}/czynnosci`, { method: 'POST', body: JSON.stringify(data) }),
  removeJobCzynnosc: (jobId, czynnoscId) =>
    request(`/jobs/${jobId}/czynnosci/${czynnoscId}`, { method: 'DELETE' }),
  setCzynnoscStatus: (jobId, czynnoscId, status, opisWykonania, zdjecie) =>
    request(`/jobs/${jobId}/czynnosci/${czynnoscId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, opisWykonania, zdjecie }),
    }),
  assignJob: (id, mechanikId) =>
    request(`/jobs/${id}/assign`, { method: 'PUT', body: JSON.stringify({ mechanikId }) }),
  assignMechanik: (id, mechanikId) =>
    request(`/jobs/${id}/assign`, { method: 'PUT', body: JSON.stringify({ mechanikId }) }),
  changeJobStatus: (id, status, opisWykonania, zdjecie) =>
    request(`/jobs/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, opisWykonania, zdjecie }) }),
  setStatus: (id, status, opisWykonania, zdjecie) =>
    request(`/jobs/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, opisWykonania, zdjecie }) }),
  changeJobPriority: (id, direction) =>
    request(`/jobs/${id}/priority`, { method: 'PUT', body: JSON.stringify({ direction }) }),
  setPriority: (id, direction) =>
    request(`/jobs/${id}/priority`, { method: 'PUT', body: JSON.stringify({ direction }) }),
  updateJob: (id, data) => request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  getJobZdjecie: (id) => request(`/jobs/${id}/zdjecie`),

  // Zadania po naprawie (Wyposazenie / Inspecto / Mycie) — przydzielane
  // automatycznie przez algorytm (patrz backend/routes/followup.js)
  getMojeZadaniaPoNaprawie: (userId) => request(`/followup/moje/${userId}`),
  wykonajZadaniePoNaprawie: (id) => request(`/followup/${id}/wykonaj`, { method: 'PUT' }),
  getPodsumowanieZadanPoNaprawie: () => request('/followup/podsumowanie'),
  getWszystkieZadaniaPoNaprawie: () => request('/followup/wszystkie'),
  // Status (wykonano/nie) WSZYSTKICH zadan po naprawie, dla wszystkich zlecen -
  // w odroznieniu od getWszystkieZadaniaPoNaprawie, ktore zwraca tylko
  // niewykonane. Uzywane do pokazania na karcie zakonczonego zlecenia, czy
  // Wyposazenie+Inspecto / Mycie zostaly juz wykonane przez mechanika.
  getStatusZadanPoNaprawie: () => request('/followup/status-zlecenia'),
  setDodatkowePraceMechanika: (userId, wartosc) =>
    request(`/users/${userId}/dodatkowe-prace`, { method: 'PUT', body: JSON.stringify({ wartosc }) }),
  getPowiadomieniaOdbiorcy: () => request('/followup/powiadomienia'),
  setPowiadomieniaOdbiorcy: (userIds) =>
    request('/followup/powiadomienia', { method: 'PUT', body: JSON.stringify({ userIds }) }),
  setUserEmail: (id, email) =>
    request(`/users/${id}/email`, { method: 'PUT', body: JSON.stringify({ email }) }),
  setGodzinyPracyMechanika: (id, dane) =>
    request(`/users/${id}/godziny-pracy`, { method: 'PUT', body: JSON.stringify(dane) }),

  // Gospodarcze
  getGospodarczeZadania: () => request('/gospodarcze'),
  getGospodarczeZadaniaPracownika: (id) => request(`/gospodarcze/pracownik/${id}`),
  createGospodarczeZadanie: (data) =>
    request('/gospodarcze', { method: 'POST', body: JSON.stringify(data) }),
  updateGospodarczeZadanie: (id, data) =>
    request(`/gospodarcze/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGospodarczeZadanie: (id) => request(`/gospodarcze/${id}`, { method: 'DELETE' }),
  getRejestracjeDzisiaj: (zadanieId) => request(`/gospodarcze/${zadanieId}/rejestracje-dzisiaj`),
  setRejestracjeDzisiaj: (zadanieId, rejestracje) =>
    request(`/gospodarcze/${zadanieId}/rejestracje-dzisiaj`, { method: 'PUT', body: JSON.stringify({ rejestracje }) }),
  wykonajGospodarczeZadanie: (id, dataWykonania, userId, rejestracjeWykonanie) =>
    request(`/gospodarcze/${id}/wykonaj`, {
      method: 'PUT',
      body: JSON.stringify({ dataWykonania, userId, rejestracjeWykonanie }),
    }),
  getGospodarczeHistoria: (id) => request(`/gospodarcze/${id}/historia`),
  changeGospodarczeKolejnosc: (id, direction) =>
    request(`/gospodarcze/${id}/kolejnosc`, { method: 'PUT', body: JSON.stringify({ direction }) }),
  // Raporty (szef / superadmin)
  getRaportMechanicy: (from, to, mechanikId) =>
    request(`/reports/mechanicy?from=${from}&to=${to}${mechanikId ? `&mechanikId=${mechanikId}` : ''}`),
  getRaportGospodarczy: (from, to, pracownikId) =>
    request(`/reports/gospodarczy?from=${from}&to=${to}${pracownikId ? `&pracownikId=${pracownikId}` : ''}`),
};
