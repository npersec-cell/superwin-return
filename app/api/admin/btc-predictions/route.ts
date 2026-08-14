import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // Get all BTC quick predictions ordered by created_at DESC
    const { data: entries, error: entriesError } = await supabase
      .from("btc_quick_predictions")
      .select("id, user_id, direction, duration_seconds, stake_amount, multiplier, entry_price, exit_price, potential_payout, payout_amount, status, created_at, resolved_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (entriesError) {
      return NextResponse.json({ ok: false, error: entriesError.message }, { status: 500 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    // Get user info
    const userIds = [...new Set(entries.map((e) => e.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, email, coin_balance")
      .in("id", userIds);

    const userMap = new Map(users?.map((u) => [u.id, u]) as [string, any][]);

    // Get coin_ledger entries for these predictions to find balance_before / balance_after
    const entryIds = entries.map((e) => e.id);
    const { data: ledgers } = await supabase
      .from("coin_ledger")
      .select("ref_id, type, amount, balance_after, created_at")
      .in("ref_id", entryIds)
      .in("type", ["quick_predict", "quick_payout", "quick_refund", "fee"])
      .order("created_at", { ascending: true });

    // Build ledger map: ref_id -> { predict: ..., payout?: ..., refund?: ..., fee?: ... }
    const ledgerMap = new Map<string, any[]>();
    for (const ledger of (ledgers || [])) {
      const existing = ledgerMap.get(ledger.ref_id) || [];
      existing.push(ledger);
      ledgerMap.set(ledger.ref_id, existing);
    }

    // Format data
    const stats = entries.map((entry) => {
      const user = userMap.get(entry.user_id);
      const won = entry.status === "won";
      const lost = entry.status === "lost";
      const refunded = entry.status === "refunded";
      
      // Calculate profit/loss
      let profit = 0;
      if (won) {
        profit = entry.payout_amount - entry.stake_amount;
      } else if (refunded) {
        profit = 0; // Got stake back
      } else {
        profit = -entry.stake_amount;
      }

      // Find ledger entries for this prediction
      const entryLedgers = ledgerMap.get(entry.id) || [];
      const predictLedger = entryLedgers.find((l) => l.type === "quick_predict");
      const payoutLedger = entryLedgers.find((l) => l.type === "quick_payout");
      const refundLedger = entryLedgers.find((l) => l.type === "quick_refund");
      const feeLedger = entryLedgers.find((l) => l.type === "fee");

      // Balance before = balance_after + stake (since amount is negative)
      const balanceBefore = predictLedger 
        ? predictLedger.balance_after + Math.abs(predictLedger.amount)
        : null;
      const balanceAfterPredict = predictLedger ? predictLedger.balance_after : null;
      
      // Final balance after resolution (if resolved)
      let finalBalanceAfter = balanceAfterPredict;
      if (payoutLedger) {
        finalBalanceAfter = payoutLedger.balance_after;
      } else if (refundLedger) {
        finalBalanceAfter = refundLedger.balance_after;
      } else if (feeLedger) {
        finalBalanceAfter = feeLedger.balance_after;
      }

      // Duration label
      const durationLabel = entry.duration_seconds === 60 ? "1m" 
        : entry.duration_seconds === 300 ? "5m" 
        : "15m";

      return {
        id: entry.id,
        userId: entry.user_id,
        displayName: user?.display_name ?? user?.email?.split("@")[0] ?? "Anonymous",
        email: user?.email ?? "",
        currentBalance: user?.coin_balance ?? 0,
        direction: entry.direction,
        duration: durationLabel,
        stakeAmount: entry.stake_amount,
        multiplier: entry.multiplier,
        entryPrice: entry.entry_price,
        exitPrice: entry.exit_price,
        potentialPayout: entry.potential_payout,
        payoutAmount: entry.payout_amount,
        status: entry.status,
        profit,
        createdAt: entry.created_at,
        resolvedAt: entry.resolved_at,
        expiresAt: entry.expires_at,
        balanceBefore: balanceBefore,
        balanceAfterPredict: balanceAfterPredict,
        finalBalanceAfter: finalBalanceAfter,
      };
    });

    return NextResponse.json({ ok: true, data: stats });
  } catch (error) {
    console.error("Failed to fetch BTC predictions for admin:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
