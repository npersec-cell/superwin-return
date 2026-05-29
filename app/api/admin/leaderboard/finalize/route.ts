import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import path from "node:path";

export const dynamic = "force-dynamic";

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { month } = body;

    if (!month) {
      return NextResponse.json({ ok: false, error: "กรุณาระบุชื่อเดือนจัดอันดับ เช่น May 2026" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // 1. ดึงรายชื่อผู้เล่นทั้งหมด เรียงลำดับตามคะแนนประจำเดือนสูงสุด
    const { data: users, error: fetchError } = await supabase
      .from("users")
      .select("id, email, display_name, monthly_profit")
      .neq("role", "admin")
      .order("monthly_profit", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);

    // 2. บันทึกประวัติตารางอันดับสิ้นเดือน (monthly_leaderboards) สำหรับ Top 20 หรือผู้เล่นที่มีแต้มสูงสุด
    const snapshotRows = (users || [])
      .slice(0, 20) // เก็บสถิติสูงสุด 20 อันดับแรก
      .map((user, index) => ({
        month,
        user_id: user.id,
        monthly_profit: user.monthly_profit || 0,
        total_used: 0,
        total_payout: 0,
        rank: index + 1
      }));

    if (snapshotRows.length > 0) {
      const { error: insertError } = await supabase
        .from("monthly_leaderboards")
        .upsert(snapshotRows, { onConflict: "month,user_id" });

      if (insertError) throw new Error(insertError.message);
    }

    // 3. รีเซ็ตคะแนนกำไรประจำเดือน (monthly_profit) ของผู้เล่นทุกคนในระบบเป็น 0 เพื่อเริ่มซีซั่นใหม่
    const { error: resetError } = await supabase
      .from("users")
      .update({ monthly_profit: 0 })
      .neq("role", "admin"); // แอดมินไม่ต้องรีเซ็ต

    if (resetError) throw new Error(resetError.message);

    // 4. โหลด แก้ไข และบันทึก site-settings.json อัตโนมัติ (อัปเดตขยับฤดูกาลใหม่เพื่อป้องความผิดพลาดมนุษย์)
    const settingsPath = path.join(process.cwd(), "data", "site-settings.json");
    try {
      const { readFile, writeFile } = await import("node:fs/promises");
      const settings = JSON.parse(await readFile(settingsPath, "utf8"));
      
      const currentSeason = settings.reward?.month || "Season 1";
      const match = currentSeason.match(/^(.*?)(\d+)$/);
      let nextSeasonName = `${currentSeason} 2`; // fallback
      if (match) {
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        nextSeasonName = `${prefix}${num + 1}`;
      }

      const updatedSettings = {
        ...settings,
        reward: {
          ...settings.reward,
          name: settings.reward?.name || "Season Prize",
          winnerBy: "", // เคลียร์ชื่อคนชนะเพื่อรอเก็บแต้มรอบใหม่
          month: nextSeasonName, // ขยับชื่อซีซั่นไปรอบใหม่ถัดไปออโต้!
          approved: false // ล็อกปุ่มเคลมเพื่อรอคนชนะซีซั่นใหม่
        }
      };

      await writeFile(settingsPath, JSON.stringify(updatedSettings, null, 2), "utf8");
    } catch (e) {
      // ignore settings load/write error if file doesn't exist
    }

    return NextResponse.json({ ok: true, data: { month, snapshotCount: snapshotRows.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize leaderboard";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
