import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import {
  listPendingSubmissions,
  listSubmissionsForUser,
  getSubmissionAggregations,
} from "@/lib/db";
import {
  requireMinisterSession,
  requireSession,
  sessionErrorResponse,
} from "@/lib/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ pending: [], submissions: [] });
  }

  const authOut = await requireSession();
  if (authOut.error) return sessionErrorResponse(authOut.error);

  const { role, id: userId, countryId } = authOut.session.user;
  const url = new URL(req.url);
  const submissionId = url.searchParams.get("submissionId");

  try {
    if (submissionId) {
      const aggs = await getSubmissionAggregations(Number(submissionId));
      return NextResponse.json({ aggregations: aggs });
    }

    if (role === "minister") {
      const pending = await listPendingSubmissions(countryId);
      return NextResponse.json({ pending, submissions: pending });
    }

    if (role === "teacher") {
      const submissions = await listSubmissionsForUser(userId);
      return NextResponse.json({
        submissions,
        pending: submissions.filter((s) => s.status === "pending_l2"),
      });
    }

    if (role === "admin") {
      return NextResponse.json({ pending: [], submissions: [] });
    }

    return NextResponse.json({ pending: [], submissions: [] });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
