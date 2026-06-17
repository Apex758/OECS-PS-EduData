-- =====================================================================
-- ENROLMENT SCHEMA  (additive -- run AFTER schema.sql + staff.sql)
-- =====================================================================
-- OECS instrument T2 (Current Enrolment by Division/Programme/Sex). ONE
-- row per programme. Unlike staff/students there is NO PII here -- every
-- value is an aggregate count -- so there is no mapping/link table.
--
-- Each upload is one workbook (lib/parseInstrument.js) carrying:
--   institution  -- Cover sheet      -> resolved to schools/countries
--   academicYear -- Background sheet  -> stored as text + start/end year
--   programmes[] -- Enrolment sheet   -> the rows below
--
-- The institution self-identifies (no API key); we resolve it to the
-- schools hierarchy BY NAME (territory isn't on the instrument), creating
-- an "Unspecified" country bucket only when the name is genuinely new.
--
-- Feeds the enrolment SDG view: 4.3.3 (TVET), 4.5.1 (parity), 4.b.1 (ODA
-- scholarships). Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

create table if not exists enrolment (
  id              serial primary key,
  school_id       int  not null references schools(id),
  country_id      int  not null references countries(id),
  institution     text,                         -- original Cover label
  academic_year   text,                         -- e.g. "2025/2026"
  period_start    int,                          -- start calendar year
  period_end      int,                          -- end calendar year
  division        text,
  certification   text,
  programme       text not null,
  accredited      text,                         -- No/Locally/Regionally/Internationally
  is_tvet         text,                         -- Y/N  (SDG 4.3.3)
  -- enrolment by year-of-study and sex
  y1m int, y1f int, y2m int, y2f int,
  y3m int, y3f int, y4m int, y4f int,
  -- part-time / full-time totals (headcount split)
  total_pt_m int, total_pt_f int,
  total_ft_m int, total_ft_f int,
  -- nationality split
  oecs_nat_m int, oecs_nat_f int,
  other_caricom_m int, other_caricom_f int,
  other_nat_m int, other_nat_f int,
  oda_scholarship int,                          -- SDG 4.b.1
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists enrolment_school_id_idx  on enrolment(school_id);
create index if not exists enrolment_country_id_idx on enrolment(country_id);
-- idempotent re-uploads: same programme, same institution, same year -> no dup.
create unique index if not exists uq_enrolment_row
  on enrolment(school_id, academic_year, division, programme);

-- ---------------------------------------------------------------------
-- REJECTED ROWS  --  programme rows that FAILED validation
-- (lib/validateEnrolment.js), kept so the dashboard's rejected view
-- survives reloads. Parallels staff_rejected. No PII here, but service_role
-- only keeps it off the authenticated read path. Not deduped (append-only).
-- ---------------------------------------------------------------------
create table if not exists enrolment_rejected (
  id            serial primary key,
  institution   text,
  academic_year text,
  data          jsonb not null,            -- original programme row
  errors        jsonb not null,            -- validation errors [{field,message}]
  created_at    timestamptz not null default now()
);
create index if not exists idx_enrolment_rejected_created on enrolment_rejected(created_at);
alter table enrolment_rejected enable row level security;
alter table enrolment_rejected force  row level security;
grant select, insert, update, delete on enrolment_rejected to service_role;

-- ---------------------------------------------------------------------
-- RLS  --  mirrors staff (JWT / app_current_user() model). No PII, but we
-- scope the same way so an institution sees only its own rows and a
-- minister only their territory.
-- ---------------------------------------------------------------------
alter table enrolment enable row level security;
alter table enrolment force  row level security;
drop policy if exists enrolment_access on enrolment;
create policy enrolment_access on enrolment
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id))
);

grant select, insert, update, delete on enrolment to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Name-only school resolver. The T2 instrument carries no territory, so we
-- match an existing school BY NAME (any country) and reuse its country;
-- only genuinely-new institutions fall back to the "Unspecified" bucket.
-- Returns both ids via OUT params.
-- ---------------------------------------------------------------------
create or replace function _resolve_school_byname(p_institution text,
                                                  out o_school_id int,
                                                  out o_country_id int)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(btrim(p_institution), ''), 'Unspecified Institution');
begin
  select id, country_id into o_school_id, o_country_id
    from schools where lower(name) = lower(v_name) limit 1;
  if o_school_id is not null then return; end if;

  -- new institution -> resolve under an Unspecified country, create school.
  o_country_id := _resolve_country('Unspecified');
  o_school_id  := _resolve_school(o_country_id, v_name);
end;
$$;

