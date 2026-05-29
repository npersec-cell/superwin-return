import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, num1, num2, answer } = body;

    if (!message || message.trim() === "") {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }

    // 1. ตรวจสอบ Captcha กันบอท (Server-side validation)
    const expected = Number(num1) + Number(num2);
    if (Number(answer) !== expected) {
      return NextResponse.json({ ok: false, error: "Incorrect Captcha answer. Please try again." }, { status: 400 });
    }

    // 2. ดึงผู้เล่นปัจจุบัน (หากล็อกอินอยู่)
    let dbUserId = null;
    let userEmail = "guest@superwinhub.app";
    try {
      const user = await getCurrentUser();
      if (user) {
        dbUserId = user.id;
        userEmail = user.email;
      }
    } catch {
      // ปล่อยผ่านสำหรับ Guest
    }

    const supabase = createSupabaseAdminClient();

    // 3. บันทึกลงตาราง reports
    const { error: insertError } = await supabase
      .from("reports")
      .insert({
        user_id: dbUserId,
        email: userEmail,
        message: message.trim(),
        status: "pending"
      });

    if (insertError) {
      throw new Error(insertError.message || "Failed to save report");
    }

    return NextResponse.json({ ok: true, message: "Report submitted successfully!" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to submit report";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
