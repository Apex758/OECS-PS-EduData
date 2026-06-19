import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import {
  listAggregationsOecs,
  listAggregationsScoped,
  getUserSchoolIds,
} from "@/lib/db";
import { requireSession, sessionErrorResponse } from "@/lib/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ rows: [], dbConfigured: false });
  }

  const authOut = await requireSession();
  if (authOut.error) return sessionErrorResponse(authOut.error);

  const { role, id: userId, countryId } = authOut.session.user;

  try {
    let rows;
    if (role === "admin") {
      rows = await listAggregationsOecs();
    } else {
      const schoolIds = role === "teacher" ? await getUserSchoolIds(userId) : null;
      rows = await listAggregationsScoped({ role, userId, countryId, schoolIds });
    }
    return NextResponse.json({ rows, dbConfigured: true, count: rows.length });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
