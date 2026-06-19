// Auth for external apps pushing to the approval layer (no browser session).
// Accepts either a per-school X-API-Key (sk_…) or a registered RULI Mapper
// Bearer key (rmk_…), then resolves a submitter user for that school.
import { svc } from "@/lib/supabase";
import { hashKey } from "@/lib/db";

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

function schoolContext(s) {
  return {
    schoolId: s.id,
    schoolCode: s.code,
    schoolName: s.name,
    countryId: s.country_id,
    countryIso: s.countries?.iso_code ?? null,
    countryName: s.countries?.name ?? null,
  };
}

async function findSubmitterUserId(schoolId) {
  const links =
    unwrap(
      await svc()
        .from("user_schools")
        .select("user_id, app_users!inner(id, role)")
        .eq("school_id", schoolId)
        .eq("app_users.role", "teacher")
        .limit(1)
    ) || [];
  if (links[0]?.user_id) return links[0].user_id;

  const admins = unwrap(await svc().from("app_users").select("id").eq("role", "admin").limit(1)) || [];
  return admins[0]?.id ?? null;
}

async function resolveSchoolFromLabel(label) {
  if (!label) return null;
  const code = String(label).toUpperCase();
  let row = unwrap(
    await svc()
      .from("schools")
      .select("id, code, name, country_id, countries(iso_code, name)")
      .eq("code", code)
      .maybeSingle()
  );
  if (row) return row;
  return unwrap(
    await svc()
      .from("schools")
      .select("id, code, name, country_id, countries(iso_code, name)")
      .eq("name", String(label))
      .maybeSingle()
  );
}

async function resolveFromApiKey(rawKey) {
  const row = unwrap(
    await svc()
      .from("school_api_keys")
      .select("id, school_id, schools(id, code, name, country_id, countries(iso_code, name))")
      .eq("key_hash", hashKey(rawKey))
      .eq("revoked", false)
      .maybeSingle()
  );
  if (!row?.schools) return { error: "invalid or revoked API key", status: 401 };

  unwrap(
    await svc()
      .from("school_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
  );

  const userId = await findSubmitterUserId(row.school_id);
  if (!userId) return { error: "no submitter user assigned to this school", status: 403 };

  return { userId, schoolCtx: schoolContext(row.schools), authKind: "api_key" };
}

async function resolveFromRuliKey(key) {
  const row = unwrap(
    await svc().from("ruli_mapper_keys").select("id, institution").eq("key", key).maybeSingle()
  );
  if (!row) return { error: "not authorized", status: 403 };

  unwrap(
    await svc()
      .from("ruli_mapper_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
  );

  const school = await resolveSchoolFromLabel(row.institution);
  if (!school) {
    return {
      error: "ruli key has no resolvable institution — re-register with institution code or name",
      status: 403,
    };
  }

  const userId = await findSubmitterUserId(school.id);
  if (!userId) return { error: "no submitter user assigned to this school", status: 403 };

  return { userId, schoolCtx: schoolContext(school), authKind: "ruli_key" };
}

export async function resolveSubmissionApiAuth(req) {
  const rawKey = req.headers.get("x-api-key");
  if (rawKey) {
    const out = await resolveFromApiKey(rawKey);
    if (out.error) return { error: { json: { error: out.error }, status: out.status } };
    return out;
  }

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (m?.[1]?.startsWith("rmk_")) {
    const out = await resolveFromRuliKey(m[1]);
    if (out.error) return { error: { json: { error: out.error }, status: out.status } };
    return out;
  }

  return {
    error: {
      json: { error: "missing X-API-Key header or Bearer rmk_ key" },
      status: 401,
    },
  };
}
