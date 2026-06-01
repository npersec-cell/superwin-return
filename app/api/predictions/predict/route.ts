import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import type { PredictRequestBody } from "@/lib/types";

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  fee_rate: number;
};

type OptionRow = {
  id: string;
  prediction_id: string;
  label: string;
  sort_order: number;
};

type UserBalanceRow = {
  coin_balance: number;
  monthly_profit: number;
  lifetime_profit: number;
};

function estimateReturn(sortOrder: number) {
  const estimates = [185, 230, 310, 420, 560, 690, 760, 840, 920, 980];
  return estimates[sortOrder] || Math.min(1200, 200 + sortOrder * 90);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    const body = (await request.json()) as PredictRequestBody;
    const amount = Number(body.amount || 0);

    if (!body.predictionId || !body.optionId) {
      return NextResponse.json({ ok: false, error: "Prediction and option are required" }, { status: 400 });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than zero" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate")
      .eq("id", body.predictionId)
      .single<PredictionRow>();

    if (predictionError || !prediction) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    const now = Date.now();
    const opensAt = prediction.opens_at ? new Date(prediction.opens_at).getTime() : 0;
    const closesAt = prediction.closes_at ? new Date(prediction.closes_at).getTime() : 0;

    if (prediction.status !== "open" || now < opensAt || now >= closesAt) {
      return NextResponse.json({ ok: false, error: "Prediction is closed" }, { status: 400 });
    }

    const { data: option, error: optionError } = await supabase
      .from("prediction_options")
      .select("id, prediction_id, label, sort_order")
      .eq("id", body.optionId)
      .eq("prediction_id", body.predictionId)
      .single<OptionRow>();

    if (optionError || !option) {
      return NextResponse.json({ ok: false, error: "Option not found" }, { status: 404 });
    }

    const { data: balanceRow, error: balanceError } = await supabase
      .from("users")
      .select("coin_balance, monthly_profit, lifetime_profit")
      .eq("id", user.id)
      .single<UserBalanceRow>();

    if (balanceError || !balanceRow) {
      throw new Error(balanceError?.message || "Failed to load balance");
    }

    if (balanceRow.coin_balance < amount) {
      return NextResponse.json({ ok: false, error: "Not enough coins" }, { status: 400 });
    }

    const balanceAfter = balanceRow.coin_balance - amount;
    const estimatedReturnPercent = estimateReturn(option.sort_order);
    const createdAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("users")
      .update({
        coin_balance: balanceAfter,
        updated_at: createdAt
      })
      .eq("id", user.id);

    if (updateError) {
      throw new Error(updateError.message || "Failed to update balance");
    }

    const { data: entry, error: entryError } = await supabase
      .from("prediction_entries")
      .insert({
        user_id: user.id,
        prediction_id: prediction.id,
        option_id: option.id,
        amount,
        estimated_return_percent: estimatedReturnPercent,
        status: "running"
      })
      .select("id, prediction_id, option_id, amount, estimated_return_percent, status, created_at")
      .single();

    if (entryError) {
      throw new Error(entryError.message || "Failed to create prediction entry");
    }

    const detail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Pick: ${option.label} · Status: Running`;

    const { error: ledgerError } = await supabase
      .from("coin_ledger")
      .insert({
        user_id: user.id,
        type: "predict",
        amount: -amount,
        balance_after: balanceAfter,
        ref_type: "prediction_entry",
        ref_id: entry.id,
        detail
      });

    if (ledgerError) {
      throw new Error(ledgerError.message || "Failed to write ledger");
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          coinBalance: balanceAfter,
          monthlyProfit: balanceRow.monthly_profit,
          lifetimeProfit: balanceRow.lifetime_profit
        },
        entry: {
          id: entry.id,
          predictionId: entry.prediction_id,
          optionId: entry.option_id,
          amount: entry.amount,
          estimatedReturnPercent: entry.estimated_return_percent,
          status: entry.status,
          createdAt: entry.created_at,
          question: prediction.question,
          tournamentName: prediction.tournament_name,
          optionLabel: option.label
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
