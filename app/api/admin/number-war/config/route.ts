import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    // Verify admin (standard pattern)
    const admin = await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    const body = await request.json();
    const { tournamentId, openAt, closeAt, enabled } = body;

    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "กรุณาระบุ Tournament" },
        { status: 400 }
      );
    }

    // Validate dates
    if (!openAt || !closeAt) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกวันเปิดและวันปิด" },
        { status: 400 }
      );
    }

    const openDate = new Date(openAt);
    const closeDate = new Date(closeAt);

    if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "วันที่ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (closeDate <= openDate) {
      return NextResponse.json(
        { ok: false, error: "วันปิดต้องอยู่หลังวันเปิด" },
        { status: 400 }
      );
    }

    // Update tournament
    const { data: tournament, error: updateError } = await supabase
      .from("predictions")
      .update({
        number_war_enabled: enabled ?? true,
        number_war_open_at: openDate.toISOString(),
        number_war_close_at: closeDate.toISOString(),
      })
      .eq("id", tournamentId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log admin action
    await supabase.from("audit_logs").insert({
      admin_id: admin.id,
      action: "update_number_war_config",
      target_type: "predictions",
      target_id: tournamentId,
      metadata: {
        tournament_name: tournament?.tournament_name,
        number_war_open_at: openDate.toISOString(),
        number_war_close_at: closeDate.toISOString(),
        number_war_enabled: enabled ?? true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "อัปเดตการตั้งค่าสำเร็จ",
      data: tournament,
    });
  } catch (error) {
    console.error("Error updating config:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update config" },
      { status: 500 }
    );
  }
}
