import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// Logarithmic score calculation (EXACTLY same as v2 API)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

// Get rank tier from position - EXACTLY same logic as Leaderboard page
function getRankFromPosition(rank: number, totalUsers: number): { name: string; icon: string } {
  if (totalUsers === 0) return { name: "Bronze", icon: "/ranks/bronze.png" };
  
  // Crown: #1 only (the absolute best)
  if (rank === 1) return { name: "Crown", icon: "/ranks/crown.png" };
  
  // Helper to check minimum count for each rank tier
  function minForTier(tierPercent: number): number {
    return Math.max(1, Math.ceil(totalUsers * tierPercent / 100));
  }
  
  // Conqueror: Top 3% OR at least 2 people
  const minConqueror = Math.max(2, minForTier(3));
  if (rank <= minConqueror) return { name: "Conqueror", icon: "/ranks/conqueror.png" };
  
  // Ace: Top 8% OR at least 3 people
  const minAce = Math.max(3, minForTier(8));
  if (rank <= minAce) return { name: "Ace", icon: "/ranks/ace.png" };
  
  // Diamond: Top 15% OR at least 5 people
  const minDiamond = Math.max(5, minForTier(15));
  if (rank <= minDiamond) return { name: "Diamond", icon: "/ranks/diamond.png" };
  
  // Calculate percentile: higher = better (100 = top)
  const percentile = ((totalUsers - rank) / totalUsers) * 100;
  
  // Platinum: Top 25%
  if (percentile >= 50) return { name: "Platinum", icon: "/ranks/platinum.png" };
  // Gold: Top 40%
  if (percentile >= 40) return { name: "Gold", icon: "/ranks/gold.png" };
  // Silver: 40-70%
  if (percentile >= 15) return { name: "Silver", icon: "/ranks/silver.png" };
  // Bronze: Bottom 30%
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

// Mask name function
function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
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

    // ── Fetch ALL users from DB (EXACTLY same as v2 API) ──
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, display_name, email, lifetime_profit, role, created_at, reload_count, avatar_url')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%')
      .order('lifetime_profit', { ascending: false });
    
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

    // ── Calculate stats for each user (EXACTLY same as v2 API) ──
    const userStats = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgReloadPerDay: number;
      reloadCount: number;
    }>();
    
    for (const u of users || []) {
      userStats.set(u.id, {
        profitScore: u.lifetime_profit || 0,
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
    
    // ── Build leaderboard data (EXACTLY same as v2 API) ──
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

    // ── Calculate Overall score for each user (EXACTLY same as v2 API) ──
    const leaderboardWithOverall = leaderboardData.map(user => {
      const hasActivity = user.predictionCount > 0;
      
      const orangeAmmoScore = calcLogScore(user.profitScore);
      const predictionScore = calcLogScore(user.predictionCount);
      const winScore = calcLogScore(user.highestSingleWin);
      const activeScore = hasActivity ? calcLogScore(user.avgReloadPerDay) : 0;
      
      const overall = Math.round(orangeAmmoScore + predictionScore + winScore + activeScore);
      
      return {
        ...user,
        overall,
        hasActivity
      };
    });

    // ── Get ONLY ACTIVE users (hasActivity = true) ──
    const activeUsers = leaderboardWithOverall.filter(u => u.hasActivity);
    const totalActiveUsers = activeUsers.length;
    const totalUsers = leaderboardWithOverall.length;

    // ── Sort ONLY ACTIVE users by Overall Score (EXACTLY same as v2 API's overallActive) ──
    const sortedActiveOverall = [...activeUsers].sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.userId.localeCompare(b.userId);
    });

    // ── Find user's position in sorted active users (EXACT INDEX MATCHING) ──
    const userPosition = sortedActiveOverall.findIndex(u => u.userId === userId);
    const overallRank = userPosition >= 0 ? userPosition + 1 : totalActiveUsers + 1;
    const overallScore = userPosition >= 0 ? sortedActiveOverall[userPosition].overall : 0;

    // ── Get user's data from the sorted list ──
    const userStatsData = userPosition >= 0 ? sortedActiveOverall[userPosition] : {
      profitScore: 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay: 0
    };

    // Get target user from DB
    const targetUser = users?.find(u => u.id === userId);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: "User not found", data: null }, { status: 404 });
    }

    // Fetch history entries
    const { data: historyEntries } = await supabase
      .from("prediction_entries")
      .select(`
        id, prediction_id, option_id, amount, payout_amount, status, created_at,
        predictions ( id, question, tournament_name, resolved_at )
      `)
      .eq("user_id", userId)
      .in("status", ["won", "lost"])
      .order("created_at", { ascending: false });

    // Calculate win/loss stats
    let wonCount = 0, lostCount = 0;
    for (const e of historyEntries || []) {
      if (e.status === "won") wonCount++;
      else lostCount++;
    }
    const totalSettled = historyEntries?.length || 0;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    // Fetch option labels
    const optionIds = [...new Set((historyEntries || []).map((e: any) => e.option_id).filter(Boolean))] as string[];
    const optionsMap = new Map<string, string>();
    if (optionIds.length > 0) {
      const { data: opts } = await supabase.from("prediction_options").select("id, label").in("id", optionIds);
      if (opts) for (const o of opts) optionsMap.set(o.id, o.label);
    }

    // Build history
    const sortedEntries = [...(historyEntries || [])].sort((a: any, b: any) => {
      return new Date(b.predictions?.resolved_at || b.created_at).getTime() - 
             new Date(a.predictions?.resolved_at || a.created_at).getTime();
    });

    const history = sortedEntries.slice(0, 5).map((e: any) => {
      const pred = e.predictions || {};
      const isWon = e.status === "won";
      const net = isWon ? (e.payout_amount || 0) - e.amount : -e.amount;
      
      return {
        id: e.id,
        tournament: pred.tournament_name || "Prediction",
        question: pred.question || "Unknown Question",
        pick: e.option_id ? (optionsMap.get(e.option_id) || "") : "",
        amount: e.amount,
        payout: e.payout_amount || 0,
        status: isWon ? "won" : "lost",
        net,
        date: new Date(pred.resolved_at || e.created_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "short"
        })
      };
    });

    // Calculate rank tier using EXACT same logic as Leaderboard page
    const rankInfo = getRankFromPosition(overallRank, totalActiveUsers);

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
        winRate, wonCount, lostCount, totalSettled,
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
