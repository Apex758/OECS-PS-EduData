// One-off: apply db/validation.sql to the Supabase direct connection.
// Reads SEED_DATABASE_URL from .env.local. Run: node db/apply-validation.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const envText = readFileSync(join(root, ".env.local"), "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("SEED_DATABASE_URL="));
const url = line?.slice("SEED_DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
if (!url) throw new Error("SEED_DATABASE_URL not found in .env.local");

const sql = readFileSync(join(__dirname, "validation.sql"), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("validation.sql applied OK");
} finally {
  await client.end();
}
