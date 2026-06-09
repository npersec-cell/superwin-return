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
    const { slotNumber } = body;

    if (slotNumber === undefined || slotNumber < 0 || slotNumber > 200) {
      return NextResponse.json(
        { ok: false, error: "Invalid slot number (0-200)" },
        { status: 400 }
      );
    }

    // Get the slot
    const { data: slot, error: slotError } = await supabase
      .from("number_slots")
      .select("*, owner:owner_id(id, display_name, email)")
      .eq("slot_number", slotNumber)
      .single();

    if (slotError || !slot) {
      return NextResponse.json(
        { ok: false, error: "Slot not found" },
        { status: 404 }
      );
    }

    if (!slot.owner_id) {
      return NextResponse.json(
        { ok: false, error: "No owner for this slot" },
        { status: 400 }
      );
    }

    // Check if already has a winner for this slot
    const { data: existingWinner, error: winnerCheckError } = await supabase
      .from("winners_log")
      .select("id")
      .eq("slot_number", slotNumber)
      .order("created_at", { ascending: false })
      .limit(1);

    if (winnerCheckError) throw winnerCheckError;

    // Create winner log
    const { data: winnerLog, error: winnerError } = await supabase
      .from("winners_log")
      .insert({
        user_id: slot.owner_id,
        slot_number: slotNumber,
        shipping_status: "pending",
      })
      .select()
      .single();

    if (winnerError) throw winnerError;

    // Get winner's address info
    const { data: winnerUser, error: userError } = await supabase
      .from("users")
      .select("shipping_name, shipping_address, shipping_zipcode, shipping_phone, display_name")
      .eq("id", slot.owner_id)
      .single();

    if (userError) throw userError;

    // Create notification for winner
    await supabase.from("notifications").insert({
      user_id: slot.owner_id,
      title: "🎉 ยินดีด้วย! คุณชนะรางวัล!",
      message: `เลข ${slotNumber} ของคุณชนะรางวัล! ของรางวัลกำลังเตรียมจัดส่งไปยังที่อยู่ของคุณ`,
      type: "number_war_winner",
      read: false,
    });

    // Log admin action
    await supabase.from("audit_logs").insert({
      admin_id: user.id,
      action: "set_number_winner",
      target_type: "number_slot",
      target_id: slot.id,
      metadata: {
        slot_number: slotNumber,
        winner_id: slot.owner_id,
        winner_name: winnerUser?.display_name || "Unknown",
        winner_address: {
          name: winnerUser?.shipping_name,
          address: winnerUser?.shipping_address,
          zipcode: winnerUser?.shipping_zipcode,
          phone: winnerUser?.shipping_phone,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: `ประกาศผลสำเร็จ! เลข ${slotNumber} ชนะรางวัล`,
      data: {
        winner: {
          id: slot.owner_id,
          name: winnerUser?.display_name || "Unknown",
          email: slot.owner?.email,
          address: {
            name: winnerUser?.shipping_name,
            address: winnerUser?.shipping_address,
            zipcode: winnerUser?.shipping_zipcode,
            phone: winnerUser?.shipping_phone,
          },
        },
        winnerLog: winnerLog,
      },
    });
  } catch (error) {
    console.error("Error setting winner:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to set winner" },
      { status: 500 }
    );
  }
}
