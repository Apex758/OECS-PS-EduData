import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { listApprovalConfig } from "@/lib/db";
import { isAdmin } from "@/lib/userAdminGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ config: [], dbConfigured: false });
  }
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }
  try {
    const config = await listApprovalConfig();
    return NextResponse.json({ config, dbConfigured: true });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
