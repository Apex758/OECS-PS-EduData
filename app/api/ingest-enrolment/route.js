import { NextResponse } from "next/server";
import { isAdminOrRuliKey } from "@/lib/ruliKeyAuth";
import { parseInstrument } from "@/lib/parseInstrument";
import { validateEnrolment } from "@/lib/validateEnrolment";
import { ingestEnrolment, valLogEvent } from "@/lib/db";

// Exe enrolment push: the standalone forwards the raw instrument workbook
// (Cover/Background/Enrolment) here. Enrolment is AGGREGATE counts with NO
// personal data -- nothing to anonymize -- so sending the raw bytes is
// privacy-safe and lets the server run the exact same pipeline as the browser
// /api/process enrolment branch (parseInstrument -> validate -> ingest).
//
//   POST /api/ingest-enrolment
//   Header: Authorization: Bearer rmk_<hex>
//   Body:   { fileBase64: "<xlsx>", fileName: "name.xlsx" }
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "not authorized" }, { status: 403 });

export async function POST(req) {
  if (!(await isAdminOrRuliKey(req))) return deny();

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { fileBase64 } = body || {};
  if (!fileBase64 || typeof fileBase64 !== "string") {
    return NextResponse.json({ error: "fileBase64 required" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseInstrument(Buffer.from(fileBase64, "base64"));
  } catch (e) {
    return NextResponse.json({ error: `could not read instrument: ${e.message}` }, { status: 400 });
  }
  if (!parsed.enrolment.length) {
    return NextResponse.json({ error: "no programme rows found on the Enrolment sheet" }, { status: 422 });
  }

  const period = parsed.reportPeriod || {};
  const meta = {
    institution: parsed.institution || "",
    academicYear: period.startYear && period.endYear ? `${period.startYear}/${period.endYear}` : (period.raw || ""),
    periodStart: period.startYear || "",
    periodEnd: period.endYear || "",
    background: parsed.background || null,
    finance: parsed.finance || null,
  };
  const { accepted, rejected } = validateEnrolment(parsed.enrolment);

  let outcome;
  try {
    outcome = await ingestEnrolment({ meta, rows: accepted, rejected });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }

  await valLogEvent({
    kind: "enrolment",
    institution: outcome.institution || meta.institution || null,
    detail: { total: parsed.enrolment.length, inserted: outcome.inserted, skipped: outcome.skipped, rejected: rejected.length },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    entity: "enrolment",
    institution: meta.institution,
    academicYear: meta.academicYear,
    total: parsed.enrolment.length,
    inserted: outcome.inserted,
    skipped: outcome.skipped,
    institutionCode: outcome.institution,
    rejected: rejected.length,
  });
}
