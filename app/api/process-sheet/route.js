import { NextResponse } from "next/server";

// Google Sheets ingest disabled — raw PII must not be read on the server.
// Export the sheet to CSV/XLSX and upload the file for offline strip/validate.
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({
    error: "Google Sheets cannot be processed on the server — export to CSV/XLSX and upload the file. PII must stay in your browser (session storage) until you push stripped records.",
  }, { status: 400 });
}
