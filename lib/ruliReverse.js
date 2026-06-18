// =====================================================================
// RULI v2 REVERSE  --  server-side salt decryption for the validation layer
// =====================================================================
// Mirror of the standalone's engine/crypto/ruli2.js decrypt path. The salt is a
// deterministic AES-256-GCM encryption of the person's canonical identity:
//   salt = hex( iv(12) || tag(16) || ciphertext )
// Given the master key (copied in from the standalone), recover the identity so
// a duplicate prompt can show who the match is about. Splice format is also
// reversed here in case only the complete token is available.
//
// SECURITY: this uses the master key, which can re-identify anyone. Only ever
// call it from server-trusted (admin-gated) code paths.
// =====================================================================

import crypto from "crypto";

function splitKey(masterHex) {
  const buf = Buffer.from(masterHex, "hex");
  if (buf.length !== 64) throw new Error("master key must be 64 bytes (128 hex chars)");
  return { kEnc: buf.subarray(0, 32) };
}

// salt(hex) + masterKey(hex) -> canonical identity string ("surname|first|dob|nat")
export function decryptSalt(saltHex, masterHex) {
  const { kEnc } = splitKey(masterHex);
  const buf = Buffer.from(saltHex, "hex");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", kEnc, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Reverse the fixed 4-hex-char interleave (must match ruli2.splice).
const CHUNK = 4;
export function desplice(token) {
  const ruliLen = parseInt(token.slice(0, 4), 16);
  const body = token.slice(4);
  let a = "";
  let b = "";
  let ai = 0;
  for (let i = 0; i < body.length; ) {
    const aTake = Math.min(CHUNK, Math.max(0, ruliLen - ai), body.length - i);
    a += body.slice(i, i + aTake);
    ai += aTake;
    i += aTake;
    const bTake = Math.min(CHUNK, body.length - i);
    b += body.slice(i, i + bTake);
    i += bTake;
  }
  return { ruli: a, salt: b };
}

// Best-effort: turn a canonical identity string into labeled parts for display.
export function identityParts(identity) {
  const [surname, first_name, date_of_birth, nationality] = String(identity).split("|");
  return { surname, first_name, date_of_birth, nationality };
}
