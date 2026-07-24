import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { getRankFromPosition } from "@/lib/utils";

// Calculate ratio vs average (scaled) — same as /api/leaderboard/profile
// Value at average = 10, twice average = 20, 10x average = 100
function getRatioScore(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  if (avg === 0) return value > 0 ? 10 : 0;
  return Math.round((value / avg) * 10);
}

/**
 * GET /api/predictions/create/check
 * Check if current user can create a prediction (Diamond+ rank, max 2 open questions)
 * 
 * IMPORTANT: Uses the EXACT SAME rank calculation as /api/leaderboard/profile
 * to ensure consistency across the app.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    // ── Calculate Overall Rank (same method as /api/leaderboard/profile) ──
    // Get all non-admin, non-test users
    const { data: allUsers, error: usersError } = await supabase
      .from("users")
      .select("id, display_name, email, coin_balance, lifetime_profit, role, created_at, claim_count")
      .neq("role", "admin")
      .not("email", "like", "%test%")
      .not("email", "like", "%automated%");

    if (usersError || !allUsers || allUsers.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Failed to fetch users",
        data: { canCreate: false, rank: "Bronze", rankIcon: "/ranks/bronze.png", openQuestions: 0, maxAllowed: 2, remainingSlots: 0, reason: "System error" },
      });
    }

    const userIds = allUsers.map(u => u.id);

    // Get all prediction entries for rank calculation
    const { data: allEntries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("id, user_id, prediction_id, amount, payout_amount, status, created_at")
      .in("user_id", userIds)
      .in("status", ["won", "lost", "refunded"]);

    if (entriesError || !allEntries) {
      return NextResponse.json({
        ok: false,
        error: "Failed to fetch entries",
        data: { canCreate: false, rank: "Bronze", rankIcon: "/ranks/bronze.png", openQuestions: 0, maxAllowed: 2, remainingSlots: 0, reason: "System error" },
      });
    }

    // Calculate stats for each user (same as profile API)
    const userStatsMap = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgClaimPerDay: number;
      overall: number;
    }>();

    const allCoinBalances: number[] = [];
    const allPredCounts: number[] = [];
    const allHighestWins: number[] = [];
    const allAvgClaims: number[] = [];

    for (const u of allUsers) {
      const userEntries = allEntries.filter(e => e.user_id === u.id);
      const wonEntries = userEntries.filter(e => e.status === "won");

      const profitScore = Number(u.coin_balance) || 0;
      const uniqueQuestionIds = new Set(userEntries.map(e => e.prediction_id).filter(Boolean));
      const predictionCount = uniqueQuestionIds.size;
      const highestSingleWin = wonEntries.length > 0
        ? Math.max(...wonEntries.map(e => (e.payout_amount || 0) - e.amount))
        : 0;

      const createdAt = new Date(u.created_at);
      const daysActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const avgClaimPerDay = (u.claim_count || 0) / daysActive;

      allCoinBalances.push(profitScore);
      allPredCounts.push(predictionCount);
      allHighestWins.push(highestSingleWin);
      allAvgClaims.push(avgClaimPerDay);

      userStatsMap.set(u.id, {
        profitScore,
        predictionCount,
        highestSingleWin,
        avgClaimPerDay,
        overall: 0,
      });
    }

    // Calculate overall score using Ratio vs Average (same as profile API)
    for (const [uid, stats] of userStatsMap.entries()) {
      const orangeScore = getRatioScore(stats.profitScore, allCoinBalances);
      const predScore = getRatioScore(stats.predictionCount, allPredCounts);
      const winScore = getRatioScore(stats.highestSingleWin, allHighestWins);
      const activeScore = getRatioScore(stats.avgClaimPerDay, allAvgClaims);
      const overall = Math.round((orangeScore + predScore + winScore + activeScore) / 4);
      userStatsMap.set(uid, { ...stats, overall });
    }

    // Build leaderboard and sort (same stable sort as profile API)
    const leaderboardData = allUsers.map(u => ({
      userId: u.id,
      overall: userStatsMap.get(u.id)?.overall || 0,
    }));

    leaderboardData.sort((a, b) => {
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.userId.localeCompare(b.userId);
    });

    // Find user's overall rank
    const totalUsers = leaderboardData.length;
    const userIndex = leaderboardData.findIndex(u => u.userId === user.id);
    const overallRank = userIndex >= 0 ? userIndex + 1 : totalUsers;

    // Get rank tier name (same as profile API)
    const rankInfo = getRankFromPosition(overallRank, totalUsers);
    const diamondRanks = ["Diamond", "Ace", "Conqueror", "Crown"];
    const canCreateByRank = diamondRanks.includes(rankInfo.name);

    // ── Check if user questions feature is enabled ──
    const { data: features } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "frontend_features")
      .maybeSingle();

    const userQuestionsEnabled = !features || !features.value || features.value.userQuestionsEnabled !== false;

    if (!userQuestionsEnabled) {
      return NextResponse.json({
        ok: true,
        data: { canCreate: false, rank: rankInfo.name, rankIcon: rankInfo.icon, openQuestions: stillOpen.length, maxAllowed: 2, remainingSlots: 0, reason: "การสร้างคำถามจากผู้ใช้ถูกปิดชั่วคราวโดยผู้ดูแลระบบ" },
      });
    }

    // ── Count open questions ──
    const now = new Date().toISOString();
    const { data: existingOpen } = await supabase
      .from("predictions")
      .select("id, closes_at, status")
      .eq("created_by_user_id", user.id)
      .in("status", ["open", "closed"])
      .or(`closes_at.gt.${now},closes_at.is.null`);

    const stillOpen = (existingOpen || []).filter((p) => {
      if (p.status === "closed") return false;
      if (!p.closes_at) return true;
      return new Date(p.closes_at) > new Date();
    });

    return NextResponse.json({
      ok: true,
      data: {
        canCreate: canCreateByRank && stillOpen.length < 2,
        rank: rankInfo.name,
        rankIcon: rankInfo.icon,
        openQuestions: stillOpen.length,
        maxAllowed: 2,
        remainingSlots: Math.max(0, 2 - stillOpen.length),
        reason: !canCreateByRank
          ? `Requires Diamond rank or higher. Your rank: ${rankInfo.name}`
          : stillOpen.length >= 2
            ? `Maximum 2 open questions reached`
            : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check creation eligibility";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        data: { canCreate: false, rank: "Bronze", rankIcon: "/ranks/bronze.png", openQuestions: 0, maxAllowed: 2, remainingSlots: 0, reason: message },
      },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
