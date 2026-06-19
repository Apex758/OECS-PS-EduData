import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { computeIndicators, computeGroups } from "@/lib/sdgIndicators";
import { readStaffRecords, readEnrolment } from "@/lib/db";
import { resolveReadScope } from "@/lib/readScope";

const headcount = (r) =>
  ["totalFtM", "totalFtF", "totalPtM", "totalPtF"].reduce((s, k) => s + (Number(r[k]) || 0), 0);

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EMPTY = {
  count: 0, indicators: [],
  distributions: { byQualification: [], byClassification: [], byGender: [], cpdBands: [], experienceBands: [] },
  byInstitution: [], byTerritory: [],
  dbConfigured: false,
};

export async function GET(req) {
  if (!isDbConfigured()) {
    return NextResponse.json(EMPTY);
  }

  const resolved = await resolveReadScope(req);
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const scope = resolved.scope || {};
  const { params } = resolved;

  let records, enrolment;
  try {
    [records, enrolment] = await Promise.all([
      readStaffRecords(scope),
      readEnrolment(scope).catch(() => []),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!records.length) return NextResponse.json({ ...EMPTY, dbConfigured: true });

  const pupils = pupilTotals(enrolment || []);

  return NextResponse.json({
    ...computeIndicators(records, { pupils: pupils.total || null }),
    byInstitution: computeGroups(records, "institution", pupils.byInstitution),
    byTerritory: computeGroups(records, "territory", pupils.byTerritory),
    dbConfigured: true,
    scope: params.country || params.school ? { country: params.country || null, school: params.school || null } : null,
  });
}
