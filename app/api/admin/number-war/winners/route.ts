import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    // Get all winners with user info and round info
    const { data: winners, error } = await supabase
      .from("winners_log")
      .select(`
        *,
        user:user_id (id, display_name, email, shipping_name, shipping_address, shipping_zipcode, shipping_phone),
        round:round_id (id, name)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: winners });
  } catch (error) {
    console.error("Error fetching winners:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch winners";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
