import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

// GET /api/settings — Public: fetch site-wide settings (YouTube embed, etc.)
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: settings, error } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["youtube_embed"]);

    if (error) {
      console.error("Settings GET error:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch settings" }, { status: 500 });
    }

    const result: Record<string, any> = {};
    for (const s of settings || []) {
      result[s.key] = s.value;
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
