import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

function parseBkkDateTime(localStr: string) {
  if (!localStr) return null;
  if (localStr.includes("Z") || localStr.includes("+")) {
    return new Date(localStr).toISOString();
  }
  return new Date(localStr + "+07:00").toISOString();
}

type AdminPredictionInput = {
  tournamentName?: string;
  question?: string;
  opensAt?: string;
  closesAt?: string;
  feeRate?: number;
  status?: "draft" | "open" | "closed" | "resolved" | "canceled";
  options?: string[];
};

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  fee_rate: number;
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
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, created_at, updated_at")
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

    return NextResponse.json({
      ok: true,
      data: (predictions || []).map((row) => mapPrediction(row, options || []))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin predictions";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = (await request.json()) as AdminPredictionInput;

    const tournamentName = String(body.tournamentName || "").trim();
    const question = String(body.question || "").trim();
    const options = (body.options || []).map((item) => String(item).trim()).filter(Boolean);
    const feeRate = Number(body.feeRate ?? 0.03);
    const status = body.status || "draft";

    if (!tournamentName || !question) {
      return NextResponse.json({ ok: false, error: "Tournament and question are required" }, { status: 400 });
    }

    if (!body.closesAt) {
      return NextResponse.json({ ok: false, error: "Close time is required" }, { status: 400 });
    }

    if (options.length < 2) {
      return NextResponse.json({ ok: false, error: "At least 2 options are required" }, { status: 400 });
    }

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
        tournament_name: tournamentName,
        question,
        status,
        opens_at: opensAt,
        closes_at: closesAt,
        fee_rate: feeRate,
        created_by: admin.id
      })
      .select("id, tournament_name, question, status, opens_at, closes_at, fee_rate, created_at, updated_at")
      .single<PredictionRow>();

    if (predictionError) throw new Error(predictionError.message);

    const optionRows = options.map((label, index) => ({
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

    return NextResponse.json({ ok: true, data: mapPrediction(prediction, createdOptions || []) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create prediction";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
