<#
.SYNOPSIS
  Odtwarza baze z pliku backupu (stworzonego przez backup-db.ps1) na
  DOWOLNYM serwerze PostgreSQL - np. gdy baza na Aiven padnie/przestanie
  istniec i trzeba ja postawic gdzie indziej.

.DESCRIPTION
  Plik backupu zawiera "--clean --if-exists" - oznacza to, ze PRZED
  odtworzeniem kazdej tabeli/obiektu najpierw probuje go USUNAC, jesli juz
  istnieje. Jest to BEZPIECZNE i oczekiwane dla docelowej, swiezej/pustej
  bazy, ale NIE uruchamiaj tego na serwerze, na ktorym jest juz COS INNEGO
  wartosciowego w tej samej bazie danych - zostanie nadpisane/usuniete.

  Skrypt pyta o dane docelowego serwera interaktywnie (albo podaj je jako
  parametry), prosi o potwierdzenie przed faktycznym wykonaniem, i nigdy
  nie zapisuje hasla docelowego serwera na dysku.

.PARAMETER BackupFile
  Sciezka do pliku backupu (.zip z backup-db.ps1, albo .sql). Jesli
  pominiesz, uzyty zostanie NAJNOWSZY plik .zip z C:\Backups\mechanik-app-db.

.PARAMETER TargetHost
  Adres NOWEGO serwera PostgreSQL, na ktory odtwarzasz baze.

.PARAMETER TargetPort
  Port nowego serwera (domyslnie 5432).

.PARAMETER TargetDb
  Nazwa bazy danych na nowym serwerze - MUSI juz istniec (np. utworzona
  recznie: CREATE DATABASE mechanikapp;) i powinna byc PUSTA albo
  przeznaczona do nadpisania.

.PARAMETER TargetUser
  Uzytkownik nowego serwera (z uprawnieniami do tworzenia tabel w $TargetDb).

.PARAMETER TargetSsl
  'require' jesli nowy serwer tez wymaga SSL (np. inny hosting w chmurze),
  albo 'prefer'/'disable' dla lokalnego/bez SSL. Domyslnie 'prefer'.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File restore-db.ps1
  (zapyta o wszystko interaktywnie, uzyje najnowszego backupu)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File restore-db.ps1 -BackupFile "C:\Backups\mechanik-app-db\mechanik-db_2026-10-12_15-07.zip" -TargetHost "nowy-serwer.example.com" -TargetDb "mechanikapp" -TargetUser "postgres"
#>

param(
    [string]$BackupFile,
    [string]$TargetHost,
    [string]$TargetPort = '5432',
    [string]$TargetDb,
    [string]$TargetUser,
    [string]$TargetSsl = 'prefer'
)

$DefaultBackupDir = 'C:\Backups\mechanik-app-db'

# ============================================================
# Znajdz psql.exe
# ============================================================
$PsqlPath = (Get-Command psql.exe -ErrorAction SilentlyContinue).Source
if (-not $PsqlPath) {
    $PsqlPath = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $PsqlPath -or -not (Test-Path $PsqlPath)) {
    Write-Error "Nie znaleziono psql.exe. Zainstaluj klienta PostgreSQL."
    exit 1
}

# ============================================================
# Wybierz plik backupu
# ============================================================
if (-not $BackupFile) {
    $najnowszy = Get-ChildItem -Path $DefaultBackupDir -Filter 'mechanik-db_*.zip' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $najnowszy) {
        Write-Error "Nie podano -BackupFile i nie znaleziono zadnego backupu w $DefaultBackupDir."
        exit 1
    }
    $BackupFile = $najnowszy.FullName
    Write-Host "Uzyto najnowszego backupu: $BackupFile"
}
if (-not (Test-Path $BackupFile)) {
    Write-Error "Nie znaleziono pliku: $BackupFile"
    exit 1
}

# ============================================================
# Rozpakuj, jesli to .zip
# ============================================================
$sqlFile = $BackupFile
$tempDir = $null
if ($BackupFile -match '\.zip$') {
    $tempDir = Join-Path $env:TEMP ("mechanik-restore-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    Expand-Archive -Path $BackupFile -DestinationPath $tempDir -Force
    $sqlFile = Get-ChildItem -Path $tempDir -Filter '*.sql' | Select-Object -First 1 -ExpandProperty FullName
    if (-not $sqlFile) {
        Write-Error "W archiwum $BackupFile nie znaleziono pliku .sql."
        Remove-Item $tempDir -Recurse -Force
        exit 1
    }
}

# ============================================================
# Dane docelowego serwera (interaktywnie, jesli nie podano jako parametry)
# ============================================================
if (-not $TargetHost) { $TargetHost = Read-Host "Adres NOWEGO serwera PostgreSQL (host)" }
if (-not $TargetDb)   { $TargetDb   = Read-Host "Nazwa bazy danych na nowym serwerze (musi juz istniec)" }
if (-not $TargetUser) { $TargetUser = Read-Host "Uzytkownik nowego serwera" }
$TargetPassSecure = Read-Host "Haslo dla $TargetUser@${TargetHost}:${TargetPort}/$TargetDb" -AsSecureString
$TargetPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TargetPassSecure)
)

# ============================================================
# Potwierdzenie - ta operacja kasuje/nadpisuje obiekty w docelowej bazie
# ============================================================
Write-Host ""
Write-Host "=== PODSUMOWANIE ===" -ForegroundColor Yellow
Write-Host "Plik:   $sqlFile"
Write-Host "Cel:    $TargetUser@${TargetHost}:${TargetPort}/$TargetDb"
Write-Host ""
Write-Host "UWAGA: ten dump zaczyna sie od DROP (--clean --if-exists) dla kazdej" -ForegroundColor Yellow
Write-Host "tabeli/obiektu z osobna - wszystko co juz jest w bazie '$TargetDb'" -ForegroundColor Yellow
Write-Host "o tych samych nazwach zostanie NADPISANE." -ForegroundColor Yellow
Write-Host ""
$potwierdzenie = Read-Host "Wpisz TAK, aby kontynuowac"
if ($potwierdzenie -ne 'TAK') {
    Write-Host "Przerwano."
    if ($tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    exit 0
}

# ============================================================
# Odtworzenie
# ============================================================
$env:PGPASSWORD = $TargetPassPlain
$env:PGSSLMODE  = $TargetSsl
try {
    $psqlArgs = @(
        '-h', $TargetHost,
        '-p', $TargetPort,
        '-U', $TargetUser,
        '-d', $TargetDb,
        '-v', 'ON_ERROR_STOP=0',
        '-f', $sqlFile
    )
    & $PsqlPath @psqlArgs
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "Odtworzenie zakonczone." -ForegroundColor Green
        Write-Host "Zweryfikuj dane (np. SELECT COUNT(*) na kilku tabelach) przed przelaczeniem aplikacji na ten serwer." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "psql zakonczyl sie kodem $exitCode - sprawdz powyzsze komunikaty (kilka ostrzezen o \restrict/\unrestrict jest nieszkodliwych na starszym psql)." -ForegroundColor Red
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
    $TargetPassPlain = $null
    if ($tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
