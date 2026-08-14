import React from 'react';

const CLASS_BY_PRIORYTET = {
  Wysoki: 'priority-high',
  Średni: 'priority-medium',
  Niski: 'priority-low',
};

export default function PriorityBadge({ priorytet }) {
  return (
    <span className={`priority-badge ${CLASS_BY_PRIORYTET[priorytet] || 'priority-medium'}`}>
      {priorytet}
    </span>
  );
}
