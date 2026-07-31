import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

interface EntryRow {
  id: string;
  prediction_id: string;
  option_id: string;
  amount: number;
  created_at: string;
  user_id: string;
}

interface OptionRow {
  id: string;
  prediction_id: string;
  label: string;
}

interface PredictionRow {
  id: string;
  tournament_name: string;
  question: string;
  status: string;
  closes_at: string;
  created_at: string;
  fee_rate: number;
  sponsor_pool: number | null;
  winning_option_id: string | null;
}
function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    // 1. Fetch all predictions first to avoid PostgREST embed errors
    const { data: predictions, error: pError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status, closes_at, created_at, fee_rate, sponsor_pool, winning_option_id")
      .order("created_at", { ascending: false });

    if (pError) throw new Error(pError.message);

    // 2. Fetch all prediction options
    const { data: options, error: oError } = await supabase
      .from("prediction_options")
      .select("id, prediction_id, label");

    if (oError) throw new Error(oError.message);

    // 3. Fetch all prediction entries (no users join to avoid PostgREST errors)
    const { data: entries, error: eError } = await supabase
      .from("prediction_entries")
      .select("id, prediction_id, option_id, amount, created_at, user_id");

    if (eError) throw new Error(eError.message);

    // 3b. Fetch user data separately
    const userIds = [...new Set((entries || []).map((e: EntryRow) => e.user_id).filter(Boolean))];
    const usersById: Record<string, { email: string; display_name: string }> = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, email, display_name")
        .in("id", userIds);
      for (const u of usersData || []) {
        usersById[u.id] = { email: u.email || "", display_name: u.display_name || "" };
      }
    }

    // 4. Join data together in JavaScript for safety and zero errors
    const formatted = (predictions || []).map((p: PredictionRow) => {
      const pOptions = (options || []).filter((o) => o.prediction_id === p.id);
      const pEntries = (entries || []).filter((e) => e.prediction_id === p.id);

      // Total coins in pool (including sponsor pool)
      const sponsorPool = Number(p.sponsor_pool || 0);
      const userPoolCoins = pEntries.reduce((sum, e: EntryRow) => sum + (e.amount || 0), 0);
      const totalPoolCoins = userPoolCoins + sponsorPool;
      const uniquePlayers = new Set(pEntries.map((e: EntryRow) => usersById[e.user_id]?.email).filter(Boolean)).size;

      // Net pool after deducting fee
      const feeRate = Number(p.fee_rate || 0.03);
      const netPool = totalPoolCoins * (1 - feeRate);

      // Calculate bet totals and odds multiplier for each option
      const optionStats = pOptions.map((opt) => {
        const optEntries = pEntries.filter((e) => e.option_id === opt.id);
        const optTotalCoins = optEntries.reduce((sum, e: EntryRow) => sum + (e.amount || 0), 0);
        const optPlayerCount = new Set(optEntries.map((e: EntryRow) => usersById[e.user_id]?.email).filter(Boolean)).size;

        // Calculate return multiplier per coin, rounded to integer (e.g., 1x, 2x instead of 1.1x)
        const potentialMultiplier = optTotalCoins > 0 ? Math.round(netPool / optTotalCoins) : 0;

        return {
          id: opt.id,
          label: opt.label,
          totalCoins: optTotalCoins,
          playerCount: optPlayerCount,
          multiplier: potentialMultiplier
        };
      });

      // List of players who bet on this prediction
      const playerBets = pEntries.map((e: EntryRow) => {
        const optionLabel = pOptions.find((o: OptionRow) => o.id === e.option_id)?.label || "--";
        const userInfo = usersById[e.user_id];
        return {
          id: e.id,
          email: userInfo?.email || "",
          displayName: userInfo?.display_name || "",
          userId: e.user_id,
          optionLabel,
          amount: e.amount,
          createdAt: e.created_at
        };
      });

      return {
        id: p.id,
        tournamentName: p.tournament_name,
        question: p.question,
        status: p.status,
        closesAt: p.closes_at,
        createdAt: p.created_at,
        sponsorPool,
        userPoolCoins,
        totalPoolCoins,
        uniquePlayers,
        optionStats,
        playerBets,
        winningOptionId: p.winning_option_id
      };
    });

    return NextResponse.json({ ok: true, data: formatted });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
