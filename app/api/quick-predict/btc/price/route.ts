import { NextResponse } from "next/server";

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
const BINANCE_API = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const BINANCE_24H_API = "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT";

// Cache price for 15 seconds to avoid rate limiting
let cachedPrice: { price: number; change24h: number; timestamp: number } | null = null;
const CACHE_TTL = 15000; // 15 seconds

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

  let lastError: any = null;

  // Try CoinGecko first
  try {
    const response = await fetch(COINGECKO_API, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      next: { revalidate: 15 },
    });

    if (response.ok) {
      const data = await response.json();
      const price = data.bitcoin?.usd ?? 0;
      const change24h = data.bitcoin?.usd_24h_change ?? 0;

      if (price > 0) {
        cachedPrice = { price, change24h, timestamp: now };
        return NextResponse.json({
          ok: true,
          data: { price, change24h, cached: false, source: "coingecko", timestamp: new Date(now).toISOString() },
        });
      }
    }
  } catch (e) {
    lastError = e;
    console.warn("[BTC price] CoinGecko failed, trying Binance:", e instanceof Error ? e.message : e);
  }

  // Fallback to Binance
  try {
    const [priceRes, changeRes] = await Promise.all([
      fetch(BINANCE_API, { cache: "no-store", next: { revalidate: 15 } }),
      fetch(BINANCE_24H_API, { cache: "no-store", next: { revalidate: 15 } }),
    ]);

    if (priceRes.ok) {
      const priceData = await priceRes.json();
      const price = parseFloat(priceData.price) || 0;

      let change24h = 0;
      if (changeRes.ok) {
        const changeData = await changeRes.json();
        change24h = parseFloat(changeData.priceChangePercent) || 0;
      }

      if (price > 0) {
        cachedPrice = { price, change24h, timestamp: now };
        return NextResponse.json({
          ok: true,
          data: { price, change24h, cached: false, source: "binance", timestamp: new Date(now).toISOString() },
        });
      }
    }
  } catch (e) {
    console.warn("[BTC price] Binance also failed:", e instanceof Error ? e.message : e);
  }

  // If we have stale cache, return it as fallback
  if (cachedPrice && now - cachedPrice.timestamp < 300000) { // 5 min stale cache
    return NextResponse.json({
      ok: true,
      data: {
        price: cachedPrice.price,
        change24h: cachedPrice.change24h,
        cached: true,
        stale: true,
        timestamp: new Date(cachedPrice.timestamp).toISOString(),
      },
    });
  }

  return NextResponse.json(
    { ok: false, error: "Failed to fetch BTC price from all sources", detail: lastError instanceof Error ? lastError.message : "Unknown error" },
    { status: 500 },
  );
}
