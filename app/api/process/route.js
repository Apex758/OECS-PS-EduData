import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseUpload } from "@/lib/parseUpload";
import { parseInstrument, isInstrumentWorkbook } from "@/lib/parseInstrument";
import { validateEnrolment } from "@/lib/validateEnrolment";
import { processRows } from "@/lib/ingestPipeline";
import { listValueAliases, getPendingAliasesForSubmitter, ingestStaff, ingestEnrolment } from "@/lib/db";
import { getSubmitterIdentity } from "@/lib/submitterIdentity";

// Local-dev path: browser upload -> coded JSON files on disk.
// (Production multi-school path is /api/ingest -> Postgres.)
const OUT_DIR = path.join(process.cwd(), "data", "output");

export async function POST(req) {
  const form = await req.formData();
  const file = form.get("file");
  let entity = String(form.get("entity") || "student");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  // Read the bytes once; reused by every parser below.
  const buf = Buffer.from(await file.arrayBuffer());

  // Auto-route: an instrument workbook (Cover/Background/Enrolment sheets) is
  // processed as enrolment even if the Data type dropdown says staff/student,
  // so a drop-in isn't silently misread as a flat table.
  if (entity !== "enrolment" && /\.xlsx?$/i.test(file.name || "") && isInstrumentWorkbook(buf)) {
    entity = "enrolment";
  }

  // ---- Enrolment (instrument T2): a multi-sheet workbook, not a flat table.
  // Parse the three sheets (Cover/Background/Enrolment) and push the programme
  // rows + workbook metadata to Postgres. No PII -> no pipeline/anonymizer.
  if (entity === "enrolment") {
    let parsed;
    try {
      parsed = parseInstrument(buf);
    } catch (e) {
      return NextResponse.json({ error: `could not read instrument: ${e.message}` }, { status: 400 });
    }
    if (!parsed.enrolment.length) {
      return NextResponse.json(
        { error: "no programme rows found on the Enrolment sheet" }, { status: 422 }
      );
    }
    const period = parsed.reportPeriod || {};
    const meta = {
      institution: parsed.institution || "",
      academicYear: period.startYear && period.endYear ? `${period.startYear}/${period.endYear}` : (period.raw || ""),
      periodStart: period.startYear || "",
      periodEnd: period.endYear || "",
    };
    // Same validation gate the demo uses: split into accepted / rejected so
    // bad programme rows surface instead of ingesting silently.
    const { accepted, rejected } = validateEnrolment(parsed.enrolment);
    let outcome;
    try {
      outcome = await ingestEnrolment({ meta, rows: accepted, rejected });
    } catch (e) {
      return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      entity,
      institution: meta.institution,
      academicYear: meta.academicYear,
      total: parsed.enrolment.length,
      accepted: outcome.inserted,
      skipped: outcome.skipped,
      institutionCode: outcome.institution,
      rejected,
    });
  }

  let rawRows;
  try {
    rawRows = parseUpload(buf, file.name, entity);
  } catch (e) {
    return NextResponse.json({ error: `could not read file: ${e.message}` }, { status: 400 });
  }

  const submittedBy = getSubmitterIdentity(req);

  // Admin-approved value aliases + this uploader's own pending suggestions
  // (best-effort; empty if DB unavailable).
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

  // Keys of suggestions already pending for this uploader so the UI can
  // show "Awaiting approval" instead of the submission form.
  const alreadyPending = new Set(
    pendingForSubmitter.map((p) => `${p.field}=${p.variant}`)
  );

  // ---- Staff (T10): persist to Postgres via the keyless server-trusted RPC.
  // (The legacy on-disk path below is local-dev only and fails on read-only
  // serverless filesystems; staff is the production entity.)
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
      total: result.total,
      accepted: outcome.inserted,           // new staff written
      skipped: outcome.skipped,             // duplicates (already ingested)
      institutions: outcome.institutions,   // resolved school codes touched
      rejected: result.rejected,            // failed validation
      headerAliasesApplied: result.headerAliasesApplied,
      valueAliasesApplied: result.valueAliasesApplied,
      dateNormalizationApplied: result.dateNormalizationApplied,
      suggestedAliases: result.suggestedAliases,
      alreadyPending: [...alreadyPending],
      headerWarnings: result.headerWarnings,
    });
  }

  // unbundle the shared pipeline output into the two file shapes
  const newRecords = result.accepted.map((a) => a.record);
  const newMapping = result.accepted.map((a) => a.mapping);
  const newRejected = result.rejected;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const recPath = path.join(OUT_DIR, `${entity}-records.json`);
  const mapPath = path.join(OUT_DIR, `${entity}-mapping.json`);
  const rejPath = path.join(OUT_DIR, `${entity}-rejected.json`);

  // Append to existing data so multi-file bulk uploads accumulate correctly.
  async function readExisting(p) {
    try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return []; }
  }
  const [existingRec, existingMap, existingRej] = await Promise.all([
    readExisting(recPath), readExisting(mapPath), readExisting(rejPath),
  ]);

  const records = [...existingRec, ...newRecords];
  const mapping = [...existingMap, ...newMapping];
  const rejected = [...existingRej, ...newRejected];

  await fs.writeFile(recPath, JSON.stringify(records, null, 2), "utf8");
  await fs.writeFile(mapPath, JSON.stringify(mapping, null, 2), "utf8");
  await fs.writeFile(rejPath, JSON.stringify(rejected, null, 2), "utf8");

  return NextResponse.json({
    ok: true,
    entity,
    total: result.total,
    accepted: newRecords.length,
    rejected: newRejected,
    headerAliasesApplied: result.headerAliasesApplied,
    valueAliasesApplied: result.valueAliasesApplied,
    dateNormalizationApplied: result.dateNormalizationApplied,
    suggestedAliases: result.suggestedAliases,
    alreadyPending: [...alreadyPending],
    headerWarnings: result.headerWarnings,
    files: [recPath, mapPath],
    sample: records[0] ?? null,
  });
}
