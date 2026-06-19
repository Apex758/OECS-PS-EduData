-- =====================================================================
-- APPROVAL RPCs  (run AFTER approval.sql)
-- =====================================================================

-- Returns true when a user may submit for a school (teacher assignment or admin).
create or replace function _user_can_submit(p_user_id int, p_school_id int)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from app_users u
    where u.id = p_user_id
      and (
        u.role = 'admin'
        or exists (
          select 1 from user_schools us
          where us.user_id = u.id and us.school_id = p_school_id
        )
      )
  );
$$;

-- Returns true when minister owns the submission's country.
create or replace function _minister_owns_country(p_user_id int, p_country_id int)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from app_users u
    where u.id = p_user_id
      and u.role = 'minister'
      and u.country_id = p_country_id
  );
$$;

-- ---------------------------------------------------------------------
-- submit_staff_submission  --  atomic institution push with aggregations.
-- p_aggregations: [{ sdg, numerator, denominator, result, metadata }]
-- ---------------------------------------------------------------------
drop function if exists submit_staff_submission(jsonb, jsonb, int, jsonb);
create or replace function submit_staff_submission(
  p_rows jsonb,
  p_rejected jsonb,
  p_user_id int,
  p_aggregations jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r               jsonb;
  agg             jsonb;
  v_cid           int;
  v_sid           int;
  v_sub_id        int;
  v_agg_id        int;
  v_need_l2       boolean := false;
  v_l2_auto       boolean := false;
  v_inserted      int := 0;
  v_skipped       int := 0;
  v_rejected      int := 0;
  v_agg_count     int := 0;
  v_code          text;
  v_status        text;
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    return jsonb_build_object('error', 'rows[] required');
  end if;

  select elem into r from jsonb_array_elements(p_rows) elem limit 1;
  v_cid := _resolve_country(r->>'territory');
  v_sid := _resolve_school(v_cid, r->>'institution');

  if not _user_can_submit(p_user_id, v_sid) then
    return jsonb_build_object('error', 'not authorized for this institution');
  end if;

  select coalesce(ac.approval_required, false) into v_need_l2
    from approval_config ac where ac.country_id = v_cid;
  if not found then v_need_l2 := false; end if;

  v_l2_auto := not v_need_l2;
  v_status := case when v_need_l2 then 'pending_l2' else 'approved' end;

  insert into submissions (school_id, country_id, entity, status, submitted_by)
  values (v_sid, v_cid, 'staff', v_status, p_user_id)
  returning id into v_sub_id;

  for r in select jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into staff (
      ruli, school_id, country_id, institution, territory,
      classification, teacher_type, subjects, total_periods, years_experience,
      highest_qualification, area_of_specialisation, cpd_hours, appraised,
      left_service, sex, metadata, identity_hash, is_demo, submission_id
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
      coalesce(r->'metadata', '{}'::jsonb), r->>'identity_hash', false, v_sub_id
    )
    on conflict (school_id, identity_hash) where identity_hash is not null do nothing;

    if found then
      insert into staff_mapping (ruli, school_id, country_id, salt, sensitive)
      values (r->>'ruli', v_sid, v_cid, r->>'salt', coalesce(r->'sensitive', '{}'::jsonb));
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  for r in select jsonb_array_elements(coalesce(p_rejected, '[]'::jsonb)) loop
    insert into staff_rejected (institution, territory, data, errors, submission_id)
    values (
      nullif(r->'data'->>'institution', ''), nullif(r->'data'->>'territory', ''),
      coalesce(r->'data', '{}'::jsonb), coalesce(r->'errors', '[]'::jsonb), v_sub_id
    );
    v_rejected := v_rejected + 1;
  end loop;

  for agg in select jsonb_array_elements(coalesce(p_aggregations, '[]'::jsonb)) loop
    insert into aggregations (submission_id, sdg, country_id, school_id, numerator, denominator, result, metadata)
    values (
      v_sub_id,
      agg->>'sdg',
      v_cid,
      v_sid,
      nullif(agg->>'numerator', '')::numeric,
      nullif(agg->>'denominator', '')::numeric,
      nullif(agg->>'result', '')::numeric,
      coalesce(agg->'metadata', '{}'::jsonb)
    )
    returning id into v_agg_id;

    insert into approvals (aggregation_id, l1, l2, l2_at, l2_by)
    values (
      v_agg_id,
      true,
      v_l2_auto,
      case when v_l2_auto then now() else null end,
      case when v_l2_auto then p_user_id else null end
    );
    v_agg_count := v_agg_count + 1;
  end loop;

  if v_l2_auto then
    update submissions
       set l2_by = p_user_id, l2_at = now()
     where id = v_sub_id;
  end if;

  select code into v_code from schools where id = v_sid;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_sub_id,
    'status', v_status,
    'approvalRequired', v_need_l2,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'rejected', v_rejected,
    'aggregations', v_agg_count,
    'institution', v_code
  );
