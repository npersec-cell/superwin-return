import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_KEY = "leaderboard_top10";
const CACHE_TTL_SECONDS = 300; // 5 minutes

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // 1. ตรวจสอบ Cache ก่อน
    const { data: cacheEntry, error: cacheError } = await supabase
      .from("cache")
      .select("value, expires_at")
      .eq("key", CACHE_KEY)
      .single();

    if (!cacheError && cacheEntry && new Date(cacheEntry.expires_at) > new Date()) {
      // Cache ยังไม่หมดอายุ → ส่งคืนข้อมูลจาก Cache
      return NextResponse.json({
        ok: true,
        data: cacheEntry.value,
        cached: true,
        expires_at: cacheEntry.expires_at,
      });
    }

    // 2. Cache ไม่มี หรือหมดอายุ → คำนวณใหม่
    const { data: allUsers, error: errUsers } = await supabase
      .from("users")
      .select("id, display_name, email, avatar_url, role, profit_score, lifetime_profit");

    if (errUsers) throw new Error(errUsers.message);

    // กรอง admin และ user ทดสอบออก
    const filteredUsers = (allUsers || []).filter((u) => {
      const email = (u.email || "").toLowerCase();
      const displayName = (u.display_name || "").toLowerCase();
      const role = (u.role || "").toLowerCase();
      return (
        role !== "admin" &&
        !email.includes("test") &&
        !displayName.includes("test") &&
        !displayName.includes("ทดสอบ")
      );
    });

    // 3. รวม users
    const rows = filteredUsers.map((u) => ({
      id: u.id,
      name: u.display_name || u.email.split("@")[0],
      profit: u.lifetime_profit || 0,
      profitScore: u.profit_score || 0,
      avatarUrl: u.avatar_url || null,
      isReal: true,
    }));

    // 4. เรียงตาม profitScore มาก → น้อย แล้วเอา top 10
    const sorted = rows.sort((a, b) => b.profitScore - a.profitScore).slice(0, 10);

    // 5. บันทึกลง Cache (UPSERT)
    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();

    await supabase.from("cache").upsert(
      {
        key: CACHE_KEY,
        value: sorted,
        expires_at: expiresAt,
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      ok: true,
      data: sorted,
      cached: false,
      expires_at: expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load leaderboard failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
