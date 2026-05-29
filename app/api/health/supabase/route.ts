import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseConfigured } from "@/lib/db";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase environment variables are not configured" },
      { status: 500 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("users").select("id").limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Supabase query failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: { database: "connected", schema: "available" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
