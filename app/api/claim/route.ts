import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const CLAIM_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Weighted random: 10-100 coins, 100 is rarest
 * Probability: 10-30 (~50%), 31-60 (~30%), 61-90 (~15%), 91-100 (~5%)
 */
function randomClaimAmount(): number {
  const r = Math.random(); // 0-1
  if (r < 0.50) {
    // 10-30 (common)
    return Math.floor(Math.random() * 21) + 10;
  }
  if (r < 0.80) {
    // 31-60 (uncommon)
    return Math.floor(Math.random() * 30) + 31;
  }
  if (r < 0.95) {
    // 61-90 (rare)
    return Math.floor(Math.random() * 30) + 61;
  }
  // 91-100 (very rare)
  return Math.floor(Math.random() * 10) + 91;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    // Rate limiting: max 5 claims per hour per user (prevent bot abuse)
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.CLAIM, user.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    const now = Date.now();
    const nextClaimMs = user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0;

    // Cheap first check (good UX for 99% of cases)
    if (nextClaimMs > now) {
      return NextResponse.json(
        { ok: false, error: "Claim cooldown active", data: { nextClaimAt: user.nextClaimAt } },
        { status: 429 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const claimedAt = new Date();
    const nextClaimAt = new Date(claimedAt.getTime() + CLAIM_COOLDOWN_MS);
    const claimAmount = randomClaimAmount();
    const balanceAfter = user.coinBalance + claimAmount;
    const nowISO = new Date(now).toISOString();

    // Get current claim_count
    const { data: currentUserData, error: fetchUserError } = await supabase
      .from("users")
      .select("claim_count")
      .eq("id", user.id)
      .single();
    
    if (fetchUserError || !currentUserData) {
      throw new Error("Failed to fetch user data");
    }
    
    const newClaimCount = (currentUserData.claim_count || 0) + 1;
    
    // Atomic update: only succeeds if (next_claim_at IS NULL) OR (next_claim_at <= now)
    // Correct .or() syntax: comma = OR, pipe = AND
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({
        coin_balance: balanceAfter,
        last_claim_at: claimedAt.toISOString(),
        next_claim_at: nextClaimAt.toISOString(),
        claim_count: newClaimCount,
        updated_at: claimedAt.toISOString()
      })
      .eq("id", user.id)
      .or(`next_claim_at.is.null,next_claim_at.lte.${nowISO}`)
      .select("id, coin_balance, lifetime_profit, last_claim_at, next_claim_at");

    if (updateError) {
      throw new Error(updateError.message || "Failed to update claim");
    }

    // If 0 rows updated → cooldown still active (atomic check failed)
    if (!updated || updated.length === 0) {
      const { data: freshUser } = await supabase
        .from("users")
        .select("next_claim_at")
        .eq("id", user.id)
        .single();
      return NextResponse.json(
        { ok: false, error: "Claim cooldown active", data: { nextClaimAt: freshUser?.next_claim_at } },
        { status: 429 }
      );
    }

    const updatedUser = updated[0];

    const { data: ledger, error: ledgerError } = await supabase
      .from("coin_ledger")
      .insert({
        user_id: user.id,
        type: "claim",
        amount: claimAmount,
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
        amount: claimAmount,
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
    return createSafeErrorResponse(error);
  }
}
