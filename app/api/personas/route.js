import { NextResponse } from "next/server";
import { listPersonas } from "@/lib/db";

// Demo "view as" personas for the RLS toggle (is_demo users). Real SSO
// logins are resolved by email instead (resolveUserByEmail) in Step 4.
export const runtime = "nodejs";

export async function GET() {
  try {
    const personas = await listPersonas();
    return NextResponse.json({ personas });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
