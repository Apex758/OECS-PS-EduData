import { NextResponse } from "next/server";
import { computeIndicators, computeGroups } from "@/lib/sdgIndicators";
import { readStaffRecords, readEnrolment } from "@/lib/db";

// Headcount of one enrolment (T2) programme row: full-time + part-time, M + F.
const headcount = (r) =>
  ["totalFtM", "totalFtF", "totalPtM", "totalPtF"].reduce((s, k) => s + (Number(r[k]) || 0), 0);

// Sum enrolment rows into { total, byInstitution:{...}, byTerritory:{...} } pupil
// counts -- the denominators staff-side ratios (4.c.2 / 4.c.4) divide pupils by.
function pupilTotals(rows) {
  const byInstitution = {}, byTerritory = {};
  let total = 0;
  for (const r of rows) {
    const h = headcount(r);
    total += h;
    const inst = (r.institution || "").trim();
    const terr = (r.territory || "").trim();
    if (inst) byInstitution[inst] = (byInstitution[inst] || 0) + h;
    if (terr) byTerritory[terr] = (byTerritory[terr] || 0) + h;
  }
  return { total, byInstitution, byTerritory };
}

// SDG dashboard source: the anonymized staff dash records, now read from
// Postgres (staff table) instead of staff-records.json. Only SAFE fields are
// stored there -- names/DOB live in staff_mapping and are never read here.
export const runtime = "nodejs";
// Read live every request -- never serve a stale/cached snapshot.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EMPTY = {
  count: 0, indicators: [],
  distributions: { byQualification: [], byClassification: [], byGender: [], cpdBands: [], experienceBands: [] },
  byInstitution: [], byTerritory: [],
};

export async function GET() {
  let records, enrolment;
  try {
    // Enrolment is read for the pupil-teacher ratios only -- a failure there
    // must not blank the staff dashboard, so it falls back to [] (ratios "—").
    [records, enrolment] = await Promise.all([
      readStaffRecords(),
      readEnrolment().catch(() => []),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!records.length) return NextResponse.json(EMPTY);

  const pupils = pupilTotals(enrolment || []);

  return NextResponse.json({
    ...computeIndicators(records, { pupils: pupils.total || null }), // global rollup
    byInstitution: computeGroups(records, "institution", pupils.byInstitution),
    byTerritory: computeGroups(records, "territory", pupils.byTerritory),
  });
}
