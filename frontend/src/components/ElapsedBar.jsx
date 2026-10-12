import React from 'react';
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
export default function ElapsedBar({
  status,
  percent,
  elapsedHours,
  estimateHours,
  zakonczona = false,
  szczegolowaEtykieta = false,
  className = '',
}) {
  return (
    <div className={`elapsed-bar elapsed-bar--${status}${className ? ' ' + className : ''}`}>
      <div className="elapsed-bar-track">
        <div className="elapsed-bar-fill" style={{ width: `${percent != null ? percent : 12}%` }} />
      </div>
      <div className="elapsed-bar-label">
        {status === 'brak-szacunku' ? (
          <>{zakonczona ? 'Trwało' : 'W trakcie od'} {formatGodziny(elapsedHours)}</>
        ) : status === 'przekroczono' ? (
          <>Przekroczono {szczegolowaEtykieta ? 'szac. czas ' : ''}o {formatGodziny(elapsedHours - estimateHours)} ({zakonczona ? 'trwało' : 'trwa'} {formatGodziny(elapsedHours)})</>
        ) : (
          <>{zakonczona ? 'Trwało' : 'W trakcie'}: {formatGodziny(elapsedHours)} / szac. {formatGodziny(estimateHours)}</>
        )}
      </div>
    </div>
  );
}
