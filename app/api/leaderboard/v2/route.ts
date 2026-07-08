import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db';

// Calculate average reloads per day for a user
function calcAvgReloadPerDay(reloadCount: number | null, createdAt: string | null): number {
  if (!reloadCount || reloadCount === 0 || !createdAt) return 0;
  
  const created = new Date(createdAt);
  const now = new Date();
  const days = Math.max(1, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
  
  return Math.round((reloadCount / days) * 100) / 100; // 2 decimal places
}

// Logarithmic score calculation (sum of logs, no cap)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

export async function GET() {
  const supabase = createSupabaseAdminClient();
  
  // Get all users with their stats
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, display_name, email, profit_score, role, created_at, reload_count')
    .neq('role', 'admin')
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
  
  // Initialize with user data
  for (const user of users) {
    const reloadCount = user.reload_count || 0;
    const avgReloadPerDay = calcAvgReloadPerDay(reloadCount, user.created_at);
    
    userStats.set(user.id, {
      profitScore: user.profit_score || 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay,
      reloadCount
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
  
  // Build leaderboard data - use email if display_name is null
  const leaderboardData = Array.from(userStats.entries()).map(([userId, stats]) => {
    const user = users?.find(u => u.id === userId);
    const displayName = user?.display_name || user?.email?.split('@')[0] || 'User';
    
    return {
      userId,
      displayName,
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
    const overall = Math.round(log2(profitScore + 1) + Math.log2(predictionCount + 1) + Math.log2(highestSingleWin + 1) + Math.log2(avgReloadPerDay + 1));
    
    return {
      ...user,
      overall
    };
  });
  
  // Create leaderboards for each category (top 20)
  const leaderboards = {
    overall: leaderboardWithOverall
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, value: u.overall })),
    
    mostOrangeAmmo: leaderboardWithOverall
      .sort((a, b) => b.profitScore - a.profitScore)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, value: u.profitScore })),
    
    mostPredictions: leaderboardWithOverall
      .sort((a, b) => b.predictionCount - a.predictionCount)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, value: u.predictionCount })),
    
    highestSingleWin: leaderboardWithOverall
      .filter(u => u.highestSingleWin > 0)
      .sort((a, b) => b.highestSingleWin - a.highestSingleWin)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, value: u.highestSingleWin })),
    
    mostActive: leaderboardWithOverall
      .sort((a, b) => b.avgReloadPerDay - a.avgReloadPerDay)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, userId: u.userId, displayName: u.displayName, value: u.avgReloadPerDay }))
  };
  
  return NextResponse.json({
    leaderboards,
    timestamp: new Date().toISOString()
  });
}
