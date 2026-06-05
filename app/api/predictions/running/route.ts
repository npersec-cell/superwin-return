import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import type { RunningPredictionDto } from "@/lib/types";

type RunningRow = {
  id: string;
  prediction_id: string;
  amount: number;
  estimated_return_percent: number | null;
  status: "running" | "won" | "lost" | "refunded";
  created_at: string;
  insurance: boolean;
  predictions: { tournament_name: string; question: string } | null;
  prediction_options: { label: string } | null;
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("prediction_entries")
      .select("id, prediction_id, amount, estimated_return_percent, status, created_at, insurance, predictions(tournament_name, question), prediction_options(label)")
      .eq("user_id", user.id)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .returns<RunningRow[]>();

    if (error) {
      throw new Error(error.message || "Failed to load running predictions");
    }

    const rows: RunningPredictionDto[] = (data || []).map((entry) => ({
      id: entry.id,
      predictionId: entry.prediction_id,
      tournamentName: entry.predictions?.tournament_name || "Prediction",
      question: entry.predictions?.question || "Prediction",
      optionLabel: entry.prediction_options?.label || "Option",
      amount: entry.amount,
      estimatedReturnPercent: entry.estimated_return_percent,
      status: entry.status,
      createdAt: entry.created_at,
      insurance: entry.insurance || false,
    }));

    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load running predictions";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
