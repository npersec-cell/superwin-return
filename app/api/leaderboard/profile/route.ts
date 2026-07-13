import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

// Logarithmic score calculation (same as v2 API)
function calcLogScore(value: number): number {
  return Math.log2(value + 1);
}

// Get rank from position with minimum counts
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
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
    }

    // ── ดึง user info ──
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("display_name, email, lifetime_profit, reload_count, created_at")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // ── ดึงทุก users สำหรับคำนวณ rank ──
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('id, display_name, email, lifetime_profit, reload_count, created_at')
      .neq('role', 'admin')
      .not('email', 'like', '%test%')
      .not('email', 'like', '%automated%');

    if (allUsersError) {
      console.error("[Profile] Error fetching users:", allUsersError);
    }

    // ── ดึงทุก entries สำหรับคำนวณ rank (count all settled: won, lost, refunded) ──
    const allUserIds = allUsers?.map(u => u.id) || [];
    const { data: allEntries, error: allEntriesError } = await supabase
      .from('prediction_entries')
      .select('id, user_id, amount, payout_amount, status')
      .in('user_id', allUserIds)
      .in('status', ['won', 'lost', 'refunded']);

    if (allEntriesError) {
      console.error("[Profile] Error fetching entries:", allEntriesError);
    }

    // ── คำนวณ stats สำหรับทุก user ──
    const userStatsMap = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgReloadPerDay: number;
      reloadCount: number;
    }>();

    for (const u of allUsers || []) {
      userStatsMap.set(u.id, {
        profitScore: u.lifetime_profit || 0,  // Use lifetime_profit (累计赢利), same as API v2
        predictionCount: 0,
        highestSingleWin: 0,
        avgReloadPerDay: 0,
        reloadCount: u.reload_count || 0
      });
    }

    // Calculate from entries
    for (const entry of (allEntries || [])) {
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
      const u = allUsers?.find(u => u.id === uid);
      if (u) {
        const daysSinceCreated = Math.max(1, Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        stat.avgReloadPerDay = stat.reloadCount / daysSinceCreated;
      }
    }

    // Convert to array and calculate Overall score
    // Note: profitScore (green ammo) is NOT used in leaderboard calculations
    // It's only used for NUMBER WAR page
    const allUsersData = Array.from(userStatsMap.entries()).map(([uid, stats]) => {
      const u = allUsers?.find(u => u.id === uid);
      const hasActivity = stats.predictionCount > 0;
      const predictionScore = calcLogScore(stats.predictionCount);
      const winScore = calcLogScore(stats.highestSingleWin);
      // Only count active score if user has actual activity
      const activeScore = hasActivity ? calcLogScore(stats.avgReloadPerDay) : 0;
      // Overall = Most Predictions + Highest Single Win + Most Active
      const overall = Math.round(predictionScore + winScore + activeScore);
      
      return {
        userId: uid,
        displayName: u?.display_name || u?.email?.split('@')[0] || 'User',
        ...stats,
        overall,
        hasActivity
      };
    });

    const totalUsers = allUsersData.length;
    
    // For Overall ranking, only include users who have actual activity
    const activeUsers = allUsersData.filter(u => u.hasActivity);
    const totalActiveUsers = activeUsers.length;

    // Calculate rank for the target user
    const targetUser = allUsersData.find(u => u.userId === userId);
    
    // Get target user stats from allUsersData (calculated from allEntries)
    const targetUserStats = targetUser || {
      profitScore: user.lifetime_profit || 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay: 0,
      overall: 0,
      hasActivity: false
    };
    
    const predictionCount = targetUserStats.predictionCount;
    const highestSingleWin = targetUserStats.highestSingleWin;

    // Overall rank - only among active users
    const sortedOverall = [...activeUsers].sort((a, b) => b.overall - a.overall);
    const activeUserIndex = sortedOverall.findIndex(u => u.userId === userId);
    const overallRank = activeUserIndex >= 0 ? activeUserIndex + 1 : totalActiveUsers + 1;

    // Most Orange Ammo rank
    const sortedByProfit = [...allUsersData].sort((a, b) => b.profitScore - a.profitScore);
    const mostOrangeAmmoRank = sortedByProfit.findIndex(u => u.userId === userId) + 1;

    // Most Predictions rank
    const sortedByPredictions = [...allUsersData].sort((a, b) => b.predictionCount - a.predictionCount);
    const mostPredictionsRank = sortedByPredictions.findIndex(u => u.userId === userId) + 1;

    // Highest Single Win rank
    const usersWithWin = allUsersData.filter(u => u.highestSingleWin > 0);
    const sortedByWin = [...usersWithWin].sort((a, b) => b.highestSingleWin - a.highestSingleWin);
    const hasWin = sortedByWin.some(u => u.userId === userId);
    const highestSingleWinRank = hasWin ? sortedByWin.findIndex(u => u.userId === userId) + 1 : totalUsers;

    // Most Active rank
    const sortedByActive = [...allUsersData].sort((a, b) => b.avgReloadPerDay - a.avgReloadPerDay);
    const mostActiveRank = sortedByActive.findIndex(u => u.userId === userId) + 1;

    // Calculate rank tier
    const rankInfo = getRankFromPosition(mostOrangeAmmoRank, totalUsers);

    // ── ดึงทุก entries ของ user ที่ settle แล้ว (won / lost / refunded) ──
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
      return NextResponse.json({
        ok: true,
        data: {
          name: user.display_name || user.email.split("@")[0],
          displayName: user.display_name || null,
          // Basic stats
          profitScore: user.lifetime_profit || 0,  // Use lifetime_profit, same as API v2
          allTimeProfit: user.lifetime_profit || 0,
          predictionCount: 0,
          highestSingleWin: 0,
          winRate: 0,
          wonCount: 0,
          lostCount: 0,
          totalSettled: 0,
          // Rank data
          rank: mostOrangeAmmoRank,
          rankPercentile: mostOrangeAmmoRank / totalUsers,
          rankName: rankInfo.name,
          rankIcon: rankInfo.icon,
          totalUsers,
          overallScore: targetUserStats.overall,
          overallRank,
          mostOrangeAmmoRank,
          mostPredictionsRank,
          highestSingleWinRank,
          mostActiveRank,
          history: []
        }
      });
    }

    // ── นับ stats (use values from allUsersData for consistency) ──
    let wonCount = 0;
    let lostCount = 0;
    let highestSingleWinFromHistory = 0;

    for (const e of historyEntries || []) {
      if (e.status === "won") {
        wonCount++;
        const profit = (e.payout_amount || 0) - e.amount;
        if (profit > highestSingleWinFromHistory) highestSingleWinFromHistory = profit;
      } else {
        lostCount++;
      }
    }

    const totalSettled = historyEntries?.length || 0;
    const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

    // Use highestSingleWin from allUsersData (calculated from all entries)
    // This ensures consistency with rank calculation
    const finalHighestSingleWin = highestSingleWin;

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

    // ── สร้าง history (เรียงตาม resolved_at desc → created_at desc) ──
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

    return NextResponse.json({
      ok: true,
      data: {
        name: user.display_name || user.email.split("@")[0],
        displayName: user.display_name || null,
        // Basic stats
        profitScore: user.lifetime_profit || 0,
        allTimeProfit: user.lifetime_profit || 0,
        predictionCount,
        highestSingleWin,
        winRate,
        wonCount,
        lostCount,
        totalSettled,
        avgReloadPerDay: targetUserStats.avgReloadPerDay,
        // Rank data
        rank: mostOrangeAmmoRank,
        rankPercentile: mostOrangeAmmoRank / totalUsers,
        rankName: rankInfo.name,
        rankIcon: rankInfo.icon,
        totalUsers,
        // Leaderboard ranks
        overallScore: targetUserStats.overall,
        overallRank,
        mostOrangeAmmoRank,
        mostPredictionsRank,
        highestSingleWinRank,
        mostActiveRank,
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
    return createSafeErrorResponse(error);
  }
}
