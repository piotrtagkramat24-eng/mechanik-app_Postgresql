import React from 'react';

const CLASS_BY_PRIORYTET = {
  Wysoki: 'priority-wysoki',
  Średni: 'priority-sredni',
  Niski: 'priority-niski',
};

export default function PriorityBadge({ priorytet }) {
  return (
    <span className={`priority-badge ${CLASS_BY_PRIORYTET[priorytet] || 'priority-sredni'}`}>
      {priorytet}
    </span>
  );
}
