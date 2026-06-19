// Apply all SQL migrations + validation layer + seed demo data.
// Usage: node db/setup.mjs
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { loadProjectEnv, resolveSeedDatabaseUrl } from "./loadEnv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadProjectEnv();
const dbUrl = resolveSeedDatabaseUrl();
if (!dbUrl) {
  console.error(
    "Set SEED_DATABASE_URL or SUPABASE_DB_PASSWORD in .env\n" +
      "Example: postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
  );
  process.exit(1);
}
console.log("Connecting to Supabase Postgres…");

process.env.SEED_DATABASE_URL = dbUrl;

const MIGRATIONS = [
  "schema.sql",
  "functions.sql",
  "policies.sql",
  "ingest.sql",
  "sheets.sql",
  "value-aliases.sql",
  "pending-aliases.sql",
  "pending-aliases-notify.sql",
  "pending-aliases-scope.sql",
  "rpc.sql",
  "drilldown.sql",
  "staff.sql",
  "enrolment.sql",
  "approval.sql",
  "approval-rpc.sql",
  "approval-policies.sql",
  "repair-fks.sql",
  "validation.sql",
];

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(__dirname, file), "utf8");
    process.stdout.write(`applying ${file}… `);
    await client.query(sql);
    console.log("OK");
  }
} finally {
  await client.end();
}

await import("./seed.mjs");

console.log("SETUP COMPLETE");
