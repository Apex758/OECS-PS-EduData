# Setup Recipes

> Step-by-step setup procedures for this project. **Add new recipes here**
> (you or another chat) whenever a new service/integration needs configuring,
> so they're never lost in chat history. Architecture/explanations live in
> [HANDOFF.md](HANDOFF.md); this file is just "how to set X up".

Recipes:
1. [Auth0 SSO](#1-auth0-sso)
2. [Database bootstrap](#2-database-bootstrap)
3. [Database schema & porting to another DB](#3-database-schema--porting-to-another-db)
4. [Reset a forgotten Postgres password](#4-reset-a-forgotten-postgres-password)
5. [Issue a school API key](#5-issue-a-school-api-key)
6. [Environment variables](#6-environment-variables)
7. [Google Sheets ingest (service account + cron)](#7-google-sheets-ingest)
8. [Admin portal](#8-admin-portal)
9. [Deploy to Vercel + Neon](#9-deploy-to-vercel--neon)

---

## 1. Auth0 SSO

Goal: real OAuth2/OIDC login with access + refresh tokens, brokered by Auth0.
Wired via Auth.js (NextAuth v5); provider id is `auth0`.

**A. Create the Auth0 application**
1. Sign in at https://manage.auth0.com → pick (or create) a tenant.
2. **Applications → Applications → Create Application**.
   - Name: `oecs-postsec-edudata`. Type: **Regular Web Application** → Create.
   - (If asked for tech, pick Next.js / skip the quickstart.)
3. Open the app's **Settings** tab and set:
   - **Allowed Callback URLs:** `http://localhost:3000/api/auth/callback/auth0`
   - **Allowed Logout URLs:** `http://localhost:3000`
   - **Allowed Web Origins:** `http://localhost:3000`
   - Save changes.
4. From the same Settings page copy: **Domain**, **Client ID**, **Client Secret**.

**B. Enable refresh tokens** (so the token panel can show one)
5. Same app → **Settings → Advanced Settings → Grant Types** → ensure
   **Refresh Token** is checked. Save.
6. The app already requests the `offline_access` scope (in `auth.js`); Auth0
   returns a refresh token when that scope + grant type are enabled.

**C. (Optional) Add Google as a login option**
7. **Authentication → Social → Create Connection → Google** → enable it for
   this application. Users can then "Continue with Google" through Auth0.

**D. Decide who can log in / map roles**
8. Login email must match a row in `app_users` to get a role. Either tell the
   AI your 3 emails + roles to seed them, or create the users in
   **Auth0 → User Management → Users**.

**E. Fill `.env.local`**
```
AUTH0_ISSUER=https://YOUR_TENANT.us.auth0.com   # = "https://" + Domain
AUTH0_CLIENT_ID=<Client ID>
AUTH0_CLIENT_SECRET=<Client Secret>
AUTH_SECRET=<run: npx auth secret>
```
> `AUTH0_ISSUER` is `https://` + the **Domain** value (e.g.
> `https://dev-ab12cd.us.auth0.com`). No trailing slash.

**F. Restart `npm run dev`** (env changes need a restart). Go to the
**Access (RLS)** tab → **Sign in with Auth0**.

---

## 2. Database bootstrap

Stands up the `student_demo` Postgres DB: schema → RLS policies → functions →
ingest tables → demo seed. Idempotent (wipes + reseeds each run).

```powershell
db\setup.ps1
```
- Needs `db/.superuser-password.txt` (created by the reset recipe below).
- App then connects with the `app_client` login from `.env.local`.

## 3. Database schema & porting to another DB

The schema lives in **two forms** — edit the source files; use the single file
to read/port the whole thing at once.

**Editable source (run-order; `db/setup.ps1` applies all of these):**

| File | Builds |
|------|--------|
| `db/schema.sql` | tables + indexes + `app_client` grants |
| `db/policies.sql` | row-level security policies |
| `db/functions.sql` | identity lookup functions (`SECURITY DEFINER`) |
| `db/ingest.sql` | `school_api_keys`, `student_mapping`, `students.identity_hash` |
| `db/sheets.sql` | `school_sheets` registry (Google Sheets to pull on cron) |
| `db/value-aliases.sql` | `value_aliases` table (admin-approved enum normalizations) |
| `db/drilldown.sql` | per-school `can_drill` toggle + updated students policy (migration; redundant on fresh install) |

To **update** the schema: edit the relevant file above, then re-run
`db\setup.ps1` (drops + rebuilds + reseeds). Keep [HANDOFF.md](HANDOFF.md) in sync.

**Single consolidated file (the whole schema in one place):**

- `db/full-schema.sql` — every table, index, policy, and function in one file.
  This is the easy-to-read / easy-to-port artifact.

Regenerate it any time from the live DB (so it never drifts):
```powershell
$env:PGPASSWORD = (Get-Content db\.superuser-password.txt -Raw).Trim()
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" `
  -U postgres -h localhost -w --schema-only --no-owner --no-privileges `
  -f db\full-schema.sql student_demo
```
Run it against a fresh Postgres to recreate the structure:
```powershell
psql -U postgres -h localhost -d <newdb> -f db\full-schema.sql
```
> `full-schema.sql` is structure only (no data, no role/grants). For a complete
> working setup including the `app_client` role + seed data, use `db\setup.ps1`.

**Porting to a non-Postgres database.** Most of the schema is standard SQL, but
some features are Postgres-specific. Translate these:

| Postgres construct | Used for | Port to... |
|--------------------|----------|------------|
| `serial` | auto PK ids | MySQL `AUTO_INCREMENT`, SQLite `INTEGER PRIMARY KEY`, SQL Server `IDENTITY` |
| `jsonb` | `students.metadata`, `student_mapping.sensitive` | MySQL `JSON`, SQLite `TEXT`, SQL Server `NVARCHAR(MAX)` |
| `timestamptz` | timestamps | MySQL `TIMESTAMP`/`DATETIME`, SQLite `TEXT`/`INTEGER` |
| partial unique index `... where identity_hash is not null` | idempotent ingest | SQLite supports it; **MySQL does not** (use a trigger or NULL-safe key) |
| **Row-Level Security** (`enable/force row level security`, `create policy`, `current_setting('app.*')`) | the access control | **No equivalent in MySQL/SQLite.** Enforce in the app layer (always `WHERE` by the user's scope) or via per-role views. SQL Server has its own RLS syntax. |
| `SECURITY DEFINER` functions + `set_config` | resolve identity before RLS | Drop if you drop RLS; otherwise rewrite per target DB |
| `do $$ ... $$` / dollar-quoting | scripting blocks | Use the target DB's procedural syntax |

> The single biggest porting cost is **RLS**. If the target DB has none, the
> row filtering currently done by Postgres must move into the query layer
> (`lib/db.js` `fetchScoped`) — every read gets an explicit `WHERE` on the
> user's role/country/school.

---

## 4. Reset a forgotten Postgres password

Postgres passwords are hashed (not recoverable), only resettable. This script
flips auth to trust, sets a new generated password, restores secure auth.

```powershell
# right-click PowerShell -> Run as Administrator, then:
db\reset-postgres-password.ps1
```
New password is written to `db/.superuser-password.txt`. Auth is left as
`scram-sha-256`.

## 5. Issue a school API key

Per-school push credential for `/api/ingest`. Prints the raw key once.

> `school_api_keys` is admin-RLS, so this needs the **superuser**
> connection (`SEED_DATABASE_URL`), not `app_client`. Or just use the
> [admin portal](#9-admin-portal).

```powershell
$env:SEED_DATABASE_URL = "postgres://postgres:<superpw>@localhost:5432/student_demo"
node db/gen-key.mjs <SCHOOL_CODE> "optional label"   # e.g. JM-S1
```
Only the SHA-256 hash is stored; copy the raw key into that school's config.

## 6. Environment variables

All in `.env.local` (gitignored):

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | App DB login (`app_client`). Use the **pooled** endpoint on Neon/Vercel. |
| `SEED_DATABASE_URL` | Superuser conn for `db/seed.mjs`, `db/gen-key.mjs`, `db/add-sheet.mjs` (bypasses RLS) |
| `APP_CLIENT_PASSWORD` | Same `app_client` password, read by `db/setup.ps1` |
| `PGSSL=disable` | Local PG has no TLS; remove for managed PG (Neon/Supabase) |
| `AUTH0_ISSUER` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 SSO |
| `AUTH_SECRET` | Auth.js session encryption (`npx auth secret`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Google Sheets ingest (recipe 7) |
| `CRON_SECRET` | Protects `/api/cron/sync-sheets` (recipe 7) |
| `ADMIN_SECRET` | Gate for the admin portal `/admin` (recipe 9) |

Generate any shared secret (`CRON_SECRET`, `ADMIN_SECRET`):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 7. Google Sheets ingest

Lets a school keep its own Google Sheet; a daily cron pulls it through the
same pipeline as `/api/ingest`. Uses a Google **service account** (no per-user
login).

**A. Create the service account**
1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Name it, create. Open it → **Keys → Add key → Create new key → JSON**.
   A JSON file downloads.

**B. Put the creds in env** (from the JSON)
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON>
GOOGLE_PRIVATE_KEY=<private_key from the JSON — keep the \n escapes on one line>
CRON_SECRET=<generate a long random string>
```

**C. Each school shares its sheet**
- Open the sheet → **Share** → add `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Viewer**.

**D. Register the sheet** (superuser conn, or use the [admin portal](#9-admin-portal))
```powershell
$env:SEED_DATABASE_URL = "postgres://postgres:<superpw>@localhost:5432/student_demo"
node db/add-sheet.mjs <SCHOOL_CODE> <SPREADSHEET_ID> "A:Z"
```
`<SPREADSHEET_ID>` is the long id in the URL:
`docs.google.com/spreadsheets/d/<THIS>/edit`. First row = headers.

**E. Test the pull by hand**
```powershell
curl https://<app>/api/cron/sync-sheets -H "Authorization: Bearer <CRON_SECRET>"
```
On Vercel, `vercel.json` runs it automatically (daily 02:00 UTC). The per-sheet
result is saved to `school_sheets.last_status`.

---

## 8. Admin portal

Manage ingest credentials without the CLI.

1. Set `ADMIN_SECRET` in env.
2. Open `/admin`, enter the secret (kept in that browser tab only).
3. **API keys** — issue per school (raw shown once), see last-used, revoke.
   **Sheets** — register, enable/disable, see last sync.

> Interim auth = the shared `ADMIN_SECRET`. When Auth0 SSO is fully wired, this
> gate is replaced by an admin-role session check (`lib/adminAuth.js`).

---

## 9. Deploy to Vercel + Neon

1. **Neon** — create a project. Put the **pooled** connection string in
   `DATABASE_URL` (Vercel env); keep the direct string as `SEED_DATABASE_URL`
   for migrations. (Drop `PGSSL=disable` — managed PG uses TLS.)
2. **Apply schema** against Neon (from your machine):
   ```bash
   psql "$SEED_DATABASE_URL" -f db/schema.sql
   psql "$SEED_DATABASE_URL" -f db/policies.sql
   psql "$SEED_DATABASE_URL" -f db/functions.sql
   psql "$SEED_DATABASE_URL" -f db/ingest.sql
   psql "$SEED_DATABASE_URL" -f db/sheets.sql
   psql "$SEED_DATABASE_URL" -f db/value-aliases.sql
   psql "$SEED_DATABASE_URL" -f db/drilldown.sql
   ```
3. **Vercel** — import the repo, set every env var (recipe 6), deploy.
   `vercel.json` registers the Sheets cron automatically.
