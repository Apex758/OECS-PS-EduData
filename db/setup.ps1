# =====================================================================
# SETUP  --  stand up the student_demo database (idempotent)
# =====================================================================
#   1. create database student_demo (if missing)
#   2. create/alter role app_client with password from .env.local
#   3. run schema.sql  (tables + grants)
#   4. run policies.sql (RLS)
#   5. run seed.mjs    (demo data, via node + pg)
# Uses the superuser password from db/.superuser-password.txt.
# =====================================================================
# NOTE: do NOT use ErrorActionPreference=Stop here -- psql writes harmless
# NOTICEs to stderr which PowerShell would otherwise treat as terminating.
# Real SQL errors are caught via ON_ERROR_STOP=1 + $LASTEXITCODE checks.
$ErrorActionPreference = "Continue"
$Bin   = "C:\Program Files\PostgreSQL\17\bin"
$Psql  = "$Bin\psql.exe"
$Root  = Split-Path $PSScriptRoot -Parent

# ---- secrets ----
$superPw = (Get-Content (Join-Path $PSScriptRoot ".superuser-password.txt") -Raw).Trim()
$envText = Get-Content (Join-Path $Root ".env.local")
$appPw   = ($envText | Where-Object { $_ -match '^APP_CLIENT_PASSWORD=' }) -replace '^APP_CLIENT_PASSWORD=',''
if (-not $appPw) { Write-Error "APP_CLIENT_PASSWORD not found in .env.local"; exit 1 }

$env:PGPASSWORD = $superPw
function Psql([string]$db, [string]$sql)  { & $Psql -U postgres -h localhost -w -d $db -v ON_ERROR_STOP=1 -c $sql }
function PsqlF([string]$db, [string]$file){ & $Psql -U postgres -h localhost -w -d $db -v ON_ERROR_STOP=1 -f $file; if ($LASTEXITCODE -ne 0) { Write-Error "psql failed on $file"; exit 1 } }
function PsqlScalar([string]$db, [string]$sql) { $r = & $Psql -U postgres -h localhost -w -t -A -d $db -c $sql; return ("$r").Trim() }

# 1. database
$exists = PsqlScalar "postgres" "select 1 from pg_database where datname='student_demo'"
if ($exists -ne "1") { Psql "postgres" "create database student_demo" | Out-Null; Write-Host "created database student_demo" }
else { Write-Host "database student_demo already exists" }

# 2. role (create or update password)
$roleExists = PsqlScalar "postgres" "select 1 from pg_roles where rolname='app_client'"
if ($roleExists -ne "1") { Psql "postgres" "create role app_client login password '$appPw'" | Out-Null; Write-Host "created role app_client" }
else { Psql "postgres" "alter role app_client login password '$appPw'" | Out-Null; Write-Host "updated role app_client password" }

# 3 + 4. schema + policies
PsqlF "student_demo" (Join-Path $PSScriptRoot "schema.sql")
Write-Host "applied schema.sql"
PsqlF "student_demo" (Join-Path $PSScriptRoot "policies.sql")
Write-Host "applied policies.sql"
PsqlF "student_demo" (Join-Path $PSScriptRoot "functions.sql")
Write-Host "applied functions.sql"
# additive ingest layer (school_api_keys, student_mapping, students.identity_hash)
PsqlF "student_demo" (Join-Path $PSScriptRoot "ingest.sql")
Write-Host "applied ingest.sql"
# additive Google Sheets layer (school_sheets registry for the cron pull)
PsqlF "student_demo" (Join-Path $PSScriptRoot "sheets.sql")
Write-Host "applied sheets.sql"
# additive value-alias layer (admin-approved enum normalizations)
PsqlF "student_demo" (Join-Path $PSScriptRoot "value-aliases.sql")
Write-Host "applied value-aliases.sql"
# additive uploader-submitted alias suggestions + notification + room scope
PsqlF "student_demo" (Join-Path $PSScriptRoot "pending-aliases.sql")
Write-Host "applied pending-aliases.sql"
PsqlF "student_demo" (Join-Path $PSScriptRoot "pending-aliases-notify.sql")
Write-Host "applied pending-aliases-notify.sql"
PsqlF "student_demo" (Join-Path $PSScriptRoot "pending-aliases-scope.sql")
Write-Host "applied pending-aliases-scope.sql"
# additive per-institution drill-down toggle (schools.can_drill + students policy)
PsqlF "student_demo" (Join-Path $PSScriptRoot "drilldown.sql")
Write-Host "applied drilldown.sql"

# 5. seed (node, superuser conn bypasses RLS)
$env:SEED_DATABASE_URL = "postgres://postgres:$superPw@localhost:5432/student_demo"
Push-Location $Root
node (Join-Path $PSScriptRoot "seed.mjs")
Pop-Location

Write-Host "SETUP COMPLETE"
