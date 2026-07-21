export const OKRESY = [
  { key: 'dzis', label: 'Dzis' },
  { key: '7', label: '7 dni' },
  { key: '30', label: '30 dni' },
  { key: 'wszystkie', label: 'Wszystkie' },
];

// Filtruje liste zadan wg wybranego okresu, na podstawie pola DniDoTerminu.
// Zadania bez terminu (DniDoTerminu === null) traktowane sa jako "bez okresu"
// i pokazywane tylko w widoku "Wszystkie".
export function filterByPeriod(tasks, okres) {
  if (okres === 'wszystkie') return tasks;

  return tasks.filter((t) => {
    if (t.DniDoTerminu === null || t.DniDoTerminu === undefined) return false;
    if (okres === 'dzis') return t.DniDoTerminu <= 0;
    if (okres === '7') return t.DniDoTerminu <= 7;
    if (okres === '30') return t.DniDoTerminu <= 30;
    return true;
  });
}
