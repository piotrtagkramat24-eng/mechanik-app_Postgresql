-- ============================================================
--  WARSZTAT APP — JEDYNY I KOMPLETNY SKRYPT BAZY DANYCH (PostgreSQL)
--  Wersja: v20-pg (port z MSSQL na PostgreSQL)
--
--  To jest JEDYNY plik SQL potrzebny do uruchomienia aplikacji.
--  W odroznieniu od poprzedniej (MSSQL) wersji tego pliku, ktora
--  odtwarzala historie kolejnych migracji krok po kroku, ten skrypt
--  tworzy od razu KONCOWY, docelowy ksztalt schematu (odpowiadajacy
--  wersji v19 aplikacji na MSSQL) - jest to prostsze do utrzymania
--  i daje dokladnie ten sam wynik na czystej bazie.
--
--  Skrypt jest w pelni bezpieczny do wielokrotnego uruchamiania —
--  wszystkie tabele i indeksy uzywaja IF NOT EXISTS, a dane
--  startowe sa wstawiane tylko, gdy jeszcze nie istnieja, wiec mozna
--  go uruchomic ponownie (np. przy kazdym starcie backendu) bez
--  ryzyka zdublowania danych.
--
--  Uzycie:
--    psql -U postgres -d mechanikapp -f schema.sql
--  (baza "mechanikapp" musi juz istniec - patrz README.md)
-- ============================================================

-- ============================================================
-- 1. TABELA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL PRIMARY KEY,
    username                VARCHAR(50)  NOT NULL UNIQUE,
    password                VARCHAR(100) NOT NULL,
    -- Haslo przechowywane jako hash bcrypt (nigdy jawnym tekstem). Nowe konta
    -- dodaje sie komenda: node create-user.js (patrz backend/create-user.js) -
    -- haszuje haslo przed zapisem, wiec w bazie nigdy nie ląduje jawny tekst.
    full_name               VARCHAR(100) NOT NULL,
    role                    VARCHAR(30)  NOT NULL,
    email                   VARCHAR(200) NULL,
    wykonuje_dodatkowe_prace BOOLEAN NOT NULL DEFAULT FALSE,
    -- Godziny pracy (v20) - dynamiczna konfiguracja per uzytkownik, zeby pasek
    -- uplywu czasu (i szacowany czas wykonania) liczyly sie wg RZECZYWISTYCH
    -- godzin roboczych, a nie zegarowych 24h. Domyslnie: pon-pt 8:00-17:00
    -- z przerwa 11:00-12:00, sobota 8:00-14:00 bez przerwy (firmowy standard) -
    -- kazdy mechanik moze miec to nadpisane indywidualnie w Super Adminie.
    -- Godziny trzymane jako VARCHAR(5) "HH:MM" (prosciej niz typ TIME przy
    -- serializacji do JSON). *_przerwa_min = 0 oznacza brak przerwy tego dnia.
    -- godz_sob_* = NULL oznacza, ze uzytkownik w ogole nie pracuje w soboty.
    godz_tydz_od            VARCHAR(5) NOT NULL DEFAULT '08:00',
    godz_tydz_do            VARCHAR(5) NOT NULL DEFAULT '17:00',
    godz_tydz_przerwa_od    VARCHAR(5) NULL DEFAULT '11:00',
    godz_tydz_przerwa_min   INT NOT NULL DEFAULT 60,
    godz_sob_od             VARCHAR(5) NULL DEFAULT '08:00',
    godz_sob_do             VARCHAR(5) NULL DEFAULT '14:00',
    godz_sob_przerwa_od     VARCHAR(5) NULL DEFAULT NULL,
    godz_sob_przerwa_min    INT NOT NULL DEFAULT 0,
    CONSTRAINT ck_users_role CHECK (
        role IN ('szef', 'kierownik', 'mechanik', 'pracownik_gospodarczy', 'administrator', 'superadmin')
    )
);

