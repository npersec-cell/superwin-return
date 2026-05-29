import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";

const claimsDir = path.join(process.cwd(), "data");
const claimsPath = path.join(claimsDir, "winner-claims.json");

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
};

async function readClaims(): Promise<Claim[]> {
  try {
    return JSON.parse(await readFile(claimsPath, "utf8")) as Claim[];
  } catch {
    return [];
  }
}

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Admin request failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function GET() {
  try {
    await requireAdmin();
    const claims = await readClaims();
    // เรียงลำดับจากล่าสุดลงไป
    const sorted = [...claims].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({ ok: true, data: sorted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load claims";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { id, status, trackingNumber } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing claim ID" }, { status: 400 });
    }

    const claims = await readClaims();
    const index = claims.findIndex((c) => c.id === id);

    if (index === -1) {
      return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });
    }

    const current = claims[index];
    const updated: Claim = {
      ...current,
      status: status !== undefined ? status : current.status,
      trackingNumber: trackingNumber !== undefined ? String(trackingNumber).trim() : current.trackingNumber
    };

    claims[index] = updated;

    await mkdir(claimsDir, { recursive: true });
    await writeFile(claimsPath, JSON.stringify(claims, null, 2), "utf8");

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update claim";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
