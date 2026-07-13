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

// Logarithmic score calculation (same as v2 API)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "";

    if (!userId) {
      return NextResponse.json({ 
        ok: false, 
        error: "userId is required",
        data: null 
      }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // ── Fetch ALL users from DB directly (no API call) ──
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, email, lifetime_profit, role, created_at, reload_count')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');
    
    if (usersError) {
      console.error("[Profile] Error fetching users:", usersError);
      return NextResponse.json({ 
        ok: false, 
        error: "Failed to fetch users from database",
        data: null 
      }, { status: 500 });
    }

    // ── Fetch ALL prediction entries ──
    const userIds = users?.map(u => u.id) || [];
    const { data: entries, error: entriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, amount, payout_amount, status')
      .in('user_id', userIds)
      .in('status', ['won', 'lost', 'refunded']);
    
    if (entriesError) {
      console.error("[Profile] Error fetching entries:", entriesError);
      return NextResponse.json({ 
        ok: false, 
        error: "Failed to fetch entries from database",
        data: null 
      }, { status: 500 });
    }

    // ── Calculate stats for each user (same logic as v2 API) ──
    const userStats = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgReloadPerDay: number;
      reloadCount: number;
      hasActivity: boolean;
    }>();
    
    for (const u of users || []) {
      userStats.set(u.id, {
        profitScore: u.lifetime_profit || 0,
        predictionCount: 0,
        highestSingleWin: 0,
        avgReloadPerDay: 0,
        reloadCount: u.reload_count || 0,
        hasActivity: false
      });
    }
    
    // Calculate from entries
    for (const entry of (entries || [])) {
      const stat = userStats.get(entry.user_id);
      if (stat) {
        stat.predictionCount++;
        stat.hasActivity = true;
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
    for (const [uid, stat] of userStats) {
      const user = users?.find(u => u.id === uid);
      if (user) {
        const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        stat.avgReloadPerDay = stat.reloadCount / daysSinceCreated;
      }
    }
    
    // ── Build leaderboard data ──
    const leaderboardData = Array.from(userStats.entries()).map(([userId, stats]) => {
      const user = users?.find(u => u.id === userId);
      return {
        userId,
        displayName: user?.display_name || user?.email?.split('@')[0] || 'Userxx',
        ...stats
      };
    });
    
    // ── Calculate Overall score for each user ──
    const leaderboardWithOverall = leaderboardData.map(user => {
      const orangeAmmoScore = calcLogScore(user.profitScore);
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = user.hasActivity ? calcLogScore(user.avgReloadPerDay) : 0;
      
      const overall = Math.round(orangeAmmoScore + predictionScore + winScore + activeScore);
      
      return {
        ...user,
        overall,
        hasActivity: user.hasActivity
      };
    });

    // ── Filter to ONLY ACTIVE users (same as Leaderboard table) ──
    const activeUsers = leaderboardWithOverall.filter(u => 
      u.hasActivity || u.predictionCount > 0 || u.profitScore > 0 || u.overall > 0
    );
    
    // Total counts
    const totalUsers = leaderboardData.length;
    const totalActiveUsers = activeUsers.length;

    // ── Sort ACTIVE users and find user's rank ──
    const sortedActiveOverall = [...activeUsers].sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.userId.localeCompare(b.userId);
    });
    
    // Find user in sorted ACTIVE leaderboard (this matches Leaderboard table exactly)
    const userPosition = sortedActiveOverall.findIndex(u => u.userId === userId);
    const overallRank = userPosition >= 0 ? userPosition + 1 : totalActiveUsers + 1;
    const overallScore = userPosition >= 0 ? sortedActiveOverall[userPosition].overall : 0;
    
    // Get user's stats directly
    const userStatsData = activeUsers.find(u => u.userId === userId) || {
      profitScore: 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay: 0
    };

    // Calculate rank tier from overallRank
    const rankInfo = getRankFromPosition(overallRank, totalActiveUsers);

    // ── Fetch user basic info ──
    const targetUser = users?.find(u => u.id === userId);
    if (!targetUser) {
      return NextResponse.json({ 
        ok: false, 
        error: "User not found",
        data: null 
      }, { status: 404 });
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

    return NextResponse.json({
      ok: true,
      error: null,
      data: {
        name: targetUser.display_name || targetUser.email?.split("@")[0] || "User",
        displayName: targetUser.display_name || null,
        profitScore: userStatsData.profitScore,
        allTimeProfit: userStatsData.profitScore,
        predictionCount: userStatsData.predictionCount,
        highestSingleWin: userStatsData.highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay: userStatsData.avgReloadPerDay,
        rank: overallRank,
        rankPercentile: totalActiveUsers > 0 ? overallRank / totalActiveUsers : 0,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        totalActiveUsers,
        overallScore,
        overallRank,
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
  } catch (error: any) {
    console.error("[Profile] API Error:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "Internal server error",
      data: null 
    }, { status: 500 });
  }
}
