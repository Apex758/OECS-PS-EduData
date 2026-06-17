import { NextResponse } from "next/server";
import { parseUpload } from "@/lib/parseUpload";
import { processRows } from "@/lib/ingestPipeline";
import { ingestStudents, hashKey, listValueAliases } from "@/lib/db";

// Production multi-school path. Schools POST here (push API) with their
// per-school API key:
//
//   POST /api/ingest
//   Header: X-API-Key: <raw key>
//   Body:   multipart/form-data { file: <csv|xlsx>, entity?: "student" }
//
// Pipeline is identical to /api/process; only the destination differs
// (Postgres, scoped to the school the key belongs to). Re-uploading the
// same file is safe -- identical students are skipped, not duplicated.
export const runtime = "nodejs";

export async function POST(req) {
  const rawKey = req.headers.get("x-api-key");
  if (!rawKey) {
    return NextResponse.json({ error: "missing X-API-Key header" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const entity = String(form.get("entity") || "student");

  if (entity !== "student") {
    return NextResponse.json({ error: "only entity=student is supported for ingest" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no file uploaded (field 'file')" }, { status: 400 });
  }

  let rawRows;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    rawRows = parseUpload(buf, file.name, entity);
  } catch (e) {
    return NextResponse.json({ error: `could not read file: ${e.message}` }, { status: 400 });
  }

  let extraAliases = [];
  try { extraAliases = await listValueAliases(entity); } catch { /* static only */ }

  const result = processRows(rawRows, entity, { createdAt: new Date().toISOString(), extraAliases });
  if (result.batchError) {
    return NextResponse.json(result.batchError, { status: 422 });
  }

  let outcome;
  try {
    outcome = await ingestStudents({ keyHash: hashKey(rawKey), items: result.accepted });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (outcome.unauthorized) {
    return NextResponse.json({ error: "invalid or revoked API key" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    school: outcome.school,
    total: result.total,
    inserted: outcome.inserted,           // new students written
    skipped: outcome.skipped,             // duplicates (already ingested)
    rejected: result.rejected,            // failed validation
    headerAliasesApplied: result.headerAliasesApplied,
    valueAliasesApplied: result.valueAliasesApplied,
    dateNormalizationApplied: result.dateNormalizationApplied,
    suggestedAliases: result.suggestedAliases,
    headerWarnings: result.headerWarnings,
  });
}
