import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

type Claim = {
  id: string;
  month: string;
  rewardName: string;
  winnerName: string;
  winnerEmail: string;
  receiverName: string;
  phone: string;
  address: string;
  note: string;
  status: "pending" | "contacting" | "completed";
  trackingNumber: string;
  createdAt: string;
  completedAt?: string;
};

async function readSettingsFromDb(supabase: any) {
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "site_settings")
      .maybeSingle();
    return data?.value || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const settings = await readSettingsFromDb(supabase);
    if (!settings || !settings.reward || !settings.reward.winnerBy || !settings.reward.approved) {
      return NextResponse.json({ ok: true, data: null });
    }

    // ตรวจสอบว่าผู้ใช้ปัจจุบันคือผู้ชนะประจำฤดูกาลตัวจริงหรือไม่
    const isWinner =
      (user.displayName && user.displayName.toLowerCase() === settings.reward.winnerBy.toLowerCase()) ||
      (user.email && user.email.toLowerCase() === settings.reward.winnerBy.toLowerCase());

    if (!isWinner) {
      return NextResponse.json({ ok: true, data: null });
    }

    // คิวรีดึงข้อมูลใบเคลมพัสดุจาก Supabase
    const { data: dbClaim, error: fetchError } = await supabase
      .from("winner_claims")
      .select("*")
      .eq("month", settings.reward.month)
      .eq("winner_email", user.email.toLowerCase())
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (dbClaim) {
      // หากแอดมินตั้งสถานะเป็นจัดส่งสำเร็จ (completed) แล้วเกิน 7 วัน ให้แถบข้อความนี้หายไปถาวรสำหรับผู้ชนะ
      if (dbClaim.status === "completed" && dbClaim.completed_at) {
        const diffTime = Date.now() - new Date(dbClaim.completed_at).getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
          return NextResponse.json({ ok: true, data: null });
        }
      }

      // แมปปิงข้อมูลกลับเป็นฟอร์แมต CamelCase สำหรับหน้ากากส่วนติดต่อแรก (Frontend)
      const mappedClaim: Claim = {
        id: dbClaim.id,
        month: dbClaim.month,
        rewardName: dbClaim.reward_name,
        winnerName: dbClaim.winner_name,
        winnerEmail: dbClaim.winner_email,
        receiverName: dbClaim.receiver_name || "",
        phone: dbClaim.phone || "",
        address: dbClaim.address || "",
        note: dbClaim.note || "",
        status: dbClaim.status,
        trackingNumber: dbClaim.tracking_number || "",
        createdAt: dbClaim.created_at,
        completedAt: dbClaim.completed_at
      };

      return NextResponse.json({ ok: true, data: mappedClaim });
    }

    // หากยังไม่เคยเคลม ให้คืนรูปแบบเริ่มต้นเพื่อบอกว่าให้เคลมได้
    const defaultClaim: Partial<Claim> = {
      month: settings.reward.month,
      rewardName: settings.reward.name,
      winnerName: user.displayName || user.email,
      winnerEmail: user.email,
      status: "pending"
    };

    return NextResponse.json({ ok: true, data: defaultClaim });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load claim";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const settings = await readSettingsFromDb(supabase);
    if (!settings || !settings.reward || !settings.reward.winnerBy || !settings.reward.approved) {
      return NextResponse.json({ ok: false, error: "Winner reward is not approved yet" }, { status: 403 });
    }

    const isWinner =
      (user.displayName && user.displayName.toLowerCase() === settings.reward.winnerBy.toLowerCase()) ||
      (user.email && user.email.toLowerCase() === settings.reward.winnerBy.toLowerCase());

    if (!isWinner) {
      return NextResponse.json({ ok: false, error: "You are not the designated winner" }, { status: 403 });
    }

    const body = await request.json();
    const { receiverName, phone, address, note } = body;

    if (!receiverName || !phone || !address) {
      return NextResponse.json({ ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    // คิวรีดูข้อมูลเดิมเพื่อนำ ID มา Upsert ป้องกันแถวซ้ำซ้อน
    const { data: existing } = await supabase
      .from("winner_claims")
      .select("id, tracking_number, created_at")
      .eq("month", settings.reward.month)
      .eq("winner_email", user.email.toLowerCase())
      .maybeSingle();

    const claimId = existing ? existing.id : crypto.randomUUID();

    const { error: upsertError } = await supabase
      .from("winner_claims")
      .upsert({
        id: claimId,
        month: settings.reward.month,
        reward_name: settings.reward.name,
        winner_name: user.displayName || user.email,
        winner_email: user.email.toLowerCase(),
        receiver_name: String(receiverName).trim(),
        phone: String(phone).trim(),
        address: String(address).trim(),
        note: String(note || "").trim(),
        status: "contacting",
        tracking_number: existing ? existing.tracking_number : "",
        created_at: existing ? existing.created_at : new Date().toISOString()
      });

    if (upsertError) {
      throw new Error(upsertError.message || "Failed to submit claim to database");
    }

    // แมปกลับคืนให้ฝั่งเว็บแสดงสถานะกำลังดำเนินการ (contacting)
    const claimData: Claim = {
      id: claimId,
      month: settings.reward.month,
      rewardName: settings.reward.name,
      winnerName: user.displayName || user.email,
      winnerEmail: user.email,
      receiverName: String(receiverName).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      note: String(note || "").trim(),
      status: "contacting",
      trackingNumber: existing ? existing.tracking_number : "",
      createdAt: existing ? existing.created_at : new Date().toISOString()
    };

    return NextResponse.json({ ok: true, data: claimData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit claim";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
