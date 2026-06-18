import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { toMatrix, matrixToRecords } from "@/lib/csv";
import { findHeaderRowIndex, detectEntity } from "@/lib/headerAliases";
import { fetchSheetRows } from "@/lib/sheets";
import { processRows } from "@/lib/ingestPipeline";
import { listValueAliases, getPendingAliasesForSubmitter, ingestStaff } from "@/lib/db";
import { getSubmitterIdentity } from "@/lib/submitterIdentity";

// Google Sheets path for the local-dev browser upload. Mirrors /api/process
// but the rows come from a pasted Sheets LINK instead of an uploaded file.
//
// Two retrieval modes, tried in order — the first keeps the teacher side
// zero-config:
//   1. PUBLIC export  — GET .../export?format=csv. Works when the sheet is
//      shared "Anyone with the link (Viewer)" or Published to web. No Google
//      credentials, no per-teacher setup.
//   2. SERVICE ACCOUNT — fetchSheetRows() via GOOGLE_SERVICE_ACCOUNT_EMAIL /
//      GOOGLE_PRIVATE_KEY (app-level, configured once). Used only if the public
//      fetch fails (private sheet shared directly with the service account).
export const runtime = "nodejs";

const OUT_DIR = path.join(process.cwd(), "data", "output");

// Pull the spreadsheet id + optional gid (tab) out of any Sheets URL shape.
function parseSheetUrl(url) {
  const u = String(url || "").trim();
  const id = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    || (/^[a-zA-Z0-9-_]{20,}$/.test(u) ? u : null); // bare id pasted
  const gid = u.match(/[#&?]gid=([0-9]+)/)?.[1] || null;
  return { id, gid };
}

// Try the public CSV export. Returns rows, or null if the sheet isn't publicly
// readable (Google serves an HTML sign-in page / redirect instead of CSV).
// Auto-detects the header row so title/junk rows above it are skipped.
async function fetchPublicCsv(id, gid, entity) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
    + (gid ? `&gid=${gid}` : "");
  const res = await fetch(url, { redirect: "follow" });
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || !ctype.includes("text/csv")) return null; // not public
  const matrix = toMatrix(await res.text());
  return matrixToRecords(matrix, findHeaderRowIndex(matrix, entity));
}

export async function POST(req) {
  const { url, entity: rawEntity } = await req.json().catch(() => ({}));
  let entity = String(rawEntity || "auto");

  const { id, gid } = parseSheetUrl(url);
  if (!id) {
    return NextResponse.json(
      { error: "could not find a spreadsheet id in that link" },
      { status: 400 }
    );
  }

  // ---- retrieve rows (public first, then service account) ----
  let rawRows = null;
  let source = null;
  try {
    rawRows = await fetchPublicCsv(id, gid, entity);
    if (rawRows) source = "public";
  } catch { /* fall through to service account */ }

  if (!rawRows) {
    // Public fetch failed. Fall back to a service account ONLY if the app
    // owner happens to have configured one — never required of the teacher.
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      try {
        rawRows = await fetchSheetRows(id, "A:Z", entity);
        source = "service-account";
      } catch { /* fall through to the public-sharing hint below */ }
    }
  }

  if (!rawRows) {
    // The teacher just needs to make the sheet link-readable — no setup.
    return NextResponse.json({
      error: 'Can\'t read that sheet — it isn\'t shared. In the sheet: Share → General access → "Anyone with the link" → Viewer, then paste the link again.',
    }, { status: 400 });
  }

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return NextResponse.json({ error: "the sheet is empty or unreadable" }, { status: 422 });
  }

  // Auto-identify the record type from the sheet's columns (no dropdown).
  if (entity === "auto" || !["staff", "student", "institution"].includes(entity)) {
    entity = detectEntity(Object.keys(rawRows[0])) || "staff";
  }

  const submittedBy = getSubmitterIdentity(req);

  // Admin-approved value aliases + this uploader's own pending suggestions.
  let extraAliases = [];
  let pendingForSubmitter = [];
  try {
    [extraAliases, pendingForSubmitter] = await Promise.all([
      listValueAliases(entity),
      getPendingAliasesForSubmitter(submittedBy),
    ]);
  } catch { /* no DB -> static only */ }

  const result = processRows(rawRows, entity, {
    createdAt: new Date().toISOString(),
    extraAliases: [...extraAliases, ...pendingForSubmitter],
  });
  if (result.batchError) {
    return NextResponse.json(result.batchError, { status: 422 });
  }

  const alreadyPending = new Set(
    pendingForSubmitter.map((p) => `${p.field}=${p.variant}`)
  );

  // Staff (T10) -> Postgres via the keyless RPC (same as /api/process). The
  // on-disk path below is local-dev only and fails on serverless.
  if (entity === "staff") {
    let outcome;
    try {
      outcome = await ingestStaff({ items: result.accepted, rejected: result.rejected });
    } catch (e) {
      return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      entity,
      source,
      total: result.total,
      accepted: outcome.inserted,
      skipped: outcome.skipped,
      institutions: outcome.institutions,
      rejected: result.rejected,
      headerAliasesApplied: result.headerAliasesApplied,
      valueAliasesApplied: result.valueAliasesApplied,
      dateNormalizationApplied: result.dateNormalizationApplied,
      suggestedAliases: result.suggestedAliases,
      alreadyPending: [...alreadyPending],
      headerWarnings: result.headerWarnings,
    });
  }

  const newRecords = result.accepted.map((a) => a.record);
  const newMapping = result.accepted.map((a) => a.mapping);
  const newRejected = result.rejected;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const recPath = path.join(OUT_DIR, `${entity}-records.json`);
  const mapPath = path.join(OUT_DIR, `${entity}-mapping.json`);
  const rejPath = path.join(OUT_DIR, `${entity}-rejected.json`);

  async function readExisting(p) {
    try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return []; }
  }
  const [existingRec, existingMap, existingRej] = await Promise.all([
    readExisting(recPath), readExisting(mapPath), readExisting(rejPath),
  ]);

  await fs.writeFile(recPath, JSON.stringify([...existingRec, ...newRecords], null, 2), "utf8");
  await fs.writeFile(mapPath, JSON.stringify([...existingMap, ...newMapping], null, 2), "utf8");
  await fs.writeFile(rejPath, JSON.stringify([...existingRej, ...newRejected], null, 2), "utf8");

  return NextResponse.json({
    ok: true,
    entity,
    source,
    total: result.total,
    accepted: newRecords.length,
    rejected: newRejected,
    headerAliasesApplied: result.headerAliasesApplied,
    valueAliasesApplied: result.valueAliasesApplied,
    dateNormalizationApplied: result.dateNormalizationApplied,
    suggestedAliases: result.suggestedAliases,
    alreadyPending: [...alreadyPending],
    headerWarnings: result.headerWarnings,
  });
}
