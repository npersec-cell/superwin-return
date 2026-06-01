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
};

function estimateReturn(sortOrder: number) {
  const estimates = [185, 230, 310, 420, 560, 690, 760, 840, 920, 980];
  return estimates[sortOrder] || Math.min(1200, 200 + sortOrder * 90);
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: predictionRows, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, closes_at")
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

    const predictions: PredictionWithOptionsDto[] = (predictionRows || []).map((prediction) => ({
      id: prediction.id,
      tournamentName: prediction.tournament_name,
      question: prediction.question,
      closesAt: prediction.closes_at,
      options: (optionsByPrediction[prediction.id] || []).map((option) => ({
        id: option.id,
        label: option.label,
        sortOrder: option.sort_order,
        estimatedReturnPercent: estimateReturn(option.sort_order)
      }))
    }));

    return NextResponse.json({ ok: true, data: predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load predictions";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
