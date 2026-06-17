// =====================================================================
// AUTH.JS (NextAuth v5)  --  Auth0 SSO + role mapping
// =====================================================================
// Auth0 is the identity broker (it fronts Google / username-password / etc).
// Reads AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET / AUTH0_ISSUER + AUTH_SECRET
// from .env.local. Callback URL: /api/auth/callback/auth0
// Flow:
//   1. User signs in via Auth0 (real OAuth 2.0 / OpenID Connect).
//   2. Auth0 returns an ACCESS token (short-lived) + REFRESH token
//      (long-lived, requested via the `offline_access` scope).
//   3. We look up the email in app_users (resolveUserByEmail) to attach the
//      app ROLE + country -> drives RBAC and the RLS session context.
//
// SECURITY NOTE: this DEMO deliberately surfaces the access/refresh tokens to
// the client session so the UI token panel can show them. A real app keeps the
// refresh token server-side ONLY. Do not copy this part to prod.
// =====================================================================
import NextAuth from "next-auth";
// import Auth0 from "next-auth/providers/auth0";   // TEMP: disabled until AUTH0_CLIENT_ID/SECRET set
import { resolveUserByEmail } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    // TEMP: Auth0 disabled — empty AUTH0_CLIENT_ID/SECRET caused 500 on /api/auth/session.
    // Re-enable by uncommenting the import above + this block once credentials are set.
    // Auth0({
    //   clientId: process.env.AUTH0_CLIENT_ID,
    //   clientSecret: process.env.AUTH0_CLIENT_SECRET,
    //   issuer: process.env.AUTH0_ISSUER,   // https://YOUR_TENANT.<region>.auth0.com
    //   authorization: {
    //     params: {
    //       // offline_access = the OIDC way to get a refresh token from Auth0.
    //       scope: "openid profile email offline_access",
    //       prompt: "consent",
    //     },
    //   },
    // }),
  ],
  callbacks: {
    // Runs on sign-in and on every session read. `account` is only present
    // at sign-in -> capture the provider tokens then.
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;   // epoch seconds
      }
      // Map the Google identity to an app_users row (role + scope).
      const email = profile?.email ?? token.email;
      if (email && token.appRole === undefined) {
        try {
          const u = await resolveUserByEmail(email);
          if (u) {
            token.userId = u.id;
            token.appRole = u.role;
            token.countryId = u.country_id;
            token.canDrill = u.can_drill_students;
          } else {
            token.appRole = null;   // signed in but not provisioned
          }
        } catch {
          token.appRole = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId ?? null;
      session.user.role = token.appRole ?? null;
      session.user.countryId = token.countryId ?? null;
      session.user.canDrill = token.canDrill;
      // DEMO-ONLY: expose provider tokens for the token panel.
      session.tokens = {
        accessToken: token.accessToken ?? null,
        refreshToken: token.refreshToken ?? null,
        expiresAt: token.expiresAt ?? null,
      };
      return session;
    },
  },
});
