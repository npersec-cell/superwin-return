import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Verify admin
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if admin
    const { data: adminUser, error: adminError } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (adminError || !adminUser?.is_admin) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: Admin only" },
        { status: 403 }
      );
    }

    // Get all winners with user info
    const { data: winners, error } = await supabase
      .from("winners_log")
      .select(`
        *,
        user:user_id (id, display_name, email, shipping_name, shipping_address, shipping_zipcode, shipping_phone)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: winners });
  } catch (error) {
    console.error("Error fetching winners:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch winners" },
      { status: 500 }
    );
  }
}
