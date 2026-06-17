// NextAuth v5 catch-all route. Handles /api/auth/* (sign in, callback,
// session, sign out). Node runtime because the jwt callback hits Postgres.
import { handlers } from "@/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
