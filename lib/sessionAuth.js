import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: { json: { error: "not signed in" }, status: 401 } };
  }
  if (!session.user.role) {
    return { error: { json: { error: "signed in, but this email is not provisioned in app_users" }, status: 403 } };
  }
  return { session };
}

export async function requireTeacherSession() {
  const out = await requireSession();
  if (out.error) return out;
  if (out.session.user.role !== "teacher" && out.session.user.role !== "admin") {
    return { error: { json: { error: "institution login required" }, status: 403 } };
  }
  if (!out.session.user.id) {
    return { error: { json: { error: "user id missing on session — sign out and sign in again" }, status: 403 } };
  }
  return out;
}

export async function requireMinisterSession() {
  const out = await requireSession();
  if (out.error) return out;
  if (out.session.user.role !== "minister") {
    return { error: { json: { error: "country / ministry login required" }, status: 403 } };
  }
  if (!out.session.user.id || out.session.user.countryId == null) {
    return { error: { json: { error: "minister session missing country scope" }, status: 403 } };
  }
  return out;
}

export async function requireAdminSession() {
  const out = await requireSession();
  if (out.error) return out;
  if (out.session.user.role !== "admin") {
    return { error: { json: { error: "OECS admin login required" }, status: 403 } };
  }
  return out;
}

export function sessionErrorResponse(err) {
  return NextResponse.json(err.json, { status: err.status });
}
