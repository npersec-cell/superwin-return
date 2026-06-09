import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_request: NextRequest) {
  try {
    const { data: config, error } = await supabase
      .from("number_war_config")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    const now = new Date();
    const openAt = config?.open_at ? new Date(config.open_at) : null;
    const closeAt = config?.close_at ? new Date(config.close_at) : null;

    let status: "open" | "closed" | "upcoming" = "closed";
    if (openAt && closeAt) {
      if (now < openAt) status = "upcoming";
      else if (now >= openAt && now <= closeAt) status = "open";
      else status = "closed";
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...config,
        status,
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
