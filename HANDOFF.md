# Student CSV App — Handoff & Architecture

> **Living document.** Keep this current. If you (a person or another AI chat)
> change the schema, auth, files, or flow, update the matching section here in
> the same change. This is the single source of truth handed to new technical
> contributors. Last verified: 2026-06-16.

Each concept below has two lines:
- **Tech:** one short technical sentence (for engineers).
- **Plain:** one simple sentence (safe to say to a teacher / non-technical staff).

---

## 1. What this app is

- **Tech:** Next.js 14 app that ingests student CSV/XLSX, anonymizes each
  student with a CSPRNG code (RULI), and stores records in Postgres behind
  role-based row-level security; logins are via Google SSO.
- **Plain:** It takes a spreadsheet of students, gives each child a secret
  code instead of their name, and only lets the right people see the right
  schools.

## 2. Status

| Step | What | State |
|------|------|-------|
| 1 | Seed CSVs + DB schema + RLS policies | ✅ done |
| 2 | Postgres `student_demo` stood up + seeded + RLS verified | ✅ done |
| 3 | App reads from Postgres; "Access (RLS)" dashboard + persona toggle | ✅ done |
| — | Parallel ingest path (API keys, idempotent upload, mapping table) | ✅ done (other session) |
| — | Google Sheets ingest (service account + Vercel Cron pull) | ✅ done (other session) |
| — | Admin portal for ingest (issue/revoke keys, register sheets) | ✅ done (other session) |
| 4 | Auth0 SSO (Auth.js) + access/refresh token panel | ◑ scaffolded — fill Auth0 creds in `.env.local` |
| 5 | Wire real session → RLS context (`/api/me/scoped`, mode toggle) | ✅ done |
| 6 | Admin **Users & Access** panel (`/admin/access`): edit role/territory/schools, bulk-import from template, export users.json | ✅ done |
| 6b | Minister **drill-down toggle** (`can_drill_students`): aggregate counts only vs individual students, RLS-enforced | ✅ done |
| 6c | Validation **self-learning** (`/admin/validation` + inline on upload): approve a rejected value → `value_aliases` → auto-normalizes next upload | ✅ done |
| 7 | DEMO "view as" toggle polish + labelling | ◑ partial (toggle works) |
| 8 | Token panel (show access/refresh token after login) | ✅ done (TokenPanel) |

## 3. Run it

```powershell
# one-time: stand up the database (idempotent; wipes + reseeds)
db\setup.ps1
# dev server
npm run dev          # http://localhost:3000
```

- DB setup needs the Postgres superuser password (saved in
  `db/.superuser-password.txt`). If lost, re-run `db/reset-postgres-password.ps1`
  **as Administrator** to set a new one.
- App connects with the `app_client` login in `.env.local` (`DATABASE_URL`).

---

## 4. File & folder map

