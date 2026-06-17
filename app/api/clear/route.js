import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { clearValueAliases, clearPendingAliases, clearStaff, clearEnrolment } from "@/lib/db";

const OUT_DIR = path.join(process.cwd(), "data", "output");
const ENTITIES = ["student", "staff", "institution"];

async function rm(file) {
  try {
    await fs.unlink(file);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false; // already gone
    throw err;
  }
}

export async function POST() {
  const removed = [];

  for (const entity of ENTITIES) {
    const recPath = path.join(OUT_DIR, `${entity}-records.json`);
    const mapPath = path.join(OUT_DIR, `${entity}-mapping.json`);
    const rejPath = path.join(OUT_DIR, `${entity}-rejected.json`);
    if (await rm(recPath)) removed.push(recPath);
    if (await rm(mapPath)) removed.push(mapPath);
    if (await rm(rejPath)) removed.push(rejPath);
  }

  // Back up then wipe BOTH alias tables so the next demo run starts fresh:
  // value_aliases (approved global rules) AND pending_aliases (uploader
  // suggestions). Clearing only the first leaves orphaned pending rows that
  // silently auto-apply or re-notify — the bug this fixes. The demo's built-in
  // errors (e.g. gender "Male"/"Female") then re-appear as unrecognized.
  let aliasesCleared = 0;
  let pendingCleared = 0;
  let dbError = null;
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    // Wipe the staff table too (Postgres is now the source of truth for the
    // dashboard, not the on-disk JSON above).
    await clearStaff();
    await clearEnrolment();
    const [aliasSnapshot, pendingSnapshot] = await Promise.all([
      clearValueAliases(),
      clearPendingAliases(),
    ]);
    aliasesCleared = aliasSnapshot.length;
    pendingCleared = pendingSnapshot.length;
    if (aliasSnapshot.length > 0) {
      await fs.writeFile(
        path.join(OUT_DIR, "value-aliases-backup.json"),
        JSON.stringify(aliasSnapshot, null, 2), "utf8"
      );
    }
    if (pendingSnapshot.length > 0) {
      await fs.writeFile(
        path.join(OUT_DIR, "pending-aliases-backup.json"),
        JSON.stringify(pendingSnapshot, null, 2), "utf8"
      );
    }
  } catch (e) {
    // DB unreachable (e.g. local dev without DATABASE_URL) — files were still
    // cleared, but the alias/pending tables were NOT. Report it instead of
    // pretending a full reset happened, so a half-reset is never silent.
    dbError = e.message || "database unreachable — alias rules NOT cleared";
  }

  return NextResponse.json({ ok: !dbError, removed, aliasesCleared, pendingCleared, dbError });
}
