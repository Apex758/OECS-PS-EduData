import { NextResponse } from "next/server";
import { isAdminOrRuliKey } from "@/lib/ruliKeyAuth";
import { valListPrompts } from "@/lib/db";

// Pending duplicate prompts, optionally filtered to one institution. The layer
// holds no identity key, so prompts carry the colliding tokens (RULI +
// institution) only — the institution re-identifies the person locally in its
// own exe, which holds the salt-derivation key.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "not authorized" }, { status: 403 });

export async function GET(req) {
  if (!(await isAdminOrRuliKey(req))) return deny();
  try {
    const institution = new URL(req.url).searchParams.get("institution") || undefined;
    const prompts = await valListPrompts(institution);
    return NextResponse.json({ prompts });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
