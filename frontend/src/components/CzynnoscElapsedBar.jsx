import React, { useEffect, useState } from 'react';
import { getCzynnoscElapsedInfo, DOMYSLNY_HARMONOGRAM } from '../utils/jobTimeUtils.js';
import ElapsedBar from './ElapsedBar.jsx';

// Pasek postepu DLA POJEDYNCZEJ CZYNNOSCI (kazda ma wlasny, niezalezny od
// pozostalych na tym samym zleceniu). Widoczny tylko gdy czynnosc jest
// rozpoczeta lub zakonczona (ma DataRozpoczecia).
// `harmonogram` - godziny pracy mechanika przypisanego do zlecenia (patrz
// harmonogramZJoba w jobTimeUtils.js), zeby pasek liczyl czas ROBOCZY a nie
// zegarowy. Rodzic (JobCzynnosciList) przekazuje je wyliczone z Job.
export default function CzynnoscElapsedBar({ czynnosc, harmonogram = DOMYSLNY_HARMONOGRAM }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!czynnosc.DataRozpoczecia) return null;

  const info = getCzynnoscElapsedInfo(czynnosc, now, harmonogram);
  if (!info) return null;

  const { elapsedHours, estimateHours, percent, status } = info;
  const zakonczona = czynnosc.Status === 'zakonczone';

  return (
    <ElapsedBar
      status={status}
      percent={percent}
      elapsedHours={elapsedHours}
      estimateHours={estimateHours}
      zakonczona={zakonczona}
      className="job-czynnosci-item-bar"
    />
  );
}
