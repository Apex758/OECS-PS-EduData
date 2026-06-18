-- =====================================================================
-- INGEST SCHEMA  (additive -- run AFTER schema.sql + policies.sql)
-- =====================================================================
-- Adds what the multi-school ingest path needs on top of the base schema:
--   1. school_api_keys  -- per-school push credentials (hashed)
--   2. students.identity_hash + unique index -- idempotent re-uploads
--   3. student_mapping  -- the RULI <-> PII link table (was JSON-only)
--
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. API KEYS  --  one or more per school. Only the SHA-256 hash of the
--    raw key is stored; the raw key is shown once at generation time.
-- ---------------------------------------------------------------------
create table if not exists school_api_keys (
  id           serial primary key,
  school_id    int  not null references schools(id) on delete cascade,
  key_hash     text not null unique,          -- sha256(raw key), hex
  label        text,                          -- e.g. "Sir Arthur Lewis CC - office PC"
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_api_keys_school on school_api_keys(school_id);

-- ---------------------------------------------------------------------
-- 2. IDEMPOTENT RE-UPLOADS  --  identity_hash is a fingerprint of a
--    student's identifying fields (computed in lib/ingestPipeline.js).
--    Unique per school so re-dropping the same file inserts nothing new.
-- ---------------------------------------------------------------------
alter table students add column if not exists identity_hash text;
create unique index if not exists uq_students_school_identity
  on students(school_id, identity_hash)
  where identity_hash is not null;

-- ---------------------------------------------------------------------
-- 3. MAPPING / LINK TABLE  --  RULI -> sensitive PII (names, DOB) + salt.
--    Kept in its own table so it can be locked down harder than students.
-- ---------------------------------------------------------------------
create table if not exists student_mapping (
  ruli        text primary key references students(ruli) on delete cascade,
  school_id   int  not null references schools(id) on delete cascade,
  country_id  int  not null references countries(id),
  salt        text not null,
  sensitive   jsonb not null,                 -- { first_name, date_of_birth, ... }
  created_at  timestamptz not null default now()
);
create index if not exists idx_mapping_school on student_mapping(school_id);

-- ---------------------------------------------------------------------
-- RLS  --  both tables hold secrets (key hashes, RULI<->PII mapping). Only
-- service_role (server-trusted ingest/admin, BYPASSRLS) ever touches them.
-- RLS is enabled with NO policy for `authenticated`, so even a leaked end-user
-- JWT sees zero rows. The API key (hashed) is what authorizes the school.
-- ---------------------------------------------------------------------
alter table school_api_keys enable row level security;
alter table school_api_keys force  row level security;
drop policy if exists api_keys_admin on school_api_keys;

alter table student_mapping enable row level security;
alter table student_mapping force  row level security;
drop policy if exists student_mapping_admin on student_mapping;

-- Server-trusted role only; do NOT grant these to authenticated/anon.
grant select, insert, update, delete on school_api_keys to service_role;
grant select, insert, update, delete on student_mapping to service_role;
grant usage, select on all sequences in schema public to service_role;
