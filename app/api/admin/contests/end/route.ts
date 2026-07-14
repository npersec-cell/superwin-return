import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Helper function to get user rank based on total_points
async function getUserRank(supabase: any): Promise<string | null> {
  try {
    // Get all users with their total points, ordered by points descending
    const { data: users, error } = await supabase
      .from("users")
      .select("id, display_name, total_points")
      .order("total_points", { ascending: false });

    if (error || !users || users.length === 0) {
      return null;
    }

    // Return the user_id of the top 1 user
    return users[0]?.id || null;
  } catch (e) {
    console.error("Error getting user rank:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();

    const body = await request.json();
    const { contest_id } = body;

    if (!contest_id) {
      return NextResponse.json({ ok: false, error: "Missing contest_id" });
    }

    // Get the contest
    const { data: contest, error } = await supabase
      .from("contests")
      .select("*")
      .eq("id", contest_id)
      .single();

    if (error || !contest) {
      return NextResponse.json({ ok: false, error: "Contest not found" });
    }

    if (contest.status === "ended") {
      return NextResponse.json({ ok: false, error: "Contest already ended" });
    }

    // Get the top 1 user (winner)
    const winnerUserId = await getUserRank(supabase);

    if (!winnerUserId) {
      return NextResponse.json({ ok: false, error: "No users found to determine winner" });
    }

    // Update contest: set status to ended, set winner
    const { data, error: updateError } = await supabase
      .from("contests")
      .update({
        status: "ended",
        winner_user_id: winnerUserId,
      })
      .eq("id", contest_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error ending contest:", updateError);
      return NextResponse.json({ ok: false, error: "Failed to end contest" });
    }

    return NextResponse.json({ 
      ok: true, 
      data,
      message: ` Contest ended! Winner: ${data.winner_user_id}`
    });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
