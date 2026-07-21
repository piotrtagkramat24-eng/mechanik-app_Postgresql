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


-- ============================================================
-- 2. TABELA: cars (samochody i naczepy przyjete do warsztatu)
-- ============================================================


-- ============================================================
-- 3. TABELA: predefiniowane_prace (nazwa + domyslne czasy min/sredni/max w godzinach)
-- ============================================================


-- ============================================================
-- 4. TABELA: jobs (zlecenia / roboty)
-- ============================================================


-- ============================================================
-- 5. TABELA: job_czynnosci — lista czynnosci skladajacych sie na jedno
--    zlecenie (moze ich byc kilka, np. kilka predefiniowanych prac
--    dodanych naraz, albo dopisanych pozniej przez mechanika w trakcie
--    realizacji). jobs.opis pozostaje jako krotkie podsumowanie (do
--    widoku listy/karty), a jobs.czas_szacowany_min/sredni/max sa
--    liczone jako SUMA z tej tabeli (patrz zapytania w routes/jobs.js).
--    Kazda czynnosc ma WLASNY status i wlasny pasek postepu.
-- ============================================================


-- ============================================================
-- 6. TABELA: gospodarcze_zadania (zadania pracownikow gospodarczych)
-- ============================================================


-- ============================================================
-- 7. TABELA: gospodarcze_wykonania (historia wykonan zadan)
-- ============================================================


-- ============================================================
-- 8. TABELA: gospodarcze_zadania_rejestracje — numery rejestracyjne
--    przypisane do zadan gospodarczych (checkbox "Dodaj numery
--    rejestracyjne" przy tworzeniu zadania; pracownik gospodarczy
--    zaznacza Wykonano/Nie wykonano dla kazdego numeru osobno)
-- ============================================================


-- ============================================================
-- 9. TABELA: gospodarcze_wykonania_rejestracje
-- ============================================================


-- ============================================================
-- 10. TABELA: gospodarcze_rejestracje_dzienne — codzienne rejestracje
--     dla CYKLICZNYCH zadan gospodarczych (np. "Sprzatanie") - lista
--     numerow NA DANY DZIEN, ktora NIE przechodzi z dnia na dzien -
--     kazdy dzien wpisuje sie od nowa (patrz PUT
--     /api/gospodarcze/:id/rejestracje-dzisiaj).
-- ============================================================


-- ============================================================
-- 11. TABELA: powiadomienia_odbiorcy — uzytkownicy (szef/kierownik)
--     ktorzy otrzymuja mail o zakonczonych robotach/zadaniach
-- ============================================================


-- ============================================================
-- 12. TABELA: dalsze_kroki_odbiorcy — recznie wybierani odbiorcy per typ
--     (zachowana dla wstecznej kompatybilnosci danych - logika
--     przydzielania obecnie wybiera mechanika automatycznie, patrz
--     backend/routes/followup.js)
-- ============================================================


-- ============================================================
-- 13. TABELA: zadania_po_naprawie — "dalsze kroki" (Wyposazenie+Inspecto
--     / Mycie) automatycznie tworzone po zakonczeniu roboty (patrz
--     backend/routes/followup.js)
-- ============================================================


-- ============================================================
-- 14. DANE POCZATKOWE — uzytkownicy (haslo dla wszystkich: 1234)
-- ============================================================


-- ============================================================
-- 15. DANE POCZATKOWE — przykladowy samochod i zlecenie
-- ============================================================


-- ============================================================
-- 16. DANE POCZATKOWE — zadania gospodarczego (cykliczne i jednorazowe)
--     nastepny_termin = dzisiaj oznacza "aktywne od dzisiaj", dzieki
--     czemu pracownik od razu widzi zadania do wykonania.
-- ============================================================


-- ============================================================
-- 17. DANE POCZATKOWE — predefiniowane prace (93 pozycje, czasy
--     normatywne). Wczytywane z osobnego pliku (dla czytelnosci).
-- ============================================================
\ir predefiniowane_prace_seed.sql
