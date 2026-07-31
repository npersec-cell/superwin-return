import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// Fetch all distinct user emails for autocomplete
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const supabase = createSupabaseAdminClient();
    const { data: emails, error } = await supabase
      .from("users")
      .select("email")
      .eq("role", "user")
      .order("email", { ascending: true });

    if (error) throw new Error(error.message);

    const uniqueEmails = Array.from(new Set((emails || []).map(e => e.email))).sort();
    return NextResponse.json({ ok: true, data: uniqueEmails });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load user emails";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
