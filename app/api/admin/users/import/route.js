import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { importUsers } from "@/lib/userAdmin";
import { parseUpload } from "@/lib/parseUpload";

// Bulk-register users from a dragged-in CSV/XLSX (the template institutions fill).
export const runtime = "nodejs";

export async function POST(req) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no file uploaded (field 'file')" }, { status: 400 });
  }
  let rows;
  try {
    rows = parseUpload(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return NextResponse.json({ error: `could not read file: ${e.message}` }, { status: 400 });
  }
  const results = await importUsers(rows);
  const imported = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, imported, failed: results.length - imported, results });
}
