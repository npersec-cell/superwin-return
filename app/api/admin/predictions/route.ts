import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest, createPredictionBodySchema } from "@/lib/validation";
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

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  fee_rate: number;
  number_war_enabled: boolean | null;
  number_war_open_at: string | null;
  number_war_close_at: string | null;
  number_war_winner_slot: number | null;
  created_at: string;
  updated_at: string;
};

type OptionRow = {
  id: string;
  prediction_id: string;
  label: string;
  sort_order: number;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

function mapPrediction(row: PredictionRow, options: OptionRow[]) {
  return {
    id: row.id,
    tournamentName: row.tournament_name,
    question: row.question,
    status: row.status,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    feeRate: row.fee_rate,
    numberWarEnabled: row.number_war_enabled,
    numberWarOpenAt: row.number_war_open_at,
    numberWarCloseAt: row.number_war_close_at,
    numberWarWinnerSlot: row.number_war_winner_slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    options: options
      .filter((option) => option.prediction_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({ id: option.id, label: option.label, sortOrder: option.sort_order }))
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    const { data: predictions, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, number_war_enabled, number_war_open_at, number_war_close_at, number_war_winner_slot, created_at, updated_at")
      .order("created_at", { ascending: false })
      .returns<PredictionRow[]>();

    if (predictionError) throw new Error(predictionError.message);

    const ids = (predictions || []).map((row) => row.id);
    const { data: options, error: optionError } = ids.length
      ? await supabase
          .from("prediction_options")
          .select("id, prediction_id, label, sort_order")
          .in("prediction_id", ids)
          .order("sort_order", { ascending: true })
          .returns<OptionRow[]>()
      : { data: [] as OptionRow[], error: null };

    if (optionError) throw new Error(optionError.message);

    // Fetch entry counts for ALL predictions (any status)
    const { data: entryCounts, error: entryError } = ids.length
      ? await supabase
          .from("prediction_entries")
          .select("prediction_id")
          .in("prediction_id", ids)
      : { data: [] as { prediction_id: string }[], error: null };

    if (entryError) throw new Error(entryError.message);

    const countMap = new Map<string, number>();
    for (const entry of entryCounts || []) {
      countMap.set(entry.prediction_id, (countMap.get(entry.prediction_id) || 0) + 1);
    }

    return NextResponse.json({
      ok: true,
      data: (predictions || []).map((row) => ({ ...mapPrediction(row, options || []), entryCount: countMap.get(row.id) || 0 }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin predictions";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    // Rate Limiting Check
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.CREATE_PREDICTION, admin.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Validate request body with Zod
    const rawBody = await request.clone().json().catch(() => null);
    console.log('[ADMIN CREATE] Raw body:', JSON.stringify(rawBody));
    const validation = await validateRequest(request, createPredictionBodySchema);
    if (!validation.success) {
      console.log('[ADMIN CREATE] Validation failed');
      return validation.response;
    }

    const body = validation.data;
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const opensAt = body.opensAt ? (parseBkkDateTime(body.opensAt) || now) : now;
    const closesAt = parseBkkDateTime(body.closesAt) || now;

    if (Number.isNaN(new Date(closesAt).getTime()) || new Date(closesAt).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Close time must be in the future" }, { status: 400 });
    }

    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .insert({
        tournament_name: body.tournamentName,
        question: body.question,
        status: body.status,
        opens_at: opensAt,
        closes_at: closesAt,
        fee_rate: body.feeRate,
        created_by: admin.id,
        number_war_enabled: body.numberWarEnabled,
        number_war_open_at: body.numberWarOpenAt ? (parseBkkDateTime(body.numberWarOpenAt) || null) : null,
        number_war_close_at: body.numberWarCloseAt ? (parseBkkDateTime(body.numberWarCloseAt) || null) : null,
      })
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, number_war_enabled, number_war_open_at, number_war_close_at, created_at, updated_at")
      .single<PredictionRow>();

    if (predictionError) throw new Error(predictionError.message);

    const optionRows = body.options.map((label, index) => ({
      prediction_id: prediction.id,
      label,
      sort_order: index
    }));

    const { data: createdOptions, error: optionError } = await supabase
      .from("prediction_options")
      .insert(optionRows)
      .select("id, prediction_id, label, sort_order")
      .returns<OptionRow[]>();

    if (optionError) throw new Error(optionError.message);

    // Audit Log: Record this admin action
    await logAudit({
      adminId: admin.id,
      action: "create_prediction",
      targetType: "prediction",
      targetId: prediction.id,
      metadata: {
        tournamentName: body.tournamentName,
        question: body.question,
        status: body.status,
        feeRate: body.feeRate,
        optionsCount: body.options.length,
      },
    });

    let response = NextResponse.json({ ok: true, data: mapPrediction(prediction, createdOptions || []) });
    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
