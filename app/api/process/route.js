import { NextResponse } from "next/server";
import { parseInstrument, isInstrumentWorkbook } from "@/lib/parseInstrument";
import { validateEnrolment } from "@/lib/validateEnrolment";

// Browser upload endpoint — enrolment instrument workbooks only (no PII).
// Strip & validate: parse + validate only (no database write).
// Flat staff/student tables are processed offline in the browser; push to the
// approval layer is a separate explicit step (/api/submissions).
export async function POST(req) {  const form = await req.formData();
  const file = form.get("file");
  let entity = String(form.get("entity") || "student");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  if (entity !== "enrolment" && /\.xlsx?$/i.test(file.name || "") && isInstrumentWorkbook(buf)) {
    entity = "enrolment";
  }

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
      territory: parsed.territory || "",
      academicYear: period.startYear && period.endYear ? `${period.startYear}/${period.endYear}` : (period.raw || ""),
      periodStart: period.startYear || "",
      periodEnd: period.endYear || "",
      background: parsed.background || null,
      finance: parsed.finance || null,
    };
    const { accepted, rejected } = validateEnrolment(parsed.enrolment);
    return NextResponse.json({
      ok: true,
      entity,
      institution: meta.institution,
      academicYear: meta.academicYear,
      total: parsed.enrolment.length,
      accepted: accepted.length,
      skipped: 0,
      rejected,
      readyToPush: accepted.length > 0,
      _meta: meta,
      _accepted: accepted,
    });
  }
  return NextResponse.json({
    error: "Flat uploads must be processed in your browser (Aggregate Data). PII stays in session storage until you push stripped records.",
  }, { status: 400 });
}
