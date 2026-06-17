import { NextResponse } from "next/server";
import { buildEnrolmentDemo } from "@/lib/enrolmentDemoData";
import { validateEnrolment } from "@/lib/validateEnrolment";
import { ingestEnrolment } from "@/lib/db";

// =====================================================================
// DEMO DATA  --  synthetic OECS instrument (T2) enrolment, straight to DB.
// =====================================================================
// Builds one workbook per institution (Cover institution + Background
// academic year + Enrolment programme rows), validates each through the
// same gate real uploads use (lib/validateEnrolment.js), then ingests the
// accepted rows and persists the rejects -- so the Enrolment dashboard,
// records table, and rejected view all populate from Postgres.
//
// Two rows are intentionally broken in the demo data (bad isTvet enum + a
// nationality split that doesn't reconcile) to show the rejected view.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const workbooks = buildEnrolmentDemo();

  let inserted = 0;
  let skipped = 0;
  let rejectedCount = 0;
  const institutions = new Set();
  const territories = new Set();

  for (const { meta, rows } of workbooks) {
    const { accepted, rejected } = validateEnrolment(rows);
    let outcome;
    try {
      outcome = await ingestEnrolment({ meta, rows: accepted, rejected });
    } catch (e) {
      return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
    }
    inserted += outcome.inserted || 0;
    skipped += outcome.skipped || 0;
    rejectedCount += outcome.rejected || 0;
    if (meta.institution) institutions.add(meta.institution);
    if (meta.territory) territories.add(meta.territory);
  }

  return NextResponse.json({
    ok: true,
    institutions: institutions.size,
    territories: territories.size,
    programmes: inserted,
    skipped,
    rejected: rejectedCount,
  });
}
