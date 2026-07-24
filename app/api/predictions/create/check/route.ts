import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { getRankFromPosition } from "@/lib/utils";

/**
 * GET /api/predictions/create/check
 * Check if current user can create a prediction (rank + open count)
 * Always returns JSON - never throws or redirects to HTML
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    // Get total user count
    const { count: totalUsers, error: countError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (countError) throw new Error(countError.message);

    // Get user's rank
    const { data: userStats } = await supabase
      .from("user_stats")
      .select("overall_rank")
      .eq("user_id", user.id)
      .maybeSingle();

    let userRank = 0;
    if (userStats?.overall_rank) {
      userRank = userStats.overall_rank;
    }

    const rankInfo = getRankFromPosition(userRank, totalUsers || 1);
    const diamondRanks = ["Diamond", "Ace", "Conqueror", "Crown"];
    const canCreateByRank = diamondRanks.includes(rankInfo.name);

    // Count open questions
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
    // Always return JSON, never HTML error page
    const message = error instanceof Error ? error.message : "Failed to check creation eligibility";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        data: {
          canCreate: false,
          rank: "",
          rankIcon: "",
          openQuestions: 0,
          maxAllowed: 2,
          remainingSlots: 0,
          reason: message,
        },
      },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
