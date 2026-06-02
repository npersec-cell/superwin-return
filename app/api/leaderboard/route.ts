import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ดึงผู้เล่นทั่วไป (คัดแอดมินออก)
    const { data: nonAdmins, error: err1 } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url")
      .neq("role", "admin")
      .limit(20);

    if (err1) throw new Error(err1.message);

    const userList = nonAdmins || [];
    const allUserIds = userList.map((u) => u.id);

    // 2. ดึง prediction_entries ที่ settled ของ user เหล่านี้มาคำนวณ profit เอง
    let profitMap = new Map<string, number>();
    if (allUserIds.length > 0) {
      const { data: entries, error: err2 } = await supabase
        .from("prediction_entries")
        .select("user_id, amount, payout_amount, status")
        .in("user_id", allUserIds)
        .in("status", ["won", "lost"]);

      if (err2) throw new Error(err2.message);

      for (const entry of entries || []) {
        const profit = (entry.payout_amount || 0) - entry.amount;
        profitMap.set(entry.user_id, (profitMap.get(entry.user_id) || 0) + profit);
      }
    }

    let rows = userList.map((user) => ({
      id: user.id,
      name: user.email.split("@")[0],
      profit: profitMap.get(user.id) || 0,
      avatarUrl: user.avatar_url || null,
      isReal: true
    }));

    // 3. เรียงตาม profit มาก → น้อย
    rows.sort((a, b) => b.profit - a.profit);

    // 4. ถ้าคนเล่นจริงไม่ครบ 10 คน ให้ดึงผู้ใช้ระบบคนอื่น ๆ (รวมแอดมิน) มาร่วมแสดงเพื่อป้องกันตารางว่างเปล่า
    if (rows.length < 10) {
      const { data: allUsers, error: err2 } = await supabase
        .from("users")
        .select("id, display_name, email, avatar_url")
        .limit(20);

      if (!err2 && allUsers) {
        const existingIds = new Set(rows.map((r) => r.id));
        const extraIds = allUsers.filter((u) => !existingIds.has(u.id)).map((u) => u.id);

        let extraProfitMap = new Map<string, number>();
        if (extraIds.length > 0) {
          const { data: extraEntries } = await supabase
            .from("prediction_entries")
            .select("user_id, amount, payout_amount, status")
            .in("user_id", extraIds)
            .in("status", ["won", "lost"]);

          for (const entry of extraEntries || []) {
            const profit = (entry.payout_amount || 0) - entry.amount;
            extraProfitMap.set(entry.user_id, (extraProfitMap.get(entry.user_id) || 0) + profit);
          }
        }

        for (const user of allUsers) {
          if (rows.length >= 10) break;
          if (existingIds.has(user.id)) continue;
          rows.push({
            id: user.id,
            name: user.email.split("@")[0],
            profit: extraProfitMap.get(user.id) || 0,
            avatarUrl: user.avatar_url || null,
            isReal: true
          });
        }
      }
    }

    return NextResponse.json({ ok: true, data: rows.slice(0, 10) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
