// Interleaved RULI + salt token — must match lib/ruliReverse.js desplice().
const CHUNK = 4;

export function spliceToken(ruli, salt) {
  const ruliLen = ruli.length;
  const prefix = ruliLen.toString(16).padStart(4, "0");
  let body = "";
  let ai = 0;
  let bi = 0;
  while (ai < ruli.length || bi < salt.length) {
    body += ruli.slice(ai, ai + CHUNK);
    ai += CHUNK;
    body += salt.slice(bi, bi + CHUNK);
    bi += CHUNK;
  }
  return prefix + body;
}
