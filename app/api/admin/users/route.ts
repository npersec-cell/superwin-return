import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/admin/users — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin();

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, coin_balance, free_coins, profit_score, is_admin, created_at, last_claim_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const users = (data || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      coinBalance: u.coin_balance,
      freeCoins: u.free_coins,
      profitScore: u.profit_score,
      isAdmin: u.is_admin,
      createdAt: u.created_at,
      lastClaimAt: u.last_claim_at,
    }));

    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
