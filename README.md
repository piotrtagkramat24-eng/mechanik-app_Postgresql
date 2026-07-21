# Warsztat - aplikacja do zarzadzania robotami mechanikow

Aplikacja webowa dla czterech rol:

- **Szef mechanikow** - dodaje samochody i roboty (zlecenia) do auta. Dodaje
  rowniez prace (jednorazowe i cykliczne) dla pracownikow gospodarczych.
- **Kierownik mechanikow** - przydziela mechanikow do zgloszonych robot.
  Ma te same uprawnienia co szef w module "Pracownik gospodarczy".
- **Mechanik** - widzi swoje roboty, zmienia status: rozpoczeta -> zakonczona.
- **Pracownik gospodarczy** - widzi tylko swoje wlasne zadania (prace
  porzadkowe/gospodarcze) i oznacza je jako wykonane, podajac date wykonania.
  W systemie moze byc kilku pracownikow gospodarczych - kazdy widzi tylko
  swoje zadania.

Wszystkie zmiany statusu sa widoczne u kierownika i szefa automatycznie
(strona odswieza dane z serwera co 4 sekundy, bez koniecznosci klikania F5).

Aplikacja dziala na Twoim wewnetrznym serwerze (nie tylko na "localhost") -
dostepna jest z kazdego urzadzenia w Twojej sieci lokalnej, w tym z telefonu
i tabletu, a uklad strony jest responsywny (dopasowuje sie do malego ekranu).

Stack technologiczny: **React (Vite)** + **Node.js / Express** + **PostgreSQL**.

---

## 1. Struktura projektu

```
mechanik-app/
├── backend/              <- serwer Node.js (API) + polaczenie z PostgreSQL
│   ├── server.js
│   ├── db.js
│   ├── schema.sql        <- JEDYNY skrypt SQL: tworzy baze/tabele (nowa instalacja)
│   │                          LUB dopisuje brakujace elementy (istniejaca baza) -
│   │                          uruchamiany automatycznie przy kazdym starcie backendu
│   ├── predefiniowane_prace_seed.sql  <- lista domyslnych prac (wlaczana przez schema.sql, nie uruchamiaj recznie)
│   ├── .env.example       <- wzor konfiguracji (skopiuj jako .env)
│   └── routes/
│       ├── auth.js        (logowanie)
│       ├── users.js       (lista mechanikow / pracownikow gospodarczych)
│       ├── cars.js        (samochody)
│       ├── jobs.js        (roboty - tworzenie, przydzielanie, zmiana statusu)
│       ├── gospodarcze.js (zadania pracownikow gospodarczych)
│       └── predefiniowane.js (predefiniowane prace z czasami normatywnymi)
└── frontend/             <- aplikacja React (to, co widzi uzytkownik w przegladarce)
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Boss.jsx        (widok szefa)
    │   │   ├── Manager.jsx     (widok kierownika)
    │   │   ├── Mechanic.jsx    (widok mechanika)
    │   │   └── Gospodarczy.jsx (widok pracownika gospodarczego)
    │   └── components/
    │       ├── DodajRobotePanel.jsx   (dodawanie pojazdu + roboty - uzywane przez szefa I kierownika)
    │       ├── SearchableSelect.jsx   (szukajka uzywana przy wyborze pojazdu / predefiniowanej pracy)
    │       ├── ElapsedTimeBar.jsx     (pasek uplywu czasu dla roboty w trakcie)
    │       ├── GospodarczyModule.jsx  (modul "dodaj prace" + "lista prac" dla szefa/kierownika)
    │       ├── GospodarczyForm.jsx    (formularz dodawania zadania)
    │       ├── GospodarczyTaskCard.jsx (karta zadania, z opcja "wykonano")
    │       └── PeriodFilter.jsx       (filtr Dzis / 7 dni / 30 dni / Wszystkie)
    └── dist/             <- tworzony przez "npm run build" (patrz punkt 5, Opcja A)
                              backend automatycznie go serwuje
```

---

## 2. Czego potrzebujesz

1. **Node.js** (wersja 18 lub nowsza) - instalator ze strony https://nodejs.org
2. **PostgreSQL** (wersja 14 lub nowsza) zainstalowany na Twoim komputerze/serwerze
   - Windows: instalator ze strony https://www.postgresql.org/download/windows/
     (w kreatorze zostaw zaznaczone "pgAdmin 4" - przyda sie do podejrzenia bazy)
   - Linux (Debian/Ubuntu): `apt install postgresql postgresql-contrib`
   - macOS: `brew install postgresql@16`

