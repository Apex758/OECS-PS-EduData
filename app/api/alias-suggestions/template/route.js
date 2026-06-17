import { listValueAliases } from "@/lib/db";
import { rulesByEntity } from "@/lib/validationRules";

// Downloadable reference template for an entity: every field, its type,
// whether it's required, the allowed canonical values for enums, and any
// admin-approved aliases that normalize to those values. Uploaders use this
// as a guide so future files land cleanly.
export const runtime = "nodejs";

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req) {
  const entity = new URL(req.url).searchParams.get("entity") || "staff";
  const rules = rulesByEntity[entity] || {};

  // Approved aliases grouped by field: { field -> [{variant, canonical}] }
  let aliases = [];
  try { aliases = await listValueAliases(entity); } catch { /* no DB -> values only */ }
  const aliasByField = {};
  for (const a of aliases) {
    (aliasByField[a.field] ||= []).push(`${a.variant}=${a.canonical}`);
  }

  const header = ["field", "required", "type", "allowed_values", "approved_aliases"];
  const lines = [header.join(",")];
  for (const [field, rule] of Object.entries(rules)) {
    const allowed = rule.type === "enum" && Array.isArray(rule.values) ? rule.values.join(" | ") : "";
    const aka = (aliasByField[field] || []).join(" | ");
    lines.push([
      csvCell(field),
      csvCell(rule.required ? "yes" : "no"),
      csvCell(rule.type || "string"),
      csvCell(allowed),
      csvCell(aka),
    ].join(","));
  }

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}-validation-template.csv"`,
    },
  });
}
