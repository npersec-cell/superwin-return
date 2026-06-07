import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { checkRateLimit, applyRateLimitHeaders, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Refund failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    const supabase = createSupabaseAdminClient();
    const refundedAt = new Date().toISOString();

    // Rate Limiting Check
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.REFUND, admin.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Use atomic database function for refund
    const { data, error } = await supabase.rpc("refund_prediction_atomic", {
      p_prediction_id: id,
      p_refunded_at: refundedAt,
    });

    if (error) {
      // Handle specific error messages from the function
      const msg = error.message || "Refund failed";
      if (msg.includes("not found")) {
        return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
      }
      if (msg.includes("already canceled")) {
        return NextResponse.json({ ok: false, error: "Prediction already canceled" }, { status: 400 });
      }
      if (msg.includes("Resolved")) {
        return NextResponse.json({ ok: false, error: "Resolved prediction cannot be refunded" }, { status: 400 });
      }
      if (msg.includes("No running entries")) {
        return NextResponse.json({ ok: false, error: "No running entries to refund" }, { status: 400 });
      }
      throw new Error(msg);
    }

    // Parse result from function
    if (!data || typeof data !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid response from refund function" }, { status: 500 });
    }

    const result = data as { ok?: boolean; error?: string; data?: { predictionId?: string; refundedCount?: number; totalRefunded?: number } };

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || "Refund failed" },
        { status: result.error?.includes("not found") ? 404 : 400 }
      );
    }

    let response = NextResponse.json({
      ok: true,
      data: {
        predictionId: result.data?.predictionId || id,
        refundedEntries: result.data?.refundedCount || 0,
        totalRefunded: result.data?.totalRefunded || 0,
      },
    });

    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