---

## 3. Konfiguracja PostgreSQL (jednorazowo)

### 3.1 Ustaw haslo dla uzytkownika `postgres`

Windows (instalator pyta o to haslo od razu podczas instalacji - zapamietaj je).

Linux/macOS, jesli haslo nie zostalo ustawione:

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'TwojeHaslo123!';"
```

### 3.2 Utworz pusta baze danych

Backend **sam tworzy wszystkie tabele** (patrz `backend/schema.sql`), ale sama
**baza danych** (np. o nazwie `mechanikapp`) musi juz istniec, zanim uruchomisz
backend po raz pierwszy - PostgreSQL (w odroznieniu od MSSQL) nie tworzy nowej
bazy danych automatycznie z poziomu zwyklego polaczenia.

```bash
# Linux/macOS
sudo -u postgres createdb mechanikapp

# Windows (z "SQL Shell (psql)" w Menu Start, po zalogowaniu jako postgres)
CREATE DATABASE mechanikapp;
```

> Jesli wolisz pgAdmin: kliknij prawym na "Databases" -> **Create** -> **Database...**,
> wpisz nazwe `mechanikapp` i zapisz.

Przy pierwszym starcie backend sam wykona `backend/schema.sql`, ktory utworzy
wszystkie tabele, indeksy oraz przykladowych uzytkownikow/dane startowe w tej
bazie - **nie trzeba nic recznie uruchamiac w psql/pgAdmin**. Skrypt jest w
pelni bezpieczny do wielokrotnego uruchamiania (uruchamia sie przy kazdym
starcie serwera): na czystej bazie tworzy wszystko od zera, a na juz
istniejacej - nic nie dubluje ani nie usuwa.

> Uwaga: jesli masz w bazie wazne dane (auta, roboty) i nie masz pewnosci,
> zawsze mozesz najpierw zrobic kopie zapasowa (`pg_dump mechanikapp > backup.sql`)
> przed aktualizacja wersji aplikacji - chociaz `schema.sql` niczego nie usuwa,
> to dobra praktyka przy pracy na produkcyjnych danych.

---

## 4. Konfiguracja backendu

1. W folderze `backend/` skopiuj plik `.env.example` i zapisz go jako `.env`.
2. Otworz `.env` i wpisz swoje dane:

```
PGHOST=localhost
PGPORT=5432
PGDATABASE=mechanikapp
PGUSER=postgres
PGPASSWORD=TwojeHaslo123!
PGSSL=false
PORT=4000
```

3. Zainstaluj zaleznosci i uruchom serwer:

```bash
cd backend
npm install
npm run dev
```

Jesli wszystko poszlo dobrze, zobaczysz w konsoli:

```
Polaczono z baza danych PostgreSQL (mechanikapp)
[Migracja] Sprawdzanie schematu bazy danych...
[Migracja] Schemat aktualny.
✅ Backend HTTPS działa na porcie 4000   (albo "Backend HTTP (bez SSL)", jesli nie masz jeszcze certyfikatow - patrz README-PWA-SSL.md)
```

> Jezeli pojawi sie blad polaczenia, sprawdz: czy haslo/login/nazwa bazy w `.env`
> sa poprawne, czy usluga PostgreSQL jest uruchomiona (`sudo service postgresql status`
> na Linuksie, albo "Services" -> `postgresql-x64-XX` na Windows), oraz czy zapora
> systemowa (firewall) nie blokuje portu 5432.

---

## 5. Uruchomienie frontendu - dwa sposoby

### Opcja A (polecana): jeden port, dziala w sieci lokalnej - "produkcyjnie"

Najlepsza opcja, jesli chcesz, by aplikacja dzialala caly czas na Twoim
wewnetrznym serwerze, a inne urzadzenia (telefon, tablet, inny komputer w
sieci) mialy do niej dostep. Backend bedzie serwowal rowniez frontend, wiec
cala aplikacja dziala z **jednego adresu i portu**.

```bash
cd frontend
npm install
npm run build        # tworzy folder frontend/dist
```

Backend (musi byc uruchomiony, patrz punkt 4) automatycznie wykryje folder
`frontend/dist` i zacznie go serwowac. Wystarczy wejsc na:

```
http://localhost:4000
```

z tego samego komputera, albo z telefonu/tabletu w tej samej sieci Wi-Fi/LAN:

```
http://<adres-IP-Twojego-komputera>:4000
```

Adres IP zobaczysz w konsoli, w ktorej dziala backend - przy starcie wypisuje
on liste adresow w stylu `http://192.168.1.23:4000`. Wpisz dokladnie taki
adres w przegladarce na telefonie/tablecie (musza byc w tej samej sieci
lokalnej co komputer z serwerem).

