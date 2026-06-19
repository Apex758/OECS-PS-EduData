import fs from "fs/promises";
import path from "path";
import { readStaffRecords } from "@/lib/db";

export const runtime = "nodejs";

const OUT_DIR = path.join(process.cwd(), "data", "output");
const ENTITIES = ["staff", "student", "institution"];
const TYPES = ["mapping", "records"];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity") || "student";
  const type = searchParams.get("type") || "mapping";

  if (!ENTITIES.includes(entity) || !TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: "invalid entity or type" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Staff is Postgres-backed -> rebuild the records/mapping JSON from the DB.
  if (entity === "staff") {
    if (type === "mapping") {
      return new Response(JSON.stringify({ error: "PII mappings are not stored on the server — they live in your browser session only." }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }
    try {
      const payload = await readStaffRecords();
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${entity}-${type}.json"`,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: `database error: ${e.message}` }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    }
  }

  const file = path.join(OUT_DIR, `${entity}-${type}.json`);
  try {
    const data = await fs.readFile(file, "utf8");
    return new Response(data, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${entity}-${type}.json"`,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "file not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
}
