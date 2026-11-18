import React from 'react';
import Icon from './Icon.jsx';
import { formatGodziny } from '../utils/jobTimeUtils.js';

// Widok paska uplywu czasu - wspolny dla calego zlecenia (ElapsedTimeBar.jsx)
// i pojedynczej czynnosci (CzynnoscElapsedBar.jsx), ktore roznily sie tylko
// zrodlem danych (job vs czynnosc+harmonogram) i dwoma drobnymi niuansami
// etykiety, sterowanymi ponizszymi propsami:
//   zakonczona          - czy chodzi o juz zakonczony element (CzynnoscElapsedBar
//                          pokazuje ten sam pasek takze po zakonczeniu, ze slowem
//                          "Trwało" zamiast "W trakcie"; ElapsedTimeBar w ogole
//                          nie renderuje tego paska dla zakonczonych zlecen -
//                          ma dla nich osobny widok "completion-info")
//   szczegolowaEtykieta - czy przy przekroczeniu dopisac "szac. czas" (tak
//                          robi ElapsedTimeBar na calym zleceniu; CzynnoscElapsedBar
//                          celowo uzywa krotszej wersji na pojedynczej czynnosci)
//
// Uklad: nad paskiem wiersz z etykieta stanu (lewo) i czasem / procentem
// (prawo). Kolor paska i etykiety wynika z `status`
// (ok / w-normie / blisko / przekroczono / brak-szacunku).
export default function ElapsedBar({
  status,
  percent,
  elapsedHours,
  estimateHours,
  zakonczona = false,
  szczegolowaEtykieta = false,
  className = '',
}) {
  const przekroczono = status === 'przekroczono';
  const brakSzacunku = status === 'brak-szacunku';
  const trwa = zakonczona ? 'Trwało' : 'W trakcie';

  let lewo;
  let prawo;
  if (brakSzacunku) {
    lewo = zakonczona ? 'Trwało' : 'W trakcie od';
    prawo = formatGodziny(elapsedHours);
  } else if (przekroczono) {
    lewo = <>Przekroczono {szczegolowaEtykieta ? 'szac. czas ' : ''}o {formatGodziny(elapsedHours - estimateHours)}</>;
    prawo = <>{zakonczona ? 'trwało' : 'trwa'} {formatGodziny(elapsedHours)}</>;
  } else {
    lewo = trwa;
    prawo = <>{formatGodziny(elapsedHours)} <span className="elapsed-bar-of">/ {formatGodziny(estimateHours)}</span></>;
  }
  const pokazProcent = percent != null && !brakSzacunku && !przekroczono;
  const szerokosc = percent != null ? Math.max(percent, 3) : 12;

  return (
    <div
      className={`elapsed-bar elapsed-bar--${status}${zakonczona ? ' elapsed-bar--done' : ''}${className ? ' ' + className : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent != null ? Math.round(percent) : undefined}
    >
      <div className="elapsed-bar-label">
        <span className="elapsed-bar-state">
          {przekroczono && <Icon name="alert" size={12} strokeWidth={2.4} />}
          {lewo}
        </span>
        <span className="elapsed-bar-time">
          {prawo}
          {pokazProcent && <span className="elapsed-bar-pct">{Math.round(percent)}%</span>}
        </span>
      </div>
      <div className="elapsed-bar-track">
        <div className="elapsed-bar-fill" style={{ width: `${szerokosc}%` }} />
      </div>
    </div>
  );
}
