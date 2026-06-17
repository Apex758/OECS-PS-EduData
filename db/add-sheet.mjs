// =====================================================================
// REGISTER A GOOGLE SHEET FOR A SCHOOL
// =====================================================================
// The cron job (/api/cron/sync-sheets) pulls every enabled row. The school
// must first SHARE the sheet (Viewer) with GOOGLE_SERVICE_ACCOUNT_EMAIL.
//
// Usage (PowerShell):
//   $env:SEED_DATABASE_URL="postgres://...";  node db/add-sheet.mjs <SCHOOL_CODE> <SPREADSHEET_ID> [range]
//
//   <SPREADSHEET_ID> = the long id in the sheet URL:
//     docs.google.com/spreadsheets/d/<THIS PART>/edit
//   [range] default "A:Z" (first row = headers)
//
// Connects as SUPERUSER (school_sheets is admin-RLS).
// =====================================================================
import pg from "pg";

const [schoolCode, spreadsheetId, range] = process.argv.slice(2);
if (!schoolCode || !spreadsheetId) {
  console.error("usage: node db/add-sheet.mjs <SCHOOL_CODE> <SPREADSHEET_ID> [range]");
  process.exit(1);
}

const connectionString = process.env.SEED_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("set SEED_DATABASE_URL (superuser)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  const s = await client.query("select id, name from schools where code = $1", [schoolCode]);
  if (s.rowCount === 0) {
    console.error(`no school with code "${schoolCode}"`);
    process.exit(1);
  }
  await client.query(
    `insert into school_sheets (school_id, spreadsheet_id, range_a1)
     values ($1, $2, $3)
     on conflict (school_id, spreadsheet_id, range_a1) do update set enabled = true`,
    [s.rows[0].id, spreadsheetId, range || "A:Z"]
  );
  console.log(`registered sheet for ${s.rows[0].name} (${schoolCode}): ${spreadsheetId} [${range || "A:Z"}]`);
  console.log("Make sure the school shared it (Viewer) with the service account email.");
} finally {
  await client.end();
}
