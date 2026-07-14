import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" });
    }

    const userId = user.id;

    // Get all ended contests where current user is the winner
    const { data: contests, error } = await supabase
      .from("contests")
      .select(`
        *,
        winner:winner_user_id(users!id:id, users!id:display_name, users!id:shipping_name, users!id:shipping_address, users!id:shipping_zipcode, users!id:shipping_phone)
      `)
      .eq("winner_user_id", userId)
      .eq("status", "ended")
      .order("end_time", { ascending: false });

    if (error) {
      console.error("Error fetching contests:", error);
      return NextResponse.json({ ok: false, error: "Failed to fetch contests" });
    }

    return NextResponse.json({ ok: true, data: contests || [] });
  } catch (e) {
    console.error("Error in GET /api/contests/winners:", e);
    return NextResponse.json({ ok: false, error: "Server error" });
  }
}
