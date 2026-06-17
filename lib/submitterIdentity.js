import crypto from "crypto";

// Derive a short, stable fingerprint for the uploader from request headers.
// No PII is stored — only the hash. Same browser+IP = same fingerprint,
// which is enough for the "apply your own pending aliases on re-upload" flow.
export function getSubmitterIdentity(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "";
  return crypto
    .createHash("sha256")
    .update(`${ip}:${ua}`)
    .digest("hex")
    .slice(0, 24);
}
