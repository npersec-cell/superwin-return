import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/admin/users — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("users")
      .select("id, display_name, email, role, coin_balance, profit_score, created_at, last_claim_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const users = (data || []).map((u) => ({
      id: u.id,
      name: u.display_name,
      email: u.email,
      isAdmin: u.role === "admin",
      coinBalance: u.coin_balance,
      profitScore: u.profit_score,
      createdAt: u.created_at,
      lastClaimAt: u.last_claim_at,
    }));

    return NextResponse.json({ ok: true, data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
