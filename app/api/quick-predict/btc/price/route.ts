import { NextResponse } from "next/server";

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";

// Cache price for 10 seconds to avoid rate limiting
let cachedPrice: { price: number; change24h: number; timestamp: number } | null = null;
const CACHE_TTL = 10000; // 10 seconds

export async function GET() {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice && now - cachedPrice.timestamp < CACHE_TTL) {
    return NextResponse.json({
      ok: true,
      data: {
        price: cachedPrice.price,
        change24h: cachedPrice.change24h,
        cached: true,
        timestamp: new Date(cachedPrice.timestamp).toISOString(),
      },
    });
  }

  try {
    const response = await fetch(COINGECKO_API, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`);
    }

    const data = await response.json();
    const price = data.bitcoin?.usd ?? 0;
    const change24h = data.bitcoin?.usd_24h_change ?? 0;

    cachedPrice = { price, change24h, timestamp: now };

    return NextResponse.json({
      ok: true,
      data: {
        price,
        change24h,
        cached: false,
        timestamp: new Date(now).toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to fetch BTC price:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch BTC price", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
