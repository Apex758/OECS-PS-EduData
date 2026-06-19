import { STAFF_SAFE_FIELDS } from "@/lib/staffFields";
import { spliceToken } from "@/lib/client/ruliToken";
import { generateCode } from "@/lib/client/crypto";

const RULI_KEY_STORAGE = "ruliMapperKey";

export function shapeStaffPushRows(accepted) {
  return (accepted || []).map(({ record, mapping, identityHash }) => {
    const s = record.staff || {};
    const row = {
      ruli: record.RULI,
      metadata: { ...record.metadata, tables: record.tables },
      identity_hash: identityHash,
      salt: mapping.salt,
    };
    for (const f of STAFF_SAFE_FIELDS) row[f] = s[f] ?? null;
    return row;
  });
}

export function shapeValidationTokens(accepted) {
  return (accepted || []).map(({ record, mapping }) => ({
    token: spliceToken(record.RULI, mapping.salt),
    ruli: record.RULI,
    salt: mapping.salt,
    institution: record.staff?.institution || mapping.staff?.institution || null,
  }));
}

export function getStoredRuliKey() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(RULI_KEY_STORAGE);
}

export function storeRuliKey(key) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(RULI_KEY_STORAGE, key);
}

export function generateRuliKey() {
  return `rmk_${generateCode(8)}`;
}

export async function ensureRuliKey(institution) {
  let key = getStoredRuliKey();
  if (key) return key;
  key = generateRuliKey();
  const res = await fetch("/api/validation/ruli-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, institution: institution || null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `key registration failed (${res.status})`);
  storeRuliKey(key);
  return key;
}

async function requireDbConfigured() {
  const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({ dbConfigured: false }));
  if (!cfg.dbConfigured) {
    throw new Error(
      "Database not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env — required to submit for approval."
    );
  }
}

export async function pushStrippedPayload({ accepted, rejected, entity, institution }) {
  if (entity !== "staff") {
    throw new Error(`staff push expected, got '${entity}'`);
  }
  await requireDbConfigured();

  const tokens = shapeValidationTokens(accepted);

  const tokRes = await fetch("/api/validation/tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tokens }),
  });
  const tokJson = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok) throw new Error(tokJson.error || `token push failed (${tokRes.status})`);

  const subRes = await fetch("/api/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ entity: "staff", accepted, rejected: rejected || [] }),
  });
  const subJson = await subRes.json().catch(() => ({}));
  if (!subRes.ok) throw new Error(subJson.error || `submission failed (${subRes.status})`);

  return {
    tokensInserted: tokJson.inserted ?? tokens.length,
    duplicatesFound: tokJson.duplicatesFound ?? 0,
    recordsInserted: subJson.inserted ?? 0,
    recordsSkipped: subJson.skipped ?? 0,
    submissionId: subJson.submissionId ?? null,
    status: subJson.status ?? null,
    approvalRequired: subJson.approvalRequired ?? false,
    aggregations: subJson.aggregations ?? 0,
    institutions: subJson.institution ? [subJson.institution] : [],
  };
}

export async function pushEnrolmentPayload({ meta, accepted, rejected }) {
  await requireDbConfigured();
  const res = await fetch("/api/submissions/enrolment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ meta, accepted, rejected: rejected || [] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `enrolment submission failed (${res.status})`);
  return {
    recordsInserted: json.recordsInserted ?? json.inserted ?? 0,
    recordsSkipped: json.recordsSkipped ?? json.skipped ?? 0,
    submissionId: json.submissionId ?? null,
    status: json.status ?? null,
    approvalRequired: json.approvalRequired ?? false,
    aggregations: json.aggregations ?? 0,
    institutions: json.institution ? [json.institution] : [],
  };
}

/** Explicit institution push to validation + approval layer (never called from strip/validate). */
export async function pushToApprovalLayer(entry) {
  const r = entry.result;
  if (r.entity === "staff" && r._accepted?.length) {
    return pushStrippedPayload({
      accepted: r._accepted,
      rejected: r.rejected,
      entity: r.entity,
      institution: r.institution,
    });
  }
  if (r.entity === "enrolment" && r._accepted?.length) {
    return pushEnrolmentPayload({
      meta: r._meta,
      accepted: r._accepted,
      rejected: r.rejected,
    });
  }
  throw new Error("nothing to submit — validate first");
}
