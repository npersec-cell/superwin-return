import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ดึง users ทั้งหมด (ไม่รวม admin)
    const { data: allUsers, error: errUsers } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, role, profit_score, lifetime_profit")
      .neq("role", "admin");

    if (errUsers) throw new Error(errUsers.message);

    // 2. รวม users ทั้งหมด (ใช้ lifetime_profit จากฐานข้อมูลแทนการคำนวณซ้ำ)
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
        profit: u.lifetime_profit || 0,
        profitScore: u.profit_score || 0,
        avatarUrl: u.avatar_url || null,
        isReal: true
      });
    }

    // 3. เรียงตาม profitScore มาก → น้อย แล้วเอา top 10
    const sorted = rows.sort((a, b) => b.profitScore - a.profitScore).slice(0, 10);

    return NextResponse.json({ ok: true, data: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
