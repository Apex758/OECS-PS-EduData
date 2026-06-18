// =====================================================================
// GENERATE A SCHOOL API KEY
// =====================================================================
// Issues a push credential for one school. Stores only the SHA-256 hash;
// prints the RAW key ONCE -- copy it into that school's push client config.
//
// Usage (PowerShell):
//   $env:SEED_DATABASE_URL = "postgres://...";  node db/gen-key.mjs <SCHOOL_CODE> ["label"]
//
//   <SCHOOL_CODE>  matches schools.code (e.g. LC-CC)
//   [label]        optional note, e.g. "Sir Arthur Lewis CC - office PC"
//
// Connects as SUPERUSER (SEED_DATABASE_URL) -- school_api_keys has
// admin-only RLS, so the non-superuser app role can't write keys.
// =====================================================================
import crypto from "crypto";
import pg from "pg";

const [schoolCode, label] = process.argv.slice(2);
if (!schoolCode) {
  console.error("usage: node db/gen-key.mjs <SCHOOL_CODE> [label]");
  process.exit(1);
}

const rawKey = "sk_" + crypto.randomBytes(24).toString("hex");
const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

const connectionString = process.env.SEED_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("set SEED_DATABASE_URL (superuser) -- needed to write API keys past RLS");
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
    "insert into school_api_keys (school_id, key_hash, label) values ($1, $2, $3)",
    [s.rows[0].id, keyHash, label || null]
  );
  console.log("\nAPI key issued for:", s.rows[0].name, `(${schoolCode})`);
  console.log("Label:", label || "(none)");
  console.log("\n  RAW KEY (shown once -- save it now):\n");
  console.log("    " + rawKey + "\n");
} finally {
  await client.end();
}
