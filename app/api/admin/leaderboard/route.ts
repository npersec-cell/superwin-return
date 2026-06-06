import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Load top users failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = createSupabaseAdminClient();

    // ดึงผู้ใช้ 10 อันดับแรกที่มี lifetime_profit สูงสุดเพื่อทำ dropdown หน้ารางวัล
    const { data: allUsers, error } = await supabase
      .from("users")
      .select("id, email, display_name, lifetime_profit")
      .order("lifetime_profit", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    // กรอง user ทดสอบออก (ทำใน JS เพื่อจัดการ NULL ได้ถูกต้อง)
    const data = (allUsers || []).filter((u) => {
      const email = (u.email || "").toLowerCase();
      const displayName = (u.display_name || "").toLowerCase();
      return (
        !email.includes("test") &&
        !displayName.includes("test") &&
        !displayName.includes("ทดสอบ")
      );
    }).slice(0, 10);

    const defaultLeaderboard = [
      { id: "default-1", email: "maverick@email.com", displayName: "Maverick" },
      { id: "default-2", email: "nova@email.com", displayName: "Nova" },
      { id: "default-3", email: "raptor@email.com", displayName: "Raptor" },
      { id: "default-4", email: "echo@email.com", displayName: "Echo" },
      { id: "default-5", email: "vector@email.com", displayName: "Vector" }
    ];

    const mapped = (data || []).map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.display_name || user.email.split("@")[0]
    }));

    // รวมรายชื่อ default และผู้ใช้จริงไม่ให้ซ้ำกัน
    const unique = [...mapped];
    for (const item of defaultLeaderboard) {
      if (!unique.some((u) => u.email === item.email)) {
        unique.push(item);
      }
    }

    return NextResponse.json({ ok: true, data: unique.slice(0, 10) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Load top users failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
