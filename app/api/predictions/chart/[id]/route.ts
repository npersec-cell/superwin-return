import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: predictionId } = await params;
    const supabase = createSupabaseAdminClient();

    // Fetch snapshots grouped by time buckets
    // For questions < 24h old: bucket by minute
    // For questions > 24h old: bucket by hour
    const { data: snapshots, error } = await supabase
      .from("prediction_snapshots")
      .select("option_id, coins_on_option, percentage, total_pool, created_at")
      .eq("prediction_id", predictionId)
      .order("created_at", { ascending: true })
      .limit(500); // Max 500 data points

    if (error) {
      throw new Error(error.message || "Failed to load chart data");
    }

    // Group by time and option
    const byOption: Record<string, Array<{ t: string; pct: number; coins: number }>> = {};
    const timestamps = new Set<string>();
    
    for (const snap of (snapshots || [])) {
      if (!byOption[snap.option_id]) {
        byOption[snap.option_id] = [];
      }
      byOption[snap.option_id].push({
        t: snap.created_at,
        pct: Number(snap.percentage) || 0,
        coins: snap.coins_on_option || 0,
      });
      timestamps.add(snap.created_at);
    }

    // Get option labels
    const { data: options } = await supabase
      .from("prediction_options")
      .select("id, label")
      .eq("prediction_id", predictionId);

    const labelsById = new Map((options || []).map(o => [o.id, o.label]));

    return NextResponse.json({
      ok: true,
      data: {
        optionIds: Object.keys(byOption),
        labels: Object.fromEntries(
          Object.keys(byOption).map(id => [id, labelsById.get(id) || "Unknown"])
        ),
        series: byOption,
        timestamps: Array.from(timestamps).sort(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load chart data";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
