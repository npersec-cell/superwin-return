import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// Logarithmic score calculation
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
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
      .select('id, display_name, email, lifetime_profit, role, created_at, reload_count, avatar_url')
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
      .select('id, user_id, amount, payout_amount, status')
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
      avgReloadPerDay: number;
      reloadCount: number;
    }>();
    
    for (const u of users || []) {
      userStats.set(u.id, {
        profitScore: u.lifetime_profit || 0,  // Use lifetime_profit (累计赢利), not profit_score (当前余额)
        predictionCount: 0,
        highestSingleWin: 0,
        avgReloadPerDay: 0,
        reloadCount: u.reload_count || 0
      });
    }
    
    // Calculate from entries
    for (const entry of (entries || [])) {
      const stat = userStats.get(entry.user_id);
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
    for (const [userId, stat] of userStats) {
      const user = users?.find(u => u.id === userId);
      if (user) {
        const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        stat.avgReloadPerDay = stat.reloadCount / daysSinceCreated;
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
      
      return {
        userId,
        displayName,
        avatarUrl: user?.avatar_url || null,
        ...stats
      };
    });
    
    // Calculate Overall score for each user using Logarithmic Score (sum, no cap)
    // Note: profitScore (green ammo) is NOT used in leaderboard calculations
    // It's only used for NUMBER WAR page
    const leaderboardWithOverall = leaderboardData.map(user => {
      // Only count active score if user has actual prediction activity
      const hasActivity = user.predictionCount > 0;
      
      // Calculate log score for each category (excluding profitScore)
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = hasActivity ? calcLogScore(user.avgReloadPerDay) : 0;
      
      // Sum of scores (no cap, balanced, no decimals)
      // Overall = Most Predictions + Highest Single Win + Most Active
      const overall = Math.round(predictionScore + winScore + activeScore);
      
      return {
        ...user,
        overall,
        hasActivity
      };
    });
    
    // Create leaderboards for each category
    const totalUsers = leaderboardWithOverall.length; // Total active users
    
    // For Overall ranking, only include users who have actual activity
    const activeUsers = leaderboardWithOverall.filter(u => u.hasActivity);
    const totalActiveUsers = activeUsers.length;
    
    const leaderboards = {
      overall: activeUsers
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
          if (b.avgReloadPerDay !== a.avgReloadPerDay) return b.avgReloadPerDay - a.avgReloadPerDay;
          return a.userId.localeCompare(b.userId); // stable sort by userId
        })
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.avgReloadPerDay }))
    };
    
    // Calculate user's rank if userId is provided
    let userRankData = null;
    if (userId) {
      const userPosition = leaderboardWithOverall.findIndex(u => u.userId === userId);
      if (userPosition >= 0) {
        const userStats = leaderboardWithOverall[userPosition];
        const userHasActivity = userStats.hasActivity;
        
        // Overall rank - only among active users (stable sort by userId)
        let overallRank;
        if (userHasActivity) {
          const sortedActive = [...activeUsers].sort((a, b) => {
            if (b.overall !== a.overall) return b.overall - a.overall;
            return a.userId.localeCompare(b.userId);
          });
          const activeRank = sortedActive.findIndex(u => u.userId === userId);
          overallRank = activeRank >= 0 ? activeRank + 1 : totalActiveUsers + 1;
        } else {
          overallRank = totalActiveUsers + 1;
        }
        
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
          if (b.avgReloadPerDay !== a.avgReloadPerDay) return b.avgReloadPerDay - a.avgReloadPerDay;
          return a.userId.localeCompare(b.userId);
        });
        const activeRank = sortedByActive.findIndex(u => u.userId === userId) + 1;
        
        userRankData = {
          overallRank,
          profitScore: userStats.profitScore,
          profitScoreRank,
          predictionCount: userStats.predictionCount,
          predictionCountRank,
          highestSingleWin: userStats.highestSingleWin,
          highestSingleWinRank,
          avgReloadPerDay: userStats.avgReloadPerDay,
          activeRank,
          totalUsers,
          totalActiveUsers,
          userHasActivity
        };
      }
    }
    
    return NextResponse.json({
      leaderboards,
      totalUsers,
      userRankData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
