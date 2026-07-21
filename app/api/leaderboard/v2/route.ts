import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

// Cache leaderboard for 30 seconds to reduce Supabase load
// Revalidate on each request after cache expires (stale-while-revalidate)
export const revalidate = 30;

// Calculate percentile rank (0-100)
// Higher value = higher percentile
function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  let rank = sorted.filter(v => v < value).length + 1; // 1-based
  return ((rank / allValues.length)) * 100;
}

// Mask name function
function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    
    // Get all users with their stats (exclude admin and test accounts)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, email, coin_balance, lifetime_profit, role, created_at, claim_count, avatar_url')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%')
      .order('lifetime_profit', { ascending: false });
    
    if (usersError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
    
    // Get prediction entries for all users (count all settled entries: won, lost, refunded)
    const userIds = users?.map(u => u.id) || [];
    const { data: entries, error: entriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, prediction_id, amount, payout_amount, status')
      .in('user_id', userIds)
      .in('status', ['won', 'lost', 'refunded']);
    
    if (entriesError) {
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
    
    // Calculate stats for each user
    const userStats = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgClaimPerDay: number;
      claimCount: number;
      predictedQuestionIds: Set<string>;
    }>();
    
    for (const u of users || []) {
      userStats.set(u.id, {
        profitScore: Number(u.coin_balance) || 0,  // Use coin_balance (Orange Ammo)
        predictionCount: 0,
        highestSingleWin: 0,
        avgClaimPerDay: 0,
        claimCount: u.claim_count || 0,
        predictedQuestionIds: new Set<string>()
      });
    }
    
    // Calculate from entries
    for (const entry of (entries || [])) {
      const stat = userStats.get(entry.user_id);
      if (stat) {
        // Count unique questions only (1 per question max, regardless of how many times predicted)
        if (entry.prediction_id) {
          stat.predictedQuestionIds.add(entry.prediction_id);
        }
        // Only calculate highestSingleWin for WON entries
        if (entry.status === 'won') {
          const profit = entry.payout_amount - entry.amount;
          if (profit > stat.highestSingleWin) {
            stat.highestSingleWin = profit;
          }
        }
      }
    }
    
    // Set predictionCount to unique question count
    for (const [_, stat] of userStats) {
      stat.predictionCount = stat.predictedQuestionIds.size;
    }
    
    // Calculate average claim per day for each user
    for (const [userId, stat] of userStats) {
      const user = users?.find(u => u.id === userId);
      if (user) {
        const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        stat.avgClaimPerDay = stat.claimCount / daysSinceCreated;
      }
    }
    
    // Build leaderboard data - use masked email if display_name is null
    const leaderboardData = Array.from(userStats.entries()).map(([userId, stats]) => {
      const user = users?.find(u => u.id === userId);
      let displayName = user?.display_name;
      
      // If no display_name, use masked email prefix
      if (!displayName) {
        const emailPrefix = user?.email?.split('@')[0];
        displayName = emailPrefix ? maskName(emailPrefix) : 'Userxx';
      }
      
      // Exclude internal tracking fields from response
      const { predictedQuestionIds, ...publicStats } = stats;
      
      return {
        userId,
        displayName,
        avatarUrl: user?.avatar_url || null,
        ...publicStats
      };
    });
    
    // Prepare arrays for percentile calculation
    const allCoinBalances = leaderboardData.map(u => u.profitScore);
    const allPredCounts = leaderboardData.map(u => u.predictionCount);
    const allHighestWins = leaderboardData.map(u => u.highestSingleWin);
    const allAvgClaims = leaderboardData.map(u => u.avgClaimPerDay);
    
    // Calculate Overall score for each user using Percentile Score (0-100)
    // Each category contributes equally (25% weight)
    // Overall = Average of 4 percentiles
    const leaderboardWithOverall = leaderboardData.map(user => {
      // Calculate percentile for each category (0-100)
      const orangePct = getPercentile(user.profitScore, allCoinBalances);       // Most Orange Ammo
      const predPct = getPercentile(user.predictionCount, allPredCounts);       // Most Predictions
      const winPct = getPercentile(user.highestSingleWin, allHighestWins);       // Highest Single Win
      const activePct = getPercentile(user.avgClaimPerDay, allAvgClaims);        // Most Active
      
      // Average of all percentiles (0-100)
      const overall = Math.round((orangePct + predPct + winPct + activePct) / 4);
      
      const hasActivity = user.predictionCount > 0;
      
      return {
        ...user,
        overall,
        orangePct,
        predPct,
        winPct,
        activePct,
        hasActivity
      };
    });
    
    // Create leaderboards for each category
    const totalUsers = leaderboardWithOverall.length;
    
    // For Overall ranking, include ALL users (not just active users)
    // This ensures rank consistency between Leaderboard table and Profile modal
    const leaderboards = {
      overall: leaderboardWithOverall
        .slice()
        .sort((a, b) => {
          if (b.overall !== a.overall) return b.overall - a.overall;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      
      overallAll: leaderboardWithOverall
        .slice()
        .sort((a, b) => {
          if (b.overall !== a.overall) return b.overall - a.overall;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      
      overallActive: leaderboardWithOverall
        .filter(u => u.hasActivity)
        .slice()
        .sort((a, b) => {
          if (b.overall !== a.overall) return b.overall - a.overall;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      
      activeUsersCount: leaderboardWithOverall.filter(u => u.hasActivity).length,
      
      mostOrangeAmmo: leaderboardWithOverall
        .slice()
        .sort((a, b) => {
          if (b.profitScore !== a.profitScore) return b.profitScore - a.profitScore;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.profitScore, profitScore: u.profitScore })),
      
      mostPredictions: leaderboardWithOverall
        .slice()
        .sort((a, b) => {
          if (b.predictionCount !== a.predictionCount) return b.predictionCount - a.predictionCount;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.predictionCount })),
      
      highestSingleWin: leaderboardWithOverall
        .filter(u => u.highestSingleWin > 0)
        .slice()
        .sort((a, b) => {
          if (b.highestSingleWin !== a.highestSingleWin) return b.highestSingleWin - a.highestSingleWin;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.highestSingleWin })),
      
      mostActive: leaderboardWithOverall
        .slice()
        .sort((a, b) => {
          if (b.avgClaimPerDay !== a.avgClaimPerDay) return b.avgClaimPerDay - a.avgClaimPerDay;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.avgClaimPerDay }))
    };
    
    // Calculate user's rank if userId is provided
    let userRankData = null;
    if (userId) {
      const userPosition = leaderboardWithOverall.findIndex(u => u.userId === userId);
      if (userPosition >= 0) {
        const userStats = leaderboardWithOverall[userPosition];
        const userHasActivity = userStats.hasActivity;
        
        // Overall rank - include ALL users (not just active users) for consistency with Profile
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
        const highestSingleWinRank = sortedByHighestWin.findIndex(u => u.userId === userId) >= 0 
          ? sortedByHighestWin.findIndex(u => u.userId === userId) + 1
          : totalUsers;
        
        // Most Active rank (stable sort by userId)
        const sortedByActive = [...leaderboardWithOverall].sort((a, b) => {
          if ((b as any).avgClaimPerDay !== (a as any).avgClaimPerDay) return (b as any).avgClaimPerDay - (a as any).avgClaimPerDay;
          return a.userId.localeCompare(b.userId);
        });
        const activeRank = sortedByActive.findIndex(u => u.userId === userId) + 1;
        
        userRankData = {
          overallRank,
          overallScore: userStats.overall,
          profitScore: userStats.profitScore,
          profitScoreRank,
          predictionCount: userStats.predictionCount,
          predictionCountRank,
          highestSingleWin: userStats.highestSingleWin,
          highestSingleWinRank,
          avgClaimPerDay: userStats.avgClaimPerDay,
          activeRank,
          totalUsers,
          totalActiveUsers: leaderboardWithOverall.filter(u => u.hasActivity).length,
          userHasActivity
        };
      }
    }
    
    return NextResponse.json({
      leaderboards,
      totalUsers,
      userRankData,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
