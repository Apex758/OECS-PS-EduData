import { NextResponse } from "next/server";

// Runtime DB (Supabase) is optional until the validation-layer push.
export function isDbConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Shown only when the user explicitly pushes to the validation layer. */
export function pushRequiresDbResponse() {
  return NextResponse.json(
    {
      error:
        "Database not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env — only needed when pushing to the validation layer.",
      dbConfigured: false,
    },
    { status: 503 }
  );
}
