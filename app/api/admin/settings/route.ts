import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

const settingsDir = path.join(process.cwd(), "data");
const settingsPath = path.join(settingsDir, "site-settings.json");

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

async function readSettings(): Promise<SiteSettings> {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8")) as SiteSettings;
  } catch {
    return fallback;
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
    const settings = await readSettings();

    // ดึงรายชื่อซีซั่นที่มีอยู่จริงในตารางคะแนนเกียรติยศ
    const supabase = createSupabaseAdminClient();
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
    const current = await readSettings();
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

    await mkdir(settingsDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify(next, null, 2), "utf8");

    return NextResponse.json({ ok: true, data: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings update failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
