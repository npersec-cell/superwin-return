import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Verify admin
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if admin
    const { data: adminUser, error: adminError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminError || adminUser?.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Admin only" },
        { status: 403 }
      );
    }

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
      admin_id: user.id,
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
