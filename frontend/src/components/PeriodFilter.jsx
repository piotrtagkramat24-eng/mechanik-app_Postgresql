import React from 'react';
import { OKRESY } from '../utils/gospodarczeUtils.js';

export default function PeriodFilter({ value, onChange }) {
  return (
    <div className="period-filter">
      {OKRESY.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`period-filter-btn ${value === o.key ? 'period-filter-btn--active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
