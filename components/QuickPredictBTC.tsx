"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ──
type BTCPriceData = {
  price: number;
  change24h: number;
  cached: boolean;
  timestamp: string;
};

type QuickPredictEntry = {
  id: string;
  direction: "UP" | "DOWN";
  duration_seconds: number;
  entry_price: number;
  stake_amount: number;
  multiplier: number;
  potential_payout: number;
  status: "running" | "won" | "lost" | "refunded";
  created_at: string;
  expires_at: string;
  exit_price?: number | null;
  resolved_at?: string | null;
};

type ConfirmData = {
  direction: "UP" | "DOWN";
  durationSeconds: number;
  stakeAmount: number;
  entryPrice: number;
  multiplier: number;
  potentialPayout: number;
  startTime: Date;
  endTime: Date;
};

// ── Constants ──
const STAKES = [100, 500, 1000] as const;
const DURATIONS = [
  { seconds: 60, label: "1 นาที", multiplier: 1.9 },
  { seconds: 300, label: "5 นาที", multiplier: 1.9 },
  { seconds: 900, label: "15 นาที", multiplier: 1.9 },
] as const;

const formatTime = (date: Date) => {
  return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
};

const AmmoIcon = () => (
  <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
);

// ── Sparkline Chart Component ──
const PriceChart = ({ prices }: { prices: number[] }) => {
  if (prices.length === 0) return null;

  const width = 320;
  const height = 50;
  const padding = 4;

  // If only one price point, show just the dot and label
  if (prices.length === 1) {
    const midY = height / 2;
    const priceLabel = `$${prices[0].toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "50px", display: "block" }}>
        <line x1={padding} y1={midY} x2={width - padding} y2={midY} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3,3" />
        <circle cx={width / 2 - 10} cy={midY} r="4" fill="#ffa502" />
        <text
          x={width / 2 + 6}
          y={midY + 4}
          fill="#ffa502"
          fontSize="11"
          fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
        >
          {priceLabel}
        </text>
      </svg>
    );
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // Generate points for SVG polyline
  const points = prices.map((price, i) => {
    const x = padding + (i / (prices.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (price - minPrice) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  const isUp = prices[prices.length - 1] >= prices[0];
  const strokeColor = isUp ? "#00ff88" : "#ff4757";
  const fillColor = isUp ? "rgba(0, 255, 136, 0.08)" : "rgba(255, 71, 87, 0.08)";

  // Area fill path
  const firstX = padding;
  const lastX = width - padding;
  const bottomY = height - padding;
  const areaPoints = `${firstX},${bottomY} ${points} ${lastX},${bottomY}`;

  const lastPrice = prices[prices.length - 1];
  const lastDotX = lastX;
  const lastDotY = padding + (1 - (lastPrice - minPrice) / range) * (height - padding * 2);
  const priceLabel = `$${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "50px", display: "block" }}>
      {/* Fill area */}
      <polygon points={areaPoints} fill={fillColor} />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle cx={lastDotX} cy={lastDotY} r="3.5" fill={strokeColor} />
      {/* Price label at end — inside SVG bounds */}
      <text
        x={lastDotX - 2}
        y={lastDotY - 6}
        fill={strokeColor}
        fontSize="10"
        fontWeight="700"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="end"
      >
        {priceLabel}
      </text>
    </svg>
  );
};

