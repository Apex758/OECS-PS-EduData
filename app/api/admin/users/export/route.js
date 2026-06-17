import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { isAdmin } from "@/lib/userAdminGate";
import { exportUsers } from "@/lib/userAdmin";

// Dump live app_users to data/users.json (and download it). Best-effort file
// write -- works locally; managed hosts (Vercel) have a read-only FS, so the
// download still returns even if the write is skipped.
export const runtime = "nodejs";

export async function GET(req) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "admin only" }, { status: 403 });
  try {
    const data = await exportUsers();
    const json = JSON.stringify(data, null, 2) + "\n";
    try {
      await writeFile(path.join(process.cwd(), "data", "users.json"), json, "utf8");
    } catch {
      /* read-only FS (prod) -- download still works */
    }
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="users.json"',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
