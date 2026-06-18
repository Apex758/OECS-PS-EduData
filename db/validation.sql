-- =====================================================================
-- VALIDATION LAYER  --  cross-institution duplicate detection
-- =====================================================================
-- Fed by the RULI Mapper standalone over /api/validation/*. Stores the
-- complete spliced tokens (RULI+salt), the master key (copied in from the
-- standalone), and the duplicate-person candidates surfaced by scanning for a
-- shared salt across institutions.
--
-- All access is via the service_role client (svc(), BYPASSRLS). RLS is enabled
-- with NO policies so the anon/authenticated roles can never read these tables
-- directly (defense in depth — the master key and PII-linked salts live here).
-- =====================================================================

create table if not exists validation_tokens (
  token       text primary key,             -- complete spliced RULI+salt
  ruli        text not null,                 -- bare random RULI
  salt        text not null,                 -- deterministic identity-derived salt
  institution text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()  -- bumped on every re-push (edited)
);
-- existing installs: backfill the edited column.
alter table validation_tokens add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_validation_tokens_salt on validation_tokens (salt);

-- Append-only audit log of everything that touches the validation layer:
-- standalone pushes (uploads), scans, duplicate decisions, master-key changes.
create table if not exists validation_events (
  id          bigint generated always as identity primary key,
  kind        text not null,                 -- push | scan | decide | key_update
  institution text,
  detail      jsonb,                          -- counts / ids / decision context
  created_at  timestamptz not null default now()
);
create index if not exists idx_validation_events_created on validation_events (created_at desc);

create table if not exists validation_dups (
  id             bigint generated always as identity primary key,
  salt           text not null unique,        -- the shared salt = same person
  status         text not null default 'pending',  -- pending | approved | denied
  canonical_ruli text,                          -- the RULI chosen to keep
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- NOTE: there is intentionally NO master/identity key here. Duplicate detection
-- works on salt EQUALITY alone (valScan) — a shared salt means the same person.
-- The salt-derivation key never leaves the institutions' exes, so this layer
-- cannot re-identify anyone; the two institutions confirm identity locally.
drop table if exists validation_key;

-- Per-exe auth secrets the RULI Mapper standalones authenticate with. EACH exe
-- generates its OWN unique key (rmk_<hex>) and self-registers it here (open
-- registration). Auth checks an incoming Bearer against this whole set. Separate
-- from ADMIN_SECRET so institutions never hold the admin password.
create table if not exists ruli_mapper_keys (
  id           bigint generated always as identity primary key,
  key          text not null unique,
  institution  text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
-- retire the old single-row table if it exists from an earlier install.
drop table if exists ruli_mapper_key;

alter table validation_tokens enable row level security;
alter table validation_dups   enable row level security;
alter table ruli_mapper_keys  enable row level security;
alter table validation_events enable row level security;
