import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);

    // Get user's wins with round info
    const { data: wins, error } = await supabase
      .from("winners_log")
      .select("*, round:round_id (id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: wins || [],
    });
  } catch (error) {
    console.error("Error fetching my wins:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch wins" },
      { status: 500 }
    );
  }
}
