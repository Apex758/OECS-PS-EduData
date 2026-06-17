-- =====================================================================
-- STAFF SCHEMA  (additive -- run AFTER schema.sql + ingest.sql)
-- =====================================================================
-- Teaching-staff (OECS instrument T10) parallel of students. Feeds the
-- SDG 4.c dashboard. Same privacy split as students:
--   staff          -- anonymized "safe" dimensions (RULI-coded, no PII)
--   staff_mapping  -- the RULI <-> PII link table (surname, DOB, ...) -- locked
--
-- institution / territory arrive as free text on upload and are resolved to
-- the existing schools / countries hierarchy at ingest (lib/db.js), so the
-- same RLS model (admin / minister-by-country / teacher-by-school) applies.
--
-- RLS uses the Supabase JWT model: scope comes from app_current_user()
-- (functions.sql), exactly like students in db/policies.sql. (The old app.role
-- session-var model was retired with the move to supabase-js -- nothing sets
-- those GUCs anymore.)
--
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / drop-before-create).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. STAFF  --  one row per teaching-staff member. "safe" fields only;
--    surname/first_name/date_of_birth/nationality live in staff_mapping.
--    The denormalized institution/territory TEXT is kept alongside the
--    school_id/country_id FKs so the SDG rollups group by the original
--    label while RLS scopes by the resolved hierarchy.
-- ---------------------------------------------------------------------
create table if not exists staff (
  id                     serial primary key,
  ruli                   text unique not null,
  school_id              int  not null references schools(id),
  country_id             int  not null references countries(id),
  institution            text,                     -- original label (SDG grouping)
  territory              text,                     -- original label (SDG grouping)
  classification         text,                     -- PRIN/VPRIN/DEAN/HOD/LECT/INST/TUTOR
  teacher_type           text,
  subjects               text,
  total_periods          int,
  years_experience       int,
  highest_qualification  text,                     -- SDG 4.c.1
  area_of_specialisation text,
  cpd_hours              int,                       -- SDG 4.c.7
  appraised              text,                      -- Y/N
  left_service           text,                      -- Y/N  (SDG 4.c.6)
  sex                    text,                      -- M/F  (SDG 4.5.1)
  metadata               jsonb,                     -- salt/hash/createdAt/tables.sdg/safe extras
  identity_hash          text,
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists staff_school_id_idx  on staff(school_id);
create index if not exists staff_country_id_idx on staff(country_id);
-- idempotent re-uploads: same person for the same institution inserts nothing new.
create unique index if not exists uq_staff_school_identity
  on staff(school_id, identity_hash)
  where identity_hash is not null;

-- ---------------------------------------------------------------------
-- 2. MAPPING / LINK TABLE  --  RULI -> PII (surname, first_name, DOB,
--    nationality) + salt. Locked to service-trusted role only.
-- ---------------------------------------------------------------------
create table if not exists staff_mapping (
  ruli        text primary key references staff(ruli) on delete cascade,
  school_id   int  not null references schools(id) on delete cascade,
  country_id  int  not null references countries(id),
  salt        text not null,
  sensitive   jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_staff_mapping_school on staff_mapping(school_id);

-- ---------------------------------------------------------------------
-- 3. RLS  --  staff mirrors the students policy (JWT / app_current_user()
--    model). staff_mapping holds PII -> service_role only, no authenticated
--    policy (zero rows even with a leaked end-user session).
-- ---------------------------------------------------------------------
alter table staff enable row level security;
alter table staff force  row level security;
drop policy if exists staff_access on staff;
create policy staff_access on staff
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and coalesce((select can_drill_students from app_current_user()), true)
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id))
);

alter table staff_mapping enable row level security;
alter table staff_mapping force  row level security;
drop policy if exists staff_mapping_admin on staff_mapping;

-- ---------------------------------------------------------------------
-- 4. AGGREGATE STATS  --  true per-institution staff counts IGNORING RLS
--    (SECURITY DEFINER), so an institution whose individual rows are hidden
--    still shows totals. Returns ONLY counts + the SDG numerators, no PII.
-- ---------------------------------------------------------------------
drop function if exists staff_stats_by_ids(int[]);
create or replace function staff_stats_by_ids(p_ids int[])
returns table(school_id int, staff bigint, male bigint, female bigint,
              min_qualified bigint, with_cpd bigint, left_service bigint)
language sql security definer set search_path = public stable as $$
  select sc.id,
         count(s.id)                                                          as staff,
         count(*) filter (where s.sex = 'M')                                  as male,
         count(*) filter (where s.sex = 'F')                                  as female,
         count(*) filter (where s.highest_qualification in ('BACH','PGD','MAST','PHD')) as min_qualified,
         count(*) filter (where coalesce(s.cpd_hours,0) > 0)                  as with_cpd,
         count(*) filter (where s.left_service = 'Y')                         as left_service
    from schools sc
    left join staff s on s.school_id = sc.id
   where sc.id = any(p_ids)
   group by sc.id;
$$;

