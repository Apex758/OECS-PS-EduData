// =====================================================================
// AUTH.JS (NextAuth v5)  --  Auth0 SSO + role mapping
// =====================================================================
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Auth0 from "next-auth/providers/auth0";
import { resolveUserByEmail } from "@/lib/db";

async function attachAppUser(token, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return token;
  try {
    const u = await resolveUserByEmail(normalized);
    if (u) {
      token.userId = u.id;
      token.appRole = u.role;
      token.countryId = u.country_id;
      token.canDrill = u.can_drill_students;
      token.email = normalized;
    } else {
      token.userId = null;
      token.appRole = null;
      token.countryId = null;
      token.canDrill = null;
      token.email = normalized;
    }
  } catch {
    token.userId = null;
    token.appRole = null;
    token.countryId = null;
    token.canDrill = null;
  }
  return token;
}

const providers = [
  Credentials({
    name: "Email",
    credentials: { email: { label: "Email", type: "email" } },
    async authorize(creds) {
      const email = String(creds?.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return null;
      return { id: email, email };
    },
  }),
];

if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_ISSUER) {
  providers.unshift(
    Auth0({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER,
      authorization: { params: { scope: "openid profile email offline_access", prompt: "consent" } },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers,
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
      }
      const email = profile?.email ?? user?.email ?? token.email;
      if (email) await attachAppUser(token, email);
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId ?? null;
      session.user.role = token.appRole ?? null;
      session.user.countryId = token.countryId ?? null;
      session.user.canDrill = token.canDrill;
      session.tokens = token.accessToken
        ? {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken ?? null,
            expiresAt: token.expiresAt ?? null,
          }
        : null;
      return session;
    },
  },
});
