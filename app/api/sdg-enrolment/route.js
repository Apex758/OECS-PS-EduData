import { NextResponse } from "next/server";
import { computeEnrolment, computeEnrolmentGroups } from "@/lib/sdgEnrolment";
import { computeBackground } from "@/lib/sdgBackground";
import { computeFinance } from "@/lib/sdgFinance";
import { computeSystem } from "@/lib/sdgSystem";
import { readEnrolment, readEnrolmentRejected } from "@/lib/db";

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
  background: { count: 0, indicators: [], institutions: [] },
  finance: { count: 0, indicators: [], institutions: [] },
  system: { count: 0, indicators: [], territories: [] },
  rows: [],
  rejected: [],
};

export async function GET() {
  let rows, rejected;
  try {
    [rows, rejected] = await Promise.all([readEnrolment(), readEnrolmentRejected()]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!rows.length && !rejected.length) return NextResponse.json(EMPTY);

  return NextResponse.json({
    ...computeEnrolment(rows),                              // global rollup
    byInstitution: computeEnrolmentGroups(rows, "institution"),
    byTerritory: computeEnrolmentGroups(rows, "territory"),
    background: computeBackground(rows),                    // SDG 4.a.1 / 4.a.3 from row metadata
    finance: computeFinance(rows),                          // SDG 4.5.3 / 4.5.4 / 4.c.5 from row metadata
    system: computeSystem(rows),                            // SDG 4.3.2 GER / 4.5.6 %GDP from row data + reference inputs
    rows,        // raw programme rows for the records table (incl. institution, territory, academicYear)
    rejected,    // failed-validation rows for the rejected view
  });
}
