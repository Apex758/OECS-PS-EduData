// Shared ingest pipeline logic — crypto is injected by server or browser callers.
import { normalizeHeaders } from "@/lib/headerAliases";
import { normalizeValues } from "@/lib/valueAliases";
import { normalizeDates } from "@/lib/dateNormalize";
import { rulesByEntity } from "@/lib/validationRules";
import { validateRecord, validateBatch } from "@/lib/validation";
import { buildMetadata, buildTables, buildRecord } from "@/lib/transform";
import { splitSensitive, sensitiveFields } from "@/lib/sensitiveFields";

const ENTITIES = ["staff", "student", "institution"];

function stripRuli(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    const c = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (c === "ruli" || c === "ruti") continue;
    out[k] = v;
  }
  return out;
}

function keepCanonical(rec, entity) {
  const allowed = new Set(Object.keys(rulesByEntity[entity] || {}));
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

// processRowsCore(rawRows, entity, { createdAt, extraAliases, generateCode,
//   generateSalt, hashCode, identityHash, saltFromIdentity })
export function processRowsCore(
  rawRows,
  entity,
  {
    createdAt,
    extraAliases = [],
    generateCode,
    generateSalt,
    hashCode,
    identityHash,
    saltFromIdentity = false,
  } = {}
) {
  if (!generateCode || !generateSalt || !hashCode || !identityHash) {
    return { batchError: { error: "crypto helpers required" } };
  }
  if (!ENTITIES.includes(entity)) {
    return { batchError: { error: `entity must be one of ${ENTITIES.join(", ")}` } };
  }
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { batchError: { error: "no rows: file empty or unparseable" } };
  }

  const norm = normalizeHeaders(rawRows, entity);
  const vals = normalizeValues(norm.records, entity, rulesByEntity[entity], extraAliases);
  const dts = normalizeDates(vals.records, entity, rulesByEntity[entity]);
  const rows = dts.records.map(stripRuli).map((r) => keepCanonical(r, entity));

  const headerWarnings = [];
  if (norm.unknown.length) headerWarnings.push(`unrecognized columns ignored: ${norm.unknown.join(", ")}`);
  for (const c of norm.collisions) {
    headerWarnings.push(`columns [${c.from.join(", ")}] all map to "${c.canonical}" -- using last`);
  }
  const unrecSeen = new Set();
  for (const u of vals.unrecognized) {
    const k = `${u.field}=${u.value}`;
    if (unrecSeen.has(k)) continue;
    unrecSeen.add(k);
    headerWarnings.push(`unrecognized ${u.field} value "${u.value}" -- left as-is (will fail validation if not allowed)`);
  }
  if (dts.applied.length && !dts.ambiguous) {
    headerWarnings.push(`dates read as ${dts.dayFirst ? "day/month/year" : "month/day/year"} and reformatted to ISO (YYYY-MM-DD)`);
  }
  if (dts.ambiguous && dts.applied.length) {
    headerWarnings.push(`ambiguous date order -- assumed ${dts.dayFirst ? "day/month/year" : "month/day/year"}; verify if your school uses the other order`);
  }
  const dateUnparsedSeen = new Set();
  for (const u of dts.unparsed) {
    const k = `${u.field}=${u.value}`;
    if (dateUnparsedSeen.has(k)) continue;
    dateUnparsedSeen.add(k);
    headerWarnings.push(`unrecognized ${u.field} date "${u.value}" -- left as-is (will fail validation)`);
  }

  const batch = validateBatch(rows, entity);
  if (!batch.valid) {
    return { batchError: { error: "batch validation failed", errors: batch.errors } };
  }

  const when = createdAt || new Date().toISOString();
  const accepted = [];
  const rejected = [];
  const suggestSeen = new Set();
  const suggestedAliases = [];

  rows.forEach((data, i) => {
    const v = validateRecord(data, i, entity);
    if (!v.valid) {
      rejected.push({ row: i, errors: v.errors, data });
      for (const e of v.errors) {
        if (e.code !== "not_in_options") continue;
        const key = `${e.field}=${e.value}`;
        if (suggestSeen.has(key)) continue;
        suggestSeen.add(key);
        suggestedAliases.push({
          entity,
          field: e.field,
          value: e.value,
          options: (rulesByEntity[entity]?.[e.field]?.values) || [],
          institution: data.institution || null,
        });
      }
      return;
    }

    const idHash = identityHash(data, entity);
    const code = generateCode();
    const salt = saltFromIdentity ? idHash : generateSalt();
    const hash = hashCode(code, salt);
    const { safe, sensitive } = splitSensitive(data, entity);
    const metadata = buildMetadata({ code, salt, hash, rowIndex: i, createdAt: when, entity });
    const tables = buildTables(safe, { code, salt, entity });

    accepted.push({
      record: buildRecord({ code, metadata, entity, data: safe, tables }),
      mapping: { RULI: code, salt, [entity]: sensitive },
      identityHash: idHash,
    });
  });

  return {
    entity,
    total: rows.length,
    accepted,
    rejected,
    headerAliasesApplied: norm.applied,
    valueAliasesApplied: vals.applied,
    dateNormalizationApplied: dts.applied,
    suggestedAliases,
    headerWarnings,
    batchError: null,
  };
}