-- ---------------------------------------------------------------------
-- ingest_enrolment  --  KEYLESS, server-trusted browser upload. Resolves the
-- institution to the hierarchy, then upserts one row per programme.
-- p_meta: { institution, territory?, academicYear, periodStart, periodEnd }
--   When territory is present (the demo carries it; the instrument doesn't),
--   resolve country FROM it and create the school under it -- so territory
--   grouping works. Without it, fall back to name-only resolution.
-- p_rows: [{ division, certification, programme, accredited, isTvet,
--            y1m..y4f, totalPtM/F, totalFtM/F, oecsNatM/F,
--            otherCaricomM/F, otherNatM/F, odaScholarship }]
-- p_rejected: [{ data, errors }] -- failed-validation rows, appended to
--   enrolment_rejected so the dashboard's rejected view persists.
-- Returns { ok, inserted, skipped, rejected, institution:code }
-- ---------------------------------------------------------------------
drop function if exists ingest_enrolment(jsonb, jsonb);
drop function if exists ingest_enrolment(jsonb, jsonb, jsonb);
create or replace function ingest_enrolment(p_meta jsonb, p_rows jsonb, p_rejected jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_sid      int;
  v_cid      int;
  v_year     text := nullif(p_meta->>'academicYear', '');
  v_pstart   int  := nullif(p_meta->>'periodStart', '')::int;
  v_pend     int  := nullif(p_meta->>'periodEnd', '')::int;
  v_inst     text := nullif(p_meta->>'institution', '');
  v_terr     text := nullif(p_meta->>'territory', '');
  v_inserted int := 0;
  v_skipped  int := 0;
  v_rejected int := 0;
  v_code     text;
begin
  if v_terr is not null then
    v_cid := _resolve_country(v_terr);
    v_sid := _resolve_school(v_cid, coalesce(v_inst, 'Unspecified Institution'));
  else
    select o_school_id, o_country_id into v_sid, v_cid
      from _resolve_school_byname(v_inst);
  end if;

  for r in select jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into enrolment (
      school_id, country_id, institution, academic_year, period_start, period_end,
      division, certification, programme, accredited, is_tvet,
      y1m, y1f, y2m, y2f, y3m, y3f, y4m, y4f,
      total_pt_m, total_pt_f, total_ft_m, total_ft_f,
      oecs_nat_m, oecs_nat_f, other_caricom_m, other_caricom_f,
      other_nat_m, other_nat_f, oda_scholarship, metadata
    ) values (
      v_sid, v_cid, v_inst, v_year, v_pstart, v_pend,
      nullif(r->>'division',''), nullif(r->>'certification',''),
      r->>'programme', nullif(r->>'accredited',''), nullif(r->>'isTvet',''),
      (r->>'y1m')::int, (r->>'y1f')::int, (r->>'y2m')::int, (r->>'y2f')::int,
      (r->>'y3m')::int, (r->>'y3f')::int, (r->>'y4m')::int, (r->>'y4f')::int,
      (r->>'totalPtM')::int, (r->>'totalPtF')::int,
      (r->>'totalFtM')::int, (r->>'totalFtF')::int,
      (r->>'oecsNatM')::int, (r->>'oecsNatF')::int,
      (r->>'otherCaricomM')::int, (r->>'otherCaricomF')::int,
      (r->>'otherNatM')::int, (r->>'otherNatF')::int,
      (r->>'odaScholarship')::int, coalesce(r->'metadata','{}'::jsonb)
    )
    on conflict (school_id, academic_year, division, programme) do nothing;

    if found then v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;

  -- append failed-validation rows (no dedup; mirrors staff_rejected).
  for r in select jsonb_array_elements(coalesce(p_rejected, '[]'::jsonb)) loop
    insert into enrolment_rejected (institution, academic_year, data, errors)
    values (v_inst, v_year, coalesce(r->'data', '{}'::jsonb), coalesce(r->'errors', '[]'::jsonb));
    v_rejected := v_rejected + 1;
  end loop;

  select code into v_code from schools where id = v_sid;
  return jsonb_build_object(
    'ok', true, 'inserted', v_inserted, 'skipped', v_skipped,
    'rejected', v_rejected, 'institution', v_code
  );
end;
$$;

revoke all on function _resolve_school_byname(text)  from public;
revoke all on function ingest_enrolment(jsonb, jsonb, jsonb) from public;
grant execute on function ingest_enrolment(jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Aggregate stats IGNORING RLS (SECURITY DEFINER) -- true per-institution
-- enrolment rollups so a hidden institution still shows totals. Headcount =
-- full-time + part-time totals; TVET = headcount in is_tvet='Y' programmes.
-- ---------------------------------------------------------------------
drop function if exists enrolment_stats_by_ids(int[]);
create or replace function enrolment_stats_by_ids(p_ids int[])
returns table(school_id int, programmes bigint,
              male bigint, female bigint, total bigint,
              tvet_total bigint, oda bigint)
language sql security definer set search_path = public stable as $$
  select sc.id,
         count(e.id)                                                          as programmes,
         coalesce(sum(coalesce(e.total_ft_m,0)+coalesce(e.total_pt_m,0)),0)   as male,
         coalesce(sum(coalesce(e.total_ft_f,0)+coalesce(e.total_pt_f,0)),0)   as female,
         coalesce(sum(coalesce(e.total_ft_m,0)+coalesce(e.total_pt_m,0)
                     +coalesce(e.total_ft_f,0)+coalesce(e.total_pt_f,0)),0)   as total,
         coalesce(sum(case when e.is_tvet = 'Y'
                      then coalesce(e.total_ft_m,0)+coalesce(e.total_pt_m,0)
                          +coalesce(e.total_ft_f,0)+coalesce(e.total_pt_f,0)
                      else 0 end),0)                                          as tvet_total,
         coalesce(sum(coalesce(e.oda_scholarship,0)),0)                       as oda
    from schools sc
    left join enrolment e on e.school_id = sc.id
   where sc.id = any(p_ids)
   group by sc.id;
$$;

revoke all on function enrolment_stats_by_ids(int[]) from public;
grant execute on function enrolment_stats_by_ids(int[]) to authenticated, service_role;
