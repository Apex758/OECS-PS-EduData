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
  // The Auth0 access token (validated by Supabase third-party auth) carries the
  // identity that drives RLS. It must include an `email` claim (Auth0 Action).
  const token = session.tokens?.accessToken;
  if (!token) {
    return NextResponse.json({ error: "no access token on session" }, { status: 401 });
  }
  try {
    const data = await fetchScoped({ token });
    const hierarchy = await fetchHierarchy({ token, role, canDrill });
    return NextResponse.json({
      user: { id, role, country_id: countryId, can_drill_students: canDrill, email },
      hierarchy,
      ...data,
    });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
