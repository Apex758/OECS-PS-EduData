-- =====================================================================
-- PENDING ALIAS SUGGESTIONS  (additive -- run after value-aliases.sql)
-- =====================================================================
-- Uploaders submit alias suggestions (e.g. "Female" -> "F") without
-- needing admin rights. Each suggestion is stored here as 'pending'.
-- The pipeline applies pending suggestions only for the submitter who
-- created them, giving them an immediate feedback loop while the admin
-- reviews. Admin approval promotes the row into value_aliases (global,
-- permanent). Rejection marks it rejected so the uploader sees feedback.
-- =====================================================================
create table if not exists pending_aliases (
  id            serial primary key,
  entity        text not null,
  field         text not null,
  variant       text not null,
  canonical     text not null,
  submitted_by  text not null,   -- sha256 fingerprint of IP+UA (no PII stored)
  institution   text,            -- first institution seen with this variant
  submitted_at  timestamptz not null default now(),
  status        text not null default 'pending',
  constraint pending_aliases_status_check check (status in ('pending','approved','rejected')),
  unique (entity, field, variant, submitted_by)
);

create index if not exists idx_pending_aliases_submitter
  on pending_aliases(submitted_by, status);
create index if not exists idx_pending_aliases_status
  on pending_aliases(status);

-- Server-side only (submit + admin review run under service_role).
grant select, insert, update on pending_aliases to service_role;
grant usage, select on all sequences in schema public to service_role;
