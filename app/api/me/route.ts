import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        coinBalance: user.coinBalance,
        lifetimeProfit: user.lifetimeProfit,
        profitScore: user.profitScore,
        lastClaimAt: user.lastClaimAt,
        nextClaimAt: user.nextClaimAt,
        status: user.status,
        avatarUrl: user.avatarUrl,
        addressCompleted: user.addressCompleted ?? false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
