import React, { useState } from 'react';

// onOpen (opcjonalny) - wywolywane dokladnie raz, przy PIERWSZYM rozwinieciu
// panelu (przejsciu zamkniety -> otwarty) - uzywane np. do doladowania
// danych "na zadanie" zamiast trzymania ich caly czas w pamieci/pollingu
// (patrz sekcja "Zakonczone" w Mechanic.jsx).
export default function CollapsiblePanel({ title, count, defaultOpen = true, onOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);

  function handleToggle() {
    setOpen((o) => {
      const nowy = !o;
      if (nowy && onOpen) onOpen();
      return nowy;
    });
  }

  return (
    <section className="panel">
      <button
        type="button"
        className="panel-toggle"
        onClick={handleToggle}
        aria-expanded={open}
      >
        <span>
          {title} ({count})
        </span>
        <span className="panel-toggle-icon">{open ? '▾' : '▸'}</span>
      </button>

      {open && <div className="job-list">{children}</div>}
    </section>
  );
}
