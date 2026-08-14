import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // Get last 10 resolved predictions (won/lost)
    const { data: entries, error: entriesError } = await supabase
      .from("btc_quick_predictions")
      .select("id, user_id, direction, stake_amount, status, entry_price, exit_price, potential_payout, created_at, resolved_at")
      .in("status", ["won", "lost"])
      .order("resolved_at", { ascending: false })
      .limit(10);

    if (entriesError) {
      return NextResponse.json({ ok: false, error: entriesError.message }, { status: 500 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ ok: true, data: [], stats: null });
    }

    // Get user display names
    const userIds = [...new Set(entries.map((e) => e.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, email")
      .in("id", userIds);

    const userMap = new Map(users?.map((u) => [u.id, u]) as [string, any][]);

    // Format stats
    const stats = entries.map((entry) => {
      const user = userMap.get(entry.user_id);
      const won = entry.status === "won";
      const profit = won ? entry.potential_payout - entry.stake_amount : -entry.stake_amount;

      return {
        id: entry.id,
        displayName: user?.display_name ?? user?.email?.split("@")[0] ?? "Anonymous",
        direction: entry.direction,
        stakeAmount: entry.stake_amount,
        entryPrice: entry.entry_price,
        exitPrice: entry.exit_price,
        status: entry.status,
        profit,
        createdAt: entry.created_at,
        resolvedAt: entry.resolved_at,
      };
    });

    return NextResponse.json({
      ok: true,
      data: stats,
    });
  } catch (error) {
    console.error("Failed to fetch BTC quick predict stats:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
