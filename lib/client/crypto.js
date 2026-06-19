import { sensitiveFields } from "@/lib/sensitiveFields";
import { sha256Hex } from "@/lib/client/sha256";

export function generateCode(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateSalt(bytes = 16) {
  return generateCode(bytes);
}

export function hashCode(code, salt) {
  return sha256Hex(`${code}:${salt}`);
}

export function identityHash(data, entity) {
  const fields = (sensitiveFields[entity] || []).slice().sort();
  const parts = fields.map((f) => String(data[f] ?? "").trim().toLowerCase());
  return sha256Hex(parts.join("\x01"));
}
