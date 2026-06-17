# =====================================================================
# RESET the postgres superuser password (run ELEVATED / as Administrator)
# =====================================================================
# Postgres passwords are hashed and cannot be retrieved, only reset.
# This script:
#   1. backs up pg_hba.conf
#   2. flips local/host auth to `trust` (passwordless), restarts service
#   3. sets a NEW generated superuser password
#   4. restores pg_hba.conf as `scram-sha-256` (more secure), restarts
#   5. writes the new password to db/.superuser-password.txt
# Net: known superuser password, auth left MORE secure than before.
# =====================================================================
$ErrorActionPreference = "Stop"

$PgVer   = "17"
$Base    = "C:\Program Files\PostgreSQL\$PgVer"
$Data    = "$Base\data"
$Psql    = "$Base\bin\psql.exe"
$Hba     = "$Data\pg_hba.conf"
$Service = "postgresql-x64-$PgVer"
$Root    = Split-Path $PSScriptRoot -Parent
$PwFile  = Join-Path $PSScriptRoot ".superuser-password.txt"
$Log     = Join-Path $PSScriptRoot "reset-log.txt"

function Log($m) { $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m; Write-Host $line; Add-Content -Path $Log -Value $line }

# must be elevated
$elevated = (New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $elevated) { Write-Error "Run this script as Administrator (right-click PowerShell -> Run as Administrator)."; exit 1 }

Set-Content -Path $Log -Value "reset run $(Get-Date)"

# generate new password (alphanumeric, no shell-hostile chars)
Add-Type -AssemblyName System.Web
$NewPw = ([System.Web.Security.Membership]::GeneratePassword(24,4)) -replace '[^A-Za-z0-9]','X'
Log "generated new superuser password"

# 1. backup pg_hba
$backup = "$Hba.bak-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $Hba $backup -Force
Log "backed up pg_hba.conf -> $backup"

# helper: rewrite the auth METHOD (last token) on local/host lines
function Set-HbaAuth($method) {
  $out = Get-Content $Hba | ForEach-Object {
    if ($_ -match '^\s*(local|host)\s' -and $_ -notmatch '^\s*#') {
      $_ -replace '(?<=\s)(trust|md5|scram-sha-256|password|peer|ident|reject)\s*$', $method
    } else { $_ }
  }
  Set-Content -Path $Hba -Value $out -Encoding ascii
}

try {
  # 2. trust + restart
  Set-HbaAuth "trust"
  Log "pg_hba -> trust; restarting $Service"
  Restart-Service $Service -Force
  Start-Sleep -Seconds 2

  # 3. set new password (passwordless connect)
  $env:PGPASSWORD = ""
  & $Psql -U postgres -h localhost -w -c "ALTER USER postgres PASSWORD '$NewPw';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ALTER USER failed" }
  Log "superuser password updated"
}
finally {
  # 4. ALWAYS restore secure auth, even on error
  Set-HbaAuth "scram-sha-256"
  Log "pg_hba -> scram-sha-256; restarting $Service"
  Restart-Service $Service -Force
  Start-Sleep -Seconds 2
}

# 5. save + verify
Set-Content -Path $PwFile -Value $NewPw -Encoding ascii
$env:PGPASSWORD = $NewPw
$check = & $Psql -U postgres -h localhost -w -t -c "select 'OK ' || current_user;"
Log "verify connect: $($check.Trim())"
Log "DONE. New superuser password saved to: $PwFile"
Write-Host ""
Write-Host "New postgres password: $NewPw"
