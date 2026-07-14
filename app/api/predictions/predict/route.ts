import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest, predictBodySchema } from "@/lib/validation";
import { checkRateLimit, applyRateLimitHeaders, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

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

    // Rate Limiting Check
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.PREDICT, user.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Validate request body with Zod
    const validation = await validateRequest(request, predictBodySchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const supabase = createSupabaseAdminClient();

    // Call atomic database function (prevents Race Condition)
    // All validation, balance check, and deduction happen in a single transaction with row locking
    const { data, error: rpcError } = await supabase.rpc("place_prediction_atomic", {
      p_user_id: user.id,
      p_prediction_id: body.predictionId,
      p_option_id: body.optionId,
      p_amount: body.amount,
      p_insurance: false, // Insurance feature removed
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

    let response = NextResponse.json({
      ok: true,
      data: {
        user: {
          coinBalance: resultData.coinBalanceAfter,
          lifetimeProfit: resultData.lifetimeProfitAfter,
        },
        entry: {
          id: resultData.entryId,
          predictionId: body.predictionId,
          optionId: body.optionId,
          amount: resultData.amount,
          question: prediction.data?.question || "",
          tournamentName: prediction.data?.tournament_name || "",
          optionLabel: option?.label || "",
        },
      },
    });

    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
