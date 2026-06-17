import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { clearValueAliases, clearPendingAliases, clearStaff, clearEnrolment } from "@/lib/db";

const OUT_DIR = path.join(process.cwd(), "data", "output");
const ENTITIES = ["student", "staff", "institution"];

// Read-only serverless FS (Vercel) rejects writes outside /tmp with EROFS/
// EACCES. Treat those — and a missing file — as "nothing to do" so on-disk
// cleanup NEVER blocks the database wipe, which is the real source of truth.
function ignorableFsError(err) {
  return err && (err.code === "ENOENT" || err.code === "EROFS" || err.code === "EACCES" || err.code === "EPERM");
}

async function rm(file) {
  try {
    await fs.unlink(file);
    return true;
  } catch (err) {
    if (ignorableFsError(err)) return false; // already gone or read-only FS
    throw err;
  }
}

async function tryWrite(file, contents) {
  try {
    await fs.writeFile(file, contents, "utf8");
  } catch (err) {
    if (ignorableFsError(err)) return; // read-only serverless FS — skip backup
    throw err;
  }
}

export async function POST() {
  // 1) Wipe the database FIRST. Postgres is the source of truth for the
  // dashboard, so this must run regardless of whether the (ephemeral,
  // read-only on Vercel) on-disk JSON can be touched. Doing file work first
  // was the bug: an EROFS from fs.mkdir aborted the whole handler and the DB
  // was never cleared, so the demo never actually reset in production.
  //
  // Back up then wipe BOTH alias tables: value_aliases (approved global rules)
  // AND pending_aliases (uploader suggestions). Clearing only the first leaves
  // orphaned pending rows that silently auto-apply or re-notify. The demo's
  // built-in errors (e.g. gender "Male"/"Female") then re-appear as
  // unrecognized.
  let aliasesCleared = 0;
  let pendingCleared = 0;
  let dbError = null;
  let aliasSnapshot = [];
  let pendingSnapshot = [];
  try {
    await clearStaff();
    await clearEnrolment();
    [aliasSnapshot, pendingSnapshot] = await Promise.all([
      clearValueAliases(),
      clearPendingAliases(),
    ]);
    aliasesCleared = aliasSnapshot.length;
    pendingCleared = pendingSnapshot.length;
  } catch (e) {
    // DB unreachable (e.g. local dev without DATABASE_URL). Report it instead
    // of pretending a full reset happened, so a half-reset is never silent.
    dbError = e.message || "database unreachable — tables NOT cleared";
  }

  // 2) Best-effort on-disk cleanup + backups. Tolerates read-only serverless
  // FS — failures here never undo the DB wipe above.
  const removed = [];
  for (const entity of ENTITIES) {
    const recPath = path.join(OUT_DIR, `${entity}-records.json`);
    const mapPath = path.join(OUT_DIR, `${entity}-mapping.json`);
    const rejPath = path.join(OUT_DIR, `${entity}-rejected.json`);
    if (await rm(recPath)) removed.push(recPath);
    if (await rm(mapPath)) removed.push(mapPath);
    if (await rm(rejPath)) removed.push(rejPath);
  }
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
  } catch (err) {
    if (!ignorableFsError(err)) throw err;
  }
  if (aliasSnapshot.length > 0) {
    await tryWrite(
      path.join(OUT_DIR, "value-aliases-backup.json"),
      JSON.stringify(aliasSnapshot, null, 2)
    );
  }
  if (pendingSnapshot.length > 0) {
    await tryWrite(
      path.join(OUT_DIR, "pending-aliases-backup.json"),
      JSON.stringify(pendingSnapshot, null, 2)
    );
  }

  return NextResponse.json({ ok: !dbError, removed, aliasesCleared, pendingCleared, dbError });
}
