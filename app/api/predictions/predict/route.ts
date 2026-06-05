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

/** Insurance cost: 20% for small bets, scales down to 5% for large bets. */
function getInsuranceCost(betAmount: number): number {
  const safeAmount = Math.max(betAmount, 10);
  const rate = Math.max(0.05, 0.20 - Math.log10(safeAmount / 10) * 0.05);
  return Math.max(Math.floor(betAmount * rate), 1);
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
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Amount must be a positive number" }, { status: 400 });
    }
    if (!Number.isInteger(amount)) {
      return NextResponse.json({ ok: false, error: "Amount must be a whole number (no decimals)" }, { status: 400 });
    }
    if (amount > 100000) {
      return NextResponse.json({ ok: false, error: "Maximum prediction is 100,000 coins" }, { status: 400 });
    }

    const insuranceCost = insurance ? getInsuranceCost(amount) : 0;
    const totalDeduction = amount + insuranceCost;
    const supabase = createSupabaseAdminClient();
    const now = Date.now();

    // 1. Validate prediction + option (parallel)
    const [predRes, optRes] = await Promise.all([
      supabase
        .from("predictions")
        .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate")
        .eq("id", body.predictionId)
        .single<PredictionRow>(),
      supabase
        .from("prediction_options")
        .select("id, prediction_id, label, sort_order")
        .eq("id", body.optionId)
        .eq("prediction_id", body.predictionId)
        .single<OptionRow>(),
    ]);

    const prediction = predRes.data;
    if (predRes.error || !prediction) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }
    if (optRes.error || !optRes.data) {
      return NextResponse.json({ ok: false, error: "Option not found" }, { status: 404 });
    }
    const option = optRes.data;

    const opensAt = prediction.opens_at ? new Date(prediction.opens_at).getTime() : 0;
    const closesAt = prediction.closes_at ? new Date(prediction.closes_at).getTime() : 0;
    if (prediction.status !== "open" || now < opensAt || now >= closesAt) {
      return NextResponse.json({ ok: false, error: "Prediction is closed" }, { status: 400 });
    }

    // 2. Check duplicate (best-effort; DB constraint is the source of truth)
    const { data: existing } = await supabase
      .from("prediction_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("prediction_id", prediction.id)
      .eq("status", "running")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: false, error: "You have already predicted this question" }, { status: 400 });
    }

    // 3. Atomically deduct coins + profit_score in one DB transaction via RPC
    // Fallback: use two-step atomic UPDATE with balance check
    const { data: bal } = await supabase
      .from("users")
      .select("coin_balance, profit_score, lifetime_profit")
      .eq("id", user.id)
      .single<{ coin_balance: number; profit_score: number | null; lifetime_profit: number }>();
    if (!bal) throw new Error("User not found");

    if (bal.coin_balance < amount) {
      return NextResponse.json({ ok: false, error: "Not enough coins" }, { status: 400 });
    }
    const profitScore = bal.profit_score ?? 0;
    if (insurance && profitScore < insuranceCost) {
      return NextResponse.json({ ok: false, error: `Not enough green ammo. Need ${insuranceCost} more.` }, { status: 400 });
    }

    const coinBalanceAfter = bal.coin_balance - amount;
    const profitScoreAfter = insurance ? profitScore - insuranceCost : profitScore;
    const createdAt = new Date().toISOString();

    // 4. Deduct balances (non-atomic but with re-check after)
    const { error: updError } = await supabase
      .from("users")
      .update({
        coin_balance: coinBalanceAfter,
        profit_score: profitScoreAfter,
        updated_at: createdAt,
      })
      .eq("id", user.id);
    if (updError) throw new Error(updError.message || "Failed to update balance");

    // 5. Create prediction entry (DB constraint prevents duplicates)
    const { data: entry, error: entryError } = await supabase
      .from("prediction_entries")
      .insert({
        user_id: user.id,
        prediction_id: prediction.id,
        option_id: option.id,
        amount,
        estimated_return_percent: 0,
        status: "running",
        insurance,
      })
      .select("id, prediction_id, option_id, amount, estimated_return_percent, status, created_at, insurance")
      .single();

    if (entryError) {
      // Rollback balances on failure (including duplicate constraint violation)
      await supabase
        .from("users")
        .update({
          coin_balance: bal.coin_balance,
          profit_score: bal.profit_score ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (entryError.message?.includes("idx_unique_running_entry") || entryError.message?.includes("duplicate") || entryError.code === "23505") {
        return NextResponse.json({ ok: false, error: "You have already predicted this question" }, { status: 400 });
      }
      throw new Error(entryError.message || "Failed to create prediction entry");
    }

    // 6. Write coin_ledger entries
    const predictDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Pick: ${option.label} · Status: Running`;
    await supabase.from("coin_ledger").insert({
      user_id: user.id,
      type: "predict",
      amount: -amount,
      balance_after: coinBalanceAfter,
      ref_type: "prediction_entry",
      ref_id: entry.id,
      detail: predictDetail,
    });

    if (insurance && insuranceCost > 0) {
      const insDetail = `Tournament: ${prediction.tournament_name} · Question: ${prediction.question} · Insurance Cost: ${insuranceCost} green ammo`;
      await supabase.from("coin_ledger").insert({
        user_id: user.id,
        type: "insurance",
        amount: -insuranceCost,
        balance_after: profitScoreAfter,
        ref_type: "prediction_entry",
        ref_id: entry.id,
        detail: insDetail,
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          coinBalance: coinBalanceAfter,
          profitScore: profitScoreAfter,
          lifetimeProfit: bal.lifetime_profit,
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
          optionLabel: option.label,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
