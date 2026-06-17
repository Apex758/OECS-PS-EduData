import { NextResponse } from "next/server";
import { listRoomNotifications, acknowledgeNotifications } from "@/lib/db";

// Public, room-scoped: returns reviewed (approved/rejected) suggestions for
// the requested room (institution | ministry | admin) that haven't been
// dismissed. The dashboard bell passes the current "View as" role as scope,
// so each role sees only its own notifications.
export const runtime = "nodejs";

const ROOMS = ["institution", "ministry", "admin"];
const roomOf = (s) => (ROOMS.includes(s) ? s : "institution");

export async function GET(req) {
  try {
    const scope = roomOf(new URL(req.url).searchParams.get("scope"));
    const notifications = await listRoomNotifications(scope);
    return NextResponse.json({ notifications });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Dismiss notifications. body: { scope, ids?: number[] } — omit ids to dismiss
// all of that room's.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    await acknowledgeNotifications(roomOf(body.scope), body.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
