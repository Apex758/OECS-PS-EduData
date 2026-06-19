import { NextResponse } from "next/server";
import { computeEnrolment, computeEnrolmentGroups } from "@/lib/sdgEnrolment";
import { computeBackground } from "@/lib/sdgBackground";
import { computeFinance } from "@/lib/sdgFinance";
import { computeSystem } from "@/lib/sdgSystem";
import { readEnrolment, readEnrolmentRejected } from "@/lib/db";
import { resolveReadScope } from "@/lib/readScope";

export const runtime = "nodejs";
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

export async function GET(req) {
  const resolved = await resolveReadScope(req);
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const scope = resolved.scope || {};
  const { params } = resolved;

  let rows, rejected;
  try {
    [rows, rejected] = await Promise.all([
      readEnrolment(scope),
      readEnrolmentRejected(scope),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
  if (!rows.length && !rejected.length) {
    return NextResponse.json({
      ...EMPTY,
      scope: params.country || params.school ? { country: params.country || null, school: params.school || null } : null,
    });
  }

  return NextResponse.json({
    ...computeEnrolment(rows),
    byInstitution: computeEnrolmentGroups(rows, "institution"),
    byTerritory: computeEnrolmentGroups(rows, "territory"),
    background: computeBackground(rows),
    finance: computeFinance(rows),
    system: computeSystem(rows),
    rows,
    rejected,
    scope: params.country || params.school ? { country: params.country || null, school: params.school || null } : null,
  });
}
