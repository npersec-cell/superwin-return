import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, slotNumber } = body;

    if (!userId || slotNumber === undefined) {
      return NextResponse.json(
        { ok: false, error: "Missing userId or slotNumber" },
        { status: 400 }
      );
    }

    // Check if user has completed address
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("coin_balance, address_completed, shipping_name, shipping_address, shipping_zipcode, shipping_phone")
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

    // Get slot info
    const { data: slot, error: slotError } = await supabase
      .from("number_slots")
      .select("*")
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

    // Check user balance
    if (user.coin_balance < price) {
      return NextResponse.json(
        { ok: false, error: "Insufficient coins", required: price, current: user.coin_balance },
        { status: 400 }
      );
    }

    // Start transaction
    // 1. Deduct coins from buyer
    const { error: deductError } = await supabase
      .from("users")
      .update({ coin_balance: user.coin_balance - price })
      .eq("id", userId);

    if (deductError) throw deductError;

    // 2. If takeover, pay previous owner
    if (isTakeover && slot.owner_id) {
      const profit = price - slot.current_price; // profit from previous price
      const payoutToOldOwner = slot.current_price + Math.floor(profit / 2);
      const burnAmount = price - payoutToOldOwner;

      // Get old owner balance
      const { data: oldOwner, error: oldOwnerError } = await supabase
        .from("users")
        .select("coin_balance")
        .eq("id", slot.owner_id)
        .single();

      if (oldOwnerError) throw oldOwnerError;

      // Pay old owner
      if (oldOwner) {
        const { error: payError } = await supabase
          .from("users")
          .update({ coin_balance: oldOwner.coin_balance + payoutToOldOwner })
          .eq("id", slot.owner_id);

        if (payError) throw payError;

        // Add to coin_ledger for old owner (credit)
        await supabase.from("coin_ledger").insert({
          user_id: slot.owner_id,
          amount: payoutToOldOwner,
          type: "credit",
          balance_after: oldOwner.coin_balance + payoutToOldOwner,
          description: `ถูกแย่งเลข ${slotNumber} (ได้รับ ${payoutToOldOwner} coins)`,
        });

        // Add burn record
        if (burnAmount > 0) {
          await supabase.from("coin_ledger").insert({
            user_id: slot.owner_id,
            amount: -burnAmount,
            type: "burn",
            balance_after: oldOwner.coin_balance + payoutToOldOwner,
            description: `Burn จากการแย่งเลข ${slotNumber}`,
          });
        }

        // Create notification for old owner
        await supabase.from("notifications").insert({
          user_id: slot.owner_id,
          title: "ถูกแย่งเลข!",
          message: `คุณถูกแย่งเลข ${slotNumber} ไปแล้ว! ได้รับ ${payoutToOldOwner} coins คืน`,
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

    // 4. Add to buyer's coin_ledger
    await supabase.from("coin_ledger").insert({
      user_id: userId,
      amount: -price,
      type: "predict",
      balance_after: user.coin_balance - price,
      description: isTakeover ? `แย่งเลข ${slotNumber} (${price} coins)` : `ซื้อเลข ${slotNumber} (${price} coins)`,
    });

    return NextResponse.json({
      ok: true,
      message: isTakeover ? `แย่งเลข ${slotNumber} สำเร็จ!` : `ซื้อเลข ${slotNumber} สำเร็จ!`,
      data: {
        slotNumber,
        price,
        isTakeover,
        newBalance: user.coin_balance - price,
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
