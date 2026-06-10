import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { createSafeErrorResponse } from "@/lib/safe-error-handler";

export const dynamic = "force-dynamic";

const fallbackSettings = {
  info: {
    howToPlay: "ล็อกอิน ➔ กดรับเหรียญฟรีทุก 1 ชั่วโมง ➔ เลือกวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนเหรียญแล้วกดยืนยันคำทายผล",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  tournaments: [
    { name: "Super League", logoUrl: "" }
  ],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  numberWarDescription: "ต่ำกว่า 100 · 101-299 · มากกว่า 300 | ซื้อครั้งแรก 10 | แย่งซื้อ x2 ทุกครั้ง | ชนะตามเลขที่ประกาศ",
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the All time Top 10!"
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
    return createSafeErrorResponse(error);
  }
}
