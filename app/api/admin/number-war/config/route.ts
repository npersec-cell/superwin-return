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
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (adminError || !adminUser?.is_admin) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Admin only" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { openAt, closeAt, isActive } = body;

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

    // Get existing config
    const { data: existing } = await supabase
      .from("number_war_config")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("number_war_config")
        .update({
          open_at: openDate.toISOString(),
          close_at: closeDate.toISOString(),
          is_active: isActive ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("number_war_config")
        .insert({
          open_at: openDate.toISOString(),
          close_at: closeDate.toISOString(),
          is_active: isActive ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Log admin action
    await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action: "update_number_war_config",
      target_type: "number_war_config",
      target_id: result.id,
      metadata: {
        open_at: openDate.toISOString(),
        close_at: closeDate.toISOString(),
        is_active: isActive ?? true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "อัปเดตการตั้งค่าสำเร็จ",
      data: result,
    });
  } catch (error) {
    console.error("Error updating config:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update config" },
      { status: 500 }
    );
  }
}
