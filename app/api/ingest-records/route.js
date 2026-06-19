import { NextResponse } from "next/server";
import { isAdminOrRuliKey } from "@/lib/ruliKeyAuth";
import { isDbConfigured, pushRequiresDbResponse } from "@/lib/dbConfig";
import { ingestStaffRows, valLogEvent } from "@/lib/db";

// Exe record-push: the standalone sends already-anonymized SAFE records here
// (no PII) to populate the stats/SDG dashboards -- the data counterpart to
// /api/validation/tokens (which only carries salt tokens for dup detection).
// Authenticated by the exe's own rmk_ key, same as the token push.
//
//   POST /api/ingest-records
//   Header: Authorization: Bearer rmk_<hex>
//   Body:   { entity: "staff", rows: [...safe rows...], rejected?: [...] }
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "not authorized" }, { status: 403 });

export async function POST(req) {
  if (!isDbConfigured()) return pushRequiresDbResponse();
  if (!(await isAdminOrRuliKey(req))) return deny();

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const { entity, rows, rejected } = body || {};
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows[] required" }, { status: 400 });

  // Staff is the entity behind the stats/SDG dashboard. Student records belong
  // to the API-key/school-scoped RLS path (/api/ingest) and aren't wired here.
  if (entity !== "staff") {
    return NextResponse.json(
      { error: `entity '${entity ?? ""}' not supported for record push (staff only)` },
      { status: 400 }
    );
  }

  try {
    const out = await ingestStaffRows({ rows, rejected: rejected || [] });
    // Best-effort audit line in the shared activity log; never blocks the write.
    await valLogEvent({
      kind: "records",
      institution: Array.isArray(out.institutions) && out.institutions.length === 1 ? out.institutions[0] : null,
      detail: { entity, inserted: out.inserted, skipped: out.skipped, rejected: out.rejected },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
