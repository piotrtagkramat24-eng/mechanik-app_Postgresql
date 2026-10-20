// Odpowiednik setInterval(callback, intervalMs), ale z dwoma dodatkami,
// zeby pollowanie w tle (karta przegladarki otwarta, ale nikt na nia nie
// patrzy) nie generowalo ruchu bez zadnego pozytku:
//   - gdy karta jest w tle (document.hidden) - wywolanie callbacku na danym
//     "tyknieciu" interwalu jest POMIJANE (zero zapytania do API)
//   - gdy user wraca na karte po tym, jak byla w tle - odswiezamy OD RAZU,
//     zamiast czekac do konca biezacego (potencjalnie dlugiego, np. 5-
//     minutowego) interwalu, zeby dane nie byly widocznie nieaktualne
//     zaraz po przelaczeniu z powrotem
//
// Uzycie (zastepuje bezposrednie wywolanie setInterval):
//   useEffect(() => {
//     refresh();
//     return startPollingWhenVisible(refresh, POLL_INTERVAL_MS);
//   }, [refresh]);
export function startPollingWhenVisible(callback, intervalMs) {
  const interval = setInterval(() => {
    if (!document.hidden) callback();
  }, intervalMs);

  function onVisibilityChange() {
    if (!document.hidden) callback();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
