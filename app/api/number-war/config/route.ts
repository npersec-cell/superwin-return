import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_request: NextRequest) {
  try {
    // Get the latest tournament with Number War enabled
    const { data: tournament, error } = await supabase
      .from("predictions")
      .select("id, tournament_name, number_war_enabled, number_war_open_at, number_war_close_at, status, created_at")
      .eq("number_war_enabled", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No tournament with Number War enabled
      return NextResponse.json({
        ok: true,
        data: {
          status: "closed" as const,
          tournament_name: null,
          open_at: null,
          close_at: null,
          timeLeft: 0,
          timeUntilOpen: 0,
        },
      });
    }

    const now = new Date();
    const openAt = tournament?.number_war_open_at ? new Date(tournament.number_war_open_at) : null;
    const closeAt = tournament?.number_war_close_at ? new Date(tournament.number_war_close_at) : null;

    let status: "open" | "closed" | "upcoming" = "closed";
    if (openAt && closeAt) {
      if (now < openAt) status = "upcoming";
      else if (now >= openAt && now <= closeAt) status = "open";
      else status = "closed";
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: tournament.id,
        tournament_name: tournament.tournament_name,
        status,
        open_at: tournament.number_war_open_at,
        close_at: tournament.number_war_close_at,
        timeLeft: closeAt && status === "open" ? Math.max(0, closeAt.getTime() - now.getTime()) : 0,
        timeUntilOpen: openAt && status === "upcoming" ? Math.max(0, openAt.getTime() - now.getTime()) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}