> Jezeli zmienisz cokolwiek w kodzie frontendu, musisz ponownie wykonac
> `npm run build`, zeby zmiany byly widoczne (i ewentualnie zrestartowac
> backend).

### Opcja B: tryb deweloperski (z automatycznym przeladowaniem przy zmianach kodu)

Wygodna do pracy nad kodem - kazda zmiana w plikach `.jsx`/`.css` jest widoczna
w przegladarce natychmiast, bez budowania.

```bash
cd frontend
npm install
npm run dev
```

Vite wypisze adresy, np.:

```
Local:   http://localhost:5173/
Network: http://192.168.1.23:5173/
```

Adres "Network" mozesz otworzyc na telefonie/tablecie w tej samej sieci.
Zapytania do `/api` sa automatycznie przekazywane do backendu dzialajacego
na tym samym komputerze (skonfigurowane w `vite.config.js`), wiec wszystko
dziala bez dodatkowej konfiguracji.

---

## 6. Dostep z sieci lokalnej - o czym pamietac

1. **Backend i frontend musza dzialac na tym samym komputerze** (tym, ktory
   nazywasz "wewnetrznym serwerem"). Telefon/tablet/inny komputer laczy sie
   z nim przez siec, ale sam nie musi miec zainstalowanego Node.js.
2. **Zapora systemowa (firewall)** na komputerze z serwerem musi zezwalac na
   polaczenia przychodzace na uzywany port (domyslnie `4000`, a w trybie
   deweloperskim rowniez `5173`). W Windows: Panel Sterowania -> Zapora
   Windows Defender -> Dozwolone aplikacje -> dodaj Node.js/port, albo przy
   pierwszym uruchomieniu Windows sam zapyta o zgode - wybierz "Sieci
   prywatne".
3. **Telefon/tablet musi byc w tej samej sieci** (np. tym samym Wi-Fi) co
   komputer z serwerem.
4. Jezeli komputer ma kilka adresow IP (np. Wi-Fi i LAN), uzyj tego adresu,
   ktory jest w tej samej podsieci co telefon/tablet - lista wszystkich
   adresow jest wypisywana w konsoli backendu przy starcie.
5. Aby aplikacja byla dostepna takze po restarcie komputera, mozesz dodac
   `npm start` (w folderze `backend`) do automatycznego startu (np. jako
   zadanie w Harmonogramie zadan Windows albo jako usluga - to juz wykracza
   poza zakres tego README, ale warto wiedziec, ze to mozliwe).

---

## 7. Logowanie - przykladowi uzytkownicy

Skrypt `schema.sql` tworzy konta testowe (haslo dla kazdego: `1234`):

| Login          | Rola                  | Widok                                    | Haslo |
|----------------|-----------------------|-------------------------------------------|-------|
| szef           | szef                  | Pelny (warsztat + pracownik gospodarczy)  | 1234  |
| kierownik      | kierownik             | Pelny (warsztat + pracownik gospodarczy)  | 1234  |
| mechanik1      | mechanik              | Tylko swoje roboty                        | 1234  |
| mechanik2      | mechanik              | Tylko swoje roboty                        | 1234  |
| gospodarczy1   | pracownik_gospodarczy | Tylko swoje zadania gospodarcze           | 1234  |
| administrator1 | administrator         | **Tylko modul "Pracownik gospodarczy"**   | 1234  |

Konto `administrator1` dodaje sie automatycznie przy pierwszym uruchomieniu backendu
(automigracja) - patrz sekcja 12. Zmien haslo w bazie po pierwszym zalogowaniu.

Nowych uzytkownikow dodajesz wprost w bazie, np.:

```sql
INSERT INTO Users (Username, Password, FullName, Role)
VALUES ('mechanik3', '1234', 'Nowy Mechanik', 'mechanik');

-- kolejny pracownik gospodarczy (mozesz miec ich wielu - kazdy widzi tylko swoje zadania)
INSERT INTO Users (Username, Password, FullName, Role)
VALUES ('gospodarczy2', '1234', 'Nowy Pracownik', 'pracownik_gospodarczy');

-- kolejne konto administratora (widok tylko na modul Pracownik gospodarczy)
INSERT INTO Users (Username, Password, FullName, Role)
VALUES ('administrator2', '1234', 'Drugi Administrator', 'administrator');
```

