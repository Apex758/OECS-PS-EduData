# OECS Post-Secondary EduData

Upload student CSV → each child gets a CSPRNG random code + salt → outputs JSON.

Two ingest paths share one pipeline (`lib/ingestPipeline.js`):

| Path | Endpoint | Destination | Use |
|------|----------|-------------|-----|
| Browser upload | `POST /api/process` | JSON files (`data/output/`) | local dev, single user |
| Push API | `POST /api/ingest` | **Postgres** (scoped to one school by API key) | production, multi-school |

## Run

```bash
cd student-csv-app
npm install
npm run dev
```

## Multi-school ingest (production)

1. **Database** — set `DATABASE_URL` (see `.env.example`; use the *pooled*
   endpoint on Vercel). Apply schema in order:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/policies.sql
   psql "$DATABASE_URL" -f db/ingest.sql      # API keys + mapping table + dedup
   ```

2. **Issue a key per school** (raw key shown once):

   ```bash
   node db/gen-key.mjs JM-S1 "Kingston Primary - office PC"
   ```

3. **Push data** — schools POST to `/api/ingest`:

   ```bash
   curl -X POST https://<app>/api/ingest \
     -H "X-API-Key: sk_..." \
     -F "file=@students.csv" -F "entity=student"
   ```

   Accepts `.csv` and `.xlsx`. Re-uploading the same file is safe —
   identical students are skipped (`identity_hash`), not duplicated.
   Response: `{ school, total, inserted, skipped, rejected, ... }`.

### Google Sheets ingest (scheduled pull)

Schools share a sheet; a daily Vercel Cron pulls it through the same pipeline.

1. Create a Google Cloud **service account**, enable the **Sheets API**, set
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` + `CRON_SECRET`
   (see `.env.example`).
2. Apply schema: `psql "$DATABASE_URL" -f db/sheets.sql`.
3. School shares its sheet (**Viewer**) with the service account email.
4. Register it:

   ```bash
   node db/add-sheet.mjs JM-S1 <SPREADSHEET_ID> "A:Z"
   ```

5. `vercel.json` schedules `/api/cron/sync-sheets` daily (02:00 UTC). Run by
   hand:

   ```bash
   curl https://<app>/api/cron/sync-sheets -H "Authorization: Bearer $CRON_SECRET"
   ```

   Same pipeline + dedup as the other paths. Per-sheet result is written to
   `school_sheets.last_status`.

### Admin portal (`/admin`)

Manage ingest credentials without the CLI. Set `ADMIN_SECRET`, open `/admin`,
enter it once. From there:

- **API keys** — issue a key per school (raw shown once), see last-used, revoke.
- **Google Sheets** — register a sheet for a school, enable/disable, see last
  sync status.

> Interim auth is the shared `ADMIN_SECRET`. Once Google SSO (separate effort)
> lands, this gate is replaced by an admin-role session check. The data
> dashboard (viewing student records by role) is owned by that SSO/RLS work.

Open http://localhost:3000 , upload a CSV (sample at `data/students.csv`).

## Output (under `data/output/`)

- `records.json` — anonymized hierarchy, one entry per student:
  ```json
  {
    "code": "<CSPRNG random code>",
    "metadata": { "salt": "...", "hash": "...", "createdAt": "...", ... },
    "student": { "...original CSV fields..." },
    "tables": { "...your extra data..." }
  }
  ```
- `mapping.json` — link table: original student + generated code + salt.

## Where to edit (left empty for you)

| What | File |
|------|------|
| **Validation rules (type + content)** | `lib/validationRules.js` |
| Validation engine (add new type handlers) | `lib/validation.js` |
| "Other fields" / extra tables | `lib/transform.js` → `buildTables()` |

Edit `validationRules.js` to match your CSV columns — declarative per-field
rules (`required`, `type`, `min`/`max`, `values`, `pattern`, `unique`).

Code generation, salting, metadata, and student mapping are already wired.

## How code/salt work

`lib/ruli.js`:
- `generateCode()` — `crypto.randomBytes` (OS CSPRNG, true entropy) → hex.
- `generateSalt()` — same.
- `hashCode(code, salt)` — `scrypt` KDF, lets you verify a code without storing raw.
