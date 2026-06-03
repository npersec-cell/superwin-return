import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ดึง users ทั้งหมด (ไม่รวม admin) — เอาทุกคนมารวมกับ profit map
    const { data: allUsers, error: errUsers } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, role, profit_score")
      .neq("role", "admin");

    if (errUsers) throw new Error(errUsers.message);

    // 2. ดึง coin_ledger predict + payout ทั้งหมด
    const { data: ledgerRows, error: err1 } = await supabase
      .from("coin_ledger")
      .select("user_id, amount, type")
      .in("type", ["predict", "payout"]);

    if (err1) throw new Error(err1.message);

    // 3. คำนวณ profit ต่อ user (predict = -amount, payout = +payout)
    const profitMap = new Map<string, number>();
    for (const row of ledgerRows || []) {
      profitMap.set(row.user_id, (profitMap.get(row.user_id) || 0) + row.amount);
    }

    // 4. รวม users ทั้งหมดกับ profit map (คนที่ไม่มี ledger ให้ profit = 0)
    const rows: Array<{
      id: string;
      name: string;
      profit: number;
      profitScore: number;
      avatarUrl: string | null;
      isReal: boolean;
    }> = [];

    for (const u of allUsers || []) {
      rows.push({
        id: u.id,
        name: u.display_name || u.email.split("@")[0],
        profit: profitMap.get(u.id) || 0,
        profitScore: u.profit_score || 0,
        avatarUrl: u.avatar_url || null,
        isReal: true
      });
    }

    // 5. เรียงตาม profitScore มาก → น้อย แล้วเอา top 10
    const sorted = rows.sort((a, b) => b.profitScore - a.profitScore).slice(0, 10);

    return NextResponse.json({ ok: true, data: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
