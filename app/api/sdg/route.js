import { NextResponse } from "next/server";
import { computeIndicators, computeGroups } from "@/lib/sdgIndicators";
import { readStaffRecords } from "@/lib/db";

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
  let records;
  try {
    records = await readStaffRecords();
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!records.length) return NextResponse.json(EMPTY);

  return NextResponse.json({
    ...computeIndicators(records),                  // global rollup
    byInstitution: computeGroups(records, "institution"),
    byTerritory: computeGroups(records, "territory"),
  });
}
