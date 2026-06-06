import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/db";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

type ResolveBody = {
  winningOptionId?: string;
};

function toStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Resolve failed";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 500;
}

export async function POST(request: NextRequest, context: Params) {
  let predictionId = "";
  try {
    await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    predictionId = id;
    const body = (await request.json()) as ResolveBody;

    if (!body.winningOptionId) {
      return NextResponse.json({ ok: false, error: "Winning option is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const resolvedAt = new Date().toISOString();

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

    if (pred.status === "resolving") {
      return NextResponse.json(
        { ok: false, error: "Prediction is already being resolved. Please wait or contact support." },
        { status: 409 }
      );
    }

    if (!["open", "closed"].includes(pred.status)) {
      return NextResponse.json(
        { ok: false, error: `Cannot resolve prediction with status "${pred.status}". Must be "open" or "closed".` },
        { status: 400 }
      );
    }

    // 2. Lock prediction by setting status to "resolving"
    const { data: updatedRows, error: statusError } = await supabase
      .from("predictions")
      .update({ status: "resolving", updated_at: resolvedAt })
      .eq("id", predictionId)
      .eq("status", pred.status) // optimistic lock: only update if status hasn't changed
      .select();

    if (statusError) {
      return NextResponse.json(
        { ok: false, error: `Failed to lock prediction: ${statusError.message}` },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Prediction status changed before lock. Please refresh and try again." },
        { status: 409 }
      );
    }

    // 3. Call atomic database function for resolution.
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
      throw new Error(rpcError.message || "Atomic resolve failed");
    }

    // 4. rpcResult is a JSONB object: { ok: true, data: {...} } or { ok: false, error: "..." }
    if (!rpcResult?.ok) {
      // Reset status if stuck in "resolving" — restore to original state based on closesAt
      const now = Date.now();
      const closesAt = pred?.closes_at ? new Date(pred.closes_at).getTime() : 0;
      const shouldBeOpen = now < closesAt;
      await supabase
        .from("predictions")
        .update({ status: shouldBeOpen ? "open" : "closed", updated_at: new Date().toISOString() })
        .eq("id", predictionId)
        .eq("status", "resolving");

      return NextResponse.json(
        { ok: false, error: rpcResult?.error || "Resolve failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: rpcResult.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";

    // Reset status back to original state if stuck in "resolving"
    try {
      if (!predictionId) return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
      const supabase = createSupabaseAdminClient();
      const { data: pred } = await supabase
        .from("predictions")
        .select("closes_at")
        .eq("id", predictionId)
        .single();
      const now = Date.now();
      const closesAt = pred?.closes_at ? new Date(pred.closes_at).getTime() : 0;
      const shouldBeOpen = now < closesAt;
      await supabase
        .from("predictions")
        .update({ status: shouldBeOpen ? "open" : "closed", updated_at: new Date().toISOString() })
        .eq("id", predictionId)
        .eq("status", "resolving");
    } catch {
      // Ignore reset errors
    }

    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
