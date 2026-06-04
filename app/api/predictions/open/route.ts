import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import type { PredictionWithOptionsDto } from "@/lib/types";

export const dynamic = "force-dynamic";

type OptionRow = {
  id: string;
  prediction_id: string;
  label: string;
  sort_order: number;
};

type PredictionRow = {
  id: string;
  tournament_name: string;
  question: string;
  closes_at: string;
  fee_rate: number;
};

type EntryRow = {
  option_id: string;
  prediction_id: string;
  amount: number;
  status: string;
  user_id: string;
};

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: predictionRows, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, closes_at, fee_rate")
      .eq("status", "open")
      .gt("closes_at", now)
      .order("closes_at", { ascending: true })
      .order("question", { ascending: true })
      .returns<PredictionRow[]>();

    if (predictionError) {
      throw new Error(predictionError.message || "Failed to load predictions");
    }

    const ids = (predictionRows || []).map((prediction) => prediction.id);

    const { data: optionRows, error: optionError } = ids.length
      ? await supabase
          .from("prediction_options")
          .select("id, prediction_id, label, sort_order")
          .in("prediction_id", ids)
          .order("sort_order", { ascending: true })
          .returns<OptionRow[]>()
      : { data: [] as OptionRow[], error: null };

    if (optionError) {
      throw new Error(optionError.message || "Failed to load prediction options");
    }

    const optionsByPrediction = (optionRows || []).reduce<Record<string, OptionRow[]>>((acc, option) => {
      acc[option.prediction_id] = acc[option.prediction_id] || [];
      acc[option.prediction_id].push(option);
      return acc;
    }, {});

    const { data: entryRows } = ids.length
      ? await supabase
          .from("prediction_entries")
          .select("option_id, prediction_id, amount, status, user_id")
          .in("prediction_id", ids)
          .in("status", ["running", "won", "lost"])
          .returns<EntryRow[]>()
      : { data: [] as EntryRow[] };

    const poolByOption = (entryRows || []).reduce<Record<string, number>>((acc, entry) => {
      acc[entry.option_id] = (acc[entry.option_id] || 0) + entry.amount;
      return acc;
    }, {});

    const poolByPrediction = (entryRows || []).reduce<Record<string, number>>((acc, entry) => {
      acc[entry.prediction_id] = (acc[entry.prediction_id] || 0) + entry.amount;
      return acc;
    }, {});

    const playersByPrediction = (entryRows || []).reduce<Record<string, Set<string>>>((acc, entry) => {
      acc[entry.prediction_id] = acc[entry.prediction_id] || new Set();
      acc[entry.prediction_id].add(entry.user_id);
      return acc;
    }, {});

    function computeReturn(predictionId: string, optionId: string, feeRate: number, sortOrder: number): number {
      const optionPool = poolByOption[optionId] || 0;
      const totalPool = poolByPrediction[predictionId] || 0;
      if (optionPool <= 0 || totalPool <= 0) {
        return 0;
      }
      const multiplier = (totalPool / optionPool) * (1 - feeRate);
      return Math.round((multiplier - 1) * 100);
    }

    const predictions: PredictionWithOptionsDto[] = (predictionRows || []).map((prediction) => ({
      id: prediction.id,
      tournamentName: prediction.tournament_name,
      question: prediction.question,
      closesAt: prediction.closes_at,
      totalPool: poolByPrediction[prediction.id] || 0,
      playerCount: playersByPrediction[prediction.id]?.size || 0,
      options: (optionsByPrediction[prediction.id] || []).map((option) => ({
        id: option.id,
        label: option.label,
        sortOrder: option.sort_order,
        estimatedReturnPercent: computeReturn(prediction.id, option.id, prediction.fee_rate || 0, option.sort_order)
      }))
    }));

    return NextResponse.json({ ok: true, data: predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load predictions";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
