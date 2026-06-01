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
};

type UserRow = {
  id: string;
  coin_balance: number;
  monthly_profit: number;
  lifetime_profit: number;
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

    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status, fee_rate")
      .eq("id", id)
      .single<PredictionRow>();

    if (predictionError || !prediction) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    if (!["open", "closed"].includes(prediction.status)) {
      return NextResponse.json({ ok: false, error: "Prediction cannot be resolved" }, { status: 400 });
    }

    const { data: winningOption, error: optionError } = await supabase
      .from("prediction_options")
      .select("id, label, prediction_id")
      .eq("id", body.winningOptionId)
      .eq("prediction_id", id)
      .single<OptionRow>();

    if (optionError || !winningOption) {
      return NextResponse.json({ ok: false, error: "Winning option not found" }, { status: 404 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("id, user_id, option_id, amount")
      .eq("prediction_id", id)
      .eq("status", "running")
      .returns<EntryRow[]>();

    if (entriesError) throw new Error(entriesError.message);

    const runningEntries = entries || [];
    const totalPool = runningEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const winningPool = runningEntries
      .filter((entry) => entry.option_id === winningOption.id)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const distributable = Math.floor(totalPool * (1 - Number(prediction.fee_rate || 0)));

    let winners = 0;
    let losers = 0;
    let totalPaid = 0;

    for (const entry of runningEntries) {
      const isWinner = entry.option_id === winningOption.id;
      const payout = isWinner && winningPool > 0 ? Math.floor((entry.amount / winningPool) * distributable) : 0;
      const status = isWinner ? "won" : "lost";
      const profitDelta = payout - entry.amount;

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id, coin_balance, monthly_profit, lifetime_profit")
        .eq("id", entry.user_id)
        .single<UserRow>();

      if (userError || !user) throw new Error(userError?.message || "User not found");

      const balanceAfter = user.coin_balance + payout;

      const { error: userUpdateError } = await supabase
        .from("users")
        .update({
          coin_balance: balanceAfter,
          monthly_profit: user.monthly_profit + profitDelta,
          lifetime_profit: user.lifetime_profit + profitDelta,
          updated_at: resolvedAt
        })
        .eq("id", entry.user_id);

      if (userUpdateError) throw new Error(userUpdateError.message);

      const { error: entryUpdateError } = await supabase
        .from("prediction_entries")
        .update({ status, payout_amount: payout, resolved_at: resolvedAt })
        .eq("id", entry.id);

      if (entryUpdateError) throw new Error(entryUpdateError.message);

      const returnMultiplier = isWinner && entry.amount > 0 ? (Math.round((payout / entry.amount) * 100) / 100).toFixed(2) : null;
      const detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Winning: ${winningOption.label} · Result: ${isWinner ? "Won" : "Lost"}${isWinner && returnMultiplier ? ` · Return: ${returnMultiplier}x` : ""} · Payout: ${payout} · Profit: ${profitDelta}`;

      const { error: ledgerError } = await supabase
        .from("coin_ledger")
        .insert({
          user_id: entry.user_id,
          type: "payout",
          amount: payout,
          balance_after: balanceAfter,
          ref_type: "prediction_entry",
          ref_id: entry.id,
          detail
        });

      if (ledgerError) throw new Error(ledgerError.message);

      if (isWinner) winners += 1;
      else losers += 1;
      totalPaid += payout;
    }

    const { error: predictionUpdateError } = await supabase
      .from("predictions")
      .update({
        status: "resolved",
        winning_option_id: winningOption.id,
        resolved_at: resolvedAt,
        updated_at: resolvedAt
      })
      .eq("id", id);

    if (predictionUpdateError) throw new Error(predictionUpdateError.message);

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
        totalPaid
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
