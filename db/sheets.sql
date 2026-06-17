-- =====================================================================
-- GOOGLE SHEETS INGEST  (additive -- run after ingest.sql)
-- =====================================================================
-- Registers Google Sheets to pull on a schedule. Each row = one sheet a
-- school shares (read-only) with the app's service account. The cron job
-- (/api/cron/sync-sheets) reads enabled rows, pulls each sheet, and runs
-- the same pipeline as /api/ingest -- scoped to the school.
-- =====================================================================

create table if not exists school_sheets (
  id              serial primary key,
  school_id       int  not null references schools(id) on delete cascade,
  spreadsheet_id  text not null,                 -- the long id from the sheet URL
  range_a1        text not null default 'A:Z',   -- A1 range; first row = headers
  entity          text not null default 'student',
  enabled         boolean not null default true,
  last_synced_at  timestamptz,
  last_status     text,                          -- short result of the last run
  created_at      timestamptz not null default now(),
  unique (school_id, spreadsheet_id, range_a1)
);
create index if not exists idx_sheets_enabled on school_sheets(enabled);

-- secrets-ish (which schools, which sheets) -> admin-only, like the rest.
alter table school_sheets enable row level security;
alter table school_sheets force  row level security;
drop policy if exists school_sheets_admin on school_sheets;
create policy school_sheets_admin on school_sheets
  for all using (current_setting('app.role', true) = 'admin');

grant select, insert, update, delete on school_sheets to app_client;
grant usage, select on all sequences in schema public to app_client;
