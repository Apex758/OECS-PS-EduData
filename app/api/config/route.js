import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";

export async function GET() {
  return NextResponse.json({ dbConfigured: isDbConfigured() });
}
