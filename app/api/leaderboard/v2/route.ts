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
      // Calculate log score for each category
      const profitScore = calcLogScore(user.profitScore);
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = calcLogScore(user.avgReloadPerDay);
      
      // Sum of all scores (no cap, balanced, no decimals)
      const overall = Math.round(profitScore + predictionScore + winScore + activeScore);
      
      return {
        ...user,
        overall
      };
    });
    
    // Create leaderboards for each category
    const totalUsers = leaderboardWithOverall.length; // Total active users
    
    const leaderboards = {
      overall: leaderboardWithOverall
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 15)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.overall })),
      
      mostOrangeAmmo: leaderboardWithOverall
        .sort((a, b) => b.profitScore - a.profitScore)
        .slice(0, 20)
        .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl, value: u.profitScore, profitScore: u.profitScore })),
      
      mostPredictions: leaderboardWithOverall
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
    
    return NextResponse.json({
      leaderboards,
      totalUsers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
