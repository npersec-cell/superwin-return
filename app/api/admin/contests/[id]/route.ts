import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

// Helper function to get user rank based on coin_balance
async function getUserRank(supabase: any): Promise<string | null> {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, display_name, coin_balance")
      .neq("role", "admin")
      .not("email", "like", "%test%")
      .order("coin_balance", { ascending: false });

    if (error || !users || users.length === 0) {
      return null;
    }

    return users[0]?.id || null;
  } catch (e) {
    console.error("Error getting user rank:", e);
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

      const winnerUserId = await getUserRank(supabase);
      if (!winnerUserId) {
        return NextResponse.json({ ok: false, error: "No users found to determine winner" });
      }

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