-- ---------------------------------------------------------------------
-- Grants. staff is readable by authenticated (RLS-filtered); staff_mapping
-- is service_role only. Stats fn: authenticated + service_role (counts only).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on staff to authenticated, service_role;
grant select, insert, update, delete on staff_mapping to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on function staff_stats_by_ids(int[]) from public;
grant execute on function staff_stats_by_ids(int[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. RESOLUTION HELPERS  --  free-text institution/territory -> hierarchy.
--    Get-or-create, matching the existing seed BY NAME first so uploads land
--    on already-seeded schools/countries when the labels match. iso_code /
--    school code are generated with a uniqueness loop for genuinely new ones.
-- ---------------------------------------------------------------------
create or replace function _resolve_country(p_territory text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(btrim(p_territory), ''), 'Unspecified');
  v_id   int;
  v_base text;
  v_iso  text;
  v_n    int := 1;
begin
  select id into v_id from countries
   where lower(name) = lower(v_name) or lower(iso_code) = lower(v_name) limit 1;
  if found then return v_id; end if;

  v_base := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g'), 3));
  if v_base = '' then v_base := 'XX'; end if;
  v_iso := v_base;
  loop
    insert into countries (iso_code, name) values (v_iso, v_name)
      on conflict (iso_code) do nothing returning id into v_id;
    if v_id is not null then return v_id; end if;
    v_n := v_n + 1;                       -- iso taken by a different name; suffix
    v_iso := left(v_base, 2) || v_n::text;
  end loop;
end;
$$;

create or replace function _resolve_school(p_country_id int, p_institution text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(btrim(p_institution), ''), 'Unspecified Institution');
  v_id   int;
  v_base text;
  v_code text;
  v_n    int := 1;
begin
  select id into v_id from schools
   where lower(name) = lower(v_name) and country_id = p_country_id limit 1;
  if found then return v_id; end if;

  v_base := btrim(upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'), 40)), '-');
  if v_base = '' then v_base := 'INST'; end if;
  v_code := v_base;
  loop
    insert into schools (country_id, code, name, level)
      values (p_country_id, v_code, v_name, 'tertiary')
      on conflict (code) do nothing returning id into v_id;
    if v_id is not null then return v_id; end if;
    v_n := v_n + 1;                       -- code taken by a different school; suffix
    v_code := left(v_base, 36) || '-' || v_n::text;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. ingest_staff  --  KEYLESS, server-trusted (browser self-serve upload;
--    the institution self-identifies via the institution/territory columns,
--    not an API key). Resolves each row to the hierarchy, then upserts staff +
--    staff_mapping. Idempotent per (school_id, identity_hash).
--    p_rows: [{ ruli, institution, territory, classification, teacher_type,
--              subjects, total_periods, years_experience, highest_qualification,
--              area_of_specialisation, cpd_hours, appraised, left_service, sex,
--              metadata, identity_hash, salt, sensitive }]
--    Returns { ok, inserted, skipped, institutions:[codes] }
-- ---------------------------------------------------------------------
create or replace function ingest_staff(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_cid      int;
  v_sid      int;
  v_inserted int := 0;
  v_skipped  int := 0;
  v_codes    text[] := '{}';
  v_code     text;
begin
  for r in select jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_cid := _resolve_country(r->>'territory');
    v_sid := _resolve_school(v_cid, r->>'institution');

    insert into staff (
      ruli, school_id, country_id, institution, territory,
      classification, teacher_type, subjects, total_periods, years_experience,
      highest_qualification, area_of_specialisation, cpd_hours, appraised,
      left_service, sex, metadata, identity_hash, is_demo
    ) values (
      r->>'ruli', v_sid, v_cid,
      nullif(r->>'institution', ''), nullif(r->>'territory', ''),
      nullif(r->>'classification', ''), nullif(r->>'teacher_type', ''),
      nullif(r->>'subjects', ''), nullif(r->>'total_periods', '')::int,
      nullif(r->>'years_experience', '')::int,
      nullif(r->>'highest_qualification', ''),
      nullif(r->>'area_of_specialisation', ''),
      nullif(r->>'cpd_hours', '')::int, nullif(r->>'appraised', ''),
      nullif(r->>'left_service', ''), nullif(r->>'sex', ''),
      coalesce(r->'metadata', '{}'::jsonb), r->>'identity_hash', false
    )
    on conflict (school_id, identity_hash) where identity_hash is not null do nothing;

    if found then
      insert into staff_mapping (ruli, school_id, country_id, salt, sensitive)
      values (r->>'ruli', v_sid, v_cid, r->>'salt', coalesce(r->'sensitive', '{}'::jsonb));
      v_inserted := v_inserted + 1;
      select code into v_code from schools where id = v_sid;
      if not (v_code = any(v_codes)) then v_codes := array_append(v_codes, v_code); end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'inserted', v_inserted, 'skipped', v_skipped,
    'institutions', to_jsonb(v_codes)
  );
end;
$$;

revoke all on function _resolve_country(text)     from public;
revoke all on function _resolve_school(int, text)  from public;
revoke all on function ingest_staff(jsonb)        from public;
grant execute on function ingest_staff(jsonb)     to service_role;
