import { NextResponse } from "next/server";
import { readStaffRecords, readStaffMapping, readStaffRejected } from "@/lib/db";

// Dashboard table source, all from Postgres (was on-disk JSON):
//   staff          -> anonymized dash records + columns/rows
//   staff_mapping  -> RULI->PII mapping for row-expand reveal
//   staff_rejected -> failed-validation rows for the rejected view
export const runtime = "nodejs";
// Read live every request -- never serve a stale/cached snapshot.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  let records, mappingByRuli, rejected;
  try {
    [records, mappingByRuli, rejected] = await Promise.all([
      readStaffRecords(), readStaffMapping(), readStaffRejected(),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }

  const rejColumns = [];
  for (const r of rejected) {
    for (const k of Object.keys(r?.data ?? {})) {
      if (!rejColumns.includes(k)) rejColumns.push(k);
    }
  }

  const columns = ["RULI"];
  const rows = [];
  let lastUpdated = null;
  for (const r of records) {
    const at = r?.metadata?.createdAt;
    if (at && (!lastUpdated || at > lastUpdated)) lastUpdated = at;
    const data = r?.staff ?? {};
    for (const k of Object.keys(data)) {
      if (!columns.includes(k)) columns.push(k);
    }
    rows.push({ ...data, RULI: r?.RULI });
  }

  const entities = (records.length || rejected.length)
    ? [{
        entity: "staff",
        records: records.length,
        mapped: Object.keys(mappingByRuli).length,
        lastUpdated,
        columns,
        rows,
        mappingByRuli,
        rejected,
        rejColumns,
      }]
    : [];

  return NextResponse.json({ entities, totalRecords: records.length });
}
