// Load env vars from .env.local then .env (later files do not override earlier).
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function loadProjectEnv() {
  const env = {
    ...parseEnvFile(join(root, ".env")),
    ...parseEnvFile(join(root, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
  return env;
}

export function buildPoolerUrl({
  ref,
  password,
  cluster = "aws-0",
  region = "us-east-1",
  port = "5432",
  host,
}) {
  const enc = encodeURIComponent(password);
  const user = `postgres.${ref}`;
  const poolerHost = host || `${cluster}-${region}.pooler.supabase.com`;
  return `postgresql://${user}:${enc}@${poolerHost}:${port}/postgres`;
}

export function resolveSeedDatabaseUrl(env = loadProjectEnv()) {
  if (env.SEED_DATABASE_URL) return env.SEED_DATABASE_URL;

  const password = env.SUPABASE_DB_PASSWORD;
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = env.SUPABASE_PROJECT_REF || refMatch?.[1];
  if (!password || !ref) return null;

  const db = env.SUPABASE_DB_NAME || "postgres";

  if (env.SUPABASE_DB_USE_DIRECT === "true") {
    const host = env.SUPABASE_DB_HOST || `db.${ref}.supabase.co`;
    const port = env.SUPABASE_DB_PORT || "5432";
    const user = env.SUPABASE_DB_USER || "postgres";
    const enc = encodeURIComponent(password);
    return `postgresql://${user}:${enc}@${host}:${port}/${db}`;
  }

  if (env.SUPABASE_DB_POOLER_HOST) {
    return buildPoolerUrl({
      ref,
      password,
      host: env.SUPABASE_DB_POOLER_HOST,
      port: env.SUPABASE_DB_PORT || "5432",
    });
  }

  const region = env.SUPABASE_DB_POOLER_REGION || "us-east-1";
  const cluster = env.SUPABASE_DB_POOLER_CLUSTER || "aws-0";
  return buildPoolerUrl({
    ref,
    password,
    cluster,
    region,
    port: env.SUPABASE_DB_PORT || "5432",
  });
}

/** Try pooler clusters/regions until one connects (Supabase assigns aws-0/1/2). */
export async function discoverPoolerUrl(env = loadProjectEnv()) {
  if (env.SEED_DATABASE_URL) return env.SEED_DATABASE_URL;

  const password = env.SUPABASE_DB_PASSWORD;
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = env.SUPABASE_PROJECT_REF || refMatch?.[1];
  if (!password || !ref) return null;

  if (env.SUPABASE_DB_POOLER_HOST) {
    return buildPoolerUrl({
      ref,
      password,
      host: env.SUPABASE_DB_POOLER_HOST,
      port: env.SUPABASE_DB_PORT || "5432",
    });
  }

  const clusters = String(env.SUPABASE_DB_POOLER_CLUSTERS || "aws-0,aws-1,aws-2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const regions = String(
    env.SUPABASE_DB_POOLER_REGIONS ||
      "us-east-1,us-east-2,us-west-1,us-west-2,eu-west-1,eu-west-2,eu-central-1,eu-central-2,eu-north-1,ap-southeast-1,ap-southeast-2,ap-northeast-1,ap-northeast-2,ap-south-1,ca-central-1,sa-east-1"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const cluster of clusters) {
    for (const region of regions) {
      const candidate = buildPoolerUrl({ ref, password, cluster, region });
      const client = new pg.Client({
        connectionString: candidate,
        ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      try {
        await client.connect();
        await client.query("select 1");
        await client.end();
        console.log(`Using pooler ${cluster}-${region}.pooler.supabase.com`);
        return candidate;
      } catch {
        try {
          await client.end();
        } catch {
          /* ignore */
        }
      }
    }
  }

  return null;
}
