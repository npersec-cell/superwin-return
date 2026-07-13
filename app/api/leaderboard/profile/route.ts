import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

// Get rank tier from position with minimum counts
function getRankFromPosition(position: number, totalUsers: number): { name: string; icon: string } {
  if (totalUsers <= 0) return { name: "Bronze", icon: "/ranks/bronze.png" };
  
  const percentile = position / totalUsers;
  
  // Crown: #1 only
  if (position === 1) return { name: "Crown", icon: "/ranks/crown.png" };
  
  // Conqueror: Top 3% OR at least 2 people
  if (percentile <= 0.03 || (position <= 2 && totalUsers >= 2)) return { name: "Conqueror", icon: "/ranks/conqueror.png" };
  
  // Ace: Top 8% OR at least 3 people
  if (percentile <= 0.08 || (position <= 3 && totalUsers >= 3)) return { name: "Ace", icon: "/ranks/ace.png" };
  
  // Diamond: Top 15% OR at least 5 people
  if (percentile <= 0.15 || (position <= 5 && totalUsers >= 5)) return { name: "Diamond", icon: "/ranks/diamond.png" };
  
  // Platinum: Top 25%
  if (percentile <= 0.25) return { name: "Platinum", icon: "/ranks/platinum.png" };
  
  // Gold: Top 40%
  if (percentile <= 0.40) return { name: "Gold", icon: "/ranks/gold.png" };
  
  // Silver: 40-70%
  if (percentile <= 0.70) return { name: "Silver", icon: "/ranks/silver.png" };
  
  // Bronze: Bottom 30%
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "";

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // ── Fetch rank data from API v2 (SINGLE SOURCE OF TRUTH) ──
    let v2Data: any = null;
    try {
      const response = await fetch(`http://localhost:3000/api/leaderboard/v2?userId=${userId}&t=${Date.now()}`);
      v2Data = await response.json();
    } catch (error) {
      console.error("[Profile] Error fetching from API v2:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch rank data" }, { status: 500 });
    }

    // If API v2 didn't return userRankData, user doesn't exist
    if (!v2Data.userRankData) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const userRankData = v2Data.userRankData;
    const totalUsers = v2Data.totalUsers;

    // ── Fetch user basic info ──
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("display_name, email, lifetime_profit, reload_count, created_at")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("[Profile] Error fetching user:", userError);
      return NextResponse.json({ ok: false, error: "Failed to fetch user" }, { status: 500 });
    }

    // ── Fetch user's settled entries for history display ──
    const { data: historyEntries, error: historyEntriesError } = await supabase
      .from("prediction_entries")
      .select(`
        id,
        prediction_id,
        option_id,
        amount,
        payout_amount,
        status,
        created_at,
        predictions (
          id,
          question,
          tournament_name,
          resolved_at
        )
      `)
      .eq("user_id", userId)
      .in("status", ["won", "lost", "refunded"])
      .order("created_at", { ascending: false });

    if (historyEntriesError) {
      console.error("[Profile] Error fetching prediction_entries:", historyEntriesError);
      return NextResponse.json({ ok: false, error: "Failed to fetch entries" }, { status: 500 });
    }

    // ── Calculate history stats from entries ──
    let wonCount = 0;
    let lostCount = 0;

    for (const e of historyEntries || []) {
      if (e.status === "won") wonCount++;
      else lostCount++;
    }

    const totalSettled = historyEntries?.length || 0;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    // ── Batch fetch option labels ──
    const optionIds = [...new Set(
      (historyEntries || []).map((e: any) => e.option_id).filter(Boolean)
    )] as string[];

    const optionsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const { data: opts } = await supabase
        .from("prediction_options")
        .select("id, label")
        .in("id", optionIds);
      if (opts) {
        for (const o of opts) {
          optionsMap.set(o.id, o.label);
        }
      }
    }

    // ── Build history (sorted by resolved_at desc → created_at desc) ──
    const sortedEntries = [...(historyEntries || [])].sort((a: any, b: any) => {
      const dateA = new Date(a.predictions?.resolved_at || a.created_at).getTime();
      const dateB = new Date(b.predictions?.resolved_at || b.created_at).getTime();
      return dateB - dateA;
    });

    const history = sortedEntries.slice(0, 5).map((e: any) => {
      const pred = e.predictions || {};
      const pickText = e.option_id ? (optionsMap.get(e.option_id) || "") : "";

      const isWon = e.status === "won";
      const net = isWon
        ? (e.payout_amount || 0) - e.amount
        : -e.amount;

      return {
        id: e.id,
        tournament: pred.tournament_name || "Prediction",
        question: pred.question || "Unknown Question",
        pick: pickText,
        amount: e.amount,
        payout: e.payout_amount || 0,
        status: isWon ? "won" : ("lost" as "won" | "lost"),
        net,
        date: new Date(pred.resolved_at || e.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short"
        })
      };
    });

    // ── Calculate RANK tier from Most Orange Ammo rank ──
    const mostOrangeAmmoRank = userRankData.profitScoreRank;
    const rankInfo = getRankFromPosition(mostOrangeAmmoRank, totalUsers);

    // ── Build response using ONLY data from API v2 ──
    return NextResponse.json({
      ok: true,
      data: {
        name: user.display_name || user.email.split("@")[0],
        displayName: user.display_name || null,
        // Basic stats (from user table)
        profitScore: user.lifetime_profit || 0,
        allTimeProfit: user.lifetime_profit || 0,
        predictionCount: userRankData.predictionCount,
        highestSingleWin: userRankData.highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay: userRankData.avgReloadPerDay,
        // Rank data (100% from API v2)
        rank: mostOrangeAmmoRank,
        rankPercentile: mostOrangeAmmoRank / totalUsers,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        // Leaderboard ranks (100% from API v2)
        overallScore: userRankData.overallScore,
        overallRank: userRankData.overallRank,
        mostOrangeAmmoRank: userRankData.profitScoreRank,
        mostPredictionsRank: userRankData.predictionCountRank,
        highestSingleWinRank: userRankData.highestSingleWinRank,
        mostActiveRank: userRankData.activeRank,
        history
      }
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error) {
    return createSafeErrorResponse(error);
  }
}
