import React, { useState } from 'react';

export default function CollapsiblePanel({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="panel">
      <button
        type="button"
        className="panel-toggle"
        onClick={() => setOpen((o) => !o)}
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
