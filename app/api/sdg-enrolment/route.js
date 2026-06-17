import { NextResponse } from "next/server";
import { computeEnrolment, computeEnrolmentGroups } from "@/lib/sdgEnrolment";
import { readEnrolment } from "@/lib/db";

// Enrolment SDG dashboard source: the T2 programme rows in Postgres. No PII
// here -- every value is an aggregate count -- so this is a plain rollup.
export const runtime = "nodejs";
// Read live every request -- never serve a cached (possibly empty) snapshot.
// fetchCache stops Next from caching supabase-js's internal REST GET.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EMPTY = {
  count: 0,
  totals: { male: 0, female: 0, total: 0, tvet: 0, oda: 0 },
  indicators: [],
  distributions: { byDivision: [], byProgramme: [], byAccreditation: [] },
  byInstitution: [],
  byTerritory: [],
};

export async function GET() {
  let rows;
  try {
    rows = await readEnrolment();
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!rows.length) return NextResponse.json(EMPTY);

  return NextResponse.json({
    ...computeEnrolment(rows),                              // global rollup
    byInstitution: computeEnrolmentGroups(rows, "institution"),
    byTerritory: computeEnrolmentGroups(rows, "territory"),
  });
}
