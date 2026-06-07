import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";
import { validateRequest, resolveBodySchema } from "@/lib/validation";
import { checkRateLimit, applyRateLimitHeaders, createRateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Resolve failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest, context: Params) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    const predictionId = id;

    // Rate Limiting Check
    const rateLimitResult = await checkRateLimit(request, RATE_LIMITS.RESOLVE, admin.id);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }

    // Validate request body with Zod
    const validation = await validateRequest(request, resolveBodySchema);
    if (!validation.success) {
      return validation.response;
    }

    const body = validation.data;
    const supabase = createSupabaseAdminClient();
    const resolvedAt = new Date(); // ส่งเป็น Date object เพื่อให้ PostgreSQL เลือก timestamptz version

    // 1. Check prediction exists and current status
    const { data: pred, error: predErr } = await supabase
      .from("predictions")
      .select("status, closes_at")
      .eq("id", predictionId)
      .single();

    if (predErr || !pred) {
      return NextResponse.json({ ok: false, error: "Prediction not found" }, { status: 404 });
    }

    if (pred.status === "resolved") {
      return NextResponse.json({ ok: false, error: "Prediction already resolved" }, { status: 400 });
    }

    if (pred.status === "canceled") {
      return NextResponse.json({ ok: false, error: "Prediction has been canceled" }, { status: 400 });
    }

    if (!["open", "closed"].includes(pred.status)) {
      return NextResponse.json(
        { ok: false, error: `Cannot resolve prediction with status "${pred.status}". Must be "open" or "closed".` },
        { status: 400 }
      );
    }

    // 2. Call atomic database function for resolution directly (no 'resolving' lock needed)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("resolve_prediction_atomic", {
      p_prediction_id: predictionId,
      p_winning_option_id: body.winningOptionId,
      p_resolved_at: resolvedAt,
    });

    if (rpcError) {
      // Check if function exists
      if (rpcError.message?.includes("could not find the function") || rpcError.code === "P0002") {
        return NextResponse.json({
          ok: false,
          error: "Atomic resolve function not found. Please run the SQL migration.",
        }, { status: 500 });
      }
      return NextResponse.json({
        ok: false,
        error: `Resolve failed: ${rpcError.message}`,
      }, { status: 500 });
    }

    // 3. rpcResult is a JSONB object: { ok: true, data: {...} } or { ok: false, error: "..." }
    if (!rpcResult?.ok) {
      return NextResponse.json(
        { ok: false, error: rpcResult?.error || "Resolve failed" },
        { status: 500 }
      );
    }

    let response = NextResponse.json({ ok: true, data: rpcResult.data });
    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
