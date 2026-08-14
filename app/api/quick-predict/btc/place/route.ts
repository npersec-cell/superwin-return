import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest } from "@/lib/validation";
import { z } from "zod";
import { checkRateLimit, RATE_LIMITS, createRateLimitResponse } from "@/lib/rate-limit";

const quickPredictBodySchema = z.object({
  direction: z.enum(["UP", "DOWN"]),
  durationSeconds: z.number().refine((v) => [60, 300, 900].includes(v), {
    message: "Duration must be 60, 300, or 900 seconds",
  }),
  entryPrice: z.number().positive("Entry price must be positive"),
  stakeAmount: z.number().positive("Stake must be positive").refine((v) => v >= 5 && Number.isInteger(v), {
    message: "Stake must be at least 5 coins",
  }),
  multiplier: z.number().default(1.9),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user.status !== "active") {
      return NextResponse.json({ ok: false, error: "Account is not active" }, { status: 403 });
    }

    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.PREDICT, user.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    const validation = await validateRequest(request, quickPredictBodySchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const supabase = createSupabaseAdminClient();

    const { data, error: rpcError } = await supabase.rpc("place_btc_quick_predict_atomic", {
      p_user_id: user.id,
      p_direction: body.direction,
      p_duration_seconds: body.durationSeconds,
      p_entry_price: body.entryPrice,
      p_stake_amount: body.stakeAmount,
      p_multiplier: body.multiplier,
    });

    if (rpcError) {
      return NextResponse.json({ ok: false, error: rpcError.message || "Unable to place prediction" }, { status: 400 });
    }

    const result = data as any;
    if (!result?.ok) {
      return NextResponse.json({ ok: false, error: result?.error || "Unable to place prediction" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        entryId: result.entryId,
        balanceAfter: result.balanceAfter,
        expiresAt: result.expiresAt,
        potentialPayout: result.potentialPayout,
      },
    });
  } catch (error) {
    console.error("Quick predict error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
