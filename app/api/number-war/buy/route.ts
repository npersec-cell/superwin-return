import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getRoundStatus(round: { open_at: string | null; close_at: string | null }): "upcoming" | "open" | "closed" {
  const now = Date.now();
  const open = round.open_at ? new Date(round.open_at).getTime() : null;
  const close = round.close_at ? new Date(round.close_at).getTime() : null;
  if (open && now < open) return "upcoming";
  if (close && now > close) return "closed";
  if (open && close && now >= open && now <= close) return "open";
  return "closed";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, slotNumber, roundId } = body;

    if (!userId || slotNumber === undefined) {
      return NextResponse.json(
        { ok: false, error: "Missing userId or slotNumber" },
        { status: 400 }
      );
    }

    // Check if user has completed address
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("profit_score, address_completed, shipping_name, shipping_address, shipping_zipcode, shipping_phone")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Address Wall - block if address not completed
    if (!user.address_completed) {
      return NextResponse.json(
        {
          ok: false,
          error: "ADDRESS_REQUIRED",
          message: "กรุณากรอกข้อมูลจัดส่งก่อนเริ่มเล่น",
          requiredFields: {
            shipping_name: !user.shipping_name,
            shipping_address: !user.shipping_address,
            shipping_zipcode: !user.shipping_zipcode,
            shipping_phone: !user.shipping_phone,
          }
        },
        { status: 403 }
      );
    }

    // Find active round
    let targetRoundId = roundId;
    if (!targetRoundId) {
      const { data: rounds } = await supabase
        .from("number_war_rounds")
        .select("id, open_at, close_at")
        .order("created_at", { ascending: false });

      const activeRound = (rounds || []).find((r) => getRoundStatus(r) === "open");
      if (activeRound) {
        targetRoundId = activeRound.id;
      }
    }

    if (!targetRoundId) {
      return NextResponse.json(
        { ok: false, error: "ไม่มีรายการแข่งขัน Number War ที่เปิดรับซื้ออยู่" },
        { status: 403 }
      );
    }

    // Verify round is open
    const { data: round } = await supabase
      .from("number_war_rounds")
      .select("open_at, close_at")
      .eq("id", targetRoundId)
      .single();

    if (round) {
      const status = getRoundStatus(round);
      if (status === "upcoming") {
        return NextResponse.json(
          { ok: false, error: `รายการนี้ยังไม่เปิดรับซื้อ (เปิด ${new Date(round.open_at!).toLocaleString("th-TH")})` },
          { status: 403 }
        );
      }
      if (status === "closed") {
        return NextResponse.json(
          { ok: false, error: "รายการนี้ปิดรับซื้อแล้ว" },
          { status: 403 }
        );
      }
    }

    // Get slot info for this round
    const { data: slot, error: slotError } = await supabase
      .from("number_slots")
      .select("*")
      .eq("round_id", targetRoundId)
      .eq("slot_number", slotNumber)
      .single();

    if (slotError || !slot) {
      return NextResponse.json(
        { ok: false, error: "Slot not found" },
        { status: 404 }
      );
    }

    // Calculate price
    const isTakeover = !!slot.owner_id;
    const price = isTakeover ? slot.current_price * 2 : slot.current_price;

    // Check user profit_score (กระสุนเขียว)
    if (user.profit_score < price) {
      return NextResponse.json(
        { ok: false, error: "Insufficient profit_score", required: price, current: user.profit_score },
        { status: 400 }
      );
    }

    // Start transaction
    // 1. Deduct profit_score from buyer
    const { error: deductError } = await supabase
      .from("users")
      .update({ profit_score: user.profit_score - price })
      .eq("id", userId);

    if (deductError) throw deductError;

    // 2. If takeover, pay previous owner
    if (isTakeover && slot.owner_id) {
      const profit = price - slot.current_price; // profit from previous price
      const payoutToOldOwner = slot.current_price + Math.floor(profit / 2);
      const burnAmount = price - payoutToOldOwner;

      // Get old owner profit_score
      const { data: oldOwner, error: oldOwnerError } = await supabase
        .from("users")
        .select("profit_score")
        .eq("id", slot.owner_id)
        .single();

      if (oldOwnerError) throw oldOwnerError;

      // Pay old owner
      if (oldOwner) {
        const { error: payError } = await supabase
          .from("users")
          .update({ profit_score: oldOwner.profit_score + payoutToOldOwner })
          .eq("id", slot.owner_id);

        if (payError) throw payError;

        // Create notification for old owner
        await supabase.from("notifications").insert({
          user_id: slot.owner_id,
          title: "ถูกแย่งเลข!",
          message: `คุณถูกแย่งเลข ${slotNumber} ไปแล้ว! ได้รับ ${payoutToOldOwner} ● คืน`,
          type: "number_war_takeover",
          read: false,
        });
      }
    }

    // 3. Update slot
    const { error: updateError } = await supabase
      .from("number_slots")
      .update({
        owner_id: userId,
        current_price: price,
        total_takeovers: slot.total_takeovers + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      message: isTakeover ? `แย่งเลข ${slotNumber} สำเร็จ!` : `ซื้อเลข ${slotNumber} สำเร็จ!`,
      data: {
        slotNumber,
        price,
        isTakeover,
        newProfitScore: user.profit_score - price,
      },
    });
  } catch (error) {
    console.error("Error buying slot:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to buy slot" },
      { status: 500 }
    );
  }
}