(`Role` musi byc jedna z: `szef`, `kierownik`, `mechanik`, `pracownik_gospodarczy`, `administrator`)

---

## 8. Jak dziala przeplyw pracy

1. **Szef** loguje sie -> dodaje samochod (marka, model, rejestracja) ->
   dodaje robote do tego samochodu (opis). Robota dostaje status **"Nowa"**
   i trafia na koniec kolejki.
2. **Kierownik** loguje sie -> widzi liste nowych robot -> wybiera mechanika
   z listy -> klika "Przydziel". Status zmienia sie na **"Przydzielona"**.
   - Strzalkami **▲ / ▼** przy kazdej robocie (nawet juz przydzielonej) kierownik
     moze zmienic, ktora robota ma zostac wykonana wczesniej. Ta kolejnosc
     jest widoczna u mechanikow - decyduje, w jakiej kolejnosci wyswietlaja
     im sie roboty w sekcji "Przydzielone" i "W trakcie".
3. **Mechanik** loguje sie -> widzi swoje roboty podzielone na trzy
   rozwijalne sekcje (klikniecie naglowka zwija/rozwija sekcje):
   - **Przydzielone** - czekaja na rozpoczecie, klika "Rozpocznij".
   - **Moje roboty (w trakcie)** - rozpoczete, klika "Zakoncz" po skonczeniu.
   - **Zakonczone** - historia wykonanych robot (domyslnie zwinieta).
4. Widoki **szefa** i **kierownika** odswiezaja sie automatycznie (co 4 sekundy)
   i pokazuja aktualny status oraz kolejnosc kazdej roboty bez koniecznosci
   przeladowania strony.

---

## 9. Modul "Pracownik gospodarczy"

Dodatkowy modul do zlecania i sledzenia prac porzadkowych/gospodarczych
(np. koszenie trawy, sprawdzanie pojazdow, sprzatanie, drobne remonty).

### 9.1 Kto ma dostep

- **Szef** i **Kierownik** - widza zakladke **"🧹 Pracownik gospodarczy"**
  (u szefa i kierownika obok ich zwyklych widokow). W tej zakladce moga:
  - **dodac nowe zadanie** ("+ Dodaj prace") dla wybranego pracownika
    gospodarczego - jednorazowe lub cykliczne, z lokalizacja/zakresem
    i priorytetem (Wysoki / Średni / Niski),
  - **przegladac prace** wszystkich pracownikow gospodarczych (z filtrem po
    pracowniku oraz po okresie: Dzis / 7 dni / 30 dni / Wszystkie), podzielone
    na "Do wykonania", "Zaplanowane - jeszcze nie aktywne" i "Zakonczone",
  - usunac (zarchiwizowac) blednie dodane zadanie.
  - Szef i kierownik **nie** wpisuja daty wykonania - to robi pracownik
    gospodarczy.
- **Pracownik gospodarczy** - po zalogowaniu widzi **wylacznie wlasny panel**
  z wlasnymi zadaniami (nie widzi zadan innych pracownikow gospodarczych).
  Moze byc wielu pracownikow gospodarczych - kazdy ma osobne konto i widzi
  tylko swoje zadania. W swoim panelu:
  - widzi liste "Do wykonania" z filtrem okresu **Dzis / 7 dni / 30 dni /
    Wszystkie** (dziala na podstawie liczby dni do najblizszego terminu),
  - oznacza zadanie jako wykonane, **podajac date wykonania** (domyslnie
    dzisiejsza, mozna zmienic),
  - widzi rowniez zwijane sekcje "Zaplanowane" (zadania cykliczne, ktorych
    termin jeszcze nie nadszedl) i "Zakonczone" (historia jednorazowych zadan).

### 9.2 Zadania jednorazowe vs cykliczne

- **Jednorazowe** - wykonywane raz; po oznaczeniu jako wykonane trafiaja do
  sekcji "Zakonczone". Mozna (opcjonalnie) ustawic termin wykonania.
- **Cykliczne** - powtarzaja sie co X dni (np. co 7, 14, 30, 60 dni). Po
  oznaczeniu jako wykonane, system sam wylicza **nastepny termin**
  (data wykonania + liczba dni cyklu) i zadanie "usypia" do momentu, gdy
  zaczyna sie okno widocznosci.
