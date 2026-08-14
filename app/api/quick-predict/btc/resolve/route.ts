import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/db";

// Manual trigger endpoint for auto-resolve
// In production, this should be called by a cron job every 30-60 seconds

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

export async function POST() {
  try {
    // Fetch current BTC price
    const response = await fetch(COINGECKO_API, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const currentPrice = data.bitcoin?.usd;

    if (!currentPrice) {
      return NextResponse.json({ ok: false, error: "Failed to fetch BTC price" }, { status: 500 });
    }

    const supabase = createSupabaseAdminClient();

    // Call the resolve function
    const { data: result, error: rpcError } = await supabase.rpc("resolve_expired_btc_quick_predictions", {
      p_current_btc_price: currentPrice,
    });

    if (rpcError) {
      console.error("Resolve RPC error:", rpcError);
      return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: result,
      btcPrice: currentPrice,
    });
  } catch (error) {
    console.error("Failed to resolve expired BTC predictions:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// Also allow GET for manual testing
export async function GET() {
  return POST();
}
