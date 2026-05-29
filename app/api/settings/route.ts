import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

const fallbackSettings = {
  info: {
    howToPlay: "Login, claim free coins, choose a question, select an answer, choose coins, then confirm prediction.",
    reward: "Season Top 10 is based on season profit. The season winner receives a reward after admin confirmation.",
    questionTime: "Each question has its own close time. When it closes, predictions stop and admin resolves the result."
  },
  reward: {
    name: "Season Prize",
    winnerBy: "Season Profit",
    month: "Season 1",
    approved: false
  },
  tournaments: [
    { name: "Super League", logoUrl: "" }
  ],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  season: {
    startAt: "2026-05-01T00:00",
    endAt: "2026-05-31T17:00",
    status: "active"
  },
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the Season Top 10!"
};

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    
    // ดึงค่าตั้งค่าจาก Supabase แทนระบบไฟล์เพื่อรองรับ Serverless Read-Only ของ Vercel
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "site_settings")
      .maybeSingle();

    if (error) {
      console.warn("Database settings error, falling back to default:", error.message);
      return NextResponse.json({ ok: true, data: fallbackSettings });
    }

    if (data && data.value) {
      return NextResponse.json({ ok: true, data: data.value });
    }

    // หากไม่มีข้อมูลในฐานข้อมูล ให้คืนค่าเริ่มต้นและเตรียมไปบันทึกเมื่อแอดมินกดเซฟครั้งแรก
    return NextResponse.json({ ok: true, data: fallbackSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ ok: true, data: fallbackSettings, error: message });
  }
}
