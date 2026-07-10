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

    // ── Fetch rank data from API v2 first (to ensure consistency) ──
    const v2Response = await fetch(`http://localhost:3000/api/leaderboard/v2?userId=${userId}&t=${Date.now()}`);
    const v2Data = await v2Response.json();
    
    const userRankData = v2Data.userRankData;

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
        profitScore: u.lifetime_profit || 0,
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
    const allUsersData = Array.from(userStatsMap.entries()).map(([uid, stats]) => {
      const u = allUsers?.find(u => u.id === uid);
      const hasActivity = stats.predictionCount > 0 || stats.profitScore > 0;
      const profitScore = calcLogScore(stats.profitScore);
      const predictionScore = calcLogScore(stats.predictionCount);
      const winScore = calcLogScore(stats.highestSingleWin);
      // Only count active score if user has actual activity
      const activeScore = hasActivity ? calcLogScore(stats.avgReloadPerDay) : 0;
      const overall = Math.round(profitScore + predictionScore + winScore + activeScore);
      
      return {
        userId: uid,
        displayName: u?.display_name || u?.email?.split('@')[0] || 'User',
        ...stats,
        overall,
        hasActivity
      };
    });

    const totalUsers = allUsersData.length;
    
    // Count active users (users with predictionCount > 0)
    const totalActiveUsers = allUsersData.filter(u => u.predictionCount > 0 || u.profitScore > 0).length;

    // Calculate rank for the target user
    const targetUser = allUsersData.find(u => u.userId === userId);
    const targetUserStats = targetUser || {
      profitScore: user.lifetime_profit || 0,
      predictionCount: 0,
      highestSingleWin: 0,
      avgReloadPerDay: 0,
      overall: 0
    };

    // ── Use rank data from API v2 (to ensure consistency) ──
    const overallRank = userRankData?.overallRank || 1;
    const profitScore = userRankData?.profitScore || 0;
    const mostOrangeAmmoRank = userRankData?.profitScoreRank || 1;
    const predictionCount = userRankData?.predictionCount || 0;
    const mostPredictionsRank = userRankData?.predictionCountRank || 1;
    const highestSingleWin = userRankData?.highestSingleWin || 0;
    const highestSingleWinRank = userRankData?.highestSingleWinRank || 1;
    const avgReloadPerDay = userRankData?.avgReloadPerDay || 0;
    const mostActiveRank = userRankData?.activeRank || 1;
    const userHasActivity = userRankData?.userHasActivity || false;
    const totalActiveUsersFromV2 = userRankData?.totalActiveUsers || totalUsers;

    // Calculate rank tier based on Overall rank from API v2
    const rankInfo = getRankFromPosition(overallRank, totalUsers);

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
          profitScore: user.lifetime_profit || 0,
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

    // ── นับ stats ──
    let wonCount = 0;
    let lostCount = 0;
    let highestSingleWin = 0;
    let predictionCount = (historyEntries || []).length;

    for (const e of historyEntries || []) {
      if (e.status === "won") {
        wonCount++;
        const profit = (e.payout_amount || 0) - e.amount;
        if (profit > highestSingleWin) highestSingleWin = profit;
      } else {
        lostCount++;
      }
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
        // Rank data (now based on Overall rank)
        rank: overallRank,
        rankPercentile: overallRank / totalUsers,
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
