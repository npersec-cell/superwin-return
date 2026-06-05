import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

type ResolveBody = {
  winningOptionId?: string;
};

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
  fee_rate: number;
};

type OptionRow = {
  id: string;
  label: string;
  prediction_id: string;
};

type EntryRow = {
  id: string;
  user_id: string;
  option_id: string;
  amount: number;
  insurance: boolean;
};

type UserRow = {
  id: string;
  coin_balance: number;
  lifetime_profit: number;
  profit_score: number | null;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Resolve failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    await requireAdmin();
    const { id } = await Promise.resolve(context.params);
    const body = (await request.json()) as ResolveBody;

    if (!body.winningOptionId) {
      return NextResponse.json({ ok: false, error: "Winning option is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const resolvedAt = new Date().toISOString();

    // 1. Lock prediction by updating status to "resolving" atomically
    const { data: locked, error: lockError } = await supabase
      .from("predictions")
      .update({ status: "resolving", updated_at: resolvedAt })
      .eq("id", id)
      .in("status", ["open", "closed"])
      .select("id, tournament_name, question, status, fee_rate")
      .single<PredictionRow>();

    if (lockError || !locked) {
      return NextResponse.json({ ok: false, error: "Prediction not found or already resolved" }, { status: 400 });
    }

    const prediction = locked;

    const { data: winningOption, error: optionError } = await supabase
      .from("prediction_options")
      .select("id, label, prediction_id")
      .eq("id", body.winningOptionId)
      .eq("prediction_id", id)
      .single<OptionRow>();

    if (optionError || !winningOption) {
      // Rollback status
      await supabase.from("predictions").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: false, error: "Winning option not found" }, { status: 404 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("id, user_id, option_id, amount, insurance")
      .eq("prediction_id", id)
      .eq("status", "running")
      .returns<EntryRow[]>();

    if (entriesError) throw new Error(entriesError.message);

    const runningEntries = entries || [];
    const totalPool = runningEntries.reduce((s, e) => s + e.amount, 0);
    const winningPool = runningEntries
      .filter((e) => e.option_id === winningOption.id)
      .reduce((s, e) => s + e.amount, 0);
    const distributable = Math.floor(totalPool * (1 - Number(prediction.fee_rate || 0)));

    let winners = 0;
    let losers = 0;
    let totalPaid = 0;

    for (const entry of runningEntries) {
      const isWinner = entry.option_id === winningOption.id;
      const payout = isWinner && winningPool > 0 ? Math.floor((entry.amount / winningPool) * distributable) : 0;
      const profitDelta = payout - entry.amount;

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, coin_balance, lifetime_profit, profit_score")
        .eq("id", entry.user_id)
        .single<UserRow>();

      if (userError || !user) {
        console.error(`Resolve: user ${entry.user_id} not found, skipping`);
        continue;
      }

      // Calculate step by step for correct ledger balance_after
      const balanceAfterPayout = user.coin_balance + payout;
      const profitScoreDelta = isWinner ? Math.max(0, profitDelta) : 0;

      let insuranceRefund = 0;
      if (!isWinner && entry.insurance) {
        insuranceRefund = Math.floor(entry.amount * 0.5);
      }
      const balanceAfterRefund = balanceAfterPayout + insuranceRefund;
      const newProfitScore = (user.profit_score ?? 0) + profitScoreDelta;

      // Update user balances
      const { error: userUpdateError } = await supabase
        .from("users")
        .update({
          coin_balance: balanceAfterRefund,
          lifetime_profit: user.lifetime_profit + profitDelta,
          profit_score: newProfitScore,
          updated_at: resolvedAt,
        })
        .eq("id", entry.user_id);

      if (userUpdateError) throw new Error(userUpdateError.message);

      // Update entry status
      const { error: entryUpdateError } = await supabase
        .from("prediction_entries")
        .update({ status: isWinner ? "won" : "lost", payout_amount: payout, resolved_at: resolvedAt })
        .eq("id", entry.id);

      if (entryUpdateError) throw new Error(entryUpdateError.message);

      // Write PAYOUT ledger (balance_after = after payout, before refund)
      const returnMultiplier = isWinner && entry.amount > 0 ? (Math.round((payout / entry.amount) * 100) / 100).toFixed(2) : null;
      const detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Winning: ${winningOption.label} · Result: ${isWinner ? "Won" : "Lost"}${isWinner && returnMultiplier ? ` · Return: ${returnMultiplier}x` : ""} · Payout: ${payout} · Profit: ${profitDelta}`;

      await supabase.from("coin_ledger").insert({
        user_id: entry.user_id,
        type: "payout",
        amount: payout,
        balance_after: balanceAfterPayout,
        ref_type: "prediction_entry",
        ref_id: entry.id,
        detail,
      });

      // Write INSURANCE REFUND ledger (balance_after = after refund)
      if (insuranceRefund > 0) {
        const refundDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Insurance Refund: 50% of ${entry.amount} = ${insuranceRefund}`;
        await supabase.from("coin_ledger").insert({
          user_id: entry.user_id,
          type: "insurance_refund",
          amount: insuranceRefund,
          balance_after: balanceAfterRefund,
          ref_type: "prediction_entry",
          ref_id: entry.id,
          detail: refundDetail,
        });
      }

      if (isWinner) winners += 1;
      else losers += 1;
      totalPaid += payout;
    }

    // Finalize prediction status
    const { error: finalizeError } = await supabase
      .from("predictions")
      .update({
        status: "resolved",
        winning_option_id: winningOption.id,
        resolved_at: resolvedAt,
        updated_at: resolvedAt,
      })
      .eq("id", id);

    if (finalizeError) throw new Error(finalizeError.message);

    return NextResponse.json({
      ok: true,
      data: {
        predictionId: id,
        winningOptionId: winningOption.id,
        winners,
        losers,
        totalPool,
        winningPool,
        distributable,
        totalPaid,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
