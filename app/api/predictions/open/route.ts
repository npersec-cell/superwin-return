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

type UserRow = {
  id: string;
  display_name: string | null;
  email: string;
};

// ── Save snapshot of current option percentages for time-series chart ──
async function savePredictionSnapshot(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  predictionId: string,
  optionPools: Record<string, number>,
  totalPool: number
) {
  const totalCoins = Object.values(optionPools).reduce((a, b) => a + b, 0);
  const snapshots = Object.entries(optionPools).map(([optionId, coins]) => ({
    prediction_id: predictionId,
    option_id: optionId,
    coins_on_option: coins,
    percentage: totalCoins > 0 ? (coins / totalCoins) * 100 : 0,
    total_pool: totalPool,
  }));

  if (snapshots.length > 0) {
    await supabase.from("prediction_snapshots").insert(snapshots);
  }
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // ── AUTO-OPEN: Change draft → open automatically when opens_at is reached ──
    //      Run before fetching open questions so newly opened ones appear immediately
    const { error: autoOpenError } = await supabase
      .from("predictions")
      .update({ status: "open", updated_at: now })
      .eq("status", "draft")
      .not("opens_at", "is", null)
      .lte("opens_at", now);

    if (autoOpenError) {
      console.warn("[Auto-Open] Failed to auto-open drafts:", autoOpenError.message);
      // Don't throw — just warn and continue since there are already open questions
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

    // Fetch creator info AND all bettors' display names
    const creatorIds = (predictionRows || [])
      .map(p => p.created_by_user_id)
      .filter((id): id is string => !!id);
    
    const allBettorIds = Array.from(new Set((entryRows || []).map(e => e.user_id)));
    const allUserIds = [...new Set([...creatorIds, ...allBettorIds])];
    
    const creatorsById = new Map<string, string>();
    const usersById = new Map<string, string>();
    if (allUserIds.length > 0) {
      const { data: userRows } = await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", allUserIds)
        .returns<UserRow[]>();
      for (const u of (userRows || [])) {
        const name = u.display_name || u.email.split("@")[0];
        usersById.set(u.id, name);
        if (creatorIds.includes(u.id)) {
          creatorsById.set(u.id, name);
        }
      }
    }

    // Calculate top 5 bettors per prediction (by total amount, locked option)
    const topBettorsByPrediction = (entryRows || []).reduce<Record<string, Array<{ userId: string; userName: string; optionId: string; optionName: string; totalAmount: number }>>>((acc, entry) => {
      acc[entry.prediction_id] = acc[entry.prediction_id] || [];
      const existing = acc[entry.prediction_id].find(b => b.userId === entry.user_id);
      if (existing) {
        existing.totalAmount += entry.amount;
      } else {
        acc[entry.prediction_id].push({
          userId: entry.user_id,
          userName: usersById.get(entry.user_id) || "Anonymous",
          optionId: entry.option_id,
          optionName: "", // filled in below
          totalAmount: entry.amount,
        });
      }
      return acc;
    }, {});

    // Resolve option names for top bettors
    for (const [predId, bettors] of Object.entries(topBettorsByPrediction)) {
      const opts = optionsByPrediction[predId] || [];
      for (const bettor of bettors) {
        const opt = opts.find(o => o.id === bettor.optionId);
        bettor.optionName = opt?.label || "?";
      }
      // Sort by totalAmount desc, take top 5
      bettors.sort((a, b) => b.totalAmount - a.totalAmount);
      topBettorsByPrediction[predId] = bettors.slice(0, 5);
    }

    function computeReturn(predictionId: string, optionId: string, feeRate: number, sponsorPool: number): number {
      const optionPool = poolByOption[optionId] || 0;
      const userPool = poolByPrediction[predictionId] || 0;
      const totalPool = userPool + sponsorPool; // includes sponsor pool in prize pool

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
      const optionPoolsForPred = optionsByPrediction[prediction.id]?.reduce<Record<string, number>>((acc, opt) => {
        acc[opt.id] = poolByOption[opt.id] || 0;
        return acc;
      }, {}) || {};
      
      // Save snapshot for time-series chart (fire-and-forget)
      savePredictionSnapshot(
        supabase, 
        prediction.id, 
        optionPoolsForPred, 
        userPool + sponsorPool
      ).catch(err => console.warn("[Snapshot] Failed:", err.message));

      return {
        id: prediction.id,
        tournamentName: prediction.tournament_name,
        question: prediction.question,
        closesAt: prediction.closes_at,
        opensAt: prediction.opens_at,
        totalPool: userPool + sponsorPool,
        playerCount: playersByPrediction[prediction.id]?.size || 0,
        createdBy: creatorName,
        options: (optionsByPrediction[prediction.id] || []).map((option) => ({
          id: option.id,
          label: option.label,
          sortOrder: option.sort_order,
          estimatedReturnPercent: computeReturn(prediction.id, option.id, prediction.fee_rate || 0, sponsorPool),
          coinsOnOption: poolByOption[option.id] || 0
        })),
        optionPools: optionPoolsForPred,
        entries: entriesByPrediction[prediction.id] || [],
        topBettors: topBettorsByPrediction[prediction.id] || [],
      };
    });

    return NextResponse.json({ ok: true, data: predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load predictions";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
