import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { valListAllDups, valListTokens, valListEvents, listRuliKeys } from "@/lib/db";

// Full view for the /validation page: every duplicate candidate, the stored-salt
// ledger (institutions + created/edited timestamps), the activity log, and how
// many exes have registered. No identity key lives here — salts stay anonymous;
// the two colliding institutions confirm the person locally in their own exe.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const [dups, salts, events, ruliKeys] = await Promise.all([
      valListAllDups(), valListTokens(), valListEvents(), listRuliKeys(),
    ]);
    return NextResponse.json({ dups, salts, events, registeredExes: ruliKeys.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
