import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchScoped, fetchHierarchy } from "@/lib/db";

// Scoped data for the REAL signed-in user. Identity comes from the verified
// Auth.js session (JWT signed with AUTH_SECRET) — never from client input —
// then drives the Postgres RLS context. This is the production read path;
// /api/scoped (persona id) is the DEMO "view as" path.
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  const { id, role, countryId, canDrill, email } = session.user;
  if (!role) {
    return NextResponse.json(
      { error: "signed in, but this email is not provisioned in app_users" },
      { status: 403 }
    );
  }
  try {
    const ctx = { userId: id, role, countryId, canDrill };
    const data = await fetchScoped(ctx);
    const hierarchy = await fetchHierarchy(ctx);
    return NextResponse.json({
      user: { id, role, country_id: countryId, can_drill_students: canDrill, email },
      hierarchy,
      ...data,
    });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
