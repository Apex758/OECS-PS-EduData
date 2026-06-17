import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { listValueAliases, addValueAlias, removeValueAlias } from "@/lib/db";

// Admin-approved enum value normalizations (the "add this value to the rules?"
// flow). Reads are open to the admin UI; writes/deletes gated by isAdmin.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  const entity = new URL(req.url).searchParams.get("entity") || undefined;
  try {
    return NextResponse.json({ aliases: await listValueAliases(entity) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const r = await addValueAlias(await req.json());
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  if (!(await isAdmin(req))) return deny();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await removeValueAlias(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
