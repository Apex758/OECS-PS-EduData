import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { listSchools } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ schools: [], dbConfigured: false });
  }

  const country = new URL(req.url).searchParams.get("country");
  try {
    const schools = await listSchools({ countryIso: country || undefined });
    return NextResponse.json({ schools, dbConfigured: true });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
