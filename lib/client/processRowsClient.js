import { processRowsCore } from "@/lib/processRowsCore";
import { generateCode, generateSalt, hashCode, identityHash } from "@/lib/client/crypto";

// Browser-side pipeline: deterministic salt from identity for cross-institution dup scan.
export function processRowsClient(rawRows, entity, opts = {}) {
  return processRowsCore(rawRows, entity, {
    ...opts,
    generateCode,
    generateSalt,
    hashCode,
    identityHash,
    saltFromIdentity: true,
  });
}
