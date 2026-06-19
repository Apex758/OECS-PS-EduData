// One-off: apply db/enrolment.sql to the Supabase direct connection.
// Run: node db/apply-enrolment.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { loadProjectEnv, resolveSeedDatabaseUrl } from "./loadEnv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadProjectEnv();
const url = resolveSeedDatabaseUrl();
if (!url) throw new Error("SEED_DATABASE_URL or SUPABASE_DB_PASSWORD required in .env / .env.local");

const sql = readFileSync(join(__dirname, "enrolment.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("enrolment.sql applied OK");
} finally {
  await client.end();
}
