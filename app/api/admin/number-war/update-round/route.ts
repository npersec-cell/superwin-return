import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);

    const body = await request.json();
    const { roundId, name, openAt, closeAt, prizeName, prizeImageUrl } = body;

    if (!roundId) {
      return NextResponse.json(
        { ok: false, error: "กรุณาระบุรายการแข่งขัน" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: Record<string, string | null> = {};
    if (name !== undefined) updateData.name = name;
    if (openAt !== undefined) updateData.open_at = openAt || null;
    if (closeAt !== undefined) updateData.close_at = closeAt || null;
    if (prizeName !== undefined) updateData.prize_name = prizeName;
    if (prizeImageUrl !== undefined) updateData.prize_image_url = prizeImageUrl;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "ไม่มีข้อมูลที่ต้องการแก้ไข" },
        { status: 400 }
      );
    }

    const { data: round, error } = await supabase
      .from("number_war_rounds")
      .update(updateData)
      .eq("id", roundId)
      .select()
      .single();

    if (error) {
      console.error("Error updating round:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to update round" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: round });
  } catch (error) {
    console.error("Error updating round:", error);
    const message = error instanceof Error ? error.message : "Failed to update round";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
