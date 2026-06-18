// One-off: wipe the validation layer (stored salts/tokens, dup candidates,
// activity log) back to empty. Registered exe keys are KEPT so standalones can
// still authenticate. Reads .env.local for the service_role credentials.
//
//   node db/clear-validation.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (KEY=VALUE per line, ignores # comments).
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const die = (label, { error }) => { if (error) { console.error(label, error.message); process.exit(1); } };

const tok = await sb.from("validation_tokens").delete().neq("token", "").select("token");
die("tokens", tok);
die("dups", await sb.from("validation_dups").delete().gte("id", 0).select("id"));
die("events", await sb.from("validation_events").delete().gte("id", 0).select("id"));

console.log(`cleared ${tok.data?.length ?? 0} tokens + dups + events. Registered exes kept.`);
