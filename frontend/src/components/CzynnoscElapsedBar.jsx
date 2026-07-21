import React, { useEffect, useState } from 'react';
import { getCzynnoscElapsedInfo, formatGodziny } from '../utils/jobTimeUtils.js';

// Pasek postepu DLA POJEDYNCZEJ CZYNNOSCI (kazda ma wlasny, niezalezny od
// pozostalych na tym samym zleceniu). Widoczny tylko gdy czynnosc jest
// rozpoczeta lub zakonczona (ma DataRozpoczecia).
export default function CzynnoscElapsedBar({ czynnosc }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!czynnosc.DataRozpoczecia) return null;

  const info = getCzynnoscElapsedInfo(czynnosc, now);
  if (!info) return null;

  const { elapsedHours, estimateHours, percent, status } = info;
  const zakonczona = czynnosc.Status === 'zakonczone';

  return (
    <div className={`elapsed-bar elapsed-bar--${status} job-czynnosci-item-bar`}>
      <div className="elapsed-bar-track">
        <div className="elapsed-bar-fill" style={{ width: `${percent != null ? percent : 12}%` }} />
      </div>
      <div className="elapsed-bar-label">
        {status === 'brak-szacunku' ? (
          <>{zakonczona ? 'Trwało' : 'W trakcie od'} {formatGodziny(elapsedHours)}</>
        ) : status === 'przekroczono' ? (
          <>Przekroczono o {formatGodziny(elapsedHours - estimateHours)} ({zakonczona ? 'trwało' : 'trwa'} {formatGodziny(elapsedHours)})</>
        ) : (
          <>{zakonczona ? 'Trwało' : 'W trakcie'}: {formatGodziny(elapsedHours)} / szac. {formatGodziny(estimateHours)}</>
        )}
      </div>
    </div>
  );
}
