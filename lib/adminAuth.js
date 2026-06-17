// Admin gate for /api/admin/*. Caller sends "Authorization: Bearer <ADMIN_SECRET>".
// Interim auth: simple shared secret so the portal works before Google SSO
// (the SSO chat) is wired. Once SSO lands, swap this for an admin-role
// session check. Fails closed if ADMIN_SECRET is unset.
export function requireAdmin(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}
