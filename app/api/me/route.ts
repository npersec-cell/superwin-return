import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
