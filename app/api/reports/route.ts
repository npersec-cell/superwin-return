import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || "superwin-captcha-2026";

// Simple in-memory rate limiter: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

function encodeCaptcha(num1: number, num2: number): string {
  const data = `${num1}:${num2}:${Date.now()}`;
  let encoded = "";
  for (let i = 0; i < data.length; i++) {
    encoded += String.fromCharCode(data.charCodeAt(i) ^ CAPTCHA_SECRET.charCodeAt(i % CAPTCHA_SECRET.length));
  }
  return Buffer.from(encoded).toString("base64url");
}

function decodeCaptcha(token: string): { num1: number; num2: number; timestamp: number } | null {
  try {
    const encoded = Buffer.from(token, "base64url").toString("binary");
    let data = "";
    for (let i = 0; i < encoded.length; i++) {
      data += String.fromCharCode(encoded.charCodeAt(i) ^ CAPTCHA_SECRET.charCodeAt(i % CAPTCHA_SECRET.length));
    }
    const [num1, num2, timestamp] = data.split(":").map(Number);
    if (isNaN(num1) || isNaN(num2) || isNaN(timestamp)) return null;
    // Token expires after 10 minutes
    if (Date.now() - timestamp > 10 * 60 * 1000) return null;
    return { num1, num2, timestamp };
  } catch {
    return null;
  }
}

export async function GET() {
  const num1 = Math.floor(Math.random() * 90) + 10; // 10-99
  const num2 = Math.floor(Math.random() * 90) + 10; // 10-99
  const token = encodeCaptcha(num1, num2);
  return NextResponse.json({
    ok: true,
    question: `${num1} + ${num2} =`,
    token
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again in 5 minutes." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { message, token, answer } = body;

    if (!message || message.trim() === "") {
      return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 });
    }

    if (!token || !answer || answer.trim() === "") {
      return NextResponse.json({ ok: false, error: "Captcha is required" }, { status: 400 });
    }

    // 1. Decode token to get expected answer (server-side only)
    const decoded = decodeCaptcha(token);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: "Captcha expired. Please refresh and try again." }, { status: 400 });
    }

    const expected = decoded.num1 + decoded.num2;
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
