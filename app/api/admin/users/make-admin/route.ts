import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Body = {
  email?: string;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin update failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = (await request.json()) as Body;
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("users")
      .update({ role: "admin", updated_at: new Date().toISOString() })
      .eq("email", email)
      .select("id, email, role")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "User email not found. User must sign up first." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin update failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
