# =====================================================================
# SETUP  --  apply the schema to a SUPABASE project, then seed
# =====================================================================
# Runs every migration file against the Supabase DIRECT connection, then
# seeds demo data. No local Postgres, no app_client role -- Supabase provides
# the `authenticated` / `service_role` roles the app uses.
#
#   1. read SEED_DATABASE_URL (Supabase direct connection) from .env.local
#   2. psql -f each file IN ORDER (functions before policies: the RLS policies
#      call app_current_user(); rpc/staff after the layers they reference)
#   3. node db/seed.mjs (demo data, via pg over the same connection)
#
# Requires the psql client (any recent PostgreSQL install).
# =====================================================================
# NOTE: psql writes harmless NOTICEs to stderr; ON_ERROR_STOP=1 + $LASTEXITCODE
# catch real SQL errors, so don't use ErrorActionPreference=Stop here.
$ErrorActionPreference = "Continue"
$Bin  = "C:\Program Files\PostgreSQL\17\bin"
$Psql = "$Bin\psql.exe"
$Root = Split-Path $PSScriptRoot -Parent

# ---- connection (Supabase direct connection string) ----
$envText = Get-Content (Join-Path $Root ".env.local")
$dbUrl = (($envText | Where-Object { $_ -match '^SEED_DATABASE_URL=' }) -replace '^SEED_DATABASE_URL=','').Trim().Trim('"')
if (-not $dbUrl) { Write-Error "SEED_DATABASE_URL not found in .env.local"; exit 1 }

function PsqlF([string]$file) {
  & $Psql $dbUrl -v ON_ERROR_STOP=1 -f $file
  if ($LASTEXITCODE -ne 0) { Write-Error "psql failed on $file"; exit 1 }
}

# Order matters: functions.sql defines app_current_user()/can_drill_school()
# used by policies.sql + staff.sql; rpc.sql references the additive ingest/
# alias/sheet tables, so it runs after them.
$files = @(
  "schema.sql",
  "functions.sql",
  "policies.sql",
  "ingest.sql",
  "sheets.sql",
  "value-aliases.sql",
  "pending-aliases.sql",
  "pending-aliases-notify.sql",
  "pending-aliases-scope.sql",
  "rpc.sql",
  "drilldown.sql",
  "staff.sql"
)
foreach ($f in $files) {
  PsqlF (Join-Path $PSScriptRoot $f)
  Write-Host "applied $f"
}

# ---- seed (node + pg, direct connection, bypasses RLS) ----
$env:SEED_DATABASE_URL = $dbUrl
Push-Location $Root
node (Join-Path $PSScriptRoot "seed.mjs")
Pop-Location

Write-Host "SETUP COMPLETE"
