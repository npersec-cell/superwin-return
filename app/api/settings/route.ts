import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

// GET /api/settings — Public: fetch site-wide settings (YouTube embed, etc.)
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: settings, error } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["youtube_embed", "frontend_features", "announcement", "tournaments"]);

    if (error) {
      console.error("Settings GET error:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch settings" }, { status: 500 });
    }

    const result: Record<string, any> = {};
    for (const s of settings || []) {
      // Flatten 'announcement' so it's directly accessible as data.announcement
      if (s.key === "announcement") {
        result[s.key] = s.value;
      } else {
        result[s.key] = s.value;
      }
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
