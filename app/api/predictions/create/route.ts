import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest, createUserPredictionBodySchema } from "@/lib/validation";
import { getRankFromPosition } from "@/lib/utils";
import { checkRateLimit, applyRateLimitHeaders, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-log";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

function parseBkkDateTime(localStr: string) {
  if (!localStr) return null;
  if (localStr.includes("Z") || localStr.includes("+")) {
    return new Date(localStr).toISOString();
  }
  return new Date(localStr + "+07:00").toISOString();
}

/**
 * POST /api/predictions/create
 * Allows authenticated users (Diamond+ rank) to create predictions.
 * 
 * Rules:
 * - User must have Diamond rank or higher
 * - Max 2 open questions per user at any time
 * - fee_rate is fixed at 0.05 (5%)
 * - sponsor_pool is NOT set by users (only admins get auto 500)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    // ── Rate Limiting ──
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.CREATE_PREDICTION, user.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // ── Validate request body ──
    const validation = await validateRequest(request, createUserPredictionBodySchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const supabase = createSupabaseAdminClient();

    // ── Check user's rank (must be Diamond or higher) ──
    // Get total user count for rank calculation
    const { count: totalUsers, error: countError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (countError) throw new Error(countError.message);

    // Get user's overall rank from leaderboard
    const { data: userStats, error: statsError } = await supabase
      .from("user_stats")
      .select("overall_rank")
      .eq("user_id", user.id)
      .maybeSingle();

    let userRank = 0;
    if (!statsError && userStats?.overall_rank) {
      userRank = userStats.overall_rank;
    } else {
      // Fallback: calculate from profit_score
      const { data: userData } = await supabase
        .from("users")
        .select("profit_score")
        .eq("id", user.id)
        .single();

      if (userData) {
        const { count: higherCount } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .gt("profit_score", userData.profit_score)
          .eq("status", "active");

        userRank = (higherCount || 0) + 1;
      }
    }

    const rankInfo = getRankFromPosition(userRank, totalUsers || 1);
    const diamondRanks = ["Diamond", "Ace", "Conqueror", "Crown"];
    if (!diamondRanks.includes(rankInfo.name)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Diamond rank or higher required. Your current rank: ${rankInfo.name}`,
          userRank: rankInfo.name,
          requiresRank: "Diamond",
        },
        { status: 403 }
      );
    }

    // ── Check max 2 open questions per user ──
    const now = new Date().toISOString();
    const { data: existingOpen, error: existingError } = await supabase
      .from("predictions")
      .select("id, closes_at, status")
      .eq("created_by_user_id", user.id)
      .in("status", ["open", "closed"])
      .or(`closes_at.gt.${now},closes_at.is.null`);

    if (existingError) throw new Error(existingError.message);

    // Filter to only count questions that are still open (not yet closed by time)
    const stillOpen = (existingOpen || []).filter((p) => {
      if (p.status === "closed") return false;
      if (!p.closes_at) return true;
      return new Date(p.closes_at) > new Date();
    });

    if (stillOpen.length >= 2) {
      const remainingMs = stillOpen
        .map((p) => new Date(p.closes_at!).getTime() - Date.now())
        .filter((ms) => ms > 0)
        .sort((a, b) => a - b)[0];

      let waitMessage = "You already have 2 open questions.";
      if (remainingMs && remainingMs > 0) {
        const hours = Math.ceil(remainingMs / (1000 * 60 * 60));
        waitMessage += ` Wait approximately ${hours} hour(s) for one to close.`;
      }

      return NextResponse.json(
        {
          ok: false,
          error: waitMessage,
          openQuestions: stillOpen.length,
          maxAllowed: 2,
        },
        { status: 429 }
      );
    }

    // ── Create prediction ──
    const opensAt = body.opensAt ? (parseBkkDateTime(body.opensAt) || now) : now;
    const closesAt = parseBkkDateTime(body.closesAt) || now;

    if (Number.isNaN(new Date(closesAt).getTime()) || new Date(closesAt).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Close time must be in the future" }, { status: 400 });
    }

    // Include round in question text since we don't have a separate round column
    const fullQuestion = `[${body.round}] ${body.question}`;

    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .insert({
        tournament_name: body.tournamentName,
        question: fullQuestion,
        status: "open",
        opens_at: opensAt,
        closes_at: closesAt,
        fee_rate: 0.05, // Fixed 5% for user-created questions
        created_by_user_id: user.id,
      })
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, created_at, updated_at")
      .single();

    if (predictionError) throw new Error(predictionError.message);

    // ── Create options ──
    const optionRows = body.options.map((label, index) => ({
      prediction_id: prediction.id,
      label,
      sort_order: index,
    }));

    const { data: createdOptions, error: optionError } = await supabase
      .from("prediction_options")
      .insert(optionRows)
      .select("id, prediction_id, label, sort_order")
      .returns<{ id: string; prediction_id: string; label: string; sort_order: number }[]>();

    if (optionError) throw new Error(optionError.message);

    // ── Audit Log ──
    await logAudit({
      adminId: user.id, // Using user.id as reference
      action: "user_create_prediction",
      targetType: "prediction",
      targetId: prediction.id,
      metadata: {
        userId: user.id,
        userEmail: user.email,
        userRank: rankInfo.name,
        tournamentName: body.tournamentName,
        round: body.round,
        question: body.question,
        feeRate: 0.05,
        optionsCount: body.options.length,
      },
    });

    let response = NextResponse.json({
      ok: true,
      data: {
        id: prediction.id,
        tournamentName: prediction.tournament_name,
        question: prediction.question,
        status: prediction.status,
        opensAt: prediction.opens_at,
        closesAt: prediction.closes_at,
        feeRate: prediction.fee_rate,
        createdAt: prediction.created_at,
        createdBy: user.displayName || user.email.split("@")[0],
        options: (createdOptions || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((opt) => ({ id: opt.id, label: opt.label })),
      },
    });

    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
