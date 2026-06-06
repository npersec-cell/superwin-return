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
  try {
    await requireAdmin(request);
    const { id } = await Promise.resolve(context.params);
    const body = (await request.json()) as ResolveBody;

    if (!body.winningOptionId) {
      return NextResponse.json({ ok: false, error: "Winning option is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const resolvedAt = new Date().toISOString();

    // Set status to "resolving" to prevent concurrent resolves
    const { error: statusError } = await supabase
      .from("predictions")
      .update({ status: "resolving", updated_at: resolvedAt })
      .eq("id", id)
      .eq("status", "open");

    if (statusError) {
      throw new Error("Failed to lock prediction for resolution");
    }

    // Use atomic database function for resolution.
    // This prevents partial updates: if any error occurs, the entire transaction rolls back.
    const { data: rpcResult, error: rpcError } = await supabase.rpc("resolve_prediction_atomic", {
      p_prediction_id: id,
      p_winning_option_id: body.winningOptionId,
      p_resolved_at: resolvedAt,
    });

    if (rpcError) {
      // Check if function exists
      if (rpcError.message?.includes("could not find the function") || rpcError.code === "P0002") {
        return NextResponse.json({
          ok: false,
          error: "Atomic resolve function not found. Please run the SQL migration: supabase_migrations/atomic_resolve.sql",
        }, { status: 500 });
      }
      throw new Error(rpcError.message || "Atomic resolve failed");
    }

    // rpcResult is a JSONB object: { ok: true, data: {...} } or { ok: false, error: "..." }
    if (!rpcResult?.ok) {
      // Reset status if stuck in "resolving"
      await supabase
        .from("predictions")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "resolving");

      return NextResponse.json(
        { ok: false, error: rpcResult?.error || "Resolve failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: rpcResult.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resolve failed";
    
    // Reset status back to "open" if stuck in "resolving"
    try {
      const supabase = createSupabaseAdminClient();
      await supabase
        .from("predictions")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "resolving");
    } catch {
      // Ignore reset errors
    }
    
    return NextResponse.json({ ok: false, error: message }, { status: toStatus(error) });
  }
}
