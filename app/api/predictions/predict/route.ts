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
  lifetime_profit: number;
  profit_score: number;
};

function getInsuranceCost(betAmount: number): number {
  return Math.floor(betAmount * 0.20);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    const body = (await request.json()) as PredictRequestBody;
    const amount = Number(body.amount || 0);
    const insurance = Boolean(body.insurance);

    if (!body.predictionId || !body.optionId) {
      return NextResponse.json({ ok: false, error: "Prediction and option are required" }, { status: 400 });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be greater than zero" }, { status: 400 });
    }

    const insuranceCost = insurance ? getInsuranceCost(amount) : 0;

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

    const { data: existingEntry } = await supabase
      .from("prediction_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("prediction_id", prediction.id)
      .eq("status", "running")
      .maybeSingle();

    if (existingEntry) {
      return NextResponse.json({ ok: false, error: "You have already predicted this question" }, { status: 400 });
    }

    const { data: balanceRow, error: balanceError } = await supabase
      .from("users")
      .select("coin_balance, lifetime_profit, profit_score")
      .eq("id", user.id)
      .single<UserBalanceRow>();

    if (balanceError || !balanceRow) {
      throw new Error(balanceError?.message || "Failed to load balance");
    }

    if (balanceRow.coin_balance < amount) {
      return NextResponse.json({ ok: false, error: "Not enough coins" }, { status: 400 });
    }

    if (insurance && (balanceRow.profit_score || 0) < insuranceCost) {
      return NextResponse.json({ ok: false, error: `Not enough green ammo. Need ${insuranceCost} more.` }, { status: 400 });
    }

    const balanceAfter = balanceRow.coin_balance - amount;
    const profitScoreAfter = insurance ? (balanceRow.profit_score || 0) - insuranceCost : (balanceRow.profit_score || 0);
    const createdAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("users")
      .update({
        coin_balance: balanceAfter,
        profit_score: profitScoreAfter,
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
        estimated_return_percent: 0,
        status: "running",
        insurance
      })
      .select("id, prediction_id, option_id, amount, estimated_return_percent, status, created_at, insurance")
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

    if (insurance && insuranceCost > 0) {
      const insuranceDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Insurance Cost: ${insuranceCost} green ammo`;
      const { error: insuranceLedgerError } = await supabase
        .from("coin_ledger")
        .insert({
          user_id: user.id,
          type: "insurance",
          amount: -insuranceCost,
          balance_after: profitScoreAfter,
          ref_type: "prediction_entry",
          ref_id: entry.id,
          detail: insuranceDetail
        });
      if (insuranceLedgerError) {
        throw new Error(insuranceLedgerError.message || "Failed to write insurance ledger");
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          coinBalance: balanceAfter,
          profitScore: profitScoreAfter,
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
          insurance: entry.insurance,
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
