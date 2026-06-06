import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    // 1. ดึงข้อมูลคำถามหลักทั้งหมดเพื่อป้องกัน Error PostgREST Embed
    const { data: predictions, error: pError } = await supabase
      .from("predictions")
      .select("id, tournament_name, question, status, closes_at, created_at, fee_rate")
      .order("created_at", { ascending: false });

    if (pError) throw new Error(pError.message);

    // 2. ดึงข้อมูลตัวเลือกทั้งหมด
    const { data: options, error: oError } = await supabase
      .from("prediction_options")
      .select("id, prediction_id, label");

    if (oError) throw new Error(oError.message);

    // 3. ดึงรายการทายผลทั้่งหมด (ไม่ join users เพื่อเลี่ยง PostgREST error)
    const { data: entries, error: eError } = await supabase
      .from("prediction_entries")
      .select("id, prediction_id, option_id, amount, created_at, user_id");

    if (eError) throw new Error(eError.message);

    // 3b. ดึงข้อมูลผู้ใช้แยกต่างหาก
    const userIds = [...new Set((entries || []).map((e: any) => e.user_id).filter(Boolean))];
    const usersById: Record<string, { email: string; display_name: string }> = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, email, display_name")
        .in("id", userIds);
      for (const u of usersData || []) {
        usersById[u.id] = { email: u.email || "--", display_name: u.display_name || "--" };
      }
    }

    // 4. ผูกข้อมูลรวมกันฝั่ง Javascript เพื่อความปลอดภัยและไร้ Error
    const formatted = (predictions || []).map((p) => {
      const pOptions = (options || []).filter((o) => o.prediction_id === p.id);
      const pEntries = (entries || []).filter((e) => e.prediction_id === p.id);

      // ยอดรวมเหรียญทั้งหมดในพูล
      const totalPoolCoins = pEntries.reduce((sum, e: any) => sum + (e.amount || 0), 0);
      const uniquePlayers = new Set(pEntries.map((e: any) => usersById[e.user_id]?.email).filter(Boolean)).size;

      // คืนพูลหลังหักค่าธรรมเนียม
      const feeRate = Number(p.fee_rate || 0.03);
      const netPool = totalPoolCoins * (1 - feeRate);

      // คำนวณยอดทายและอัตราต่อรองของแต่ละตัวเลือก
      const optionStats = pOptions.map((opt) => {
        const optEntries = pEntries.filter((e) => e.option_id === opt.id);
        const optTotalCoins = optEntries.reduce((sum, e: any) => sum + (e.amount || 0), 0);
        const optPlayerCount = new Set(optEntries.map((e: any) => usersById[e.user_id]?.email).filter(Boolean)).size;

        // คำนวณอัตราผลตอบแทนต่อเหรียญ ปัดเป็นจำนวนเต็มไม่มีทศนิยม (เช่น คูณ 1x, 2x แทน 1.1x)
        const potentialMultiplier = optTotalCoins > 0 ? Math.round(netPool / optTotalCoins) : 0;

        return {
          id: opt.id,
          label: opt.label,
          totalCoins: optTotalCoins,
          playerCount: optPlayerCount,
          multiplier: potentialMultiplier
        };
      });

      // รายชื่อผู้เล่นที่ทายผลคู่แข่งคู่นี้
      const playerBets = pEntries.map((e: any) => {
        const optionLabel = pOptions.find((o: any) => o.id === e.option_id)?.label || "--";
        const userInfo = usersById[e.user_id] || { email: "--", display_name: "--" };
        return {
          id: e.id,
          email: userInfo.email,
          displayName: userInfo.display_name,
          optionLabel,
          amount: e.amount,
          createdAt: e.created_at
        };
      });

      return {
        id: p.id,
        tournamentName: p.tournament_name,
        question: p.question,
        status: p.status,
        closesAt: p.closes_at,
        createdAt: p.created_at,
        totalPoolCoins,
        uniquePlayers,
        optionStats,
        playerBets
      };
    });

    return NextResponse.json({ ok: true, data: formatted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard metrics";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
