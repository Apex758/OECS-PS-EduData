import { auth } from "@/auth";
import { resolveDbScopeFromQuery, getUserPrimarySchool } from "@/lib/db";

/** Country/school scope from query params; admin reads are ministry-approved only. */
export async function resolveReadScope(req) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const resolved = await resolveDbScopeFromQuery({
    country: params.country,
    school: params.school,
  });
  if (resolved.error) return resolved;

  const session = await auth();
  const role = session?.user?.role;
  const scope = { ...(resolved.scope || {}) };

  if (role === "admin") {
    scope.approvedOnly = true;
  }

  if (role === "teacher" && session?.user?.id) {
    const primary = await getUserPrimarySchool(session.user.id);
    if (primary?.schoolId) scope.schoolId = primary.schoolId;
  }

  if (role === "minister" && session?.user?.countryId) {
    scope.countryId = scope.countryId ?? session.user.countryId;
  }

  return { scope, params };
}
