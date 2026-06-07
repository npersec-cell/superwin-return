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

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
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

    const supabase = createSupabaseAdminClient();

    // Call atomic database function (prevents Race Condition)
    // All validation, balance check, and deduction happen in a single transaction with row locking
    const { data, error: rpcError } = await supabase.rpc("place_prediction_atomic", {
      p_user_id: user.id,
      p_prediction_id: body.predictionId,
      p_option_id: body.optionId,
      p_amount: amount,
      p_insurance: insurance,
    });

    if (rpcError) {
      // Try to parse error message from DB function
      const errorMessage = rpcError.message || "Prediction failed";
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
    }

    // Parse result from function
    const result = data as any;
    if (!result?.ok) {
      const errorMsg = result?.error || "Prediction failed";
      return NextResponse.json({ ok: false, error: errorMsg }, { status: 400 });
    }

    const resultData = result.data;

    // Fetch option label for response
    const { data: option } = await supabase
      .from("prediction_options")
      .select("label")
      .eq("id", body.optionId)
      .single<{ label: string }>();

    const prediction = await supabase
      .from("predictions")
      .select("tournament_name, question")
      .eq("id", body.predictionId)
      .single<{ tournament_name: string; question: string }>();

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          coinBalance: resultData.coinBalanceAfter,
          profitScore: resultData.profitScoreAfter,
          lifetimeProfit: resultData.lifetimeProfitAfter,
        },
        entry: {
          id: resultData.entryId,
          predictionId: body.predictionId,
          optionId: body.optionId,
          amount: resultData.amount,
          insurance: resultData.insurance,
          question: prediction.data?.question || "",
          tournamentName: prediction.data?.tournament_name || "",
          optionLabel: option?.label || "",
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
