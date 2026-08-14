import { useState, useRef, useEffect, useId } from 'react';

/**
 * Wyszukiwalna lista rozwijana.
 * options: [{ value, label, sublabel? }]
 * value: aktualnie wybrany `value` (lub '')
 * onChange: (value) => void
 *
 * Dostepnosc:
 * - kontrolka ma role="combobox" i jest fokusowalna (tabIndex)
 * - etykiete podpinamy przez `labelId` (id elementu <label>/<span> z tekstem)
 *   zamiast fizycznego zagniezdzania w <label>, bo <div> nie jest
 *   elementem "labelable" wg specyfikacji HTML - dlatego pojawial sie
 *   blad "No label associated with a form field".
 * - obsluga klawiatury: Enter/Spacja/Strzalka w dol otwiera, Escape zamyka,
 *   strzalki gora/dol poruszaja sie po liscie, Enter wybiera.
 */
export default function SearchableSelect({
  id,
  labelId,
  options,
  value,
  onChange,
  placeholder = 'Szukaj...',
  emptyText = 'Brak wyników',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const controlRef = useRef(null);
  const inputRef = useRef(null);
  const autoId = useId();
  const controlId = id || `searchable-select-${autoId}`;
  const listboxId = `${controlId}-listbox`;

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => {
        const haystack = `${o.label} ${o.sublabel || ''}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
    : options;

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(-1);
  }

  function closeDropdown({ refocusControl = false } = {}) {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    if (refocusControl) {
      // po wyborze/zamknieciu wracamy fokusem na kontrolke, zeby nie zgubic uzytkownika klawiatury
      requestAnimationFrame(() => controlRef.current?.focus());
    }
  }

  function handleControlKeyDown(e) {
    if (disabled) return;
    if (!open && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      openDropdown();
    } else if (open && e.key === 'Escape') {
      e.preventDefault();
      closeDropdown({ refocusControl: true });
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown({ refocusControl: true });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const choice = filtered[activeIndex] ?? (filtered.length === 1 ? filtered[0] : null);
      if (choice) {
        onChange(choice.value);
        closeDropdown({ refocusControl: true });
      }
    }
  }

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <div
        id={controlId}
        ref={controlRef}
        className={`searchable-select-control${disabled ? ' disabled' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleControlKeyDown}
      >
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            type="text"
            id={`${controlId}-search`}
            name={`${controlId}-search`}
            className="searchable-select-input"
            placeholder={placeholder}
            aria-labelledby={labelId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleInputKeyDown}
          />
        ) : (
          <span className={selected ? '' : 'searchable-select-placeholder'}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        <span className="searchable-select-arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="searchable-select-dropdown" role="listbox" id={listboxId} aria-labelledby={labelId}>
          {filtered.length === 0 && (
            <div className="searchable-select-empty">{emptyText}</div>
          )}
          {filtered.map((o, idx) => (
            <div
              key={o.value}
              role="option"
              aria-selected={String(o.value) === String(value)}
              className={`searchable-select-option${String(o.value) === String(value) ? ' selected' : ''}${idx === activeIndex ? ' active' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                onChange(o.value);
                closeDropdown({ refocusControl: true });
              }}
            >
              <div>{o.label}</div>
              {o.sublabel && <div className="searchable-select-sublabel">{o.sublabel}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