| Path | Purpose |
|------|---------|
| `app/page.js` | Whole UI: Upload, Dashboard, **Access (RLS)** tabs + Auth0 sign-in + token panel |
| `auth.js` | Auth.js (NextAuth v5) config: Auth0 provider, role mapping, token capture |
| `app/api/auth/[...nextauth]/route.js` | Auth.js route (sign in / callback / session) |
| `app/providers.js` | `SessionProvider` wrapper (client session access) |
| `db/full-schema.sql` | Consolidated single-file schema (regenerate via pg_dump) |
| `SETUP.md` | Setup recipes: Auth0, DB bootstrap, schema/porting, password reset, API keys |
| `app/api/process/route.js` | Browser upload → JSON files on disk (local dev path) |
| `app/api/ingest/route.js` | **Production** push: API-key upload → Postgres (per school) |
| `app/api/cron/sync-sheets/route.js` | Scheduled Google Sheets pull → Postgres (Vercel Cron; `CRON_SECRET`) |
| `app/api/admin/*/route.js` | Admin portal API: overview, keys (+revoke), sheets (+toggle); `ADMIN_SECRET` |
| `app/admin/page.js` | Admin portal UI: issue/revoke API keys, register/toggle sheets |
| `app/api/stats`, `download`, `clear` | Dashboard stats / file download / wipe (JSON path) |
| `app/api/personas/route.js` | Lists demo "view as" users for the RLS toggle |
| `app/api/scoped/route.js` | DEMO "view as": scoped data by persona id (**RLS-filtered**) |
| `app/api/me/scoped/route.js` | REAL signed-in identity → scoped data (session-driven, **RLS-filtered**) |
| `app/admin/access/page.js` | Admin Users & Access UI: edit role/scope, drill toggle, bulk import, export |
| `app/admin/validation/page.js` | Admin value-alias review (approved enum normalizations) |
| `app/api/admin/users/{route,import,template,export}/route.js` | User CRUD, bulk import, CSV template, users.json export |
| `app/api/admin/value-aliases/route.js` | List/add/remove admin-approved value aliases |
| `lib/userAdmin.js` | Admin user/access DB ops (list/upsert/delete/import/export) via `withRls({role:'admin'})` |
| `lib/userAdminGate.js` | `isAdmin(req)` — SSO admin role OR `ADMIN_SECRET` |
| `data/users.json` | Canonical user registry (seeded by `db/seed.mjs`; admin can export back) |
| `db/value-aliases.sql` | Additive: `value_aliases` table (self-learning enum normalizations) |
| `lib/db.js` | Postgres pool + `ingestStudents`/`ingestStudentsForSchool` (write) + `withRls`/`fetchScoped` (read) + admin/sheet helpers |
| `lib/ingestPipeline.js` | Shared pipeline: validate → RULI code → split PII → records |
| `lib/sheets.js` | Google service-account auth → Sheets REST → row objects |
| `lib/adminAuth.js` | `Bearer ADMIN_SECRET` gate for `/api/admin/*` (interim until SSO) |
| `lib/parseUpload.js` | CSV + XLSX → row objects |
| `lib/ruli.js` | CSPRNG code/salt + scrypt hash |
| `lib/sensitiveFields.js` | Which fields are PII (blocked from the shareable record) |
| `lib/validation*.js`, `headerAliases.js`, `valueAliases.js`, `transform.js` | Validation + header **and value** normalization |
| `lib/errorHints.js` | Friendly field labels + plain-English "how to fix" hint per error code |
| `data/samples/*.csv` | Five differently-formatted student CSVs (alias demo) + README |
| `db/schema.sql` | Base tables + `app_client` grants |
| `db/policies.sql` | **Row-level security policies** (the access rules) |
| `db/functions.sql` | Identity lookup (SECURITY DEFINER) — resolve user before RLS |
| `db/ingest.sql` | Additive: `school_api_keys`, `student_mapping`, `identity_hash` |
| `db/sheets.sql` | Additive: `school_sheets` registry (Google Sheets to pull) |
| `db/drilldown.sql` | Per-school `can_drill` toggle + updated students policy (migration; run by `setup.ps1`; redundant on fresh install) |
| `db/seed.mjs` | Loads demo data from `data/seed/*.csv` |
| `db/setup.ps1` | Runs schema → policies → functions → ingest → sheets → value-aliases → drilldown → seed |
| `db/gen-key.mjs` | Issues a per-school API key (superuser conn; prints raw key once) |
| `db/add-sheet.mjs` | Registers a Google Sheet for a school (superuser conn) |
| `vercel.json` | Vercel Cron schedule for `/api/cron/sync-sheets` (daily 02:00 UTC) |
| `db/reset-postgres-password.ps1` | Resets a forgotten superuser password (run elevated) |
| `data/seed/*.csv` | Demo institutions / schools / students (Jamaica, Saint Lucia) |
| `.env.local` | Secrets: DB URL, app password, Google OAuth (gitignored) |

---

## 5. Core concepts

### Database & hierarchy
- **Tech:** `countries → institutions (ministry) → schools → students`; users in
  `app_users` (role + country), teacher↔school links in `user_schools`.
