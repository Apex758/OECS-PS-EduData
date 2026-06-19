import { detectEntity } from "@/lib/headerAliases";
import { detectRegistryEntity, isRegistryWorkbook } from "@/lib/registryWorkbook";
import * as XLSX from "xlsx";
import { parseUploadBrowser } from "@/lib/client/parseUploadBrowser";
import { processRowsClient } from "@/lib/client/processRowsClient";
import { saveMappings } from "@/lib/client/piiVault";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function isInstrumentWorkbookFile(buf) {
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const names = wb.SheetNames.map((n) => norm(n));
    const has = (w) => names.includes(w);
    return has("enrolment") && (has("cover") || has("background"));
  } catch {
    return false;
  }
}

function probeEntity(buf, fileName) {
  if (isRegistryWorkbook(buf)) {
    return detectRegistryEntity(buf) || "staff";
  }
  let probe = [];
  try {
    probe = parseUploadBrowser(buf, fileName, "staff");
  } catch { /* fall back */ }
  if (!probe.length) {
    try {
      probe = parseUploadBrowser(buf, fileName, "student");
    } catch { /* fall back */ }
  }
  const headers = probe.length ? Object.keys(probe[0]) : [];
  return detectEntity(headers) || "staff";
}

// Parse + validate + strip PII entirely in the browser (no network).
export async function processFileOffline(file, { entity = "auto" } = {}) {
  const buf = await file.arrayBuffer();
  const fileName = file.name || "";

  if (/\.xlsx?$/i.test(fileName) && isInstrumentWorkbookFile(buf)) {
    return {
      error: "Enrolment instrument workbooks use the Enrolment sheet — export Teachers/Students registry sheets as CSV or use the combined registry Teachers tab via Validate.",
    };
  }

  let resolved = entity;
  if (resolved === "auto" || !["staff", "student", "institution"].includes(resolved)) {
    resolved = probeEntity(buf, fileName);
  }

  let rawRows;
  try {
    rawRows = parseUploadBrowser(buf, fileName, resolved);
  } catch (e) {
    return { error: `could not read file: ${e.message}` };
  }

  if (isRegistryWorkbook(buf) && rawRows.length && !rawRows.some((r) => String(r.institution || "").trim())) {
    return {
      error: "Fill the Institution field on the Cover sheet (combined registry workbook) before validating.",
    };
  }

  const result = processRowsClient(rawRows, resolved, {
    createdAt: new Date().toISOString(),
    extraAliases: [],
  });

  if (result.batchError) {
    return { error: result.batchError.error, errors: result.batchError.errors };
  }

  saveMappings(result.accepted);

  const institution =
    result.accepted[0]?.record?.[resolved]?.institution ||
    result.accepted[0]?.record?.staff?.institution ||
    rawRows[0]?.institution ||
    null;

  return {
    ok: true,
    entity: resolved,
    total: result.total,
    accepted: result.accepted.length,
    skipped: 0,
    rejected: result.rejected,
    headerAliasesApplied: result.headerAliasesApplied,
    valueAliasesApplied: result.valueAliasesApplied,
    dateNormalizationApplied: result.dateNormalizationApplied,
    suggestedAliases: result.suggestedAliases,
    alreadyPending: [],
    headerWarnings: result.headerWarnings,
    institution,
    _accepted: result.accepted,
    clientProcessed: true,
  };
}

export async function isEnrolmentWorkbookFile(file) {
  const buf = await file.arrayBuffer();
  const fileName = file.name || "";
  if (!/\.xlsx?$/i.test(fileName)) return false;
  return isInstrumentWorkbookFile(buf);
}

export async function isRegistryWorkbookFile(file) {
  const buf = await file.arrayBuffer();
  const fileName = file.name || "";
  if (!/\.xlsx?$/i.test(fileName)) return false;
  return isRegistryWorkbook(buf);
}