- **Kiedy zadanie cykliczne "odnawia sie" u pracownika?** Kazde zadanie
  cykliczne ma ustawiona liczbe dni wyprzedzenia (np. 3 dni) - zadanie
  pojawia sie w sekcji "Do wykonania" dokladnie tyle dni przed kolejnym
  terminem (a takze, oczywiscie, jesli jest juz po terminie). Zanim to okno
  sie zacznie, zadanie jest widoczne tylko w sekcji "Zaplanowane" (jako
  informacja, kiedy znow bedzie aktywne) - u szefa/kierownika i u pracownika.

### 9.3 Filtr okresu (Dzis / 7 dni / 30 dni / Wszystkie)

Filtr dziala na podstawie liczby dni pozostalych do najblizszego terminu
zadania:
- **Dzis** - zadania z terminem dzisiejszym lub przeterminowane,
- **7 dni** - zadania z terminem w ciagu najblizszych 7 dni (lub juz po terminie),
- **30 dni** - analogicznie dla 30 dni,
- **Wszystkie** - bez filtrowania po terminie.

### 9.4 Instalacja / migracja

Nowa instalacja lub istniejaca baza: zawsze wystarczy uruchomic `schema.sql`
(patrz punkt 3.3) - modul jest juz w nim zawarty, a skrypt bezpiecznie dopisuje
tylko brakujace elementy do istniejacej bazy.

---

## 10. Uwagi dotyczace bezpieczenstwa

Ta aplikacja jest pomyslana jako prosty system do uzytku **wewnatrz jednego
warsztatu / sieci lokalnej**. Hasla sa przechowywane w bazie jako czysty
tekst, a logowanie nie uzywa tokenow/sesji - to wystarcza do uzytku lokalnego,
ale **nie nadaje sie do wystawienia w publicznym internecie** bez dodania
hashowania hasel (np. bcrypt) i prawdziwej autoryzacji (np. JWT).

---

## 11. Najczestsze problemy

| Problem | Rozwiazanie |
|---|---|
| `Nie udalo sie polaczyc z baza danych` | Sprawdz `.env`: host, port, nazwa bazy, login, haslo. Sprawdz czy usluga PostgreSQL jest uruchomiona. |
| Backend dziala, ale frontend pokazuje blad sieci | Sprawdz czy backend faktycznie wystartowal na porcie 4000 (`http://localhost:4000` powinno odpowiedziec tekstem). |
| Logowanie odrzuca prawidlowe dane | Sprawdz w pgAdmin (albo `psql`) w tabeli `users`, czy uzytkownik istnieje i czy haslo sie zgadza (haslo jest case-sensitive). |
| Po przydzieleniu mechanika lista "Do przydzielenia" nie aktualizuje sie u kierownika | Odczekaj do 4 sekund (czas odswiezania) albo przeladuj strone. |
| Z telefonu/tabletu strona sie nie laduje / "nie mozna polaczyc" | Sprawdz: (1) telefon i komputer sa w tej samej sieci Wi-Fi, (2) wpisujesz adres IP wypisany w konsoli backendu (nie "localhost"), (3) zapora systemowa nie blokuje portu, (4) backend i (w Opcji A) zbudowany frontend faktycznie dzialaja. |
| Na telefonie dziala strona logowania, ale po zalogowaniu nic sie nie dzieje / blad | Najpewniej uzywasz starej wersji frontendu - wykonaj ponownie `npm run build` (Opcja A) albo zrestartuj `npm run dev` (Opcja B) po aktualizacji kodu. |

---

## 12. Nowosci v14

Wszystkie zmiany ponizej wgrywaja sie **automatycznie** przy pierwszym uruchomieniu
backendu (`node server.js`) - dzieki automigracji nie trzeba recznie odpalac
zadnego skryptu SQL. Skrypt `schema.sql` zawiera te same zmiany (sekcja 12) -
przyda sie tylko przy zupelnie nowej, czystej instalacji bazy, albo jesli
wolisz uruchomic migracje recznie zamiast czekac na automigracje przy starcie backendu.

### 12.1 Konto administratora (widok ograniczony)

Nowa rola `administrator` - dodatkowe konto z widokiem **ograniczonym wylacznie
do modulu "Pracownik gospodarczy"** (bez dostepu do warsztatu/robot/kanban).
Ma te same uprawnienia co szef/kierownik w tym module: dodawanie zadan,
numery rejestracyjne, zmiana kolejnosci, kalendarz.

