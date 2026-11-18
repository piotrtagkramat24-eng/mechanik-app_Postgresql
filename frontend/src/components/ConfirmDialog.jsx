import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import Icon from './Icon.jsx';

// Wlasne okno potwierdzenia w stylu aplikacji - zamiast natywnego
// window.confirm() z przegladarki. Uzycie (zwraca Promise<boolean>):
//
//   if (!(await confirmDialog({ title: 'Usunąć?', message: '...', danger: true }))) return;
//
function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger, onClose }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}>
      <div className="modal-box confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-body">
          <span className={`confirm-icon ${danger ? 'confirm-icon--danger' : ''}`} aria-hidden="true">
            <Icon name={danger ? 'trash' : 'alert'} size={20} />
          </span>
          <div className="confirm-text">
            <h3 id="confirm-title" className="confirm-title">{title}</h3>
            {message && <p id="confirm-message" className="confirm-message">{message}</p>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(false)}>{cancelLabel}</button>
          <button
            type="button"
            ref={confirmRef}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog({
  title = 'Czy na pewno?',
  message = '',
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Anuluj',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const previouslyFocused = document.activeElement;
    const close = (result) => {
      root.unmount();
      host.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
      resolve(result);
    };
    root.render(
      <ConfirmDialog
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        danger={danger}
        onClose={close}
      />
    );
  });
}
