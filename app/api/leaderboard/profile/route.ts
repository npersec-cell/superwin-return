import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

// Logarithmic score calculation (MUST match v2 API)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

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

    // ── Fetch ALL users for rank calculation ──
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, email, lifetime_profit, role, created_at, reload_count, avatar_url')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');

    if (usersError) {
      console.error("[Profile] Error fetching users:", usersError);
      return NextResponse.json({ ok: false, error: "Failed to fetch users" }, { status: 500 });
    }

    // ── Fetch ALL entries for all users (batch query) ──
    const userIds = users?.map(u => u.id) || [];
    const { data: entries, error: entriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, amount, payout_amount, status')
      .in('user_id', userIds)
      .in('status', ['won', 'lost', 'refunded']);

    if (entriesError) {
      console.error("[Profile] Error fetching entries:", entriesError);
      return NextResponse.json({ ok: false, error: "Failed to fetch entries" }, { status: 500 });
    }

    // ── Calculate stats for ALL users (MUST match v2 API logic) ──
    const userStatsMap = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgReloadPerDay: number;
      reloadCount: number;
    }>();

    for (const u of users || []) {
      userStatsMap.set(u.id, {
        profitScore: u.lifetime_profit || 0,
        predictionCount: 0,
        highestSingleWin: 0,
        avgReloadPerDay: 0,
        reloadCount: u.reload_count || 0
      });
    }

    // Calculate from entries
    for (const entry of (entries || [])) {
      const stat = userStatsMap.get(entry.user_id);
      if (stat) {
        stat.predictionCount++;
        // Only calculate highestSingleWin for WON entries
        if (entry.status === 'won') {
          const profit = entry.payout_amount - entry.amount;
          if (profit > stat.highestSingleWin) {
            stat.highestSingleWin = profit;
          }
        }
      }
    }

    // Calculate average reload per day for each user
    for (const [uid, stat] of userStatsMap) {
      const user = users?.find(u => u.id === uid);
      if (user) {
        const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        stat.avgReloadPerDay = stat.reloadCount / daysSinceCreated;
      }
    }

    // ── Convert to leaderboard format (MUST match v2 API) ──
    const leaderboardData = Array.from(userStatsMap.entries()).map(([uid, stats]) => {
      const user = users?.find(u => u.id === uid);
      return {
        userId: uid,
        profitScore: stats.profitScore,
        predictionCount: stats.predictionCount,
        highestSingleWin: stats.highestSingleWin,
        avgReloadPerDay: stats.avgReloadPerDay,
        reloadCount: stats.reloadCount,
        displayName: user?.display_name || user?.email?.split('@')[0] || 'User',
        avatarUrl: user?.avatar_url || null
      };
    });

    // ── Calculate Overall score for ALL users (MUST match v2 API) ──
    const leaderboardWithOverall = leaderboardData.map(user => {
      const hasActivity = user.predictionCount > 0;
      const orangeAmmoScore = calcLogScore(user.profitScore);
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = hasActivity ? calcLogScore(user.avgReloadPerDay) : 0;
      const overall = Math.round(orangeAmmoScore + predictionScore + winScore + activeScore);
      
      return { ...user, overall, hasActivity };
    });

    const totalUsers = leaderboardWithOverall.length;

    // ── Find target user in leaderboard ──
    const targetUserStats = leaderboardWithOverall.find(u => u.userId === userId);
    if (!targetUserStats) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // ── Calculate ranks for target user (MUST match v2 API logic) ──
    // Overall rank - include ALL users (not just active users)
    const sortedOverall = [...leaderboardWithOverall].sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.userId.localeCompare(b.userId);
    });
    const overallUserIndex = sortedOverall.findIndex(u => u.userId === userId);
    const overallRank = overallUserIndex >= 0 ? overallUserIndex + 1 : totalUsers + 1;

    // Most Orange Ammo rank (stable sort by userId)
    const sortedByProfitScore = [...leaderboardWithOverall].sort((a, b) => {
      if (b.profitScore !== a.profitScore) return b.profitScore - a.profitScore;
      return a.userId.localeCompare(b.userId);
    });
    const profitScoreRank = sortedByProfitScore.findIndex(u => u.userId === userId) + 1;

    // Most Predictions rank (stable sort by userId)
    const sortedByPredictionCount = [...leaderboardWithOverall].sort((a, b) => {
      if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
      return a.userId.localeCompare(b.userId);
    });
    const predictionCountRank = sortedByPredictionCount.findIndex(u => u.userId === userId) + 1;

    // Highest Single Win rank (stable sort by userId)
    const sortedByHighestWin = [...leaderboardWithOverall.filter(u => u.highestSingleWin > 0)].sort((a, b) => {
      if (b.highestSingleWin !== a.highestSingleWin) return b.highestSingleWin - a.highestSingleWin;
      return a.userId.localeCompare(b.userId);
    });
    const highestSingleWinRank = sortedByHighestWin.length > 0 && sortedByHighestWin.findIndex(u => u.userId === userId) >= 0
      ? sortedByHighestWin.findIndex(u => u.userId === userId) + 1
      : totalUsers;

    // Most Active rank (stable sort by userId)
    const sortedByActive = [...leaderboardWithOverall].sort((a, b) => {
      if (b.avgReloadPerDay !== a.avgReloadPerDay) return b.avgReloadPerDay - a.avgReloadPerDay;
      return a.userId.localeCompare(b.userId);
    });
    const activeRank = sortedByActive.findIndex(u => u.userId === userId) + 1;

    // ── Fetch user basic info ──
    const { data: targetUser, error: userError } = await supabase
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
    const mostOrangeAmmoRank = profitScoreRank;
    const rankInfo = getRankFromPosition(mostOrangeAmmoRank, totalUsers);

    return NextResponse.json({
      ok: true,
      data: {
        name: targetUser.display_name || targetUser.email.split("@")[0],
        displayName: targetUser.display_name || null,
        // Basic stats (from user table)
        profitScore: targetUser.lifetime_profit || 0,
        allTimeProfit: targetUser.lifetime_profit || 0,
        predictionCount: targetUserStats.predictionCount,
        highestSingleWin: targetUserStats.highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay: targetUserStats.avgReloadPerDay,
        // Rank data (calculated from all users)
        rank: mostOrangeAmmoRank,
        rankPercentile: mostOrangeAmmoRank / totalUsers,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        // Leaderboard ranks (calculated from all users)
        overallScore: targetUserStats.overall,
        overallRank,
        mostOrangeAmmoRank: profitScoreRank,
        mostPredictionsRank: predictionCountRank,
        highestSingleWinRank,
        mostActiveRank: activeRank,
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
    return createSafeErrorResponse(error);
  }
}