-- ============================================================
-- 2. TABELA: cars (samochody i naczepy przyjete do warsztatu)
-- ============================================================
CREATE TABLE IF NOT EXISTS cars (
    id              SERIAL PRIMARY KEY,
    marka           VARCHAR(50)  NOT NULL,
    model           VARCHAR(50)  NOT NULL,
    rejestracja     VARCHAR(20)  NOT NULL,
    data_przyjecia  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    typ_pojazdu     VARCHAR(20)  NOT NULL DEFAULT 'samochod',
    kategoria       VARCHAR(50)  NULL
);

-- ============================================================
-- 3. TABELA: predefiniowane_prace (nazwa + domyslne czasy min/sredni/max w godzinach)
-- ============================================================
CREATE TABLE IF NOT EXISTS predefiniowane_prace (
    id          SERIAL PRIMARY KEY,
    nazwa       VARCHAR(300) NOT NULL,
    czas_min    DECIMAL(5,2) NULL,
    czas_sredni DECIMAL(5,2) NULL,
    czas_max    DECIMAL(5,2) NULL,
    aktywny     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- 4. TABELA: jobs (zlecenia / roboty)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id                      SERIAL PRIMARY KEY,
    car_id                  INT NOT NULL REFERENCES cars(id),
    opis                    VARCHAR(500) NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'nowe'
        CONSTRAINT ck_jobs_status CHECK (status IN ('nowe', 'przydzielone', 'rozpoczete', 'zakonczone')),
    mechanik_id             INT NULL REFERENCES users(id),
    utworzono_przez         INT NOT NULL REFERENCES users(id),
    -- priorytet = kolejnosc wykonania ustawiana przez kierownika
    -- (mniejsza wartosc = wyzszy priorytet / wczesniej na liscie)
    priorytet               INT NOT NULL DEFAULT 0,
    data_utworzenia         TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_przydzielenia      TIMESTAMPTZ NULL,
    data_rozpoczecia        TIMESTAMPTZ NULL,
    data_zakonczenia        TIMESTAMPTZ NULL,
    -- opis wykonanej pracy, uzupelniany przez mechanika przy zakonczeniu
    opis_wykonania          VARCHAR(1000) NULL,
    predefiniowana_praca_id INT NULL REFERENCES predefiniowane_prace(id),
    czas_szacowany_min      DECIMAL(5,2) NULL,
    czas_szacowany_sredni   DECIMAL(5,2) NULL,
    czas_szacowany_max      DECIMAL(5,2) NULL,
    zdjecie_wykonania       TEXT NULL
);

CREATE INDEX IF NOT EXISTS ix_jobs_mechanik_id ON jobs(mechanik_id);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS ix_jobs_predefiniowana_praca_id ON jobs(predefiniowana_praca_id);