end;
$$;

-- ---------------------------------------------------------------------
-- approve_submission_l2  --  minister approves a pending batch
-- ---------------------------------------------------------------------
drop function if exists approve_submission_l2(int, int);
create or replace function approve_submission_l2(p_submission_id int, p_minister_id int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub submissions%rowtype;
  v_count int;
begin
  select * into v_sub from submissions where id = p_submission_id;
  if not found then
    return jsonb_build_object('error', 'submission not found');
  end if;
  if v_sub.status <> 'pending_l2' then
    return jsonb_build_object('error', 'submission not pending approval');
  end if;
  if not _minister_owns_country(p_minister_id, v_sub.country_id) then
    return jsonb_build_object('error', 'not authorized for this territory');
  end if;

  update submissions
     set status = 'approved', l2_by = p_minister_id, l2_at = now()
   where id = p_submission_id;

  update approvals a
     set l2 = true, l2_at = now(), l2_by = p_minister_id
    from aggregations g
   where g.submission_id = p_submission_id
     and a.aggregation_id = g.id;

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'submissionId', p_submission_id, 'approvalsUpdated', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- reject_submission  --  minister rejects a pending batch
-- ---------------------------------------------------------------------
drop function if exists reject_submission(int, int, text);
create or replace function reject_submission(p_submission_id int, p_minister_id int, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub submissions%rowtype;
begin
  select * into v_sub from submissions where id = p_submission_id;
  if not found then
    return jsonb_build_object('error', 'submission not found');
  end if;
  if v_sub.status <> 'pending_l2' then
    return jsonb_build_object('error', 'submission not pending approval');
  end if;
  if not _minister_owns_country(p_minister_id, v_sub.country_id) then
    return jsonb_build_object('error', 'not authorized for this territory');
  end if;

  update submissions
     set status = 'rejected', l2_by = p_minister_id, l2_at = now(), reject_reason = nullif(p_reason, '')
   where id = p_submission_id;

  return jsonb_build_object('ok', true, 'submissionId', p_submission_id);
end;
$$;

-- ---------------------------------------------------------------------
-- list_pending_submissions  --  minister queue for a country
-- ---------------------------------------------------------------------
drop function if exists list_pending_submissions(int);
create or replace function list_pending_submissions(p_country_id int)
returns table(
  id int, school_id int, school_code text, school_name text,
  entity text, submitted_at timestamptz, submitted_by int, submitter_email text,
  aggregation_count bigint, inserted_staff bigint
)
language sql security definer set search_path = public stable as $$
  select s.id, s.school_id, sc.code, sc.name,
         s.entity, s.submitted_at, s.submitted_by, u.email,
         (select count(*) from aggregations g where g.submission_id = s.id),
         (select count(*) from staff st where st.submission_id = s.id)
    from submissions s
    join schools sc on sc.id = s.school_id
    left join app_users u on u.id = s.submitted_by
   where s.country_id = p_country_id
     and s.status = 'pending_l2'
   order by s.submitted_at desc;
$$;

-- ---------------------------------------------------------------------
-- list_submissions_for_user  --  institution view of own submissions
-- ---------------------------------------------------------------------
drop function if exists list_submissions_for_user(int);
create or replace function list_submissions_for_user(p_user_id int)
returns table(
  id int, school_code text, school_name text, entity text, status text,
  submitted_at timestamptz, approval_required boolean, aggregation_count bigint
)
language sql security definer set search_path = public stable as $$
  select s.id, sc.code, sc.name, s.entity, s.status, s.submitted_at,
         coalesce(ac.approval_required, false),
         (select count(*) from aggregations g where g.submission_id = s.id)
    from submissions s
    join schools sc on sc.id = s.school_id
    left join approval_config ac on ac.country_id = s.country_id
   where s.submitted_by = p_user_id
      or exists (
        select 1 from user_schools us
        where us.user_id = p_user_id and us.school_id = s.school_id
      )
   order by s.submitted_at desc;
$$;

-- ---------------------------------------------------------------------
-- submit_enrolment_submission  --  atomic enrolment push with aggregations.
-- p_meta: { institution, territory, academicYear, periodStart, periodEnd }
-- p_rows: programme rows (camelCase keys from validateEnrolment)
-- ---------------------------------------------------------------------
drop function if exists submit_enrolment_submission(jsonb, jsonb, jsonb, int, jsonb);
create or replace function submit_enrolment_submission(
  p_meta jsonb,
  p_rows jsonb,
  p_rejected jsonb,
  p_user_id int,
  p_aggregations jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r           jsonb;
  agg         jsonb;
  v_sid       int;
  v_cid       int;
  v_sub_id    int;
  v_agg_id    int;
  v_need_l2   boolean := false;
  v_l2_auto   boolean := false;
  v_inserted  int := 0;
  v_skipped   int := 0;
  v_rejected  int := 0;
  v_agg_count int := 0;
  v_code      text;
  v_status    text;
  v_year      text := nullif(p_meta->>'academicYear', '');
  v_pstart    int  := nullif(p_meta->>'periodStart', '')::int;
  v_pend      int  := nullif(p_meta->>'periodEnd', '')::int;
  v_inst      text := nullif(p_meta->>'institution', '');
  v_terr      text := nullif(p_meta->>'territory', '');
begin
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    return jsonb_build_object('error', 'rows[] required');
  end if;

  if v_terr is not null then
    v_cid := _resolve_country(v_terr);
    v_sid := _resolve_school(v_cid, coalesce(v_inst, 'Unspecified Institution'));
  else
    select o_school_id, o_country_id into v_sid, v_cid
      from _resolve_school_byname(v_inst);
  end if;

  if not _user_can_submit(p_user_id, v_sid) then
    return jsonb_build_object('error', 'not authorized for this institution');
  end if;

  select coalesce(ac.approval_required, false) into v_need_l2
    from approval_config ac where ac.country_id = v_cid;
  if not found then v_need_l2 := false; end if;

  v_l2_auto := not v_need_l2;
  v_status := case when v_need_l2 then 'pending_l2' else 'approved' end;

  insert into submissions (school_id, country_id, entity, status, submitted_by)
  values (v_sid, v_cid, 'enrolment', v_status, p_user_id)
  returning id into v_sub_id;

  for r in select jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into enrolment (
      school_id, country_id, institution, academic_year, period_start, period_end,
      division, certification, programme, accredited, is_tvet,
      y1m, y1f, y2m, y2f, y3m, y3f, y4m, y4f,
      total_pt_m, total_pt_f, total_ft_m, total_ft_f,
      oecs_nat_m, oecs_nat_f, other_caricom_m, other_caricom_f,
      other_nat_m, other_nat_f, oda_scholarship, metadata, submission_id
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
      (r->>'odaScholarship')::int,
      coalesce(r->'metadata','{}'::jsonb), v_sub_id
    )
    on conflict (school_id, academic_year, division, programme) do nothing;

    if found then v_inserted := v_inserted + 1;
    else v_skipped := v_skipped + 1; end if;
  end loop;

  for r in select jsonb_array_elements(coalesce(p_rejected, '[]'::jsonb)) loop
    insert into enrolment_rejected (institution, academic_year, data, errors, submission_id)
    values (v_inst, v_year, coalesce(r->'data', '{}'::jsonb), coalesce(r->'errors', '[]'::jsonb), v_sub_id);
    v_rejected := v_rejected + 1;
  end loop;

  for agg in select jsonb_array_elements(coalesce(p_aggregations, '[]'::jsonb)) loop
    insert into aggregations (submission_id, sdg, country_id, school_id, numerator, denominator, result, metadata)
    values (
      v_sub_id,
      agg->>'sdg',
      v_cid,
      v_sid,
      nullif(agg->>'numerator', '')::numeric,
      nullif(agg->>'denominator', '')::numeric,
      nullif(agg->>'result', '')::numeric,
      coalesce(agg->'metadata', '{}'::jsonb)
    )
    returning id into v_agg_id;

    insert into approvals (aggregation_id, l1, l2, l2_at, l2_by)
    values (
      v_agg_id,
      true,
      v_l2_auto,
      case when v_l2_auto then now() else null end,
      case when v_l2_auto then p_user_id else null end
    );
    v_agg_count := v_agg_count + 1;
  end loop;

  if v_l2_auto then
    update submissions
       set l2_by = p_user_id, l2_at = now()
     where id = v_sub_id;
  end if;

  select code into v_code from schools where id = v_sid;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_sub_id,
    'status', v_status,
    'approvalRequired', v_need_l2,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'rejected', v_rejected,
    'aggregations', v_agg_count,
    'institution', v_code
  );
end;
$$;

revoke all on function _user_can_submit(int, int) from public;
revoke all on function _minister_owns_country(int, int) from public;
revoke all on function submit_staff_submission(jsonb, jsonb, int, jsonb) from public;
revoke all on function submit_enrolment_submission(jsonb, jsonb, jsonb, int, jsonb) from public;
revoke all on function approve_submission_l2(int, int) from public;
revoke all on function reject_submission(int, int, text) from public;
revoke all on function list_pending_submissions(int) from public;
revoke all on function list_submissions_for_user(int) from public;

grant execute on function submit_staff_submission(jsonb, jsonb, int, jsonb) to service_role;
grant execute on function submit_enrolment_submission(jsonb, jsonb, jsonb, int, jsonb) to service_role;
grant execute on function approve_submission_l2(int, int) to service_role;
grant execute on function reject_submission(int, int, text) to service_role;
grant execute on function list_pending_submissions(int) to service_role;
grant execute on function list_submissions_for_user(int) to service_role;
