import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Calculate ratio vs average (same as /api/leaderboard/v2)
function getRatioScore(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  if (avg === 0) return value > 0 ? 10 : 0;
  return Math.round((value / avg) * 10);
}

// Get contest winner based on Overall Score (average of 4 category ratios)
async function getContestWinner(supabase: any): Promise<{ userId: string; overall: number } | null> {
  try {
    // 1. Get all users (exclude admin and test accounts)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, display_name, email, coin_balance, lifetime_profit, role, created_at, claim_count")
      .neq("role", "admin")
      .not("email", "like", "%test%")
      .not("email", "like", "%automated%");

    if (usersError || !users || users.length === 0) return null;

    const userIds = users.map(u => u.id);

    // 2. Get prediction entries for all users
    const { data: entries, error: entriesError } = await supabase
      .from("prediction_entries")
      .select("user_id, prediction_id, amount, payout_amount, status")
      .in("user_id", userIds)
      .in("status", ["won", "lost", "refunded"]);

    if (entriesError) {
      console.error("Failed to fetch entries:", entriesError);
    }

    // 3. Calculate stats for each user
    const userStats = new Map<string, {
      profitScore: number;
      predictionCount: number;
      highestSingleWin: number;
      avgClaimPerDay: number;
      claimCount: number;
      predictedQuestionIds: Set<string>;
    }>();

    for (const u of users) {
      userStats.set(u.id, {
        profitScore: Number(u.coin_balance) || 0,
        predictionCount: 0,
        highestSingleWin: 0,
        avgClaimPerDay: 0,
        claimCount: u.claim_count || 0,
        predictedQuestionIds: new Set<string>(),
      });
    }

    // 4. Process entries
    for (const entry of (entries || [])) {
      const stat = userStats.get(entry.user_id);
      if (stat) {
        if (entry.prediction_id) stat.predictedQuestionIds.add(entry.prediction_id);
        if (entry.status === "won") {
          const profit = entry.payout_amount - entry.amount;
          if (profit > stat.highestSingleWin) stat.highestSingleWin = profit;
        }
      }
    }

    // 5. Set prediction count and avg claim per day
    for (const [uid, stat] of userStats) {
      stat.predictionCount = stat.predictedQuestionIds.size;
      const user = users.find(u => u.id === uid);
      if (user) {
        const daysSinceCreated = Math.max(1, Math.floor(
          (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
        ));
        stat.avgClaimPerDay = stat.claimCount / daysSinceCreated;
      }
    }

    // 6. Build arrays for ratio calculation
    const statsArray = Array.from(userStats.entries()).map(([uid, s]) => ({
      userId: uid,
      profitScore: s.profitScore,
      predictionCount: s.predictionCount,
      highestSingleWin: s.highestSingleWin,
      avgClaimPerDay: s.avgClaimPerDay,
    }));

    const allCoinBalances = statsArray.map(u => u.profitScore);
    const allPredCounts = statsArray.map(u => u.predictionCount);
    const allHighestWins = statsArray.map(u => u.highestSingleWin);
    const allAvgClaims = statsArray.map(u => u.avgClaimPerDay);

    // 7. Calculate Overall Score for each user
    const withOverall = statsArray.map(u => {
      const orangeScore = getRatioScore(u.profitScore, allCoinBalances);
      const predScore = getRatioScore(u.predictionCount, allPredCounts);
      const winScore = getRatioScore(u.highestSingleWin, allHighestWins);
      const activeScore = getRatioScore(u.avgClaimPerDay, allAvgClaims);
      const overall = Math.round((orangeScore + predScore + winScore + activeScore) / 4);
      return { ...u, overall };
    });

    // 8. Sort by Overall descending and return #1
    withOverall.sort((a, b) => b.overall - a.overall);
    return withOverall[0] || null;
  } catch (e) {
    console.error("Error getting contest winner:", e);
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;

    const { data: contest, error } = await supabase
      .from("contests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching contest:", error);
      return NextResponse.json({ ok: false, error: "Contest not found" });
    }

    return NextResponse.json({ ok: true, data: contest });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;
    const body = await request.json();

    // Handle special actions
    if (body.action === "end_contest") {
      // End contest and auto-detect winner (top 1)
      if (body.status !== "ended") {
        return NextResponse.json({ ok: false, error: "action=end_contest requires status=ended" });
      }

      const winner = await getContestWinner(supabase);
      if (!winner) {
        return NextResponse.json({ ok: false, error: "No users found to determine winner" });
      }
      const winnerUserId = winner.userId;

      // Get winner user details
      const { data: winnerUser } = await supabase
        .from("users")
        .select("id, display_name, email, shipping_name, shipping_address, shipping_zipcode, shipping_phone")
        .eq("id", winnerUserId)
        .single();

      const { data, error } = await supabase
        .from("contests")
        .update({
          status: "ended",
          winner_user_id: winnerUserId,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error ending contest:", error);
        return NextResponse.json({ ok: false, error: "Failed to end contest" });
      }

      return NextResponse.json({ 
        ok: true, 
        data,
        winner: winnerUser,
        message: ` Contest ended! Winner (Top 1): ${winnerUser?.display_name || winnerUserId}`
      });
    }

    if (body.action === "set_winner") {
      // Manually set winner
      if (!body.winner_user_id) {
        return NextResponse.json({ ok: false, error: "winner_user_id is required" });
      }

      const { data, error } = await supabase
        .from("contests")
        .update({ winner_user_id: body.winner_user_id })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error setting winner:", error);
        return NextResponse.json({ ok: false, error: "Failed to set winner" });
      }

      return NextResponse.json({ ok: true, data });
    }

    // Regular update
    const updateFields: any = {};
    
    if (body.status) updateFields.status = body.status;
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.end_time !== undefined) updateFields.end_time = new Date(body.end_time);
    if (body.prize_1 !== undefined) updateFields.prize_1 = body.prize_1;
    if (body.prize_2 !== undefined) updateFields.prize_2 = body.prize_2;
    if (body.prize_3 !== undefined) updateFields.prize_3 = body.prize_3;
    if (body.prize_4 !== undefined) updateFields.prize_4 = body.prize_4;
    if (body.prize_5 !== undefined) updateFields.prize_5 = body.prize_5;
    if (body.winner_user_id !== undefined) updateFields.winner_user_id = body.winner_user_id;

    const { data, error } = await supabase
      .from("contests")
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating contest:", error);
      return NextResponse.json({ ok: false, error: "Failed to update contest" });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const { id } = await params;

    const { error } = await supabase
      .from("contests")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting contest:", error);
      return NextResponse.json({ ok: false, error: "Failed to delete contest" });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
