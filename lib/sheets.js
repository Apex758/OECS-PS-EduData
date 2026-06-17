// =====================================================================
// GOOGLE SHEETS  --  service-account read -> header-keyed rows
// =====================================================================
// Schools share a sheet (read-only) with the service account email. We
// mint a short-lived token with google-auth-library (JWT, no user OAuth
// flow) and call the Sheets REST API. Output matches parseCSV: an array
// of objects keyed by the header row, every value a trimmed string -- so
// the rest of the pipeline (normalizeHeaders, validation) is unchanged.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY   (PEM; literal "\n" sequences are un-escaped)
// =====================================================================

import { JWT } from "google-auth-library";
import { matrixToRecords } from "@/lib/csv";
import { findHeaderRowIndex } from "@/lib/headerAliases";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function jwtClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY not set");
  }
  return new JWT({ email, key, scopes: [SCOPE] });
}

// fetchSheetRows(spreadsheetId, rangeA1, entity) -> [{ header: value, ... }, ...]
// The header row is auto-detected (entity-aware) so junk/title rows above the
// real header are skipped; falls back to row 0 when entity is unknown.
export async function fetchSheetRows(spreadsheetId, rangeA1 = "A:Z", entity) {
  const client = jwtClient();
  const { token } = await client.getAccessToken();
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(rangeA1)}?majorDimension=ROWS`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  const matrix = body.values || [];
  return matrixToRecords(matrix, findHeaderRowIndex(matrix, entity));
}