- Login: `administrator1`, haslo: `1234` (dodawany automatycznie przy starcie backendu).
- Kolejne konta administratora dodajesz w bazie z `Role = 'administrator'` (patrz sekcja 7).

### 12.2 Numery rejestracyjne w zadaniach gospodarczych

W formularzu "Dodaj prace dla pracownika gospodarczego" (dostepnym dla szefa,
kierownika i administratora) pojawil sie checkbox **"Dodaj numery rejestracyjne"**.
Po zaznaczeniu mozna dopisac dowolna liczbe numerow (np. WWY12345, WPU12345, WL12345)
- kazdy trafia na liste jako "chip" z mozliwoscia usuniecia przed zapisaniem.

Gdy zadanie ma przypisane numery rejestracyjne, pracownik gospodarczy przy
"Oznacz jako wykonane" widzi liste tych numerow i **musi dla kazdego z osobna**
zaznaczyc **Wykonano / Nie wykonano**, zanim zapisze wykonanie zadania (przycisk
jest zablokowany, dopoki nie wybrano statusu dla wszystkich numerow). Historia
wykonan (`GET /api/gospodarcze/:id/historia`) przechowuje te statusy dla kazdego
wykonania osobno.

### 12.3 Kategorie naczep

Przy dodawaniu pojazdu (panel szefa) mozna wybrac **typ pojazdu**: Samochod
lub Naczepa. Dla naczepy dochodzi wybor **kategorii**: Plandeka, Chlodnia/Izoterma,
Wywrotka, Cysterna, Kontenerowa, Firanka/Kurtyna, Niskopodwoziowa, Inna.

### 12.4 Predefiniowane prace z domyslnymi czasami

Tabela `PredefiniowanePrace` zostala zaladowana 93 pozycjami (na podstawie
zalaczonego pliku `sprinter_czasy_normatywne_min_sredni_max.xlsx`) - kazda z
czasem min / sredni / max w godzinach (np. "Klocki przod" - 0.8h / 1h / 1.2h).

W formularzu "Dodaj robote do pojazdu" (panel szefa) dochodzi pole
"Predefiniowana praca (opcjonalnie)" - wyszukiwarka z podpowiedziami czasu.
Wybranie pozycji uzupelnia opis roboty, a czasy zapisuja sie razem z robota
(`Jobs.CzasSzacowanyMin/Sredni/Max`) - mozna je pozniej wykorzystac np. do
planowania obciazenia warsztatu. Opis mozna nadal dowolnie edytowac recznie.

Nowe/wlasne predefiniowane prace mozna dodac przez `POST /api/predefiniowane-prace`
(np. z poziomu pgAdmin/psql, wstawiajac rekord do tabeli `predefiniowane_prace`).

### 12.5 Wyszukiwanie przy dodawaniu roboty

Wybor pojazdu i wybor predefiniowanej pracy w formularzu "Dodaj robote do
pojazdu" to teraz wyszukiwalne listy (wpisz fragment marki, modelu, rejestracji
lub nazwy pracy), zamiast dlugiego rozwijanego `<select>` - wygodniejsze przy
duzej liczbie pojazdow.

### 12.6 Poprawka

Naprawiono blad w pliku `Manager.jsx` (zduplikowany, martwy fragment kodu po
komponencie `KanbanColumn`), ktory uniemozliwial poprawne zbudowanie frontendu.

### 12.7 Poprawki (kierownik: dodawanie robot, szacowany czas, pasek postepu, wyszukiwanie aut w module gospodarczym)

- **Kierownik nie mogl dodawac robot/pojazdow** - widok `Manager.jsx` mial
  tylko zakladki "Do przydzielenia", "Tablica mechanikow" i "Pracownik
  gospodarczy", bez formularza dodawania. Std stad m.in. wrazenie "nie dziala
  dodawanie prac" i brak szukajki dla aut - formularza po prostu nie bylo.
  Dodano nowa zakladke **"+ Dodaj robote"** (widoczna dla kierownika, tak samo
  jak u szefa), z ta sama wyszukiwarka pojazdow i predefiniowanych prac.
  Kod formularza zostal wydzielony do wspolnego komponentu
  `DodajRobotePanel.jsx`, uzywanego przez `Boss.jsx` i `Manager.jsx`, zeby
  obie role mialy dokladnie te sama, zawsze aktualna funkcjonalnosc.
