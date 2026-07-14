import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();

    // Get current active contest
    const { data: contest, error } = await supabase
      .from("contests")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching contest:", error);
      return NextResponse.json({ ok: false, error: error.message || "Failed to fetch contest" });
    }

    // If no active contest, check for recently ended contests (within 7 days)
    if (!contest) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const { data: endedContest, error: endedError } = await supabase
        .from("contests")
        .select("*")
        .eq("status", "ended")
        .gte("end_time", sevenDaysAgo.toISOString())
        .order("end_time", { ascending: false })
        .limit(1)
        .single();

      if (endedError && endedError.code !== "PGRST116") {
        console.error("Error fetching ended contest:", endedError);
        return NextResponse.json({ ok: false, error: endedError.message || "Failed to fetch contest" });
      }

      return NextResponse.json({ ok: true, data: endedContest || null, ended: true });
    }

    return NextResponse.json({ ok: true, data: contest, ended: false });
  } catch (e) {
    console.error("Error in GET /api/contests/current:", e);
    return NextResponse.json({ ok: false, error: "Server error" });
  }
}
