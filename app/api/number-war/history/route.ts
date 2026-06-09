import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const supabase = createSupabaseAdminClient();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    let query = supabase
      .from("number_war_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type && type !== "all") {
      query = query.eq("type", type);
    }

    const { data: history, error } = await query;

    if (error) {
      console.error("Error fetching number war history:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch history" },
        { status: 500 }
      );
    }

    const rows = history || [];

    // Fetch related rounds
    const roundIds = [...new Set(rows.map((r) => r.round_id).filter(Boolean))];
    const { data: rounds } = await supabase
      .from("number_war_rounds")
      .select("id, name")
      .in("id", roundIds);
    const roundMap = new Map((rounds || []).map((r) => [r.id, r]));

    // Fetch related opponents
    const opponentIds = [...new Set(rows.map((r) => r.opponent_id).filter(Boolean))];
    const { data: opponents } = await supabase
      .from("users")
      .select("id, display_name, email")
      .in("id", opponentIds);
    const opponentMap = new Map((opponents || []).map((u) => [u.id, u]));

    // Enrich history
    const enriched = rows.map((h) => ({
      ...h,
      round: h.round_id ? roundMap.get(h.round_id) || null : null,
      opponent: h.opponent_id ? opponentMap.get(h.opponent_id) || null : null,
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401 }
    );
  }
}
