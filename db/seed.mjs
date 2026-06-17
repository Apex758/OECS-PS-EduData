// =====================================================================
// SEED  --  load demo data into student_demo
// =====================================================================
// Connects as the SUPERUSER (bypasses RLS) to insert demo rows:
//   countries <- institutions.csv
//   institutions, schools, students (RULI-coded, anonymized)
//   app_users + user_schools (demo "view as" personas, is_demo=true)
//
// Run via db/setup.ps1, which sets SEED_DATABASE_URL.
// =====================================================================
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { generateCode, generateSalt, hashCode } from "../lib/ruli.js";

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
  // Supabase (managed PG) requires TLS; accept its chain unless PGSSL=disable
  // (local dev). Connects via the DIRECT connection string in SEED_DATABASE_URL.
  const client = new pg.Client({
    connectionString: process.env.SEED_DATABASE_URL,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin");
    // wipe (order respects FKs)
    await client.query("truncate user_schools, app_users, students, schools, institutions, countries restart identity cascade");

    // ---- countries + institutions ----
    const countryId = {};   // iso -> id
    for (const row of readCsv("institutions.csv")) {
      let id = countryId[row.country_iso];
      if (!id) {
        const r = await client.query(
          "insert into countries(iso_code, name) values($1,$2) returning id",
          [row.country_iso, row.country_name]
        );
        id = r.rows[0].id;
        countryId[row.country_iso] = id;
      }
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

    // ---- users + user_schools (from data/users.json) ----
    for (const u of USERS) {
      const cid = u.country_iso ? countryId[u.country_iso] : null;
      const r = await client.query(
        `insert into app_users(email, name, role, country_id, can_drill_students, is_demo)
         values($1,$2,$3,$4,$5,$6) returning id`,
        [u.email, u.name, u.role, cid,
         u.can_drill_students !== false, u.is_demo !== false]
      );
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

    await client.query("commit");
    console.log(`seeded: ${Object.keys(countryId).length} countries, ${Object.keys(schoolId).length} schools, ${n} students, ${USERS.length} users`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
