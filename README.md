# OECS Post-Secondary EduData

Institution client for OECS post-secondary SDG reporting. Upload teaching-staff spreadsheets, strip PII locally, then push anonymized records to the regional validation layer.

## Architecture

| Phase | Where | Database? | Network? |
|-------|--------|-----------|----------|
| **Strip & validate** | Browser | No — PII in `sessionStorage` only | No |
| **Push to validation layer** | Server (`/api/validation/*`, `/api/ingest-records`) | Yes — Supabase | Yes |

PII (names, DOB, nationality) never hits the server during strip/validate. Only RULI codes, safe fields, and salt tokens are pushed after you explicitly click **Push stripped data**.

## Quick start (no database)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — no `.env` required for upload and offline processing.

1. **Upload** tab → drop a staff CSV/XLSX
2. **Strip & validate** → runs entirely in the browser
3. Review rejected rows and fix your file if needed
4. Identity mappings live in this tab's **session storage** (cleared when you close the tab)

## Validation layer push (Supabase required)

When you're ready to send stripped data to the regional server:

1. Copy env template and add Supabase credentials:

   ```bash
   cp .env.example .env
   ```

2. Set at minimum:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```

3. Apply the database schema (one-time):

   ```powershell
   db\setup.ps1
   ```

   Or run the SQL files in `db/` against your Supabase project. See `SETUP.md` for details.

4. Restart `npm run dev`, strip & validate a file, then click **Push stripped data**.

Push calls:

- `POST /api/validation/tokens` — salt tokens for cross-institution duplicate scan (no PII)
- `POST /api/ingest-records` — safe staff rows for SDG dashboards (no PII)

## Enrolment instrument workbooks

Multi-sheet SDG instrument files (Cover / Background / Enrolment) contain no PII but still need the server parser. They require Supabase configured and use `POST /api/process` with `entity=enrolment`.

## Google Sheets

Not supported on the server (would read PII). Export to CSV/XLSX and upload the file instead.

## Output shape

Each accepted staff row becomes:

- **Dash record** — `RULI` + non-identifying fields (classification, qualification, CPD, …)
- **Session mapping** — `{ RULI, salt, staff: { surname, first_name, date_of_birth, nationality } }` stored only in the browser

## Key files

| Path | Purpose |
|------|---------|
| `lib/client/processUpload.js` | Offline parse + validate + strip |
| `lib/client/piiVault.js` | Session storage for PII mappings |
| `lib/client/pushPayload.js` | Push stripped data to validation layer |
| `lib/processRowsCore.js` | Shared pipeline (server + browser) |
| `lib/sensitiveFields.js` | Which fields are PII |
| `app/validation/` | Cross-institution duplicate console (read-only) |

## Optional configuration

See `.env.example` for admin secrets, Auth0 SSO, Google Sheets cron ingest, and migration URLs. None of these are required for the offline strip/validate flow.

## Legacy paths

| Endpoint | Status |
|----------|--------|
| `POST /api/process` | Enrolment workbooks only |
| `POST /api/ingest` | API-key school ingest (separate production path) |
| `POST /api/process-sheet` | Disabled (GDPR) |

For full architecture and RLS details, see `HANDOFF.md`.
