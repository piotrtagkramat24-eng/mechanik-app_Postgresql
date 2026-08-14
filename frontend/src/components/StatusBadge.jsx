import React from 'react';

const STATUS_LABELS = {
  nowe: 'Nowa',
  przydzielone: 'Przydzielona',
  rozpoczete: 'W trakcie',
  zakonczone: 'Zakończona',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