- **Brak informacji o szacowanym (normatywnym) czasie wykonania roboty** -
  karty robot (u szefa, kierownika i mechanika) pokazywaly tylko opis, bez
  czasu z tabeli `PredefiniowanePrace`/`Jobs.CzasSzacowanySredni`. Dodano
  etykiete "⏱ Szac. czas: ~1h 30min (1h–2h)" na wszystkich kartach robot
  (lista robot, tablica kanban, lista "Do przydzielenia").
- **Brak paska uplywu czasu po rozpoczeciu pracy przez mechanika** - dodano
  komponent `ElapsedTimeBar.jsx`: pasek pod opisem roboty ze statusem
  "rozpoczete", pokazujacy ile czasu minelo od `DataRozpoczecia` w stosunku do
  szacowanego czasu (zielony = w normie, pomaranczowy = blisko limitu 80%+,
  czerwony = przekroczono szacowany czas - z informacja o ile). Pasek
  odswieza sie sam co 30 sekund i jest widoczny zarowno u mechanika, jak i na
  tablicy kierownika/szefa.
- **W module "Pracownik gospodarczy" trzeba bylo recznie wpisywac kazdy numer
  rejestracyjny** - formularz dodawania zadania (`GospodarczyForm.jsx`) mial
  tylko pole tekstowe. Dodano wyszukiwarke istniejacych pojazdow z bazy
  (`Cars`) - wybranie pojazdu z listy dodaje jego numer rejestracyjny do
  zadania jednym klikniciem; recznie wpisywanie numeru zostalo zachowane jako
  dodatkowa opcja (np. dla pojazdow spoza floty/jeszcze niedodanych do bazy).

---

## 13. Jeden plik SQL zamiast kilku

Wczesniej w projekcie bylo kilka oddzielnych plikow SQL (`schema.sql` w wersji
"tylko nowa instalacja", `schema_KOMPLETNY.sql`, `migration_priorytet.sql`,
`migration_gospodarczy.sql`, `migration_v10.sql`), co latwo bylo pomylic -
nie zawsze bylo jasne, ktory z nich nalezy uruchomic. Zostaly one polaczone
w **jeden plik**: `backend/schema.sql`.

Ten jeden plik:

- na czystym serwerze tworzy baze `MechanikApp` od zera wraz z kontami
  testowymi i przykladowymi danymi,
- na istniejacej bazie (z dowolnej wczesniejszej wersji aplikacji) dopisuje
  tylko brakujace tabele/kolumny/dane, niczego nie usuwajac,
- jest w pelni bezpieczny do wielokrotnego uruchamiania (kazda operacja
  sprawdza najpierw, czy dany obiekt juz istnieje).

Plik `predefiniowane_prace_seed.sql` zostal celowo zachowany - to nie jest
skrypt do recznego uruchomienia w psql, tylko plik danych, ktory `server.js`
wczytuje programowo przy pierwszym starcie backendu (gdy tabela
`PredefiniowanePrace` jest pusta).

## 15. Bezpieczne wdrozenie na hosting i publikacja na GitHub

### 15.1 Zasada nadrzedna

