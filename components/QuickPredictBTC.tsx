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
      }
    } catch (e) {
      console.error("Failed to fetch BTC price:", e);
    } finally {
      setLoadingPrice(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000); // Refresh every 10s
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

  // ── Auto-resolve expired entries (poll every 30s) ──
  const triggerResolve = async () => {
    try {
      const res = await fetch("/api/quick-predict/btc/resolve", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.data?.resolved > 0) {
        // Refresh running entries after resolve
        setTimeout(fetchRunning, 1000);
        // Update balance if user won
        if (json.data.totalPayout > 0) {
          // Balance update happens in fetchRunning via refetch of user data
        }
      }
    } catch (e) {
      // Silent fail - resolve will happen on next poll
    }
  };

  useEffect(() => {
    if (!isSignedIn || runningEntries.length === 0) return;
    triggerResolve();
    const interval = setInterval(triggerResolve, 30000); // Every 30 seconds
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
        // All resolved, refresh
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
        console.log('[QuickPredictBTC] Bet placed successfully, entryId:', json.data.entryId);
        onBalanceUpdate(json.data.balanceAfter);
        console.log('[QuickPredictBTC] Calling onBetPlaced callback');
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
    <section className="panel" style={{ border: "1px solid rgba(255, 165, 0, 0.3)", background: "rgba(255, 165, 0, 0.04)", marginBottom: "12px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>₿</span>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#ffa502" }}>QUICK PREDICT — BTC/USD</span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => setActiveTab("predict")}
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              background: activeTab === "predict" ? "var(--yellow)" : "transparent",
              color: activeTab === "predict" ? "#000" : "var(--muted)",
              fontWeight: "600",
            }}
          >
            ทายเลย
          </button>
          <button
            onClick={() => setActiveTab("running")}
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              background: activeTab === "running" ? "var(--yellow)" : "transparent",
              color: activeTab === "running" ? "#000" : "var(--muted)",
              fontWeight: "600",
            }}
          >
            กำลังทาย {runningEntries.length > 0 && `(${runningEntries.length})`}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "12px" }}>
        {activeTab === "predict" ? (
          <>
            {/* BTC Price Display */}
            <div style={{ textAlign: "center", padding: "10px 0", borderBottom: "1px solid var(--hairline)", marginBottom: "10px" }}>
              {loadingPrice && !btcPrice ? (
                <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--muted)" }}>Loading...</span>
              ) : btcPrice ? (
                <>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#ffa502", fontFamily: "JetBrains Mono, monospace" }}>
                    ${formatPrice(btcPrice.price)}
                  </div>
                  <div style={{ fontSize: "11px", marginTop: "2px", color: btcPrice.change24h >= 0 ? "#00ff88" : "#ff4757" }}>
                    {btcPrice.change24h >= 0 ? "▲" : "▼"} {btcPrice.change24h.toFixed(2)}% (24h)
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "2px" }}>
                    อัปเดตเมื่อ {formatTime(new Date(btcPrice.timestamp))}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>ไม่สามารถโหลดราคาได้</span>
              )}
            </div>

            {/* Duration Selection */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", fontWeight: "600" }}>⏱ เลือกเวลา</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
                {DURATIONS.map((d) => (
                  <button
                    key={d.seconds}
                    onClick={() => setSelectedDuration(d.seconds)}
                    style={{
                      padding: "6px 4px",
                      fontSize: "11px",
                      fontWeight: "700",
                      borderRadius: "6px",
                      border: selectedDuration === d.seconds ? "2px solid var(--yellow)" : "1px solid var(--border)",
                      background: selectedDuration === d.seconds ? "rgba(255, 225, 0, 0.1)" : "transparent",
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

            {/* Stake Selection */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", fontWeight: "600" }}>💰 วางเหรียญ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
                {STAKES.map((stake) => (
                  <button
                    key={stake}
                    onClick={() => setSelectedStake(stake)}
                    disabled={userCoins < stake}
                    style={{
                      padding: "6px 4px",
                      fontSize: "12px",
                      fontWeight: "700",
                      borderRadius: "6px",
                      border: selectedStake === stake ? "2px solid var(--yellow)" : "1px solid var(--border)",
                      background: selectedStake === stake ? "rgba(255, 225, 0, 0.1)" : "transparent",
                      color: selectedStake === stake ? "var(--yellow)" : userCoins < stake ? "var(--muted)" : "var(--text)",
                      cursor: userCoins < stake ? "not-allowed" : "pointer",
                      opacity: userCoins < stake ? 0.4 : 1,
                      transition: "all 0.15s",
                      position: "relative",
                    }}
                  >
                    {stake.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
                    {userCoins < stake && (
                      <span style={{ position: "absolute", top: "-8px", right: "-4px", fontSize: "8px", color: "#ff4757" }}>✕</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "3px", textAlign: "center" }}>
                เหรียญของคุณ: <span style={{ color: "var(--yellow)", fontWeight: "700" }}>{userCoins.toLocaleString()}</span> <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
              </div>
            </div>

            {/* Potential Return Info */}
            {selectedStake && (
              <div style={{ textAlign: "center", padding: "6px", background: "rgba(255, 225, 0, 0.05)", borderRadius: "6px", marginBottom: "10px", fontSize: "11px" }}>
                <span style={{ color: "var(--muted)" }}>ถ้าทายถูก ได้คืน </span>
                <span style={{ color: "var(--yellow)", fontWeight: "800", fontSize: "14px" }}>{potentialReturn.toLocaleString()}</span>
                <span style={{ color: "var(--muted)" }}> <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} /> (×{currentMultiplier})</span>
              </div>
            )}

            {/* UP / DOWN Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <button
                onClick={() => handlePlaceBet("UP")}
                disabled={!selectedStake || !btcPrice || placing}
                style={{
                  padding: "10px",
                  fontSize: "13px",
                  fontWeight: "800",
                  borderRadius: "8px",
                  border: "none",
                  background: !selectedStake || !btcPrice || placing ? "rgba(0, 255, 136, 0.2)" : "linear-gradient(135deg, #00b09b 0%, #00ff88 100%)",
                  color: "#000",
                  cursor: !selectedStake || !btcPrice || placing ? "not-allowed" : "pointer",
                  opacity: !selectedStake || !btcPrice || placing ? 0.5 : 1,
                  transition: "all 0.15s",
                  boxShadow: selectedStake && btcPrice && !placing ? "0 2px 8px rgba(0, 255, 136, 0.3)" : "none",
                }}
              >
                🔼 UP ×1.9
              </button>
              <button
                onClick={() => handlePlaceBet("DOWN")}
                disabled={!selectedStake || !btcPrice || placing}
                style={{
                  padding: "10px",
                  fontSize: "13px",
                  fontWeight: "800",
                  borderRadius: "8px",
                  border: "none",
                  background: !selectedStake || !btcPrice || placing ? "rgba(255, 71, 87, 0.2)" : "linear-gradient(135deg, #eb3b5a 0%, #ff4757 100%)",
                  color: "#fff",
                  cursor: !selectedStake || !btcPrice || placing ? "not-allowed" : "pointer",
                  opacity: !selectedStake || !btcPrice || placing ? 0.5 : 1,
                  transition: "all 0.15s",
                  boxShadow: selectedStake && btcPrice && !placing ? "0 2px 8px rgba(255, 71, 87, 0.3)" : "none",
                }}
              >
                🔽 DOWN ×1.9
              </button>
            </div>

            {!isSignedIn && (
              <div style={{ textAlign: "center", fontSize: "10px", color: "var(--muted)", marginTop: "8px" }}>
                🔒 ลงชื่อเข้าใช้เพื่อทายผล
              </div>
            )}

            {error && (
              <div style={{ textAlign: "center", fontSize: "10px", color: "#ff4757", marginTop: "6px", padding: "4px", background: "rgba(255, 71, 87, 0.1)", borderRadius: "4px" }}>
                ⚠️ {error}
              </div>
            )}
          </>
        ) : (
          /* Running Tab */
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {runningEntries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: "11px" }}>
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
                      padding: "8px",
                      borderRadius: "6px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: `1px solid ${entry.direction === "UP" ? "rgba(0, 255, 136, 0.2)" : "rgba(255, 71, 87, 0.2)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "800", color: entry.direction === "UP" ? "#00ff88" : "#ff4757" }}>
                        {entry.direction === "UP" ? "🔼 UP" : "🔽 DOWN"}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                        {entry.stake_amount} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} /> → {entry.potential_payout} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text)", marginBottom: "2px" }}>
                      ราคาเข้า: <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#ffa502" }}>${formatPrice(entry.entry_price)}</span>
                      {entry.exit_price && (
                        <span> → ราคาจบ: <span style={{ fontFamily: "JetBrains Mono, monospace", color: getResultColor(entry) }}>${formatPrice(entry.exit_price)}</span></span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                      <span style={{ fontSize: "9px", color: "var(--muted)" }}>
                        {entry.status === "running" ? (
                          isExpired ? (
                            <span style={{ color: "#ffa502" }}>⏳ กำลังตรวจผล...</span>
                          ) : (
                            <span style={{ color: "var(--yellow)", fontFamily: "JetBrains Mono, monospace", fontWeight: "700" }}>⏱ {formatCountdown(timeLeft)}</span>
                          )
                        ) : (
                          <span style={{ color: getResultColor(entry), fontWeight: "700" }}>
                            {entry.status === "won" ? "✅ WIN" : entry.status === "lost" ? "❌ LOSE" : "↩️ REFUND"}
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

      {/* Confirmation Modal */}
      {confirmData && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.8)",
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
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
              border: "2px solid var(--yellow)",
              boxShadow: "0 4px 20px rgba(255, 225, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "28px" }}>{confirmData.direction === "UP" ? "🔼" : "🔽"}</span>
              <h3 style={{ margin: "8px 0", fontSize: "18px", fontWeight: "800", color: "var(--yellow)" }}>
                ยืนยันการทาย BTC
              </h3>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", padding: "16px", fontSize: "12px", lineHeight: "2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ทิศทาง:</span>
                <span style={{ fontWeight: "800", color: confirmData.direction === "UP" ? "#00ff88" : "#ff4757", fontSize: "14px" }}>
                  {confirmData.direction === "UP" ? "🔼 UP" : "🔽 DOWN"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เวลาเริ่ม:</span>
                <span style={{ fontWeight: "700", color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>
                  {formatTime(confirmData.startTime)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เวลาจบ:</span>
                <span style={{ fontWeight: "700", color: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>
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
                <span style={{ fontWeight: "700", color: "#ffa502", fontFamily: "JetBrains Mono, monospace" }}>
                  ${formatPrice(confirmData.entryPrice)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--hairline)", paddingBottom: "6px", marginBottom: "6px" }}>
                <span style={{ color: "var(--muted)" }}>เหรียญที่วาง:</span>
                <span style={{ fontWeight: "700", color: "var(--text)" }}>{confirmData.stakeAmount.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} /></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px" }}>
                <span style={{ color: "var(--muted)" }}>ถ้าทายถูก ได้คืน:</span>
                <span style={{ fontWeight: "800", color: "var(--yellow)", fontSize: "16px" }}>
                  {confirmData.potentialPayout.toLocaleString()} <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
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
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: placing ? "not-allowed" : "pointer",
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
                  borderRadius: "6px",
                  border: "none",
                  background: placing ? "var(--yellow-soft)" : "var(--yellow)",
                  color: placing ? "var(--muted)" : "#000",
                  cursor: placing ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 8px rgba(255, 225, 0, 0.3)",
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
