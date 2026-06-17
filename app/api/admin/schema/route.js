import { NextResponse } from "next/server";
import { rulesByEntity } from "@/lib/validationRules";
import { aliasesByEntity } from "@/lib/headerAliases";

// Read-only view of the STATIC validation schema: per entity, each canonical
// field with its type/constraints, allowed enum values, and accepted header
// variations (gender -> sex, etc). Public read — these are just the rule
// definitions (no data). The UI joins this with the learned value-aliases
// (admin-gated) to show "what the rules are right now".
export const runtime = "nodejs";

export async function GET() {
  const entities = {};
  for (const [entity, rules] of Object.entries(rulesByEntity)) {
    const headerAliases = aliasesByEntity[entity] || {};
    entities[entity] = {
      fields: Object.entries(rules).map(([field, r]) => ({
        field,
        type: r.type,
        required: !!r.required,
        values: r.values || null,            // enum allowed values, else null
        headerAliases: headerAliases[field] || [],
        constraints: {
          min: r.min ?? null,
          max: r.max ?? null,
          minLen: r.minLen ?? null,
          maxLen: r.maxLen ?? null,
        },
      })),
    };
  }

  return NextResponse.json({ entities });
}
