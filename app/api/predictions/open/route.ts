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
  opens_at: string;
  closes_at: string;
  fee_rate: number;
  sponsor_pool: number;
  created_by_user_id: string | null;
};

type CreatorRow = {
  id: string;
  display_name: string | null;
  email: string;
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

    // ── AUTO-OPEN: เปลี่ยน draft → open อัตโนมัติเมื่อถึงเวลา opens_at ──
    //      ทำก่อน fetch รายการเปิดเพื่อให้คำถามที่ถึงเวลาโผล่ทันที
    const { error: autoOpenError } = await supabase
      .from("predictions")
      .update({ status: "open", updated_at: now })
      .eq("status", "draft")
      .not("opens_at", "is", null)
      .lte("opens_at", now);

    if (autoOpenError) {
      console.warn("[Auto-Open] Failed to auto-open drafts:", autoOpenError.message);
      // ไม่ throw — แค่ warn แล้วไปต่อได้ เพราะยังมีคำถาม open อยู่แล้ว
    }

    const { data: predictionRows, error: predictionError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, opens_at, closes_at, fee_rate, sponsor_pool, created_by_user_id")
      .eq("status", "open")
      .or(`opens_at.is.null,opens_at.lte.${now}`)
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

    const entriesByPrediction = (entryRows || []).reduce<Record<string, { optionId: string; userId: string; amount: number; status: string }[]>>((acc, entry) => {
      acc[entry.prediction_id] = acc[entry.prediction_id] || [];
      acc[entry.prediction_id].push({
        optionId: entry.option_id,
        userId: entry.user_id,
        amount: entry.amount,
        status: entry.status,
      });
      return acc;
    }, {});

    // Fetch creator info for user-created predictions
    const creatorIds = (predictionRows || [])
      .map(p => p.created_by_user_id)
      .filter((id): id is string => !!id);
    
    const creatorsById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: creatorRows } = await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", creatorIds)
        .returns<CreatorRow[]>();
      for (const c of (creatorRows || [])) {
        creatorsById.set(c.id, c.display_name || c.email.split("@")[0]);
      }
    }

    function computeReturn(predictionId: string, optionId: string, feeRate: number, sponsorPool: number): number {
      const optionPool = poolByOption[optionId] || 0;
      const userPool = poolByPrediction[predictionId] || 0;
      const totalPool = userPool + sponsorPool; // 🍊 รวมกระสุมส้มในพูลรางวัล

      if (totalPool <= 0) {
        return 0;
      }

      if (optionPool <= 0) {
        // No bets on this option yet — estimate with average bet size
        const playerCount = playersByPrediction[predictionId]?.size || 1;
        const assumedBet = Math.max(10, Math.floor(userPool / playerCount));
        const newTotalPool = totalPool + assumedBet;
        const newOptionPool = assumedBet;
        const multiplier = (newTotalPool / newOptionPool) * (1 - feeRate);
        const profitPercent = Math.round((multiplier - 1) * 100);
        return Math.min(profitPercent, 99900);
      }

      const multiplier = (totalPool / optionPool) * (1 - feeRate);
      const profitPercent = Math.max(0, Math.round((multiplier - 1) * 100));
      return Math.min(profitPercent, 99900);
    }

    const predictions: PredictionWithOptionsDto[] = (predictionRows || []).map((prediction) => {
      const userPool = poolByPrediction[prediction.id] || 0;
      const sponsorPool = prediction.sponsor_pool || 0;
      const creatorName = prediction.created_by_user_id ? creatorsById.get(prediction.created_by_user_id) : null;
      return {
        id: prediction.id,
        tournamentName: prediction.tournament_name,
        question: prediction.question,
        closesAt: prediction.closes_at,
        totalPool: userPool + sponsorPool, // 🍊 รวมกระสุมส้ม
        playerCount: playersByPrediction[prediction.id]?.size || 0,
        createdBy: creatorName,
        options: (optionsByPrediction[prediction.id] || []).map((option) => ({
          id: option.id,
          label: option.label,
          sortOrder: option.sort_order,
          estimatedReturnPercent: computeReturn(prediction.id, option.id, prediction.fee_rate || 0, sponsorPool)
        })),
        entries: entriesByPrediction[prediction.id] || [],
      };
    });

    return NextResponse.json({ ok: true, data: predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load predictions";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
