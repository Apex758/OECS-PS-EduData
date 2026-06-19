import crypto from "crypto";
import { processRowsCore } from "@/lib/processRowsCore";
import { generateCode, generateSalt, hashCode } from "@/lib/ruli";
import { splitSensitive, sensitiveFields } from "@/lib/sensitiveFields";

function identityHash(data, entity) {
  const fields = (sensitiveFields[entity] || []).slice().sort();
  const parts = fields.map((f) => String(data[f] ?? "").trim().toLowerCase());
  return crypto.createHash("sha256").update(parts.join("\x01")).digest("hex");
}

export function processRows(rawRows, entity, opts = {}) {
  return processRowsCore(rawRows, entity, {
    ...opts,
    generateCode,
    generateSalt,
    hashCode,
    identityHash,
  });
}
