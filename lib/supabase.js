// =====================================================================
// SUPABASE CLIENTS  --  the two trust levels + persona JWT minting
// =====================================================================
// The app talks to Postgres through PostgREST, never via a raw pg pool.
// Two clients:
//
//   svc()            -- service_role key. BYPASSRLS. Server-trusted paths
//                       only (admin / ingest / cron / pipeline). NEVER expose
//                       this key to the browser.
//   userClient(jwt)  -- anon key + a per-request Authorization: Bearer <jwt>.
//                       Runs as the `authenticated` role, so the RLS policies
//                       in db/policies.sql filter every row to that identity.
//
// Identities come from two JWT sources, both carrying an `email` claim that
// app_current_user() resolves against app_users:
//   * real users   -> Auth0 access token (Supabase third-party auth)
//   * demo personas-> personaJwt() mints a short-lived token signed with the
//                     Supabase JWT secret (the persona has no Auth0 identity).
// =====================================================================

import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

// service_role client, cached (no per-user state, safe to reuse).
export function svc() {
  if (!URL || !SERVICE) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!globalThis.__sbSvc) globalThis.__sbSvc = createClient(URL, SERVICE, NO_SESSION);
  return globalThis.__sbSvc;
}

// Per-request client bound to a caller's JWT -> RLS as `authenticated`.
// Not cached: the token differs per request and must not leak across them.
export function userClient(accessToken) {
  if (!URL || !ANON) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  if (!accessToken) throw new Error("userClient requires an access token");
  return createClient(URL, ANON, {
    ...NO_SESSION,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Mint a short-lived Supabase-compatible JWT for a demo persona. Signed with
// the project JWT secret (HS256); `aud`/`role` = authenticated so PostgREST
// runs it as that role, and `email` drives app_current_user(). Used only
// server-side and consumed immediately, so a 60s lifetime is plenty.
export function personaJwt(persona) {
  if (!JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET must be set to mint persona tokens");
  if (!persona?.email) throw new Error("persona must have an email");
  return jwt.sign(
    {
      sub: `persona:${persona.id}`,
      email: persona.email,
      role: "authenticated",
      aud: "authenticated",
    },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "60s" }
  );
}
