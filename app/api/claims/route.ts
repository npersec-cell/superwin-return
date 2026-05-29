import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";

const claimsDir = path.join(process.cwd(), "data");
const claimsPath = path.join(claimsDir, "winner-claims.json");
const settingsPath = path.join(claimsDir, "site-settings.json");

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

async function readClaims(): Promise<Claim[]> {
  try {
    return JSON.parse(await readFile(claimsPath, "utf8")) as Claim[];
  } catch {
    return [];
  }
}

async function readSettings() {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8"));
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

    const settings = await readSettings();
    if (!settings || !settings.reward || !settings.reward.winnerBy || !settings.reward.approved) {
      return NextResponse.json({ ok: true, data: null });
    }

    // ตรวจสอบว่าผู้ใช้ปัจจุบันคือผู้ชนะประจำเดือนหรือไม่
    const isWinner =
      (user.displayName && user.displayName.toLowerCase() === settings.reward.winnerBy.toLowerCase()) ||
      (user.email && user.email.toLowerCase() === settings.reward.winnerBy.toLowerCase());

    if (!isWinner) {
      return NextResponse.json({ ok: true, data: null });
    }

    const claims = await readClaims();
    // หาใบเคลมพัสดุประจำเดือนปัจจุบันของผู้ชนะรายนี้
    const activeClaim = claims.find(
      (c) =>
        c.month === settings.reward.month &&
        (c.winnerEmail.toLowerCase() === user.email.toLowerCase() ||
          c.winnerName.toLowerCase() === (user.displayName || "").toLowerCase())
    );

    if (activeClaim) {
      // หากแอดมินตั้งสถานะเป็นจัดส่งสำเร็จ (completed) แล้วเกิน 7 วัน ให้แถบข้อความนี้หายไปถาวรสำหรับผู้ชนะ
      if (activeClaim.status === "completed" && activeClaim.completedAt) {
        const diffTime = Date.now() - new Date(activeClaim.completedAt).getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
          return NextResponse.json({ ok: true, data: null });
        }
      }
      return NextResponse.json({ ok: true, data: activeClaim });
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

    const settings = await readSettings();
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

    const claims = await readClaims();
    const existingIndex = claims.findIndex(
      (c) =>
        c.month === settings.reward.month &&
        (c.winnerEmail.toLowerCase() === user.email.toLowerCase() ||
          c.winnerName.toLowerCase() === (user.displayName || "").toLowerCase())
    );

    const claimData: Claim = {
      id: existingIndex >= 0 ? claims[existingIndex].id : crypto.randomUUID(),
      month: settings.reward.month,
      rewardName: settings.reward.name,
      winnerName: user.displayName || user.email,
      winnerEmail: user.email,
      receiverName: String(receiverName).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      note: String(note || "").trim(),
      status: "contacting", // เปลี่ยนสถานะเป็นเริ่มแพ็คของทันทีเมื่อส่งข้อมูล
      trackingNumber: existingIndex >= 0 ? claims[existingIndex].trackingNumber : "",
      createdAt: existingIndex >= 0 ? claims[existingIndex].createdAt : new Date().toISOString()
    };

    if (existingIndex >= 0) {
      claims[existingIndex] = claimData;
    } else {
      claims.push(claimData);
    }

    await mkdir(claimsDir, { recursive: true });
    await writeFile(claimsPath, JSON.stringify(claims, null, 2), "utf8");

    return NextResponse.json({ ok: true, data: claimData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit claim";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