- **Plain:** A country has a ministry and many schools; each school has
  students; each staff member belongs to a country and maybe a school.

### Row-Level Security (RLS) — the core
- **Tech:** Every table has Postgres `FORCE ROW LEVEL SECURITY`; the app connects
  as non-owner role `app_client`, sets `app.user_id/role/country_id` per request
  with `SET LOCAL`, and policies in `policies.sql` filter rows accordingly.
- **Plain:** The database itself only hands back the rows a person is allowed to
  see — even if the app code asked for everything, the database refuses.
- **Proof:** the same `SELECT * FROM students` returns 18 rows for an admin,
  9 for a minister (their country), 3 for a teacher (their school).

### Role-Based Access (RBAC)
- **Tech:** `app_users.role ∈ {teacher, minister, admin}` decides the policy
  branch; teacher = their school(s), minister = their country, admin = all.
- **Plain:** Teachers see their school, ministers see their whole country,
  admins see everything.

### Single Sign-On (SSO) + tokens *(Step 4 — scaffolded)*
- **Tech:** Auth.js (NextAuth v5) with the **Auth0** provider (`auth.js`); Auth0
  brokers the login (and can front Google). On login the email is matched to
  `app_users` via `resolve_user_by_email`, giving role + scope. Returns an
  **access token** (short-lived) + **refresh token** (long-lived, via the
  `offline_access` scope). The token panel in the Access tab reveals both
  (DEMO-only — refresh tokens never go to the browser in prod).
- **Plain:** You sign in once with Auth0; the app remembers who you are and
  keeps you logged in without asking for your password every time.
- **Config:** see [SETUP.md](SETUP.md) recipe 1. Needs `AUTH0_*` + `AUTH_SECRET`
  in `.env.local`. Callback URL `http://localhost:3000/api/auth/callback/auth0`.

### Identity resolution (why it's safe)
- **Tech:** `db/functions.sql` holds `SECURITY DEFINER` functions that read
  `app_users` to answer "who is this" *before* RLS context exists (chicken/egg);
  they expose only id/role/country, nothing scoped.
- **Plain:** There's a tiny trusted lookup that only tells the app your job
  title — nothing else — and everything after that is locked down.

### Anonymization (RULI)
- **Tech:** Each student gets `crypto.randomBytes` code + salt + scrypt hash;
  PII (names, DOB) is split into `student_mapping`, never the shareable record.
- **Plain:** Names are swapped for a random secret code, and the real names are
  kept in a separate locked list.

### Format-agnostic ingest (header + value aliases)
- **Tech:** before validation, `processRows()` runs two normalizers so any
  school's column names *and* cell values land in one canonical schema:
  1. `normalizeHeaders()` (`headerAliases.js`) — fuzzy maps column names
     (case/space/`_`/`-`/`.` ignored): `surname`→`last_name`, `D.O.B`→
     `date_of_birth`, `grade`→`class`, `sex`→`gender`, …
  2. `normalizeValues()` (`valueAliases.js`) — maps ENUM cell values to canonical
     ones: `Male`/`boy`/`m`/`1`→`M`, `Female`/`girl`/`f`/`2`→`F`, else `Other`.
  Unknown columns are warned + ignored; unrecognized enum values pass through and
  fail validation (never silently "fixed"). Response carries `headerAliasesApplied`
  + `valueAliasesApplied` + `headerWarnings`; the Upload tab renders them in a
  "Normalization applied" card. `data/samples/` has five divergent CSVs proving it.
  Canonical student fields: `first_name`*, `last_name`*, `middle_name`,
  `other_names`, `maiden_name`, `date_of_birth`*, `gender`*, `class`,
  `last_updated`, `age`* (*=required). NOTE: dates are validated for parseability
  but NOT reformatted — schools must send a `Date.parse`-able date.
