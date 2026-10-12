<#
.SYNOPSIS
  Rejestruje w Harmonogramie zadan Windows codzienne, automatyczne
  uruchamianie backup-db.ps1 (domyslnie o 3:00 w nocy).

.DESCRIPTION
  Uruchom RAZ (jako Administrator), zeby wlaczyc automatyczne codzienne
  backupy. Mozna uruchomic ponownie w kazdej chwili, zeby np. zmienic
  godzine - nadpisze istniejace zadanie o tej samej nazwie.

  Zeby sprawdzic / recznie uruchomic / wylaczyc zadanie pozniej:
    Get-ScheduledTask -TaskName "Mechanik-Backup-DB"
    Start-ScheduledTask -TaskName "Mechanik-Backup-DB"
    Unregister-ScheduledTask -TaskName "Mechanik-Backup-DB"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup-backup-schedule.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup-backup-schedule.ps1 -Godzina "02:30"
#>

param(
    [string]$Godzina = "03:00"
)

$NazwaZadania = "Mechanik-Backup-DB"
$SkryptBackup = Join-Path $PSScriptRoot 'backup-db.ps1'

if (-not (Test-Path $SkryptBackup)) {
    Write-Error "Nie znaleziono $SkryptBackup"
    exit 1
}

$akcja = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$SkryptBackup`""

$wyzwalacz = New-ScheduledTaskTrigger -Daily -At $Godzina

$ustawienia = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
    -TaskName $NazwaZadania `
    -Action $akcja `
    -Trigger $wyzwalacz `
    -Settings $ustawienia `
    -Description "Codzienny pelny backup bazy danych aplikacji Warsztat (pg_dump) do C:\Backups\mechanik-app-db" `
    -User $env:USERNAME `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "Zarejestrowano zadanie '$NazwaZadania' - codziennie o godzinie $Godzina." -ForegroundColor Green
Write-Host "Sprawdz w Harmonogramie zadan Windows (taskschd.msc) albo komenda:"
Write-Host "  Get-ScheduledTask -TaskName `"$NazwaZadania`""
