import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const settingsPath = path.join(process.cwd(), "data", "site-settings.json");

export async function GET() {
  try {
    const raw = await readFile(settingsPath, "utf8");
    return NextResponse.json({ ok: true, data: JSON.parse(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
