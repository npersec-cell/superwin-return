import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    // ลบ Cache ปัจจุบันออก (จะคำนวณใหม่เมื่อมีคนเรียก GET /api/leaderboard)
    const { error } = await supabase
      .from("cache")
      .delete()
      .eq("key", "leaderboard_top10");

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to clear cache: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Leaderboard cache cleared successfully. Next request will recalculate fresh data.",
      th: "ล้างแคช Leaderboard สำเร็จ คำขอถัดไปจะคำนวณข้อมูลใหม่",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh leaderboard cache failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
