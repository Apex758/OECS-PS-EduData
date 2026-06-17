import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import {
  listPendingAliases,
  approvePendingAlias,
  rejectPendingAlias,
  countPendingAliases,
} from "@/lib/db";

export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

// GET  — list all pending suggestions + total count (for badge).
export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const suggestions = await listPendingAliases();
    const count = await countPendingAliases();
    return NextResponse.json({ suggestions, count });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — approve or reject a suggestion by id.
//   body: { id: number, action: "approve" | "reject" }
export async function POST(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const { id, action, note } = await req.json();
    if (!id || !action) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }
    let result;
    if (action === "approve") result = await approvePendingAlias(id);
    else if (action === "reject") result = await rejectPendingAlias(id, note);
    else return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    if (result.notFound) return NextResponse.json({ error: "suggestion not found or already reviewed" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
