import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { readStaffRecords, readStaffRejected } from "@/lib/db";
import { resolveReadScope } from "@/lib/readScope";

// Dashboard table source from Postgres (stripped records only, after push).
// PII mappings live in institution session storage — never read from staff_mapping.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EMPTY = { entities: [], totalRecords: 0, dbConfigured: false };

export async function GET(req) {
  if (!isDbConfigured()) {
    return NextResponse.json(EMPTY);
  }

  const resolved = await resolveReadScope(req);
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const scope = resolved.scope || {};
  const { params } = resolved;

  let records, rejected;
  try {
    [records, rejected] = await Promise.all([
      readStaffRecords(scope),
      readStaffRejected(scope),
    ]);
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }

  const mappingByRuli = {};
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

  return NextResponse.json({
    entities,
    totalRecords: records.length,
    dbConfigured: true,
    scope: params.country || params.school ? { country: params.country || null, school: params.school || null } : null,
  });
}