Zaden sekret (haslo do bazy, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`,
`MICROSOFT_CLIENT_ID`) nie moze nigdy trafic do repozytorium Git ani do kodu
zrodlowego. Zyje wylacznie w pliku `.env` (lokalnie, NIGDY nie commitowany -
projekt ma juz `.gitignore`, ktory go wyklucza) oraz w panelu zmiennych
srodowiskowych hostingu (patrz 15.3).

### 15.2 Konfiguracja aplikacji w Azure AD (Microsoft Entra) - o czym pamietac

Dane, ktore dostales (Tenant ID / Client ID / Client Secret), to komplet
potrzebny do wysylki maili przez Microsoft Graph API (`backend/mail.js`).
Zanim ich uzyjesz, sprawdz w Azure Portal > Microsoft Entra ID > App
registrations > (Twoja aplikacja):

1. **API permissions** - musi byc nadane uprawnienie **Application** (nie
   Delegated) `Mail.Send` dla Microsoft Graph, z klikietym **"Grant admin
   consent"** (bez tego wysylka bedzie zwracac blad 403).
2. **Certificates & secrets** - Client Secret ma date wygasniecia (zwykle
   6-24 mies.) - zapisz sobie date i ustaw przypomnienie, bo po wygasnieciu
   wysylka mailowa po prostu przestanie dzialac bez ostrzezenia w aplikacji.
3. **EMAIL_FROM_ADDRESS** w `.env` musi byc realna skrzynka w Twojej
   organizacji (Exchange Online), ktora ten Client ID ma prawo reprezentowac.

Wpisz te trzy wartosci WYLACZNIE do `backend/.env` (skopiuj
`backend/.env.example` -> `backend/.env` i uzupelnij) - ten plik zostaje
tylko na Twoim komputerze/serwerze i nigdy nie jest wysylany na GitHub.

### 15.3 Wdrozenie na hosting

Sposob zalezy od tego, co to za hosting:

- **VPS / wlasny serwer (Windows lub Linux) z dostepem SSH/RDP** - najblizej
  temu, co juz opisuje sekcja 5 (Opcja A: `npm run build` we `frontend`,
  potem `node server.js` w `backend` serwuje i API, i zbudowany frontend na
  jednym porcie). Na serwerze **recznie** tworzysz plik `backend/.env` (np.
  przez `nano backend/.env` po SSH) z prawdziwymi danymi - nigdy nie
  wgrywasz go przez Git.
- **Platformy PaaS (Azure App Service, Render, Railway itp.)** - kod
  wgrywasz przez Git/GitHub, ale sekrety wpisujesz osobno w panelu
  platformy, w sekcji zwykle nazwanej "Environment Variables" / "App
  Settings" / "Secrets" - tam dodajesz `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
  `PGPASSWORD`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`,
  `MICROSOFT_CLIENT_SECRET`, `EMAIL_FROM_ADDRESS` jako pojedyncze pozycje.
  Platforma wstrzykuje je do `process.env` przy starcie - kod aplikacji nie
  wymaga zadnej zmiany.
- **Baza PostgreSQL** - jesli hosting Node.js i baza danych sa u roznych
  dostawcow, upewnij sie, ze firewall bazy zezwala na polaczenia z adresu IP
  serwera hostingu (Azure SQL ma do tego gotowa liste "Firewall rules" w
  portalu).

Po wdrozeniu zawsze zweryfikuj: (1) czy backend w ogole wystartowal (log
"Polaczono z baza danych PostgreSQL"), (2) czy logowanie dziala, (3) czy testowy
mail (np. zakonczenie roboty) faktycznie doszedl.

### 15.4 Bezpieczna publikacja na GitHub - krok po kroku

1. **Zanim zrobisz pierwszy commit**, sprawdz ze plik `.gitignore` (jest juz
   w projekcie) na pewno wyklucza `.env`, `node_modules/` i pliki `*.pem`/`*.key`.
2. Zainicjuj repozytorium i sprawdz, co faktycznie trafi do commita, ZANIM
   go zrobisz:
   ```bash
   git init
   git add .
   git status
   ```
   W wyniku `git status` **nie moze** pojawic sie `backend/.env` ani zaden
   plik z realnym sekretem - jesli sie pojawi, zatrzymaj sie i popraw
   `.gitignore` przed commitem.
3. Dopiero teraz commituj i publikuj:
   ```bash
   git commit -m "Pierwsza wersja aplikacji"
   git branch -M main
   git remote add origin https://github.com/TWOJ-LOGIN/NAZWA-REPO.git
   git push -u origin main
   ```
4. **Ustaw repozytorium jako Private** (Settings > General > Danger Zone,
   albo od razu przy tworzeniu repo na GitHub) - to kod firmowej aplikacji
   z danymi klientow/pojazdow, nie ma powodu, zeby byl publiczny.
5. Upewnij sie, ze w repo jest **tylko** `backend/.env.example` (z pustymi
   polami/przykladowymi wartosciami) - nigdy prawdziwy `backend/.env`.

### 15.5 Jesli sekret WYCIEKL (np. przez pomylke trafil do commita)

Samo usuniecie pliku w kolejnym commicie **nie wystarczy** - pozostaje w
historii Git i kazdy z dostepem do repo moze go odczytac. Jesli to sie
zdarzy:

1. Natychmiast **uniewaznij** ten sekret w Azure Portal (App registrations >
   Certificates & secrets > usun stary Client Secret, wygeneruj nowy) - to
   najwazniejszy krok, sam fakt usuniecia z Gita nie unieważnia sekretu.
2. Wpisz nowy Client Secret do `backend/.env` (lokalnie/na serwerze) oraz w
   panelu zmiennych srodowiskowych hostingu.
3. Dopiero potem oczysc historie repozytorium (np. `git filter-repo` albo
   narzedzie "Remove sensitive data" z dokumentacji GitHub) - to opcjonalne
   porzadkowanie, bezpieczenstwo zapewnia juz krok 1.

