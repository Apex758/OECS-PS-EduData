// One-off: apply db/approval-rpc.sql to the Supabase direct connection.
// Run: node db/apply-approval-rpc.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { loadProjectEnv, resolveSeedDatabaseUrl } from "./loadEnv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadProjectEnv();
const url = resolveSeedDatabaseUrl();
if (!url) throw new Error("SEED_DATABASE_URL or SUPABASE_DB_PASSWORD required in .env / .env.local");

const sql = readFileSync(join(__dirname, "approval-rpc.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("approval-rpc.sql applied OK");
} finally {
  await client.end();
}
