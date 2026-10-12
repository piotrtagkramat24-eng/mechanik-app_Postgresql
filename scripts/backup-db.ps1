<#
.SYNOPSIS
  Pelny, samodzielny zrzut (pg_dump) bazy PostgreSQL (Aiven) do pliku
  lokalnego, gotowy do zaimportowania na DOWOLNY inny serwer PostgreSQL.

.DESCRIPTION
  Kazde uruchomienie robi PELNY zrzut calej bazy (nie przyrostowy) - kazdy
  plik jest w 100% samodzielny i sam w sobie wystarcza do odtworzenia calej
  bazy od zera, bez zaleznosci od innych plikow/wczesniejszych backupow.
  Pierwsze uruchomienie = pelny backup. Kazde kolejne (np. raz dziennie przez
  Harmonogram zadan Windows - patrz setup-backup-schedule.ps1) = tez swiezy,
  pelny backup z aktualnym stanem bazy.

  Celowo NIE jest to "prawdziwy" incremental backup (tylko zmiany od
  ostatniego razu) - taki wymagalby ciagu WSZYSTKICH przyrostow od ostatniego
  pelnego backupu, zeby cokolwiek odtworzyc, a pojedynczy uszkodzony/
  zgubiony plik w tym lancuchu niszczy mozliwosc odtworzenia reszty. Przy tej
  skali bazy (maly warsztat) pelny zrzut codziennie zajmuje sekundy i
  pojedyncze MB, wiec nie ma powodu brac na siebie tego ryzyka.

  Dane polaczenia czytane sa z backend\.env (ten sam plik, ktorego uzywa
  aplikacja) - haslo NIGDY nie jest zapisywane w tym skrypcie ani w logu.

  Stare backupy (domyslnie starsze niz $RetentionDays dni) sa kasowane
  automatycznie PO udanym biezacym backupie, zeby folder nie rosl bez
  ograniczen. Jesli biezacy backup sie NIE powiedzie, stare pliki NIE sa
  ruszane (nie chcemy akurat wtedy zmniejszac historii).

.NOTES
  Wymaga pg_dump.exe (PostgreSQL client tools, sa juz zainstalowane na tym
  komputerze: C:\Program Files\PostgreSQL\18\bin\pg_dump.exe). Skrypt szuka
  go automatycznie; w razie problemu ustaw $PgDumpPath recznie ponizej.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backup-db.ps1
#>

# ============================================================
# KONFIGURACJA - dostosuj w razie potrzeby
# ============================================================
$BackupDir     = 'C:\Backups\mechanik-app-db'
$RetentionDays = 30
$EnvFile       = Join-Path $PSScriptRoot '..\backend\.env'
$PgDumpPath    = $null  # $null = szukaj automatycznie; albo wpisz pelna sciezke do pg_dump.exe

# ============================================================
# Znajdz pg_dump.exe
# ============================================================
if (-not $PgDumpPath) {
    $zPath = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
    $zProgramFiles = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    $PgDumpPath = @($zPath, $zProgramFiles) | Where-Object { $_ } | Select-Object -First 1
}
if (-not $PgDumpPath -or -not (Test-Path $PgDumpPath)) {
    Write-Error "Nie znaleziono pg_dump.exe. Zainstaluj klienta PostgreSQL albo ustaw `$PgDumpPath na poczatku skryptu."
    exit 1
}

# ============================================================
# Wczytaj dane polaczenia z backend\.env
# ============================================================
if (-not (Test-Path $EnvFile)) {
    Write-Error "Nie znaleziono pliku .env: $EnvFile"
    exit 1
}

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') {
        $envVars[$matches[1]] = $matches[2]
    }
}

$PgHostVal = $envVars['PGHOST']
$PgPort    = $envVars['PGPORT']
$PgDb      = $envVars['PGDATABASE']
$PgUser    = $envVars['PGUSER']
$PgPass    = $envVars['PGPASSWORD']
$PgSsl     = $envVars['PGSSL']

if (-not $PgHostVal -or -not $PgDb -or -not $PgUser -or -not $PgPass) {
    Write-Error "Brakuje danych polaczenia (PGHOST/PGDATABASE/PGUSER/PGPASSWORD) w $EnvFile"
    exit 1
}
if (-not $PgPort) { $PgPort = '5432' }

# ============================================================
# Przygotowanie
# ============================================================
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$znacznikCzasu = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$sqlFile = Join-Path $BackupDir "mechanik-db_$znacznikCzasu.sql"
$zipFile = Join-Path $BackupDir "mechanik-db_$znacznikCzasu.zip"
$logFile = Join-Path $BackupDir 'backup.log'

function Zapisz-Log {
    param([string]$Wiadomosc)
    $linia = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Wiadomosc
    Add-Content -Path $logFile -Value $linia -Encoding UTF8
    Write-Host $linia
}

Zapisz-Log "Start backupu -> $sqlFile"

# ============================================================
# pg_dump
# ============================================================
$udalo = $false
$env:PGPASSWORD  = $PgPass
$env:PGSSLMODE   = if ($PgSsl -eq 'true') { 'require' } else { 'prefer' }
try {
    $pgArgs = @(
        '-h', $PgHostVal,
        '-p', $PgPort,
        '-U', $PgUser,
        '-d', $PgDb,
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        '-f', $sqlFile
    )

    $output = & $PgDumpPath @pgArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Zapisz-Log "BLAD pg_dump (kod wyjscia $exitCode): $($output -join ' | ')"
    } elseif (-not (Test-Path $sqlFile) -or (Get-Item $sqlFile).Length -eq 0) {
        Zapisz-Log "BLAD: plik wynikowy jest pusty lub nie zostal utworzony."
    } else {
        $rozmiarSql = (Get-Item $sqlFile).Length
        Zapisz-Log ("pg_dump OK, rozmiar SQL: {0} MB" -f [math]::Round($rozmiarSql / 1MB, 2))

        Compress-Archive -Path $sqlFile -DestinationPath $zipFile -Force
        Remove-Item $sqlFile -Force

        $rozmiarZip = (Get-Item $zipFile).Length
        Zapisz-Log ("Backup zakonczony sukcesem -> {0} ({1} MB)" -f $zipFile, [math]::Round($rozmiarZip / 1MB, 2))
        $udalo = $true
    }
} catch {
    Zapisz-Log "BLAD: $($_.Exception.Message)"
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
}

# ============================================================
# Czyszczenie starych backupow - TYLKO po udanym biezacym backupie
# ============================================================
if ($udalo) {
    $graniczna = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem -Path $BackupDir -Filter 'mechanik-db_*.zip' |
        Where-Object { $_.LastWriteTime -lt $graniczna } |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Zapisz-Log "Usunieto stary backup (starszy niz $RetentionDays dni): $($_.Name)"
        }
}

Zapisz-Log "Zakonczono (sukces: $udalo)."

if (-not $udalo) { exit 1 }
