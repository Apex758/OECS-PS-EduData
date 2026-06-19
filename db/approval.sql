-- =====================================================================
-- APPROVAL LAYER  (additive -- run AFTER staff.sql + enrolment.sql)
-- =====================================================================
-- Submission batches tie stripped row-level data to pre-computed SDG
-- aggregation rows. L1 (institution) auto-approves on push; L2 (minister)
-- is required when approval_config.approval_required = true for the country.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. APPROVAL CONFIG  --  per-country ministerial gate (seeded from CSV)
-- ---------------------------------------------------------------------
create table if not exists approval_config (
  country_id        int primary key references countries(id),
  approval_required boolean not null default false
);

-- ---------------------------------------------------------------------
-- 2. SUBMISSIONS  --  one batch per institution push
-- ---------------------------------------------------------------------
create table if not exists submissions (
  id            serial primary key,
  school_id     int not null references schools(id),
  country_id    int not null references countries(id),
  entity        text not null check (entity in ('staff', 'enrolment')),
  status        text not null default 'pending_l2'
                check (status in ('pending_l2', 'approved', 'rejected')),
  submitted_by  int references app_users(id),
  submitted_at  timestamptz not null default now(),
  l2_by         int references app_users(id),
  l2_at         timestamptz,
  reject_reason text
);
create index if not exists idx_submissions_country_status on submissions(country_id, status);
create index if not exists idx_submissions_school on submissions(school_id);

-- ---------------------------------------------------------------------
-- 3. AGGREGATIONS  --  pre-computed SDG rows at submit time
-- ---------------------------------------------------------------------
create table if not exists aggregations (
  id            serial primary key,
  submission_id int not null references submissions(id) on delete cascade,
  sdg           text not null,
  country_id    int not null references countries(id),
  school_id     int not null references schools(id),
  numerator     numeric,
  denominator   numeric,
  result        numeric,
  metadata      jsonb not null default '{}'::jsonb
);
create index if not exists idx_aggregations_country_sdg on aggregations(country_id, sdg);
create index if not exists idx_aggregations_school_sdg on aggregations(school_id, sdg);
create index if not exists idx_aggregations_submission on aggregations(submission_id);

-- ---------------------------------------------------------------------
-- 4. APPROVALS  --  L1/L2 flags per aggregation row
-- ---------------------------------------------------------------------
create table if not exists approvals (
  id             serial primary key,
  aggregation_id int not null unique references aggregations(id) on delete cascade,
  l1             boolean not null default true,
  l1_at          timestamptz not null default now(),
  l2             boolean not null default false,
  l2_at          timestamptz,
  l2_by          int references app_users(id)
);

-- ---------------------------------------------------------------------
-- 5. LINK ROW-LEVEL DATA TO SUBMISSIONS
-- ---------------------------------------------------------------------
alter table staff add column if not exists submission_id int references submissions(id);
create index if not exists idx_staff_submission on staff(submission_id);

alter table staff_rejected add column if not exists submission_id int references submissions(id);

alter table enrolment add column if not exists submission_id int references submissions(id);
create index if not exists idx_enrolment_submission on enrolment(submission_id);

alter table enrolment_rejected add column if not exists submission_id int references submissions(id);

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on approval_config to authenticated, service_role;
grant select, insert, update, delete on submissions to authenticated, service_role;
grant select, insert, update, delete on aggregations to authenticated, service_role;
grant select, insert, update, delete on approvals to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
