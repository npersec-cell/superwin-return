import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const SPECIAL_CLAIM_COOLDOWN_MS = 10 * 60 * 1000; // 10 นาที

/** Special claim: same weighted random as regular claim */
function randomClaimAmount(): number {
  const r = Math.random();
  if (r < 0.50) return Math.floor(Math.random() * 21) + 10;
  if (r < 0.80) return Math.floor(Math.random() * 30) + 31;
  if (r < 0.95) return Math.floor(Math.random() * 30) + 61;
  return Math.floor(Math.random() * 10) + 91;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.CLAIM, user.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    const now = Date.now();
    const nextSpecialClaimMs = user.nextSpecialClaimAt ? new Date(user.nextSpecialClaimAt).getTime() : 0;

    if (nextSpecialClaimMs > now) {
      return NextResponse.json(
        { ok: false, error: "Special claim cooldown active", data: { nextSpecialClaimAt: user.nextSpecialClaimAt } },
        { status: 429 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const claimedAt = new Date();
    const nextSpecialClaimAt = new Date(claimedAt.getTime() + SPECIAL_CLAIM_COOLDOWN_MS);
    const claimAmount = randomClaimAmount();
    const balanceAfter = user.coinBalance + claimAmount;
    const nowISO = new Date(now).toISOString();

    // Atomic update with optimistic locking
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({
        coin_balance: balanceAfter,
        next_special_claim_at: nextSpecialClaimAt.toISOString(),
        updated_at: claimedAt.toISOString()
      })
      .eq("id", user.id)
      .or(`next_special_claim_at.is.null,next_special_claim_at.lte.${nowISO}`)
      .select("id, coin_balance, lifetime_profit, next_special_claim_at");

    if (updateError) {
      throw new Error(updateError.message || "Failed to update special claim");
    }

    if (!updated || updated.length === 0) {
      const { data: freshUser } = await supabase
        .from("users")
        .select("next_special_claim_at")
        .eq("id", user.id)
        .single();
      return NextResponse.json(
        { ok: false, error: "Special claim cooldown active", data: { nextSpecialClaimAt: freshUser?.next_special_claim_at } },
        { status: 429 }
      );
    }

    const updatedUser = updated[0];

    // Write to ledger
    await supabase.from("coin_ledger").insert({
      user_id: user.id,
      type: "claim",
      amount: claimAmount,
      balance_after: balanceAfter,
      ref_type: "special_claim",
      detail: "กระสุนส้มพิเศษ 10 นาที"
    });

    return NextResponse.json({
      ok: true,
      data: {
        amount: claimAmount,
        user: {
          coinBalance: updatedUser.coin_balance,
          lifetimeProfit: updatedUser.lifetime_profit,
          nextSpecialClaimAt: updatedUser.next_special_claim_at
        }
      }
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
