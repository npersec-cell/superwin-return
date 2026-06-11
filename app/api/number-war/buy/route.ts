import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";

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
    const authUser = await requireUser(request);
    const userId = authUser.id;

    const body = await request.json();
    const { slotNumber, roundId } = body;

    if (slotNumber === undefined) {
      return NextResponse.json(
        { ok: false, error: "Missing slotNumber" },
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
          { ok: false, error: `รายการนี้ยังไม่เปิดรับซื้อ (เปิด ${new Date(round.open_at!).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})` },
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

    // Rule: Cannot buy your own slot
    if (isTakeover && slot.owner_id === userId) {
      return NextResponse.json(
        { ok: false, error: "คุณเป็นเจ้าของเลขนี้อยู่แล้ว ไม่สามารถซื้อซ้ำได้" },
        { status: 400 }
      );
    }

    // Check user profit_score (กระสุนเขียว) - use DB value, not authUser
    const currentProfitScore = user.profit_score ?? 0;
    if (currentProfitScore < price) {
      return NextResponse.json(
        { ok: false, error: "Insufficient profit_score", required: price, current: currentProfitScore },
        { status: 400 }
      );
    }

    // Start transaction
    // 1. Deduct profit_score from buyer
    const { error: deductError } = await supabase
      .from("users")
      .update({ profit_score: currentProfitScore - price })
      .eq("id", userId);

    if (deductError) throw deductError;

    let oldOwnerPayout = 0;
    let profit = 0;

    // 2. If takeover, pay previous owner
    if (isTakeover && slot.owner_id) {
      profit = price - slot.current_price;
      const payoutToOldOwner = slot.current_price + Math.floor(profit / 2);
      oldOwnerPayout = payoutToOldOwner;
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

        // Log history for old owner (sold) - non-blocking
        try {
          await supabase.from("number_war_history").insert({
            user_id: slot.owner_id,
            round_id: targetRoundId,
            slot_number: slotNumber,
            type: "sold",
            amount: payoutToOldOwner,
            price: slot.current_price,
            profit: Math.floor(profit / 2),
            opponent_id: userId,
          });
        } catch (logErr) {
          console.error("Failed to log sold history:", logErr);
        }
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

    // 4. Log history for buyer - non-blocking
    try {
      await supabase.from("number_war_history").insert({
        user_id: userId,
        round_id: targetRoundId,
        slot_number: slotNumber,
        type: isTakeover ? "takeover" : "buy",
        amount: -price,
        price: price,
        profit: 0,
        opponent_id: isTakeover ? slot.owner_id : null,
      });
    } catch (logErr) {
      console.error("Failed to log buy history:", logErr);
    }

    return NextResponse.json({
      ok: true,
      message: isTakeover ? `แย่งเลข ${slotNumber} สำเร็จ!` : `ซื้อเลข ${slotNumber} สำเร็จ!`,
      data: {
        slotNumber,
        price,
        isTakeover,
        newProfitScore: currentProfitScore - price,
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
