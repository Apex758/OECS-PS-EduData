import { NextResponse } from "next/server";
import { fetchSheetRows } from "@/lib/sheets";
import { processRows } from "@/lib/ingestPipeline";
import { listEnabledSheets, ingestStudentsForSchool, markSheetSynced } from "@/lib/db";

// Scheduled pull of every registered Google Sheet -> Postgres.
// Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
// Vercel sends "Authorization: Bearer <CRON_SECRET>". Also runnable by hand
// with the same header.
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;                       // fail closed if unset
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let sheets;
  try {
    sheets = await listEnabledSheets();
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }

  const results = [];
  for (const sheet of sheets) {
    const createdAt = new Date().toISOString();
    try {
      const entity = sheet.entity || "student";
      const rows = await fetchSheetRows(sheet.spreadsheet_id, sheet.range_a1, entity);
      const parsed = processRows(rows, entity, { createdAt });

      if (parsed.batchError) {
        const status = `batch error: ${parsed.batchError.error}`;
        await markSheetSynced(sheet.id, status);
        results.push({ sheet: sheet.id, school_id: sheet.school_id, ok: false, status });
        continue;
      }

      const out = await ingestStudentsForSchool({
        schoolId: sheet.school_id,
        items: parsed.accepted,
      });

      const status = out.notFound
        ? "school not found"
        : `inserted=${out.inserted} skipped=${out.skipped} rejected=${parsed.rejected.length}`;
      await markSheetSynced(sheet.id, status);
      results.push({
        sheet: sheet.id,
        school_id: sheet.school_id,
        ok: !out.notFound,
        ...(out.ok ? { inserted: out.inserted, skipped: out.skipped, rejected: parsed.rejected.length } : {}),
        status,
      });
    } catch (e) {
      const status = `error: ${e.message}`;
      await markSheetSynced(sheet.id, status).catch(() => {});
      results.push({ sheet: sheet.id, school_id: sheet.school_id, ok: false, status });
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results });
}
