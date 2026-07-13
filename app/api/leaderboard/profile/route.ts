import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

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
    const baseURL = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    
    let v2Data: any = null;
    try {
      const response = await fetch(`${baseURL}/api/leaderboard/v2?t=${Date.now()}`);
      v2Data = await response.json();
    } catch (error) {
      console.error("[Profile] Error fetching from API v2:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch rank data from leaderboard" }, { status: 500 });
    }

    // Extract data safely
    const userRankData = v2Data.userRankData || {};
    const leaderboards = v2Data.leaderboards || {};
    const totalUsers = v2Data.totalUsers || 0;
    const totalActiveUsers = v2Data.totalActiveUsers || 0;

    // Find user in overall leaderboard (ACTIVE USERS only)
    const overallLeaderboard = leaderboards.overall || [];
    const activeUserCount = overallLeaderboard.length;
    const userInOverall = overallLeaderboard.find((u: any) => u.userId === userId);
    
    // Get rank from leaderboard or userRankData
    const overallRank = userInOverall ? userInOverall.rank : (userRankData.overallRank || 0);
    const overallScore = userInOverall ? userInOverall.value : (userRankData.overallScore || 0);
    
    // Extract other rank info
    const profitScoreRank = userRankData.profitScoreRank || 0;
    const predictionCountRank = userRankData.predictionCountRank || 0;
    const highestSingleWinRank = userRankData.highestSingleWinRank || 0;
    const activeRank = userRankData.activeRank || 0;
    const avgReloadPerDay = userRankData.avgReloadPerDay || 0;
    const predictionCount = userRankData.predictionCount || 0;
    const highestSingleWin = userRankData.highestSingleWin || 0;

    // Calculate rank tier
    const rankInfo = getRankFromPosition(overallRank, activeUserCount);

    // ── Fetch user basic info ──
    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("display_name, email, lifetime_profit")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("[Profile] Error fetching user:", userError);
      return NextResponse.json({ ok: false, error: "Failed to fetch user" }, { status: 500 });
    }

    // ── Fetch user's settled entries for history display ──
    const { data: historyEntries } = await supabase
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
      .in("status", ["won", "lost"])
      .order("created_at", { ascending: false });

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
        status: isWon ? "won" : "lost",
        net,
        date: new Date(pred.resolved_at || e.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short"
        })
      };
    });

    // ── Get profit score from user table ──
    const profitScore = targetUser.lifetime_profit || 0;

    return NextResponse.json({
      ok: true,
      data: {
        name: targetUser.display_name || targetUser.email?.split("@")[0] || "User",
        displayName: targetUser.display_name || null,
        profitScore,
        allTimeProfit: profitScore,
        predictionCount,
        highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay,
        rank: overallRank,
        rankPercentile: activeUserCount > 0 ? overallRank / activeUserCount : 0,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        totalActiveUsers,
        overallScore,
        overallRank,
        mostOrangeAmmoRank: profitScoreRank,
        mostPredictionsRank: predictionCountRank,
        highestSingleWinRank,
        mostActiveRank: activeRank,
        badge: "",
        badgeDesc: "",
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
    console.error("[Profile] Error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