// ── Main Component ──
export default function QuickPredictBTC({
  userCoins,
  onBalanceUpdate,
  onBetPlaced,
  isSignedIn,
}: {
  userCoins: number;
  onBalanceUpdate: (newBalance: number) => void;
  onBetPlaced?: () => void;
  isSignedIn: boolean;
}) {
  // State
  const [btcPrice, setBtcPrice] = useState<BTCPriceData | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [initialPriceLoaded, setInitialPriceLoaded] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(300);
  const [selectedStake, setSelectedStake] = useState<number | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [placing, setPlacing] = useState(false);
  const [runningEntries, setRunningEntries] = useState<QuickPredictEntry[]>([]);
  const [timeLeftMap, setTimeLeftMap] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<"predict" | "running">("predict");
  const [error, setError] = useState<string | null>(null);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch BTC Price ──
  const fetchPrice = async () => {
    try {
      setLoadingPrice(true);
      const res = await fetch("/api/quick-predict/btc/price");
      const json = await res.json();
      if (json.ok) {
        setBtcPrice(json.data);
        // Track price history for chart — show first price immediately, keep last 15 points
        setPriceHistory((prev) => {
          const newHistory = [...prev, json.data.price];
          if (!initialPriceLoaded) setInitialPriceLoaded(true);
          return newHistory.length > 15 ? newHistory.slice(newHistory.length - 15) : newHistory;
        });
      }
    } catch (e) {
      console.error("Failed to fetch BTC price:", e);
    } finally {
      setLoadingPrice(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000); // Refresh every 5s for faster chart
    return () => clearInterval(interval);
  }, []);

  // ── Fetch Running Entries ──
  const fetchRunning = async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch("/api/quick-predict/btc/running");
      const json = await res.json();
      if (json.ok) {
        setRunningEntries(json.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch running entries:", e);
    }
  };

  useEffect(() => {
    fetchRunning();
    const interval = setInterval(fetchRunning, 15000);
    return () => clearInterval(interval);
  }, [isSignedIn]);

  // ── Auto-resolve expired entries ──
  const triggerResolve = async () => {
    try {
      const res = await fetch("/api/quick-predict/btc/resolve", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.data?.resolved > 0) {
        setTimeout(fetchRunning, 1000);
      }
    } catch (e) {
      // Silent fail
    }
  };

  useEffect(() => {
    if (!isSignedIn || runningEntries.length === 0) return;
    triggerResolve();
    const interval = setInterval(triggerResolve, 30000);
    return () => clearInterval(interval);
  }, [isSignedIn, runningEntries.length]);

  // ── Countdown Timer ──
  useEffect(() => {
    if (runningEntries.length === 0) return;

    const tick = () => {
      const now = Date.now();
      const map: Record<string, number> = {};
      let allResolved = true;

      for (const entry of runningEntries) {
        const expiresAt = new Date(entry.expires_at).getTime();
        const remaining = Math.max(0, expiresAt - now);
        map[entry.id] = remaining;
        if (remaining > 0) allResolved = false;
      }

      setTimeLeftMap(map);

      if (!allResolved) {
        countdownRef.current = setTimeout(tick, 1000);
      } else {
        setTimeout(fetchRunning, 2000);
      }
    };

    tick();
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [runningEntries]);

  // ── Handle Place Bet ──
  const handlePlaceBet = async (direction: "UP" | "DOWN") => {
    if (!selectedStake || !btcPrice) return;

    const duration = DURATIONS.find((d) => d.seconds === selectedDuration)!;
    const now = new Date();
    const endTime = new Date(now.getTime() + duration.seconds * 1000);

    setConfirmData({
      direction,
      durationSeconds: duration.seconds,
      stakeAmount: selectedStake,
      entryPrice: btcPrice.price,
      multiplier: duration.multiplier,
      potentialPayout: Math.floor(selectedStake * duration.multiplier),
      startTime: now,
      endTime,
    });
  };

  const confirmBet = async () => {
    if (!confirmData || !isSignedIn) return;

    setPlacing(true);
    setError(null);

    try {
      const res = await fetch("/api/quick-predict/btc/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: confirmData.direction,
          durationSeconds: confirmData.durationSeconds,
          entryPrice: confirmData.entryPrice,
          stakeAmount: confirmData.stakeAmount,
          multiplier: confirmData.multiplier,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        onBalanceUpdate(json.data.balanceAfter);
        onBetPlaced?.();
        setRunningEntries((prev) => [
          ...prev,
          {
            id: json.data.entryId,
            direction: confirmData.direction,
            duration_seconds: confirmData.durationSeconds,
            entry_price: confirmData.entryPrice,
            stake_amount: confirmData.stakeAmount,
            multiplier: confirmData.multiplier,
            potential_payout: json.data.potentialPayout,
            status: "running",
            created_at: new Date().toISOString(),
            expires_at: json.data.expiresAt,
          },
        ]);
        setConfirmData(null);
        setSelectedStake(null);
      } else {
        setError(json.error || "วางทายไม่สำเร็จ");
      }
    } catch (e) {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      console.error(e);
    } finally {
      setPlacing(false);
    }
  };

  // ── Format countdown ──
  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Get result color ──
  const getResultColor = (entry: QuickPredictEntry) => {
    if (entry.status === "won") return "#00ff88";
    if (entry.status === "lost") return "#ff4757";
    if (entry.status === "refunded") return "#ffa502";
    return "#888";
  };

  const currentMultiplier = DURATIONS.find((d) => d.seconds === selectedDuration)?.multiplier || 1.9;
  const potentialReturn = selectedStake ? Math.floor(selectedStake * currentMultiplier) : 0;

  return (
    <section className="panel" style={{ border: "1px solid rgba(255, 165, 0, 0.2)", background: "rgba(255, 165, 0, 0.03)", marginBottom: "12px", borderRadius: "12px" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255, 165, 0, 0.1)", background: "linear-gradient(135deg, rgba(255, 165, 0, 0.05) 0%, transparent 100%)", borderTopLeftRadius: "12px", borderTopRightRadius: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>₿</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: "#ffa502", letterSpacing: "0.5px" }}>BTC/USD</div>
            <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "1px" }}>ทายราคาขึ้น/ลง • ถูกรับ 1.9x</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => setActiveTab("predict")}
            style={{
              fontSize: "10px",
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              background: activeTab === "predict" ? "rgba(255, 225, 0, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "predict" ? "var(--yellow)" : "var(--muted)",
              fontWeight: "700",
              transition: "all 0.15s",
            }}
          >
            📊 ทายผล
          </button>
          <button
            onClick={() => setActiveTab("running")}
            style={{
              fontSize: "10px",
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              background: activeTab === "running" ? "rgba(255, 225, 0, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "running" ? "var(--yellow)" : "var(--muted)",
              fontWeight: "700",
              transition: "all 0.15s",
            }}
          >
            ⏳ รายการของฉัน {runningEntries.length > 0 && <span style={{ background: "var(--yellow)", color: "#000", borderRadius: "10px", padding: "0 6px", fontSize: "9px", marginLeft: "2px", fontWeight: "800" }}>{runningEntries.length}</span>}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "14px 16px" }}>
        {activeTab === "predict" ? (
          <>
            {/* ── BTC Price Display — Trading Card Style ── */}
            <div style={{ textAlign: "center", padding: "14px 12px", background: "linear-gradient(135deg, rgba(255, 165, 0, 0.05) 0%, rgba(255, 165, 0, 0.02) 100%)", borderRadius: "10px", marginBottom: "12px", border: "1px solid rgba(255, 165, 0, 0.1)" }}>
              {loadingPrice && !btcPrice ? (
                <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--muted)" }}>กำลังโหลดราคา...</span>
              ) : btcPrice ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", color: "var(--muted)", fontWeight: "600" }}>BTC/USD</span>
                    <span style={{ fontSize: "10px", color: btcPrice.change24h >= 0 ? "#00ff88" : "#ff4757", padding: "1px 8px", borderRadius: "3px", background: btcPrice.change24h >= 0 ? "rgba(0, 255, 136, 0.1)" : "rgba(255, 71, 87, 0.1)", fontWeight: "700" }}>
                      {btcPrice.change24h >= 0 ? "▲" : "▼"} {Math.abs(btcPrice.change24h).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: "900", color: "#fff", fontFamily: "'JetBrains Mono', 'Courier New', monospace", letterSpacing: "-1px", lineHeight: "1.1" }}>
                    ${formatPrice(btcPrice.price)}
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00ff88", display: "inline-block" }}></span>
                    Live • อัปเดตเมื่อ {formatTime(new Date(btcPrice.timestamp))}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>ไม่สามารถโหลดราคาได้</span>
              )}
            </div>

            {/* ── Mini Price Chart ── */}
            {priceHistory.length >= 1 && (
              <div style={{ marginBottom: "12px", padding: "8px 12px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div style={{ fontSize: "9px", color: "var(--muted)", marginBottom: "4px", fontWeight: "600" }}>📈 แนวโนมราคา (5 นาทีล่่าสุุด)</div>
                <PriceChart prices={priceHistory} />
              </div>
            )}

            {/* ── Duration Selection ── */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>⏱ ระยะเวลา</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                {DURATIONS.map((d) => (
                  <button
                    key={d.seconds}
                    onClick={() => setSelectedDuration(d.seconds)}
                    style={{
                      padding: "8px 4px",
                      fontSize: "11px",
                      fontWeight: "700",
                      borderRadius: "8px",
                      border: selectedDuration === d.seconds ? "2px solid var(--yellow)" : "1px solid var(--border)",
                      background: selectedDuration === d.seconds ? "rgba(255, 225, 0, 0.08)" : "rgba(255, 255, 255, 0.02)",
                      color: selectedDuration === d.seconds ? "var(--yellow)" : "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Stake Selection ── */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>💰 จำนวนเหรียญ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                {STAKES.map((stake) => (
                  <button
                    key={stake}
                    onClick={() => setSelectedStake(stake)}
                    disabled={userCoins < stake}
                    style={{
                      padding: "8px 4px",
                      fontSize: "12px",
                      fontWeight: "700",
                      borderRadius: "8px",
                      border: selectedStake === stake ? "2px solid var(--yellow)" : "1px solid var(--border)",
                      background: selectedStake === stake ? "rgba(255, 225, 0, 0.08)" : "rgba(255, 255, 255, 0.02)",
                      color: selectedStake === stake ? "var(--yellow)" : userCoins < stake ? "var(--muted)" : "var(--text)",
                      cursor: userCoins < stake ? "not-allowed" : "pointer",
                      opacity: userCoins < stake ? 0.4 : 1,
                      transition: "all 0.15s",
                      position: "relative",
                    }}
                  >
                    {stake.toLocaleString()} <AmmoIcon />
                    {userCoins < stake && (
                      <span style={{ position: "absolute", top: "-8px", right: "-4px", fontSize: "8px", color: "#ff4757", fontWeight: "800" }}>✕</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "4px", textAlign: "center", padding: "4px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
                เหรียญของคุณ: <span style={{ color: "var(--yellow)", fontWeight: "700", fontSize: "11px" }}>{userCoins.toLocaleString()}</span> <AmmoIcon />
              </div>
            </div>

            {/* ── Potential Return Info ── */}
            {selectedStake && (
              <div style={{ textAlign: "center", padding: "8px", background: "rgba(255, 225, 0, 0.05)", borderRadius: "8px", marginBottom: "12px", border: "1px dashed rgba(255, 225, 0, 0.15)" }}>
                <span style={{ color: "var(--muted)", fontSize: "10px" }}>ถ้าทายถูก รับกลับ </span>
                <span style={{ color: "var(--yellow)", fontWeight: "800", fontSize: "16px" }}>{potentialReturn.toLocaleString()}</span>
                <span style={{ color: "var(--muted)", fontSize: "10px" }}> <AmmoIcon /> <span style={{ fontSize: "9px", opacity: 0.7 }}>(×{currentMultiplier})</span></span>
              </div>
            )}

            {/* ── UP / DOWN Buttons ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                onClick={() => handlePlaceBet("UP")}
                disabled={!selectedStake || !btcPrice || placing}
                style={{
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: "800",
                  borderRadius: "10px",
                  border: "none",
                  background: !selectedStake || !btcPrice || placing ? "rgba(0, 255, 136, 0.15)" : "linear-gradient(135deg, #00b09b 0%, #00ff88 100%)",
                  color: "#000",
                  cursor: !selectedStake || !btcPrice || placing ? "not-allowed" : "pointer",
                  opacity: !selectedStake || !btcPrice || placing ? 0.5 : 1,
                  transition: "all 0.15s",
                  boxShadow: selectedStake && btcPrice && !placing ? "0 3px 12px rgba(0, 255, 136, 0.25)" : "none",
                  letterSpacing: "0.5px",
                }}
              >
                🔼 UP ×1.9
              </button>
              <button
                onClick={() => handlePlaceBet("DOWN")}
                disabled={!selectedStake || !btcPrice || placing}
                style={{
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: "800",
                  borderRadius: "10px",
                  border: "none",
                  background: !selectedStake || !btcPrice || placing ? "rgba(255, 71, 87, 0.15)" : "linear-gradient(135deg, #eb3b5a 0%, #ff4757 100%)",
                  color: "#fff",
                  cursor: !selectedStake || !btcPrice || placing ? "not-allowed" : "pointer",
                  opacity: !selectedStake || !btcPrice || placing ? 0.5 : 1,
                  transition: "all 0.15s",
                  boxShadow: selectedStake && btcPrice && !placing ? "0 3px 12px rgba(255, 71, 87, 0.25)" : "none",
                  letterSpacing: "0.5px",
                }}
              >
                🔽 DOWN ×1.9
              </button>
            </div>

            {!isSignedIn && (
              <div style={{ textAlign: "center", fontSize: "10px", color: "var(--muted)", marginTop: "10px", padding: "6px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "6px" }}>
                🔒 ลงชื่อเข้าใช้เพื่อทายผล
              </div>
            )}

            {error && (
              <div style={{ textAlign: "center", fontSize: "10px", color: "#ff4757", marginTop: "8px", padding: "6px", background: "rgba(255, 71, 87, 0.08)", borderRadius: "6px", border: "1px solid rgba(255, 71, 87, 0.15)" }}>
                ⚠️ {error}
              </div>
            )}
          </>
        ) : (
          /* ── Running Tab ── */
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {runningEntries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: "11px" }}>
                ไม่มีรายการที่กำลังทาย
              </div>
            ) : (
              runningEntries.map((entry) => {
                const timeLeft = timeLeftMap[entry.id] || 0;
                const isExpired = timeLeft === 0 && entry.status === "running";
                return (
                  <div
                    key={entry.id}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${entry.direction === "UP" ? "rgba(0, 255, 136, 0.15)" : "rgba(255, 71, 87, 0.15)"}`,
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "800", color: entry.direction === "UP" ? "#00ff88" : "#ff4757", letterSpacing: "0.5px" }}>
                        {entry.direction === "UP" ? "🔼 UP" : "🔽 DOWN"}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text)", fontWeight: "600" }}>
                        {entry.stake_amount} → <span style={{ color: "var(--yellow)" }}>{entry.potential_payout}</span> <AmmoIcon />
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text)", marginBottom: "3px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span>เข้า: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#ffa502", fontWeight: "700" }}>${formatPrice(entry.entry_price)}</span></span>
                      {entry.exit_price && (
                        <>
                          <span style={{ color: "var(--muted)" }}>→</span>
                          <span>จบ: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: getResultColor(entry), fontWeight: "700" }}>${formatPrice(entry.exit_price)}</span></span>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <span style={{ fontSize: "10px", fontWeight: "700" }}>
                        {entry.status === "running" ? (
                          isExpired ? (
                            <span style={{ color: "#ffa502" }}>⏳ กำลังตรวจผล...</span>
                          ) : (
                            <span style={{ color: "var(--yellow)", fontFamily: "'JetBrains Mono', monospace" }}>⏱ {formatCountdown(timeLeft)}</span>
                          )
                        ) : (
                          <span style={{ color: getResultColor(entry) }}>
                            {entry.status === "won" ? "✅ WIN +" + entry.potential_payout : entry.status === "lost" ? "❌ LOSE" : "↩️ REFUND"}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "9px", color: "var(--muted)" }}>{formatTime(new Date(entry.created_at))}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation Modal ── */}
      {confirmData && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={() => !placing && setConfirmData(null)}
        >
          <div
            style={{
              background: "var(--card)",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
              border: "2px solid var(--yellow)",
              boxShadow: "0 8px 32px rgba(255, 225, 0, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <span style={{ fontSize: "32px" }}>{confirmData.direction === "UP" ? "🔼" : "🔽"}</span>
              <h3 style={{ margin: "8px 0", fontSize: "18px", fontWeight: "800", color: "var(--yellow)", letterSpacing: "0.5px" }}>
                ยืนยันการทาย BTC
              </h3>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: "10px", padding: "16px", fontSize: "12px", lineHeight: "2.1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ทิศทาง:</span>
                <span style={{ fontWeight: "800", color: confirmData.direction === "UP" ? "#00ff88" : "#ff4757", fontSize: "14px" }}>
                  {confirmData.direction === "UP" ? "🔼 UP" : "🔽 DOWN"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เวลาเริ่ม:</span>
                <span style={{ fontWeight: "700", color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatTime(confirmData.startTime)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เวลาจบ:</span>
                <span style={{ fontWeight: "700", color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatTime(confirmData.endTime)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ระยะเวลา:</span>
                <span style={{ fontWeight: "700", color: "var(--text)" }}>
                  {confirmData.durationSeconds >= 60 ? `${confirmData.durationSeconds / 60} นาที` : `${confirmData.durationSeconds} วินาที`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ราคา BTC ตอนทาย:</span>
                <span style={{ fontWeight: "700", color: "#ffa502", fontFamily: "'JetBrains Mono', monospace" }}>
                  ${formatPrice(confirmData.entryPrice)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เหรียญที่วาง:</span>
                <span style={{ fontWeight: "700", color: "var(--text)" }}>{confirmData.stakeAmount.toLocaleString()} <AmmoIcon /></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ถ้าทายถูก ได้คืน:</span>
                <span style={{ fontWeight: "800", color: "var(--yellow)", fontSize: "16px" }}>
                  {confirmData.potentialPayout.toLocaleString()} <AmmoIcon />
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => setConfirmData(null)}
                disabled={placing}
                style={{
                  padding: "10px",
                  fontSize: "12px",
                  fontWeight: "700",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: placing ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmBet}
                disabled={placing}
                style={{
                  padding: "10px",
                  fontSize: "12px",
                  fontWeight: "800",
                  borderRadius: "8px",
                  border: "none",
                  background: placing ? "var(--yellow-soft)" : "var(--yellow)",
                  color: placing ? "var(--muted)" : "#000",
                  cursor: placing ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 12px rgba(255, 225, 0, 0.25)",
                  transition: "all 0.15s",
                }}
              >
                {placing ? "กำลังยืนยัน..." : "✅ ยืนยันการทาย"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
