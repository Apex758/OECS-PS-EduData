import crypto from "crypto";

// CSPRNG-backed random code for a child.
// crypto.randomBytes pulls from the OS CSPRNG (cryptographically secure
// pseudo-random; entropy-seeded by the OS, not a true hardware TRNG).
// Returns a URL-safe-ish hex string.
export function generateCode(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Per-record salt.
export function generateSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Salt + hash the code. Stored hash lets you verify a code without
// keeping the raw code in the anonymized record, if you want that.
// Uses scrypt (slow KDF, resists brute force).
export function hashCode(code, salt) {
  const derived = crypto.scryptSync(code, salt, 32);
  return derived.toString("hex");
}
