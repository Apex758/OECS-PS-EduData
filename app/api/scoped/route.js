import { NextResponse } from "next/server";
import { resolvePersonaById, fetchScoped, fetchHierarchy } from "@/lib/db";
import { personaJwt } from "@/lib/supabase";

// Returns students/schools/institutions FILTERED BY POSTGRES RLS for the
// chosen persona. The persona's role/country/school are resolved server-side
// (never trusted from the client) and pushed into the RLS session context.
export const runtime = "nodejs";

export async function GET(req) {
  const id = Number(new URL(req.url).searchParams.get("personaId"));
  if (!id) {
    return NextResponse.json({ error: "personaId query param required" }, { status: 400 });
  }
  try {
    const user = await resolvePersonaById(id);
    if (!user) {
      return NextResponse.json({ error: "unknown persona" }, { status: 404 });
    }
    // The persona has no Auth0 identity, so mint a short-lived Supabase JWT for
    // it. RLS then filters exactly as it would for a real signed-in user.
    const token = personaJwt(user);
    const data = await fetchScoped({ token });
    const hierarchy = await fetchHierarchy({ token, role: user.role, canDrill: user.can_drill_students });
    return NextResponse.json({ user, hierarchy, ...data });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
