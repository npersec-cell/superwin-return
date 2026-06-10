import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type TournamentItem = {
  name: string;
  logoUrl: string;
  archived?: boolean;
};

type SiteSettings = {
  info: {
    howToPlay: string;
    questionTime: string;
  };
  tournaments: (string | TournamentItem)[];
  savedQuestions: string[];
  savedRounds: string[];
  predictionOrder?: string[];
  announcement?: string;
  numberWarDescription?: string;
};

const fallback: SiteSettings = {
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
  savedRounds: [
    "รอบ 16 ทีม",
    "รอบ 8 ทีม",
    "รอบชิงชนะเลิศ"
  ],
  numberWarDescription: "ต่ำกว่า 100 · 101-299 · มากกว่า 300 | ซื้อครั้งแรก 10 | แย่งซื้อ x2 ทุกครั้ง | ชนะตามเลขที่ประกาศ",
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the All time Top 10!"
};

async function readSettingsFromDb(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<SiteSettings> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "site_settings")
      .maybeSingle();

    if (error || !data || !data.value) {
      return fallback;
    }
    return data.value as SiteSettings;
  } catch {
    return fallback;
  }
}

async function writeSettingsToDb(supabase: ReturnType<typeof createSupabaseAdminClient>, settings: SiteSettings): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({
      key: "site_settings",
      value: settings,
      updated_at: new Date().toISOString()
    });

  if (error) {
    throw new Error("Failed to write settings to database: " + error.message);
  }
}

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Settings update failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();
    const settings = await readSettingsFromDb(supabase);

    return NextResponse.json({ 
      ok: true, 
      data: settings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings load failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();
    const current = await readSettingsFromDb(supabase);
    const body = (await request.json()) as Partial<SiteSettings>;
    
    // 使用fallback作为基础，确保缺失的字段有默认值
    const next: SiteSettings = {
      info: { ...fallback.info, ...current.info, ...(body.info || {}) },
      tournaments: body.tournaments !== undefined ? body.tournaments : (current.tournaments || fallback.tournaments),
      savedQuestions: body.savedQuestions !== undefined ? body.savedQuestions : (current.savedQuestions || fallback.savedQuestions),
      savedRounds: body.savedRounds !== undefined ? body.savedRounds : (current.savedRounds || fallback.savedRounds),
      predictionOrder: body.predictionOrder !== undefined ? body.predictionOrder : (current.predictionOrder || fallback.predictionOrder),
      numberWarDescription: body.numberWarDescription !== undefined ? body.numberWarDescription : (current.numberWarDescription || fallback.numberWarDescription),
      announcement: body.announcement !== undefined ? body.announcement : (current.announcement || fallback.announcement)
    };

    await writeSettingsToDb(supabase, next);

    return NextResponse.json({ ok: true, data: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings update failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
