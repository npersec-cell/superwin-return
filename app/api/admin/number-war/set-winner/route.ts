import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { winningScore, roundId } = body;

    // Validate roundId
    if (!roundId) {
      return NextResponse.json(
        { ok: false, error: "กรุณาเลือกรายการแข่งขัน" },
        { status: 400 }
      );
    }

    // Look up round name
    const { data: round, error: roundError } = await supabase
      .from("number_war_rounds")
      .select("name")
      .eq("id", roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบรายการแข่งขัน" },
        { status: 404 }
      );
    }

    const matchName = round.name;

    if (winningScore === undefined || winningScore === null || isNaN(Number(winningScore))) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกเลขที่ชนะ (0-200)" },
        { status: 400 }
      );
    }

    const slotNumber = Number(winningScore);

    if (slotNumber < 0 || slotNumber > 200) {
      return NextResponse.json(
        { ok: false, error: `เลขชนะที่คำนวณได้คือ ${slotNumber} ซึ่งไม่อยู่ในช่วง 0-200` },
        { status: 400 }
      );
    }

    // Update round winner slot
    const { error: updateError } = await supabase
      .from("number_war_rounds")
      .update({ winner_slot: slotNumber, status: "resolved" })
      .eq("id", roundId);

    if (updateError) {
      console.error("Error updating round winner slot:", updateError);
    }

    // Get the slot from this round
    const { data: slot, error: slotError } = await supabase
      .from("number_slots")
      .select("*, owner:owner_id(id, display_name, email)")
      .eq("round_id", roundId)
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
        { ok: false, error: `เลข ${slotNumber} ยังไม่มีเจ้าของ!` },
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

    // Create winner log with match info
    const { data: winnerLog, error: winnerError } = await supabase
      .from("winners_log")
      .insert({
        user_id: slot.owner_id,
        slot_number: slotNumber,
        match_name: matchName.trim(),
        winning_score: slotNumber,
        round_id: roundId,
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
      title: "ยินดีด้วย! คุณชนะรางวัล Number War!",
      message: `เลข ${slotNumber} ของคุณชนะรางวัลจากการแข่งขัน "${matchName.trim()}"! ของรางวัลกำลังเตรียมจัดส่ง`,
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
        round_id: roundId,
        slot_number: slotNumber,
        match_name: matchName.trim(),
        winning_score: slotNumber,
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
      message: `ประกาศผลสำเร็จ! เลข ${slotNumber} ชนะรางวัลจาก "${matchName.trim()}"`,
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
        calculatedNumber: slotNumber,
        winningScore: winningScore,
      },
    });
  } catch (error) {
    console.error("Error setting winner:", error);
    const message = error instanceof Error ? error.message : "Failed to set winner";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
