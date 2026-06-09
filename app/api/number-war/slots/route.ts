import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getRoundStatus(round: { open_at: string | null; close_at: string | null; winner_slot?: number | null }): "upcoming" | "open" | "closed" | "resolved" {
  const now = Date.now();
  const open = round.open_at ? new Date(round.open_at).getTime() : null;
  const close = round.close_at ? new Date(round.close_at).getTime() : null;
  if (round.winner_slot !== null && round.winner_slot !== undefined) return "resolved";
  if (open && now < open) return "upcoming";
  if (close && now > close) return "closed";
  if (open && close && now >= open && now <= close) return "open";
  return "closed";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get("roundId");

    let targetRoundId = roundId;

    // If no roundId specified, find the active (open) round
    if (!targetRoundId) {
      const { data: rounds } = await supabase
        .from("number_war_rounds")
        .select("id, open_at, close_at, winner_slot")
        .order("created_at", { ascending: false });

      const activeRound = (rounds || []).find((r) => getRoundStatus(r) === "open");
      if (activeRound) {
        targetRoundId = activeRound.id;
      } else if (rounds && rounds.length > 0) {
        // Fallback to most recent round
        targetRoundId = rounds[0].id;
      }
    }

    if (!targetRoundId) {
      return NextResponse.json({ ok: true, data: [], round: null });
    }

    // Fetch round info
    const { data: roundInfo } = await supabase
      .from("number_war_rounds")
      .select("id, name, open_at, close_at, winner_slot, status, created_at")
      .eq("id", targetRoundId)
      .single();

    // Fetch slots for this round
    const { data: slots, error } = await supabase
      .from("number_slots")
      .select(`
        *,
        owner:owner_id (id, display_name, email)
      `)
      .eq("round_id", targetRoundId)
      .order("slot_number", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: slots || [],
      round: roundInfo
        ? {
            ...roundInfo,
            computedStatus: getRoundStatus(roundInfo),
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching number slots:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch slots" },
      { status: 500 }
    );
  }
}