- **Plain:** Every school can name its columns and write things like "Male" vs "M"
  however it likes — the app translates them all into one standard format before
  saving, and shows you exactly what it changed.

### Validation errors (red cells + plain-English fixes)
- **Tech:** `validateRecord()` (`lib/validation.js`) emits STRUCTURED errors —
  `{ field, label, code, value, message, hint }` — not strings. `lib/errorHints.js`
  maps each `code` (`required`, `not_int`, `below_min`, `above_max`, `bad_email`,
  `bad_date`, `not_in_options`, `too_short`, `too_long`, `bad_pattern`) to a one-
  sentence, teacher-facing `hint`. The `RejectedTable` in `app/page.js` highlights
  the exact failing cell (red bg + outline via the error's `field`) and lists each
  hint in a "What's wrong & how to fix it" column. Used in both the Upload result
  and the Dashboard rejected section. `normalizeError()` still accepts legacy
  strings (batch errors) so nothing breaks.
- **Plain:** When a row is rejected, the exact cell that's wrong turns red and the
  app says — in one simple sentence — what's wrong and how to fix it, so a school
  can correct the spreadsheet and re-send without needing a technical person.

### Role-driven upload (no record-type dropdown)
- **Tech:** `UploadPanel` reads the Auth.js session role and derives the entity
  from `ROLE_ENTITY` (all roles → `student` for now); the old Student/Institution
  `<select>` is gone. Shows "Uploading as {role} → {entity} records". Signed-out
  users default to student.
- **Plain:** What you can upload is decided by who you log in as, not a menu.

### Three ingest paths (one shared pipeline)
- **Tech:** all call `processRows()` in `ingestPipeline.js`; re-uploads are
  idempotent via `students(school_id, identity_hash)`.
  1. `/api/process` — browser → JSON files (dev only).
  2. `/api/ingest` — `X-API-Key` → Postgres (production push).
  3. `/api/cron/sync-sheets` — scheduled pull of registered Google Sheets →
     Postgres (see Sheets concept below).
- **Plain:** Schools get data three ways — upload by hand, push over an API key,
  or just share a Google Sheet we read on a schedule — and sending the same data
  twice never creates duplicate students.

### Google Sheets ingest
- **Tech:** `school_sheets` registers each sheet per school. `lib/sheets.js`
  mints a service-account token (`google-auth-library`) and reads the sheet via
  the Sheets REST API; `/api/cron/sync-sheets` (Vercel Cron, daily) runs them
  through the pipeline. Auth: `Authorization: Bearer CRON_SECRET`. Each school
  shares its sheet (Viewer) with `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- **Plain:** A school can keep its own Google Sheet and just share it with us;
  the system reads it automatically each day.

### Admin portal (ingest)
- **Tech:** `/admin` (`app/admin/page.js`) + `/api/admin/*` issue/revoke API
  keys and register/toggle sheets. Interim gate `lib/adminAuth.js` =
  `Bearer ADMIN_SECRET`; the write txns set `app.role='admin'`. To be folded
  behind the SSO admin role (Step 6).
- **Plain:** A protected page where an administrator hands out each school's
  secret send-key and connects their Google Sheet, without touching the command
  line.

### API keys (per school)
- **Tech:** `school_api_keys` stores only `sha256(raw key)`; `db/gen-key.mjs`
  prints the raw key once. Ingest runs its write txn as `app.role='admin'`; the
  key alone decides which school the rows belong to.
- **Plain:** Each school gets its own secret password to send data, and it can
  only ever add data to that one school.

### Demo "view as" toggle
- **Tech:** `is_demo` users seeded in `app_users`; the Access tab calls
  `/api/scoped?personaId=` and the server resolves their scope into RLS context.
- **Plain:** A clearly-labelled DEMO dropdown lets you preview what each kind of
  user would see, without logging in as them.

---

## 6. Security notes

- App role `app_client` is **not** a superuser and **not** the table owner, so
  RLS actually applies to it (superusers/owners bypass RLS).
- Postgres auth was upgraded `md5 → scram-sha-256` during password reset.
- Secrets live only in `.env.local` and `db/.superuser-password.txt`, both
  gitignored. API keys and passwords are stored hashed, never in plaintext.
- The client never sends its own role; the server resolves it. Never trust a
  role/country value coming from the browser.

## 7. Maintenance notes

- Schema change → edit the relevant `db/*.sql`, re-run `db/setup.ps1` (it drops &
  rebuilds, then reseeds). Update this file's file-map / concepts.
- `policies.sql` casts use `nullif(current_setting('app.x', true), '')::int` so a
  missing/empty session var becomes NULL instead of erroring.
- Local Postgres has no TLS → `.env.local` sets `PGSSL=disable`. For managed
  Postgres (Neon/Supabase) remove that and the pool uses SSL.
- `setup.ps1` uses `ErrorActionPreference=Continue` because psql writes NOTICEs
  to stderr; real failures are caught via `ON_ERROR_STOP=1` + `$LASTEXITCODE`.
- `ingest.sql` `DROP POLICY IF EXISTS` before each `CREATE POLICY` — its tables
  survive the schema rebuild (FK cascade drops the constraint, not the table),
  so policies must be re-creatable for `setup.ps1` to be idempotent.

## 8a. OECS Post-Secondary SDG instrument (this chapter — 2026-06-16)

> This chapter repointed the **upload + dashboard** demo from K-12 students to the
> **OECS Post-Secondary / Tertiary SDG questionnaire** (`OECS_PostSec_SDG_Instrument.xlsx`).
> File-upload path only — no database changes. The "Access (RLS)" tab still runs on
> the original seeded dataset (a post-secondary reseed is future work).

### What we took from the instrument
- **Tech:** the questionnaire has 15 tables; most are aggregate counts. Exactly one —
  **T10 Teaching Staff Profile** (one row per staff member) — is per-person, so it's
  the table we ingest. New entity `staff` replaces `student` across the config-driven
  pipeline (`validationRules.js`, `headerAliases.js`, `valueAliases.js`,
  `sensitiveFields.js`, `transform.js`, `ingestPipeline.js`, `api/stats`).
- **Plain:** the form is a big workbook; we used the one sheet that lists teachers one
  by one, and taught the app to read a spreadsheet of teaching staff.

### What we do with each column (in simple terms)
- **Hidden (anonymized):** Surname, First Name, **Date of Birth**, Nationality — these
  identify a person, so they're swapped for a secret RULI code and kept only in the
  private mapping list. They never appear in the shareable record.
- **Kept (for the numbers):** Highest Qualification, **CPD hours in the past year**,
  Left-Service (Y/N), Classification, Sex — used to calculate the SDG figures.
- **Plain:** the app hides who the teacher is, but keeps the facts the Ministry needs
  to count (qualifications, training hours, who left).

### SDG indicators we now show *(new "SDG Indicators" tab)*
- **Tech:** `lib/sdgIndicators.js` + `app/api/sdg/route.js` compute, from the anonymized
  staff records: **SDG 4.c.1** % meeting minimum qualification (Bachelors+),
  **SDG 4.c.6** attrition (% who left service), **SDG 4.c.7** CPD coverage (% with any
  training hours), **SDG 4.5.1** gender parity (F:M). Each card is colour-tagged with its
  SDG code from the workbook's colour key, plus qualification/classification bar charts.
- **Plain:** a new tab shows the four teacher targets the Ministry reports to the UN —
  how many teachers are properly qualified, how many got training, how many left, and the
  male/female balance — each labelled with its SDG number.
- **Verified 2026-06-16** on the 12-row sample (`data/sample/staff-sample.csv`):
  4.c.1 = 75%, 4.c.7 = 75%, 4.c.6 = 16.7%, parity = 1.0; PII confirmed present only in the
  mapping, not the public record.

### Not in this MVP (future work)
- **Tech:** the aggregate sheets (T2/T3 enrolment by division/age/sex → SDG 4.3.2 GER &
  4.3.3 TVET, finance T13, facilities T14/T15) are not ingested; the RLS demo still uses
  the K-12 seed.
- **Plain:** the rest of the questionnaire (student-enrolment counts, money, buildings)
  and the post-secondary version of the access demo are next steps, not built yet.

## 8. Secrets index (not committed)

| Secret | Where |
|--------|-------|
| Postgres superuser password | `db/.superuser-password.txt` |
| `app_client` DB password / `DATABASE_URL` | `.env.local` |
| Auth0 client id/secret, `AUTH_SECRET` | `.env.local` (blank until Step 4) |
| Per-school API keys (raw) | shown once by `db/gen-key.mjs` / `/admin`; only hash stored |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | `.env.local` (Sheets pull) |
| `CRON_SECRET` (Sheets cron) / `ADMIN_SECRET` (admin portal) | `.env.local` |
| **Local dev `ADMIN_SECRET` value** | `RGq6a-f6PRZp6WX3KlDLaWKf` |

---

## 9. How the RULI follows a learner across institutions

> **RULI = Regional Unique Learner Identifier.** OECS-scoped — it crosses
> *countries*, not just schools. In this app the RULI is generated locally as an
> anonymization code; the notes below describe how a *real* regional RULI scheme
> keeps one ID attached to one person everywhere.

### Core rule: the ID is owned by a central authority, not the institution
- **Tech:** a regional registry mints one RULI per person; institutions look it
  up and reference it as a foreign key, they never create their own. The RULI
  lives in the registry and the person's records point at it — moving institution
  adds a new enrollment row, same RULI.
- **Plain:** the learner's code is given out by one central body, so every school
  or college just reuses the same code instead of inventing a new one.

### Regional layering (why it works across countries)
- **Tech:** an OECS-level registry sits above each member state's national
  registry; each national registry maps `RULI ↔ local national ID`. A learner
  moving country is resolved against the regional hub, which returns the existing
  RULI. The RULI can encode issuing country (prefix + check digit + sequence),
  fixed for life even after migration.

  ```
  OECS regional registry (RULI)
     ├─ St. Lucia nat'l registry  (RULI ↔ local ID)
     ├─ Grenada   nat'l registry  (RULI ↔ local ID)
     └─ Dominica  nat'l registry  (RULI ↔ local ID)
  ```
- **Plain:** there's a region-wide list above each country's list, so a student
  who moves from one island to another keeps the same code.

### Identity resolution at enrollment (the hard part)
- **Tech:** when an institution enrolls someone, it queries the registry with
  demographics (national ID anchor → deterministic match; else probabilistic
  fuzzy match on name + DOB + parent, with human review on uncertain matches;
  biometric for low-documentation populations). Match → existing RULI; no match →
  mint new. This is what prevents one person getting two RULIs.
- **Plain:** before giving out a code the system checks "do we already know this
  person?" so the same learner doesn't end up with two different codes.

### Data sovereignty & privacy
- **Tech:** the RULI is pseudonymous — an opaque number with no PII inside. The
  regional layer holds the *minimum*: `RULI ↔ country pointer`, not records.
  Each country's actual records stay in-country under its own RLS/RBAC; the RULI
  is only the federation key. No one sees a learner's full cross-institution
  trail without authorization.
- **Plain:** the shared code carries no names — it's just a number; each country
  keeps its own students' details, and nobody sees a learner's whole history
  across places unless they're allowed to.

### How this app relates
- **Tech:** the app's `lib/ruli.js` generates the per-record anonymization code
  also called RULI; it is the join key across the dataset and the boundary
  between the shareable record and the private `student_mapping`. In a real
  deployment this local code would be *replaced by* (or mapped to) the
  authoritative regional RULI from the registry. See [Anonymization (RULI)](#anonymization-ruli).
- **Plain:** today the app makes its own secret code; in a live regional system
  it would use the official OECS code instead, so the numbers line up across
  countries.
