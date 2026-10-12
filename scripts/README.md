# Backup bazy danych — co to jest i co zrobić, gdy baza padnie

Ten folder zawiera skrypty, które **codziennie w nocy automatycznie zapisują
kopię całej bazy danych** aplikacji Warsztat na ten komputer. Jeśli baza na
Aiven (obecny hosting) kiedykolwiek przestanie działać albo zniknie, dzięki
tym kopiom da się odtworzyć wszystkie dane na innym serwerze PostgreSQL.

Ten dokument jest napisany tak, żeby ktoś, kto nigdy wcześniej tego nie
widział, mógł wykonać odtworzenie bazy krok po kroku — np. gdy osoba, która
to skonfigurowała, jest akurat na urlopie.

---

## Gdzie są kopie zapasowe

```
C:\Backups\mechanik-app-db\
```

- Jeden plik dziennie, nazwa np. `mechanik-db_2026-10-12_03-00.zip`.
- Każdy plik to **kompletna, samodzielna kopia całej bazy** z danego dnia —
  nie trzeba kilku plików naraz, wystarczy jeden (najświeższy) plik.
- Stare kopie (starsze niż 30 dni) są same usuwane, żeby nie zapychać dysku.
- Plik `backup.log` w tym samym folderze pokazuje historię — czy backupy się
  udają, czy nie.

## Jak sprawdzić, czy automatyczny backup działa

1. Otwórz PowerShell.
2. Wpisz:
   ```
   Get-Content C:\Backups\mechanik-app-db\backup.log -Tail 10
   ```
3. Powinieneś zobaczyć linię kończącą się `Zakonczono (sukces: True).` z
   dzisiejszą/wczorajszą datą. Backup uruchamia się sam, codziennie o **3:00
   w nocy**.

Żeby sprawdzić samo zadanie w Harmonogramie Windows:
```
Get-ScheduledTask -TaskName "Mechanik-Backup-DB"
```

---

## 🆘 AWARIA — baza danych padła, trzeba ją odtworzyć gdzie indziej

Wykonuj poniższe kroki **po kolei**. Wszystkie polecenia wklejasz do
PowerShell (Start → wpisz "PowerShell" → Enter).

### Krok 1 — Załóż nowy serwer PostgreSQL

Potrzebujesz NOWEGO miejsca na bazę danych — np.:
- nowej instancji PostgreSQL na Aiven (albo innym hostingu w chmurze —
  Render, Railway, DigitalOcean, Supabase itp.), lub
- lokalnie zainstalowanego PostgreSQL (jest już zainstalowany na tym
  komputerze: `C:\Program Files\PostgreSQL\18\`, więc w ostateczności można
  tymczasowo uruchomić bazę lokalnie).

Zapisz sobie z nowego serwera: **adres (host), port, nazwę użytkownika,
hasło**.

### Krok 2 — Utwórz pustą bazę danych na nowym serwerze

Na nowym serwerze musi istnieć pusta baza o dowolnej nazwie (np.
`mechanikapp`). Jeśli zakładasz nowy serwer przez panel hostingu (Aiven,
Render itp.), zwykle baza domyślna już tam jest i można użyć jej. Jeśli
łączysz się ręcznie przez psql:
```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h <adres-nowego-serwera> -U <uzytkownik> -d postgres -c "CREATE DATABASE mechanikapp;"
```

### Krok 3 — Uruchom skrypt odtwarzania

W PowerShell, w folderze tego projektu:
```
cd "C:\Users\Administrator\Documents\PGSQL\mechanik-app-v30-postgres\project_pg\scripts"
powershell -ExecutionPolicy Bypass -File restore-db.ps1
```

Skrypt zapyta Cię kolejno o:
1. **Adres nowego serwera** (host) — ten z Kroku 1.
2. **Nazwę bazy danych** — ta z Kroku 2.
3. **Użytkownika** nowego serwera.
4. **Hasło** (nic nie będzie widać, gdy wpisujesz — tak ma być).
5. Na końcu pokaże podsumowanie i zapyta o potwierdzenie — wpisz dokładnie
   `TAK` i naciśnij Enter.

Skrypt sam znajdzie **najnowszy** plik backupu z `C:\Backups\mechanik-app-db`
i go odtworzy. Poczekaj, aż się zakończy (przy małej bazie to kwestia
kilku–kilkunastu sekund) — na końcu zobaczysz `Odtworzenie zakonczone.`

> Jeśli chcesz użyć KONKRETNEGO (nie najnowszego) pliku backupu, zobacz
> sekcję "Przydatne warianty poleceń" niżej.

### Krok 4 — Sprawdź, czy dane się zgadzają

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h <adres-nowego-serwera> -U <uzytkownik> -d <nazwa-bazy> -c "SELECT COUNT(*) FROM jobs;"
```
Porównaj liczbę z tym, czego się spodziewasz (np. z ostatniego logu albo
pamięci). Warto sprawdzić też `cars`, `users`, `gospodarcze_zadania`.

### Krok 5 — Przełącz aplikację na nowy serwer bazy danych

Aplikacja (backend) łączy się z bazą na podstawie pliku
`backend\.env` (lokalnie) oraz zmiennych środowiskowych na **Render**
(produkcja). Trzeba zaktualizować **oba miejsca**:

**A) Plik `backend\.env` na tym komputerze** — otwórz go w edytorze tekstu i
zmień:
```
PGHOST=<adres-nowego-serwera>
PGPORT=<port-nowego-serwera>
PGDATABASE=<nazwa-nowej-bazy>
PGUSER=<uzytkownik-nowego-serwera>
PGPASSWORD=<haslo-nowego-serwera>
PGSSL=true    (albo false, jesli nowy serwer nie wymaga SSL)
```

