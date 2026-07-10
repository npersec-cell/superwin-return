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
      .select('id, display_name, email, profit_score, role, created_at, reload_count, avatar_url')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%')
      .order('profit_score', { ascending: false });
    
    if (usersError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
    
    // Get prediction entries for all users
    const userIds = users?.map(u => u.id) || [];
    const { data: entries, error: entriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, amount, payout_amount, status')
      .in('user_id', userIds)
      .eq('status', 'won');
    
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
        profitScore: u.profit_score || 0,
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
        const profit = entry.payout_amount - entry.amount;
        if (profit > stat.highestSingleWin) {
          stat.highestSingleWin = profit;
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
    const leaderboardWithOverall = leaderboardData.map(user => {
      // Only count active score if user has actual prediction activity
      // Otherwise, they shouldn't benefit from reload_count
      const hasActivity = user.predictionCount > 0 || user.profitScore > 0;
      
      // Calculate log score for each category
      const profitScore = calcLogScore(user.profitScore);
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = hasActivity ? calcLogScore(user.avgReloadPerDay) : 0;
      
      // Sum of all scores (no cap, balanced, no decimals)
      const overall = Math.round(profitScore + predictionScore + winScore + activeScore);
      
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
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      overallAll: leaderboardWithOverall
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      
      mostOrangeAmmo: leaderboardWithOverall
        .filter(u => u.profitScore > 0)
        .sort((a, b) => b.profitScore - a.profitScore)
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.profitScore, profitScore: u.profitScore })),
      
      mostPredictions: leaderboardWithOverall
        .filter(u => u.predictionCount > 0)
        .sort((a, b) => b.predictionCount - a.predictionCount)
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.predictionCount })),
      
      highestSingleWin: leaderboardWithOverall
        .filter(u => u.highestSingleWin > 0)
        .sort((a, b) => b.highestSingleWin - a.highestSingleWin)
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.highestSingleWin })),
      
      mostActive: leaderboardWithOverall
        .sort((a, b) => b.avgReloadPerDay - a.avgReloadPerDay)
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
        
        // Overall rank - only among active users
        let overallRank;
        if (userHasActivity) {
          const activeRank = activeUsers.findIndex(u => u.userId === userId);
          overallRank = activeRank >= 0 ? activeRank + 1 : totalActiveUsers + 1;
        } else {
          // If user has no activity, they're not in the active leaderboard
          overallRank = totalActiveUsers + 1;
        }
        
        // Most Orange Ammo rank
        const sortedByProfitScore = [...leaderboardWithOverall].sort((a, b) => b.profitScore - a.profitScore);
        const profitScoreRank = sortedByProfitScore.findIndex(u => u.userId === userId) + 1;
        
        // Most Predictions rank
        const sortedByPredictionCount = [...leaderboardWithOverall].sort((a, b) => b.predictionCount - a.predictionCount);
        const predictionCountRank = sortedByPredictionCount.findIndex(u => u.userId === userId) + 1;
        
        // Highest Single Win rank
        const sortedByHighestWin = [...leaderboardWithOverall.filter(u => u.highestSingleWin > 0)].sort((a, b) => b.highestSingleWin - a.highestSingleWin);
        const highestSingleWinRank = sortedByHighestWin.findIndex(u => u.userId === userId) >= 0 
          ? sortedByHighestWin.findIndex(u => u.userId === userId) + 1
          : totalUsers; // If no win, rank = totalUsers
        
        // Most Active rank
        const sortedByActive = [...leaderboardWithOverall].sort((a, b) => b.avgReloadPerDay - a.avgReloadPerDay);
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
