import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

// Logarithmic score calculation
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

    // ── Calculate rank directly from database (no API-to-API call) ──
    // Get all users with their stats
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, email, coin_balance, lifetime_profit, role, created_at, reload_count')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');

    if (usersError || !allUsers) {
      return NextResponse.json({ ok: false, error: "Failed to fetch users" }, { status: 500 });
    }

    const userIds = allUsers.map(u => u.id);

    // Get all prediction entries for rank calculation
    const { data: allEntries, error: entriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, amount, payout_amount, status, created_at')
      .in('user_id', userIds)
      .in('status', ['won', 'lost', 'refunded']);

    if (entriesError || !allEntries) {
      return NextResponse.json({ ok: false, error: "Failed to fetch entries" }, { status: 500 });
    }

    // Calculate stats for each user
    const userStatsMap = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgReloadPerDay: number;
      overall: number;
    }>();

    for (const user of allUsers) {
      const userEntries = allEntries.filter(e => e.user_id === user.id);
      const wonEntries = userEntries.filter(e => e.status === 'won');
      
      const profitScore = user.coin_balance || 0;
      const predictionCount = userEntries.length;
      const highestSingleWin = wonEntries.length > 0
        ? Math.max(...wonEntries.map(e => (e.payout_amount || 0) - e.amount))
        : 0;
      
      // Calculate average reload per day (from reload_count and account age)
      const createdAt = new Date(user.created_at);
      const daysActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const avgReloadPerDay = (user.reload_count || 0) / daysActive;
      
      // Overall score = sum of all component scores
      // All users are included in the calculation, inactive users get 0 for activity-related scores
      const orangeAmmoScore = calcLogScore(profitScore);
      const predictionScore = calcLogScore(predictionCount);
      const winScore = calcLogScore(highestSingleWin);
      const activeScore = calcLogScore(avgReloadPerDay); // Always calculate, 0 for inactive users
      const overall = Math.round(orangeAmmoScore + predictionScore + winScore + activeScore);

      // Debug log for arther0945
      if (user.id.includes('arther0945') || user.email?.includes('arther0945')) {
        console.log('[DEBUG] arther0945 stats:', {
          profitScore,
          predictionCount,
          highestSingleWin,
          avgReloadPerDay,
          orangeAmmoScore,
          predictionScore,
          winScore,
          activeScore,
          overall
        });
      }

      userStatsMap.set(user.id, {
        profitScore,
        predictionCount,
        highestSingleWin,
        avgReloadPerDay,
        overall
      });
    }

    // Convert to array and sort
    const leaderboardData = allUsers.map(u => ({
      userId: u.id,
      displayName: u.display_name || u.email.split('@')[0],
      profitScore: userStatsMap.get(u.id)?.profitScore || 0,
      predictionCount: userStatsMap.get(u.id)?.predictionCount || 0,
      highestSingleWin: userStatsMap.get(u.id)?.highestSingleWin || 0,
      avgReloadPerDay: userStatsMap.get(u.id)?.avgReloadPerDay || 0,
      overall: userStatsMap.get(u.id)?.overall || 0
    }));

    const totalUsers = leaderboardData.length;

    // Find target user
    const targetUser = allUsers.find(u => u.id === userId);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const targetStats = userStatsMap.get(userId) || {
      profitScore: 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay: 0,
      overall: 0
    };

    // Calculate ranks (using stable sort with userId as tiebreaker - same as v2 API)
    // Overall rank
    const sortedOverall = [...leaderboardData].sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.userId.localeCompare(b.userId); // stable sort
    });
    const overallRank = sortedOverall.findIndex(u => u.userId === userId) + 1;
    const overallScore = targetStats.overall;

    // Most Orange Ammo rank (profitScore)
    const sortedByProfitScore = [...leaderboardData].sort((a, b) => {
      if (b.profitScore !== a.profitScore) return b.profitScore - a.profitScore;
      return a.userId.localeCompare(b.userId); // stable sort
    });
    const profitScoreRank = sortedByProfitScore.findIndex(u => u.userId === userId) + 1;

    // Most Predictions rank
    const sortedByPredictionCount = [...leaderboardData].sort((a, b) => {
      if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
      return a.userId.localeCompare(b.userId); // stable sort
    });
    const predictionCountRank = sortedByPredictionCount.findIndex(u => u.userId === userId) + 1;

    // Highest Single Win rank
    const sortedByHighestWin = [...leaderboardData.filter(u => u.highestSingleWin > 0)].sort((a, b) => {
      if (b.highestSingleWin !== a.highestSingleWin) return b.highestSingleWin - a.highestSingleWin;
      return a.userId.localeCompare(b.userId); // stable sort
    });
    const highestSingleWinRank = sortedByHighestWin.length > 0 && sortedByHighestWin.some(u => u.userId === userId)
      ? sortedByHighestWin.findIndex(u => u.userId === userId) + 1
      : totalUsers;

    // Most Active rank
    const sortedByActive = [...leaderboardData].sort((a, b) => {
      if (b.avgReloadPerDay !== a.avgReloadPerDay) return b.avgReloadPerDay - a.avgReloadPerDay;
      return a.userId.localeCompare(b.userId); // stable sort
    });
    const activeRank = sortedByActive.findIndex(u => u.userId === userId) + 1;

    // Get rank tier
    const rankInfo = getRankFromPosition(overallRank, totalUsers);

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

    // 4. คำนวณเหรียญตรา (Badge) พิเศษตามระดับความเทพ
    let badge = "Rookie";
    let badgeDesc = "New predictor in the arena.";
    if (totalSettled >= 10 && winRate >= 60) {
      badge = "Elite Sharpshooter";
      badgeDesc = "Extreme precision over multiple bets.";
    } else if ((targetStats.avgReloadPerDay || 0) >= 500 && totalSettled >= 5) {
      badge = "High Roller";
      badgeDesc = "Wages massive coin stacks on predictions.";
    } else if (totalSettled >= 8) {
      badge = "Active Predictor";
      badgeDesc = "Experienced and consistent prediction rate.";
    }

    return NextResponse.json({
      ok: true,
      data: {
        name: targetUser.display_name || targetUser.email.split("@")[0],
        displayName: targetUser.display_name || null,
        // Basic stats
        coinBalance: targetStats.profitScore,
        predictionCount: targetStats.predictionCount,
        highestSingleWin: targetStats.highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay: targetStats.avgReloadPerDay,
        // Rank data
        rank: overallRank,
        rankPercentile: overallRank / totalUsers,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        // Leaderboard ranks
        overallScore,
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
