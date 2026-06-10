import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function scoreToSlot(score: number): number | null {
  if (score < 0) return null;
  if (score < 100) return 0;
  if (score === 100 || score === 300) return null;
  if (score >= 101 && score <= 299) return score - 100;
  if (score > 300) return 200;
  return null;
}

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
        { ok: false, error: "กรุณากรอกคะแนนที่ชนะ" },
        { status: 400 }
      );
    }

    const rawScore = Number(winningScore);

    if (isNaN(rawScore) || rawScore < 0) {
      return NextResponse.json(
        { ok: false, error: "กรุณากรอกคะแนนที่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (rawScore === 100 || rawScore === 300) {
      return NextResponse.json(
        { ok: false, error: `คะแนน ${rawScore} ไม่อยู่ในช่วงที่กำหนด (ใช้ ต่ำกว่า 100, 101-299, หรือ มากกว่า 300)` },
        { status: 400 }
      );
    }

    const slotNumber = scoreToSlot(rawScore);

    if (slotNumber === null || slotNumber < 0 || slotNumber > 200) {
      return NextResponse.json(
        { ok: false, error: `คะแนน ${rawScore} ไม่อยู่ในช่วงที่กำหนด` },
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
      const slotDisplay = slotNumber === 0 ? "ต่ำกว่า 100" : slotNumber === 200 ? "มากกว่า 300" : String(slotNumber + 100);
      return NextResponse.json(
        { ok: false, error: `${slotDisplay} (slot ${slotNumber}) ยังไม่มีเจ้าของ!` },
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
        winning_score: rawScore,
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
    const slotDisplay = slotNumber === 0 ? "ต่ำกว่า 100" : slotNumber === 200 ? "มากกว่า 300" : String(slotNumber + 100);
    await supabase.from("notifications").insert({
      user_id: slot.owner_id,
      title: "ยินดีด้วย! คุณชนะรางวัล Number War!",
      message: `${slotDisplay} ของคุณชนะรางวัลจากการแข่งขัน "${matchName.trim()}"! ของรางวัลกำลังเตรียมจัดส่ง`,
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
        winning_score: rawScore,
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
      message: `ประกาศผลสำเร็จ! คะแนน ${rawScore} → ${slotDisplay} ชนะรางวัลจาก "${matchName.trim()}"`,
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
        winningScore: rawScore,
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
