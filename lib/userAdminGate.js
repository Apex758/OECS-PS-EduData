// Admin gate for /api/admin/users/*. Allows EITHER:
//   - a signed-in Auth.js session whose app role is 'admin' (the real path), OR
//   - a "Bearer <ADMIN_SECRET>" header (dev/interim, same secret the ingest
//     admin portal uses) so this works before Auth0 creds are configured.
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/adminAuth";

export async function isAdmin(req) {
  try {
    const session = await auth();
    if (session?.user?.role === "admin") return true;
  } catch {
    // auth() can throw if AUTH_SECRET is unset; fall through to secret check.
  }
  return requireAdmin(req);
}
