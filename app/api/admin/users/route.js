import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { listUsers, refData, upsertUser, deleteUser } from "@/lib/userAdmin";

// Admin user/access management. Gated by isAdmin (SSO admin role OR ADMIN_SECRET).
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const [users, ref] = await Promise.all([listUsers(), refData()]);
    return NextResponse.json({ users, ...ref });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const user = await upsertUser(await req.json());
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  if (!(await isAdmin(req))) return deny();
  const email = new URL(req.url).searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  try {
    await deleteUser(email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
