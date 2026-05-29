import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ดึงผู้เล่นทั่วไปที่มีประวัติคะแนน (คัดแอดมินออก)
    const { data: nonAdmins, error: err1 } = await supabase
      .from("users")
      .select("id, display_name, email, monthly_profit, avatar_url")
      .neq("role", "admin")
      .order("monthly_profit", { ascending: false })
      .limit(10);

    if (err1) throw new Error(err1.message);

    const rows = (nonAdmins || []).map((user) => ({
      id: user.id,
      name: user.email.split("@")[0], // ใช้แค่นำหน้าอีเมลก่อน @ เพื่อความเป็นส่วนตัวสูงสุด
      profit: user.monthly_profit || 0,
      avatarUrl: user.avatar_url || null,
      isReal: true
    }));

    // 2. ถ้าคนเล่นจริงไม่ครบ 10 คน ให้ดึงผู้ใช้ระบบคนอื่น ๆ (รวมแอดมิน) มาร่วมแสดงเพื่อป้องกันตารางว่างเปล่า
    if (rows.length < 10) {
      const { data: allUsers, error: err2 } = await supabase
        .from("users")
        .select("id, display_name, email, monthly_profit, avatar_url")
        .limit(20);

      if (!err2 && allUsers) {
        for (const user of allUsers) {
          const name = user.email.split("@")[0]; // ใช้แค่นำหน้าอีเมลก่อน @ เพื่อความเป็นส่วนตัวสูงสุด
          if (rows.length < 10 && !rows.some((r) => r.id === user.id)) {
            rows.push({
              id: user.id,
              name,
              profit: user.monthly_profit || 0,
              avatarUrl: user.avatar_url || null,
              isReal: true
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