-- ============================================================
-- 5. TABELA: job_czynnosci — lista czynnosci skladajacych sie na jedno
--    zlecenie (moze ich byc kilka, np. kilka predefiniowanych prac
--    dodanych naraz, albo dopisanych pozniej przez mechanika w trakcie
--    realizacji). jobs.opis pozostaje jako krotkie podsumowanie (do
--    widoku listy/karty), a jobs.czas_szacowany_min/sredni/max sa
--    liczone jako SUMA z tej tabeli (patrz zapytania w routes/jobs.js).
--    Kazda czynnosc ma WLASNY status i wlasny pasek postepu.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_czynnosci (
    id                      SERIAL PRIMARY KEY,
    job_id                  INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    predefiniowana_praca_id INT NULL REFERENCES predefiniowane_prace(id),
    nazwa                   VARCHAR(300) NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'oczekuje'
        CONSTRAINT ck_jobczyn_status CHECK (status IN ('oczekuje', 'rozpoczete', 'zakonczone')),
    data_rozpoczecia        TIMESTAMPTZ NULL,
    data_zakonczenia        TIMESTAMPTZ NULL,
    czas_min                DECIMAL(5,2) NULL,
    czas_sredni             DECIMAL(5,2) NULL,
    czas_max                DECIMAL(5,2) NULL,
    data_dodania            TIMESTAMPTZ NOT NULL DEFAULT now(),
    dodane_przez            INT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_jobczynnosci_job_id ON job_czynnosci(job_id);

-- ============================================================
-- 6. TABELA: gospodarcze_zadania (zadania pracownikow gospodarczych)
-- ============================================================
CREATE TABLE IF NOT EXISTS gospodarcze_zadania (
    id                          SERIAL PRIMARY KEY,
    zadanie                     VARCHAR(300) NOT NULL,
    lokalizacja                 VARCHAR(200) NULL,
    typ                         VARCHAR(20) NOT NULL
        CONSTRAINT ck_goszad_typ CHECK (typ IN ('jednorazowe', 'cykliczne')),
    -- co_ile_dni: wypelniaj tylko dla typ = 'cykliczne'
    co_ile_dni                  INT NULL,
    -- dni_wyprzedzenia: historyczna kolumna, aktualnie nieuzywana w logice widoku;
    -- zostawiona dla wstecznej kompatybilnosci
    dni_wyprzedzenia            INT NOT NULL DEFAULT 0,
    priorytet                   VARCHAR(10) NOT NULL DEFAULT 'Średni'
        CONSTRAINT ck_goszad_priorytet CHECK (priorytet IN ('Wysoki', 'Średni', 'Niski')),
    -- kolejnosc wyswietlania na liscie (kierownik/szef moze przeciagac zadania)
    priorytet_kolejnosc         INT NOT NULL DEFAULT 999,
    pracownik_id                INT NOT NULL REFERENCES users(id),
    utworzono_przez             INT NOT NULL REFERENCES users(id),
    data_utworzenia             TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_ostatniego_wykonania   DATE NULL,
    -- dla 'jednorazowe': opcjonalny termin wykonania.
    -- dla 'cykliczne': automatycznie wyliczany nastepny termin po oznaczeniu jako wykonane.
    nastepny_termin              DATE NULL,
    status                       VARCHAR(20) NOT NULL DEFAULT 'aktywne'
        CONSTRAINT ck_goszad_status CHECK (status IN ('aktywne', 'zakonczone')),
    -- aktywny = false oznacza "usuniete" (archiwizacja bez utraty historii wykonan)
    aktywny                      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_goszad_pracownik_id ON gospodarcze_zadania(pracownik_id);
CREATE INDEX IF NOT EXISTS ix_goszad_aktywny_status ON gospodarcze_zadania(aktywny, status);

-- ============================================================
-- 7. TABELA: gospodarcze_wykonania (historia wykonan zadan)
-- ============================================================
CREATE TABLE IF NOT EXISTS gospodarcze_wykonania (
    id               SERIAL PRIMARY KEY,
    zadanie_id       INT NOT NULL REFERENCES gospodarcze_zadania(id),
    data_wykonania   DATE NOT NULL,
    wykonal_user_id  INT NULL REFERENCES users(id),
    data_zapisu      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_goswyk_zadanie_id ON gospodarcze_wykonania(zadanie_id);

-- ============================================================
-- 8. TABELA: gospodarcze_zadania_rejestracje — numery rejestracyjne
--    przypisane do zadan gospodarczych (checkbox "Dodaj numery
--    rejestracyjne" przy tworzeniu zadania; pracownik gospodarczy
--    zaznacza Wykonano/Nie wykonano dla kazdego numeru osobno)
-- ============================================================
CREATE TABLE IF NOT EXISTS gospodarcze_zadania_rejestracje (
    id           SERIAL PRIMARY KEY,
    zadanie_id   INT NOT NULL REFERENCES gospodarcze_zadania(id),
    rejestracja  VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_goszadrej_zadanie_id ON gospodarcze_zadania_rejestracje(zadanie_id);

-- ============================================================
-- 9. TABELA: gospodarcze_wykonania_rejestracje
-- ============================================================
CREATE TABLE IF NOT EXISTS gospodarcze_wykonania_rejestracje (
    id              SERIAL PRIMARY KEY,
    wykonanie_id    INT NOT NULL REFERENCES gospodarcze_wykonania(id),
    rejestracja_id  INT NOT NULL REFERENCES gospodarcze_zadania_rejestracje(id),
    wykonano        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_goswykrej_wykonanie_id ON gospodarcze_wykonania_rejestracje(wykonanie_id);

-- ============================================================
-- 10. TABELA: gospodarcze_rejestracje_dzienne — codzienne rejestracje
--     dla CYKLICZNYCH zadan gospodarczych (np. "Sprzatanie") - lista
--     numerow NA DANY DZIEN, ktora NIE przechodzi z dnia na dzien -
--     kazdy dzien wpisuje sie od nowa (patrz PUT
--     /api/gospodarcze/:id/rejestracje-dzisiaj).
-- ============================================================
CREATE TABLE IF NOT EXISTS gospodarcze_rejestracje_dzienne (
    id            SERIAL PRIMARY KEY,
    zadanie_id    INT NOT NULL REFERENCES gospodarcze_zadania(id) ON DELETE CASCADE,
    data          DATE NOT NULL,
    rejestracje   VARCHAR(1000) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_gosrejdzien_zadanie_data
    ON gospodarcze_rejestracje_dzienne(zadanie_id, data);

-- ============================================================
-- 11. TABELA: powiadomienia_odbiorcy — uzytkownicy (szef/kierownik)
--     ktorzy otrzymuja mail o zakonczonych robotach/zadaniach
-- ============================================================
CREATE TABLE IF NOT EXISTS powiadomienia_odbiorcy (
    id       SERIAL PRIMARY KEY,
    user_id  INT NOT NULL UNIQUE REFERENCES users(id)
);

-- ============================================================
-- 12. TABELA: dalsze_kroki_odbiorcy — recznie wybierani odbiorcy per typ
--     (zachowana dla wstecznej kompatybilnosci danych - logika
--     przydzielania obecnie wybiera mechanika automatycznie, patrz
--     backend/routes/followup.js)
-- ============================================================
CREATE TABLE IF NOT EXISTS dalsze_kroki_odbiorcy (
    id       SERIAL PRIMARY KEY,
    typ      VARCHAR(20) NOT NULL
        CONSTRAINT ck_dko_typ CHECK (typ IN ('wyposazenie_inspecto', 'mycie')),
    user_id  INT NOT NULL REFERENCES users(id)
);

-- ============================================================
-- 13. TABELA: zadania_po_naprawie — "dalsze kroki" (Wyposazenie+Inspecto
--     / Mycie) automatycznie tworzone po zakonczeniu roboty (patrz
--     backend/routes/followup.js)
-- ============================================================
CREATE TABLE IF NOT EXISTS zadania_po_naprawie (
    id                SERIAL PRIMARY KEY,
    job_id            INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    typ               VARCHAR(20) NOT NULL
        CONSTRAINT ck_zpn_typ CHECK (typ IN ('wyposazenie_inspecto', 'mycie')),
    user_id           INT NOT NULL REFERENCES users(id),
    wykonano          BOOLEAN NOT NULL DEFAULT FALSE,
    data_utworzenia   TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_wykonania    TIMESTAMPTZ NULL
);

-- ============================================================
-- 14. DANE POCZATKOWE — predefiniowane prace (93 pozycje, czasy
--     normatywne). Wczytywane z osobnego pliku (dla czytelnosci).
--     Uwaga: od v34 NIE seedujemy juz tu zadnych kont uzytkownikow
--     ani przykladowych danych (auto/zlecenie/zadania gospodarcze) -
--     aplikacja dziala juz na prawdziwym serwerze z prawdziwymi danymi.
--     Nowe konto uzytkownika dodajesz komenda: node create-user.js
--     (patrz backend/create-user.js).
-- ============================================================
\ir predefiniowane_prace_seed.sql
