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
    const { winnerId, shippingStatus, trackingNumber, adminNotes } = body;

    if (!winnerId || !shippingStatus) {
      return NextResponse.json(
        { ok: false, error: "Missing winnerId or shippingStatus" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["pending", "processing", "shipped", "delivered"];
    if (!validStatuses.includes(shippingStatus)) {
      return NextResponse.json(
        { ok: false, error: "Invalid shipping status" },
        { status: 400 }
      );
    }

    // Get current winner log
    const { data: winnerLog, error: winnerError } = await supabase
      .from("winners_log")
      .select("*, user:user_id(id, display_name)")
      .eq("id", winnerId)
      .single();

    if (winnerError || !winnerLog) {
      return NextResponse.json(
        { ok: false, error: "Winner log not found" },
        { status: 404 }
      );
    }

    // Update winner log
    const updateData: any = {
      shipping_status: shippingStatus,
      updated_at: new Date().toISOString(),
    };

    if (trackingNumber !== undefined) {
      updateData.tracking_number = trackingNumber;
    }

    if (adminNotes !== undefined) {
      updateData.admin_notes = adminNotes;
    }

    const { error: updateError } = await supabase
      .from("winners_log")
      .update(updateData)
      .eq("id", winnerId);

    if (updateError) throw updateError;

    // Create notification for user if status changed to shipped
    if (shippingStatus === "shipped" && trackingNumber) {
      await supabase.from("notifications").insert({
        user_id: winnerLog.user_id,
        title: "📦 ของรางวัลถูกจัดส่งแล้ว!",
        message: `ของรางวัลจากเลข ${winnerLog.slot_number} ถูกจัดส่งแล้ว (เลข Tracking: ${trackingNumber})`,
        type: "number_war_shipped",
        read: false,
      });
    }

    // Log admin action
    await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action: "update_winner_shipping",
      target_type: "winners_log",
      target_id: winnerId,
      metadata: {
        slot_number: winnerLog.slot_number,
        user_id: winnerLog.user_id,
        old_status: winnerLog.shipping_status,
        new_status: shippingStatus,
        tracking_number: trackingNumber,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "อัปเดตสถานะจัดส่งสำเร็จ",
      data: {
        winnerId,
        shippingStatus,
        trackingNumber,
      },
    });
  } catch (error) {
    console.error("Error updating shipping:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update shipping status" },
      { status: 500 }
    );
  }
}
