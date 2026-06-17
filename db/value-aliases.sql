-- =====================================================================
-- VALUE ALIASES  (additive -- run after ingest.sql)
-- =====================================================================
-- Admin-approved enum value normalizations learned at upload time. When a
-- value like "Male" is rejected (not in the enum), an admin can approve
-- mapping it to a canonical value ("M"); the row is stored here and the
-- ingest pipeline merges these with the static aliases in lib/valueAliases.js
-- on the next upload -- so it normalizes automatically thereafter.
--
-- Reference data, not per-user secret -> no RLS. Writes are gated at the API
-- layer (isAdmin). Safe to re-run.
-- =====================================================================
create table if not exists value_aliases (
  id          serial primary key,
  entity      text not null,                 -- e.g. 'staff' | 'student'
  field       text not null,                 -- canonical field, e.g. 'sex'
  variant     text not null,                 -- the rejected value, e.g. 'Male'
  canonical   text not null,                 -- approved target, e.g. 'M'
  created_at  timestamptz not null default now(),
  unique (entity, field, variant)
);
create index if not exists idx_value_aliases_lookup on value_aliases(entity, field);

-- Accessed only server-side (the ingest pipeline + admin portal run under
-- service_role). No grant to authenticated/anon, so end users can't read or
-- write the alias table via PostgREST. UPDATE supports the upsert path.
grant select, insert, update, delete on value_aliases to service_role;
grant usage, select on all sequences in schema public to service_role;
