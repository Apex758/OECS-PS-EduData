// =====================================================================
// SEED  --  load demo data into student_demo
// =====================================================================
// Connects as the SUPERUSER (bypasses RLS) to insert demo rows:
//   countries <- data/countries.csv (+ approval_config)
//   institutions <- institutions.csv
//   institutions, schools, students (RULI-coded, anonymized)
//   app_users + user_schools (demo "view as" personas, is_demo=true)
//
// Run via db/setup.ps1, which sets SEED_DATABASE_URL.
// =====================================================================
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import crypto from "crypto";
import { loadProjectEnv, resolveSeedDatabaseUrl } from "./loadEnv.mjs";
import { readCountriesCsv, ministerDemoEmail } from "../lib/readCountriesCsv.mjs";

function generateCode(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}
function generateSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}
function hashCode(code, salt) {
  return crypto.scryptSync(code, salt, 32).toString("hex");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, "..", "data", "seed");

// tiny CSV reader (header row -> array of objects). No quoted-comma support
// needed for these simple seed files.
function readCsv(name) {
  const text = readFileSync(join(SEED, name), "utf8").trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? "").trim()]));
  });
}

// Registered users come from data/users.json (the canonical registry; the
// admin panel edits the live DB and can export back to this file).
const USERS = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "users.json"), "utf8")
).users;

async function main() {
  loadProjectEnv();
  const connectionString = resolveSeedDatabaseUrl();
  if (!connectionString) {
    throw new Error("SEED_DATABASE_URL or SUPABASE_DB_PASSWORD required in .env / .env.local");
  }
  // Supabase (managed PG) requires TLS; accept its chain unless PGSSL=disable
  // (local dev). Connects via the DIRECT connection string in SEED_DATABASE_URL.
  const client = new pg.Client({
    connectionString,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin");
    // wipe (order respects FKs). cascade also clears staff/enrolment via their
    // schools/countries FKs; the *_rejected tables have no FK, so name them
    // explicitly or stale rejects survive a reseed.
    await client.query(
      "truncate approvals, aggregations, submissions, approval_config, staff_mapping, staff, staff_rejected, enrolment, enrolment_rejected, user_schools, app_users, students, student_mapping, school_api_keys, schools, institutions, countries restart identity cascade"
    );

    // ---- countries (from data/countries.csv) ----
    const countryId = {};   // iso -> id
    for (const row of readCountriesCsv(join(__dirname, ".."))) {
      const r = await client.query(
        "insert into countries(iso_code, name) values($1,$2) returning id",
        [row.iso, row.name]
      );
      countryId[row.iso] = r.rows[0].id;
      await client.query(
        "insert into approval_config(country_id, approval_required) values($1,$2) on conflict (country_id) do update set approval_required = excluded.approval_required",
        [r.rows[0].id, row.approvalRequired]
      );
    }

    // ---- institutions ----
    for (const row of readCsv("institutions.csv")) {
      const id = countryId[row.country_iso];
      if (!id) continue;
      await client.query(
        "insert into institutions(country_id, name, type) values($1,$2,$3)",
        [id, row.institution_name, row.institution_type]
      );
    }

    // ---- schools ----
    const schoolId = {};    // code -> id
    for (const row of readCsv("schools.csv")) {
      const cid = countryId[row.country_iso];
      const r = await client.query(
        "insert into schools(country_id, code, name, level) values($1,$2,$3,$4) returning id",
        [cid, row.school_code, row.school_name, row.level]
      );
      schoolId[row.school_code] = r.rows[0].id;
    }

    // ---- students (RULI-coded, anonymized: names dropped like the pipeline) ----
    const createdAt = new Date().toISOString();
    let n = 0;
    for (const row of readCsv("students.csv")) {
      const code = generateCode();
      const salt = generateSalt();
      const hash = hashCode(code, salt);
      const metadata = {
        salt, hash, createdAt,
        codeAlgo: "crypto.randomBytes(16) hex",
        hashAlgo: "scrypt(code, salt, 32)",
        schemaVersion: 1,
      };
      await client.query(
        `insert into students(ruli, school_id, country_id, class, gender, age, metadata, is_demo)
         values($1,$2,$3,$4,$5,$6,$7,true)`,
        [code, schoolId[row.school_code], countryId[row.country_iso],
         row.class || null, row.gender, parseInt(row.age, 10) || null, metadata]
      );
      n++;
    }

    // ---- users + user_schools (from data/users.json) + demo ministers per country ----
    const seededEmails = new Set();
    for (const u of USERS) {
      const cid = u.country_iso ? countryId[u.country_iso] : null;
      const r = await client.query(
        `insert into app_users(email, name, role, country_id, can_drill_students, is_demo)
         values($1,$2,$3,$4,$5,$6) returning id`,
        [u.email, u.name, u.role, cid,
         u.can_drill_students !== false, u.is_demo !== false]
      );
      seededEmails.add(u.email.toLowerCase());
      for (const code of (u.schools || [])) {
        const sid = schoolId[code];
        if (sid) {
          await client.query(
            "insert into user_schools(user_id, school_id) values($1,$2)",
            [r.rows[0].id, sid]
          );
        }
      }
    }
    for (const row of readCountriesCsv(join(__dirname, ".."))) {
      const email = ministerDemoEmail(row.iso);
      if (seededEmails.has(email.toLowerCase())) continue;
      const cid = countryId[row.iso];
      if (!cid) continue;
      await client.query(
        `insert into app_users(email, name, role, country_id, can_drill_students, is_demo)
         values($1,$2,$3,$4,$5,$6)`,
        [email, `Minister (${row.name})`, "minister", cid, true, true]
      );
    }

    await client.query("commit");
    console.log(`seeded: ${Object.keys(countryId).length} countries, ${Object.keys(schoolId).length} schools, ${n} students, ${USERS.length} users, approval_config`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
