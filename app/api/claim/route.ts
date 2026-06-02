import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

const CLAIM_AMOUNT = 100;
const CLAIM_COOLDOWN_MS = 60 * 60 * 1000;

export async function POST() {
  try {
    const user = await requireUser();

    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    const now = Date.now();
    const nextClaimMs = user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0;

    if (nextClaimMs > now) {
      return NextResponse.json(
        {
          ok: false,
          error: "Claim cooldown active",
          data: { nextClaimAt: user.nextClaimAt }
        },
        { status: 429 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const claimedAt = new Date();
    const nextClaimAt = new Date(claimedAt.getTime() + CLAIM_COOLDOWN_MS);
    const balanceAfter = user.coinBalance + CLAIM_AMOUNT;

    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({
        coin_balance: balanceAfter,
        last_claim_at: claimedAt.toISOString(),
        next_claim_at: nextClaimAt.toISOString(),
        updated_at: claimedAt.toISOString()
      })
      .eq("id", user.id)
      .select("id, coin_balance, lifetime_profit, last_claim_at, next_claim_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message || "Failed to update claim");
    }

    const { data: ledger, error: ledgerError } = await supabase
      .from("coin_ledger")
      .insert({
        user_id: user.id,
        type: "claim",
        amount: CLAIM_AMOUNT,
        balance_after: balanceAfter,
        ref_type: "claim",
        detail: "Hourly reward"
      })
      .select("id, type, amount, balance_after, detail, created_at")
      .single();

    if (ledgerError) {
      throw new Error(ledgerError.message || "Failed to write ledger");
    }

    return NextResponse.json({
      ok: true,
      data: {
        amount: CLAIM_AMOUNT,
        user: {
          coinBalance: updatedUser.coin_balance,
          lifetimeProfit: updatedUser.lifetime_profit,
          lastClaimAt: updatedUser.last_claim_at,
          nextClaimAt: updatedUser.next_claim_at
        },
        ledger
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
