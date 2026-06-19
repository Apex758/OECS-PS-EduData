import { NextResponse } from "next/server";
import { readCountriesCsv, ministerDemoEmail } from "@/lib/readCountriesCsv.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const countries = readCountriesCsv().map((c) => ({
    ...c,
    ministerEmail: ministerDemoEmail(c.iso),
  }));
  return NextResponse.json({ countries });
}
