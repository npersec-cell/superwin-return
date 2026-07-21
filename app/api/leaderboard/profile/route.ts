import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";
import { maskName } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Calculate percentile rank (0-100)
// Higher value = higher percentile
function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  let rank = sorted.filter(v => v < value).length + 1; // 1-based
  return ((rank / allValues.length)) * 100;
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
      .select('id, display_name, email, coin_balance, lifetime_profit, role, created_at, claim_count')
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
      .select('id, user_id, prediction_id, amount, payout_amount, status, created_at')
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
      avgClaimPerDay: number;
      overall: number;
    }>();

    // Prepare arrays for percentile calculation
    const allCoinBalances: number[] = [];
    const allPredCounts: number[] = [];
    const allHighestWins: number[] = [];
    const allAvgClaims: number[] = [];

    for (const user of allUsers) {
      const userEntries = allEntries.filter(e => e.user_id === user.id);
      const wonEntries = userEntries.filter(e => e.status === 'won');
      
      const profitScore = Number(user.coin_balance) || 0;
      // Count unique questions only (1 per question max, regardless of how many times predicted)
      const uniqueQuestionIds = new Set(userEntries.map(e => e.prediction_id).filter(Boolean));
      const predictionCount = uniqueQuestionIds.size;
      const highestSingleWin = wonEntries.length > 0
        ? Math.max(...wonEntries.map(e => (e.payout_amount || 0) - e.amount))
        : 0;
      
      // Calculate average claim per day (from claim_count and account age)
      const createdAt = new Date(user.created_at);
      const daysActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const avgClaimPerDay = (user.claim_count || 0) / daysActive;
      
      // Collect values for percentile calculation
      allCoinBalances.push(profitScore);
      allPredCounts.push(predictionCount);
      allHighestWins.push(highestSingleWin);
      allAvgClaims.push(avgClaimPerDay);

      userStatsMap.set(user.id, {
        profitScore,
        predictionCount,
        highestSingleWin,
        avgClaimPerDay,
        overall: 0 // Will be calculated after all data is collected
      });
    }

    // Calculate Overall score using Percentile Score (0-100)
    // Each category contributes equally (25% weight)
    for (const userId of userStatsMap.keys()) {
      const stats = userStatsMap.get(userId)!;
      const profitScore = stats.profitScore;
      const predictionCount = stats.predictionCount;
      const highestSingleWin = stats.highestSingleWin;
      const avgClaimPerDay = stats.avgClaimPerDay;
      
      // Calculate percentile for each category (0-100)
      const orangePct = getPercentile(profitScore, allCoinBalances);
      const predPct = getPercentile(predictionCount, allPredCounts);
      const winPct = getPercentile(highestSingleWin, allHighestWins);
      const activePct = getPercentile(avgClaimPerDay, allAvgClaims);
      
      // Average of all percentiles (0-100)
      const overall = Math.round((orangePct + predPct + winPct + activePct) / 4);
      
      stats.overall = overall;
    }

    // Convert to array and sort
    const leaderboardData = allUsers.map(u => ({
      userId: u.id,
      displayName: u.display_name || maskName(u.email.split('@')[0]),
      profitScore: userStatsMap.get(u.id)?.profitScore || 0,
      predictionCount: userStatsMap.get(u.id)?.predictionCount || 0,
      highestSingleWin: userStatsMap.get(u.id)?.highestSingleWin || 0,
      avgClaimPerDay: userStatsMap.get(u.id)?.avgClaimPerDay || 0,
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
      avgClaimPerDay: 0,
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
      if (b.avgClaimPerDay !== a.avgClaimPerDay) return b.avgClaimPerDay - a.avgClaimPerDay;
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
    } else if (((targetStats as any).avgClaimPerDay || 0) >= 500 && totalSettled >= 5) {
      badge = "High Roller";
      badgeDesc = "Wages massive coin stacks on predictions.";
    } else if (totalSettled >= 8) {
      badge = "Active Predictor";
      badgeDesc = "Experienced and consistent prediction rate.";
    }

    return NextResponse.json({
      ok: true,
      data: {
        name: targetUser.display_name || maskName(targetUser.email.split("@")[0]),
        displayName: targetUser.display_name || maskName(targetUser.email.split("@")[0]),
        // Basic stats
        coinBalance: targetStats.profitScore,
        predictionCount: targetStats.predictionCount,
        highestSingleWin: targetStats.highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgClaimPerDay: (targetStats as any).avgClaimPerDay,
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
