import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type TournamentItem = {
  name: string;
  logoUrl: string;
};

type SiteSettings = {
  info: {
    howToPlay: string;
    reward: string;
    questionTime: string;
  };
  reward: {
    name: string;
    winnerBy: string;
    month: string;
    approved: boolean;
  };
  tournaments: (string | TournamentItem)[];
  savedQuestions: string[];
  season?: {
    startAt: string;
    endAt: string;
    status: "active" | "ended";
  };
  predictionOrder?: string[];
  announcement?: string;
};

const fallback: SiteSettings = {
  info: {
    howToPlay: "ล็อกอิน ➔ กดรับเหรียญฟรีทุก 1 ชั่วโมง ➔ เลือกวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนเหรียญแล้วกดยืนยันคำทายผล",
    reward: "ลุ้นติดอันดับ Season Top 10 วัดจากกำไรสุทธิประจำซีซั่น (Season Profit) ผู้ชนะอันดับ 1 จะได้รับของรางวัลพิเศษหลังแอดมินยืนยัน",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
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

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();
    const settings = await readSettingsFromDb(supabase);

    // ดึงรายชื่อซีซั่นที่มีอยู่จริงในตารางคะแนนเกียรติยศ
    const { data: dbSeasons } = await supabase
      .from("monthly_leaderboards")
      .select("month");
    
    const historySeasons = Array.from(new Set((dbSeasons || []).map((s) => s.month))).filter(Boolean);
    
    if (settings.reward?.month && !historySeasons.includes(settings.reward.month)) {
      historySeasons.push(settings.reward.month);
    }
    if (historySeasons.length === 0) {
      historySeasons.push("Season 1");
    }

    const resultSettings = {
      ...settings,
      historySeasons
    };

    return NextResponse.json({ 
      ok: true, 
      data: resultSettings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings load failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createSupabaseAdminClient();
    const current = await readSettingsFromDb(supabase);
    const body = (await request.json()) as Partial<SiteSettings>;
    
    const next: SiteSettings = {
      info: { ...current.info, ...(body.info || {}) },
      reward: { ...current.reward, ...(body.reward || {}) },
      tournaments: body.tournaments !== undefined ? body.tournaments : (current.tournaments || [{ name: "Super League", logoUrl: "" }]),
      savedQuestions: body.savedQuestions !== undefined ? body.savedQuestions : (current.savedQuestions || [
        "Which team will win the championship?",
        "Which team will get the Chicken Dinner?",
        "Who will get the most kills in this match?"
      ]),
      season: body.season !== undefined ? body.season : current.season,
      predictionOrder: body.predictionOrder !== undefined ? body.predictionOrder : current.predictionOrder,
      announcement: body.announcement !== undefined ? body.announcement : current.announcement
    };

    await writeSettingsToDb(supabase, next);

    return NextResponse.json({ ok: true, data: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings update failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
