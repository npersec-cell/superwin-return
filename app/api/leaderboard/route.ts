import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ดึง coin_ledger predict + payout ทั้งหมด (entries อาจถูกลบไปแล้ว แต่ ledger ยังอยู่)
    const { data: ledgerRows, error: err1 } = await supabase
      .from("coin_ledger")
      .select("user_id, amount, type")
      .in("type", ["predict", "payout"]);

    if (err1) throw new Error(err1.message);

    // 2. คำนวณ profit ต่อ user (predict = -amount, payout = +payout)
    const profitMap = new Map<string, number>();
    for (const row of ledgerRows || []) {
      profitMap.set(row.user_id, (profitMap.get(row.user_id) || 0) + row.amount);
    }

    // 3. เรียงตาม profit มาก → น้อย
    const sorted = Array.from(profitMap.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    // 4. ดึง users ที่มี profit (ดึงทั้งหมดที่มีใน profitMap)
    const allUserIds = sorted.map(([id]) => id);
    const { data: users, error: err2 } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, role")
      .in("id", allUserIds);

    if (err2) throw new Error(err2.message);

    const userMap = new Map((users || []).map((u) => [u.id, u]));

    // 5. สร้าง rows กรอง admin ออก เอา top 10
    const rows: Array<{
      id: string;
      name: string;
      profit: number;
      avatarUrl: string | null;
      isReal: boolean;
    }> = [];

    for (const [id, profit] of sorted) {
      const user = userMap.get(id);
      if (!user || user.role === "admin") continue;
      rows.push({
        id,
        name: user.display_name || user.email.split("@")[0],
        profit,
        avatarUrl: user.avatar_url || null,
        isReal: true
      });
      if (rows.length >= 10) break;
    }

    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