**B) Render (produkcja)** — wejdź na [dashboard.render.com](https://dashboard.render.com),
otwórz serwis backendu → zakładka **Environment** → zaktualizuj te same
zmienne (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSL`) →
zapisz. Render sam zrobi redeploy z nowymi danymi.

### Krok 6 — Sprawdź, że aplikacja działa

Otwórz aplikację w przeglądarce i zaloguj się — jeśli widzisz dane (pojazdy,
zlecenia, użytkowników), odtworzenie się udało.

---

## Jak zrobić backup ręcznie, od razu (nie czekając na noc)

```
cd "C:\Users\Administrator\Documents\PGSQL\mechanik-app-v30-postgres\project_pg\scripts"
powershell -ExecutionPolicy Bypass -File backup-db.ps1
```

## Jak zmienić godzinę automatycznego backupu albo go wyłączyć

Zmiana godziny (np. na 4:00 rano):
```
powershell -ExecutionPolicy Bypass -File setup-backup-schedule.ps1 -Godzina "04:00"
```

Całkowite wyłączenie:
```
Unregister-ScheduledTask -TaskName "Mechanik-Backup-DB" -Confirm:$false
```

Włączenie z powrotem — uruchom ponownie `setup-backup-schedule.ps1`.

---

## Przydatne warianty poleceń

**Odtworzenie z konkretnego, starszego pliku backupu** (nie najnowszego):
```
powershell -ExecutionPolicy Bypass -File restore-db.ps1 -BackupFile "C:\Backups\mechanik-app-db\mechanik-db_2026-10-05_03-00.zip"
```

**Podanie wszystkich danych nowego serwera od razu** (bez pytań
interaktywnych — hasło i tak zostanie zapytane osobno, nigdy nie podawaj go
jako zwykły parametr):
```
powershell -ExecutionPolicy Bypass -File restore-db.ps1 -TargetHost "nowyserwer.przyklad.pl" -TargetDb "mechanikapp" -TargetUser "postgres"
```

---

## Typowe problemy

**„Nie znaleziono pg_dump.exe / psql.exe”**
Oznacza to, że na tym komputerze nie ma już zainstalowanego klienta
PostgreSQL. Pobierz instalator z https://www.postgresql.org/download/windows/
(wystarczy zaznaczyć samo „Command Line Tools” przy instalacji) albo, jeśli
masz Chocolatey: `choco install postgresql18 --params '/Password:tymczasowe'`.

**„connection to server ... failed”** przy odtwarzaniu
Sprawdź, czy adres/port/hasło nowego serwera są poprawne, i czy nowy serwer
wymaga SSL (parametr `-TargetSsl "require"` przy uruchamianiu
`restore-db.ps1`, jeśli domyślne `prefer` nie wystarczy).

**W logu backupu widać "BLAD pg_dump"**
Najczęstsza przyczyna: zmieniło się hasło w `backend\.env`, albo baza na
Aiven jest chwilowo niedostępna. Spróbuj uruchomić `backup-db.ps1` ręcznie
(patrz wyżej) i przeczytaj pełny komunikat błędu.

**Dwie linijki `\restrict` / `\unrestrict` przy odtwarzaniu pokazują błąd**
To nieszkodliwe — nowsza wersja `pg_dump` (18) dodaje te dwie linijki jako
zabezpieczenie, starsze wersje `psql` ich nie rozpoznają i tylko wypisują
ostrzeżenie. Reszta danych odtwarza się normalnie.
