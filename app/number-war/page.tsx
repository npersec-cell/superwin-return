"use client";

import { useEffect, useState } from "react";

function GreenBullet({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "2px" }}>
      <ellipse cx="12" cy="12" rx="10" ry="6" fill="#0ecb81" />
      <ellipse cx="12" cy="12" rx="7" ry="3.5" fill="#1a3d2e" opacity="0.3" />
      <ellipse cx="10" cy="10" rx="3" ry="1.5" fill="#ffffff" opacity="0.4" />
    </svg>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface NumberSlot {
  id: string;
  slot_number: number;
  owner_id: string | null;
  current_price: number;
  total_takeovers: number;
  created_at: string;
  updated_at: string;
  owner?: {
    id: string;
    display_name: string;
    email: string;
  } | null;
}

interface NumberWarConfig {
  id: string;
  open_at: string;
  close_at: string;
  is_active: boolean;
  status?: "open" | "closed" | "upcoming";
  timeLeft?: number;
  timeUntilOpen?: number;
}

interface WinnerLog {
  id: string;
  slot_number: number;
  match_name: string | null;
  winning_score: number | null;
  shipping_status: string;
  tracking_number: string | null;
  created_at: string;
}

export default function NumberWarPage() {
  const [slots, setSlots] = useState<NumberSlot[]>([]);
  const [config, setConfig] = useState<NumberWarConfig | null>(null);
  const [myWins, setMyWins] = useState<WinnerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<NumberSlot | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [demoProfitScore, setDemoProfitScore] = useState(1000);
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState("");

  async function loadSlots() {
    try {
      const data = await fetchJson<{ ok: boolean; data: NumberSlot[] }>("/api/number-war/slots");
      if (data.ok) {
        setSlots(data.data);
      }
    } catch (error) {
      console.error("Error loading slots:", error);
    }
  }

  async function loadConfig() {
    try {
      const data = await fetchJson<{ ok: boolean; data: NumberWarConfig }>("/api/number-war/config");
      if (data.ok) {
        setConfig(data.data);
      }
    } catch (error) {
      console.error("Error loading config:", error);
    }
  }

  async function loadMyWins() {
    try {
      const token = localStorage.getItem("sb-token");
      if (!token) return;
      const res = await fetch("/api/number-war/my-wins", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setMyWins(data.data);
      }
    } catch (error) {
      console.error("Error loading my wins:", error);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadSlots(), loadConfig()]);
      if (!demoMode) {
        await loadMyWins();
      }
      setLoading(false);
    }
    init();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!config) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      if (config.status === "open" && config.close_at) {
        const remaining = new Date(config.close_at).getTime() - now;
        if (remaining > 0) {
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
          setCountdown(`⏳ เหลือเวลา: ${hours}ชม ${minutes}น ${seconds}วิ`);
        } else {
          setCountdown("⛔ ปิดรับซื้อแล้ว");
        }
      } else if (config.status === "upcoming" && config.open_at) {
        const remaining = new Date(config.open_at).getTime() - now;
        if (remaining > 0) {
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
          setCountdown(`🔒 เปิดในอีก: ${hours}ชม ${minutes}น ${seconds}วิ`);
        } else {
          setCountdown("");
        }
      } else {
        setCountdown("⛔ ปิดรับซื้อแล้ว");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [config]);

  async function handleBuy(slot: NumberSlot) {
    if (demoMode) {
      // Demo mode: just show message, don't actually buy
      const price = slot.owner_id ? slot.current_price * 2 : slot.current_price;
      setMessage(`🎮 Demo Mode: จะซื้อเลข ${slot.slot_number} ราคา ${price} <GreenBullet /> (กดซื้อจริงจะหัก <GreenBullet /> และบันทึกเจ้าของ)`);
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    // Real mode: call API
    try {
      const res = await fetch("/api/number-war/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: slot.slot_number }),
      });

      const data = await res.json();
      if (data.ok) {
        setMessage(`✅ ซื้อเลข ${slot.slot_number} สำเร็จ!`);
        await loadSlots();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage("❌ เกิดข้อผิดพลาด");
    }
  }

  function getSlotStatus(slot: NumberSlot) {
    if (!slot.owner_id) return "empty";
    if (slot.current_price >= 1000) return "hot";
    if (slot.current_price >= 100) return "warm";
    return "owned";
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "empty":
        return { bg: "rgba(14, 203, 129, 0.1)", border: "var(--green)", text: "var(--green)" };
      case "hot":
        return { bg: "rgba(240, 84, 84, 0.15)", border: "#ef4444", text: "#ef4444" };
      case "warm":
        return { bg: "rgba(255, 225, 0, 0.1)", border: "var(--yellow)", text: "var(--yellow)" };
      default:
        return { bg: "rgba(59, 130, 246, 0.1)", border: "var(--info)", text: "var(--info)" };
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ color: "var(--yellow)", marginBottom: "8px" }}>🏆 PUBG Number War</h1>
        <p style={{ color: "var(--muted)", fontSize: "12px" }}>
          ทายเลข 0-200 | ซื้อครั้งแรก 10 <GreenBullet /> | แย่งซื้อ x2 ทุกครั้ง | ชนะตามคะแนนทีม
        </p>
      </div>

      {/* Status Banner */}
      {config && (
        <div
          style={{
            background: config.status === "open" ? "rgba(14, 203, 129, 0.1)" : config.status === "upcoming" ? "rgba(255, 225, 0, 0.1)" : "rgba(240, 84, 84, 0.1)",
            border: `1px solid ${config.status === "open" ? "var(--green)" : config.status === "upcoming" ? "var(--yellow)" : "#ef4444"}`,
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", color: config.status === "open" ? "var(--green)" : config.status === "upcoming" ? "var(--yellow)" : "#ef4444" }}>
            {config.status === "open" && "🟢 เปิดรับซื้อ"}
            {config.status === "upcoming" && "🔒 ยังไม่เปิด"}
            {config.status === "closed" && "⛔ ปิดรับซื้อแล้ว"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            {countdown}
          </div>
        </div>
      )}

      {/* Winner Banner */}
      {myWins.length > 0 && (
        <div
          style={{
            background: "rgba(255, 225, 0, 0.1)",
            border: "1px solid var(--yellow)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ color: "var(--yellow)", marginBottom: "8px", fontSize: "14px" }}>
            🎉 ยินดีด้วย! คุณเป็นผู้โชคดี!
          </h3>
          <div style={{ display: "grid", gap: "8px" }}>
            {myWins.map((win) => (
              <div
                key={win.id}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "8px",
                  padding: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--yellow)" }}>
                    เลข {win.slot_number}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      fontWeight: "600",
                      background:
                        win.shipping_status === "delivered"
                          ? "rgba(14, 203, 129, 0.2)"
                          : win.shipping_status === "shipped"
                          ? "rgba(59, 130, 246, 0.2)"
                          : "rgba(255, 225, 0, 0.1)",
                      color:
                        win.shipping_status === "delivered"
                          ? "var(--green)"
                          : win.shipping_status === "shipped"
                          ? "var(--info)"
                          : "var(--yellow)",
                    }}
                  >
                    {win.shipping_status === "pending" && "⏳ รอดำเนินการ"}
                    {win.shipping_status === "processing" && "🔧 กำลังเตรียม"}
                    {win.shipping_status === "shipped" && "📦 จัดส่งแล้ว"}
                    {win.shipping_status === "delivered" && "✅ ส่งถึงแล้ว"}
                  </span>
                </div>
                {win.match_name && (
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>
                    🏆 {win.match_name}
                  </div>
                )}
                {win.tracking_number && (
                  <div style={{ fontSize: "11px", color: "var(--info)" }}>
                    📋 Tracking: {win.tracking_number}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Demo Mode Toggle */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>
            {demoMode ? "🎮 โหมดทดลองเล่น" : "💰 โหมดจริง"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            {demoMode
              ? "ทดลองเล่นแบบไม่บันทึกข้อมูล (Demo <GreenBullet />: " + demoProfitScore + ")"
              : "เล่นจริง หัก <GreenBullet /> จริง"}
          </div>
        </div>
        <button
          className={`button ${demoMode ? "" : "gold"}`}
          onClick={() => setDemoMode(!demoMode)}
          style={{ height: "36px", borderRadius: "8px" }}
        >
          {demoMode ? "เปิดโหมดจริง" : "กลับสู่โหมดทดลอง"}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "12px",
            background: message.includes("✅") ? "rgba(14, 203, 129, 0.1)" : "rgba(255, 225, 0, 0.1)",
            color: message.includes("✅") ? "var(--green)" : "var(--yellow)",
          }}
        >
          {message}
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        {[
          { label: "เลขทั้งหมด", value: "201" },
          { label: "เลขที่ถูกซื้อ", value: slots.filter((s) => s.owner_id).length.toString() },
          { label: "เลขว่าง", value: slots.filter((s) => !s.owner_id).length.toString() },
          { label: "แย่งซื้อสูงสุด", value: Math.max(...slots.map((s) => s.total_takeovers), 0).toString() },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "8px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--yellow)" }}>{stat.value}</div>
            <div style={{ fontSize: "10px", color: "var(--muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Slot Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
          gap: "6px",
          maxHeight: "600px",
          overflowY: "auto",
          padding: "4px",
        }}
      >
        {slots.map((slot) => {
          const status = getSlotStatus(slot);
          const colors = getStatusColor(status);
          const price = slot.owner_id ? slot.current_price * 2 : slot.current_price;
          return (
            <div
              key={slot.id}
              onClick={() => setSelectedSlot(selectedSlot?.id === slot.id ? null : slot)}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                padding: "8px 4px",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.2s",
                position: "relative",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: "700", color: colors.text }}>{slot.slot_number}</div>
              <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "2px" }}>{price} <GreenBullet /></div>
              {slot.owner_id && (
                <div
                  style={{
                    fontSize: "8px",
                    color: colors.text,
                    marginTop: "2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.owner?.display_name || "Unknown"}
                </div>
              )}
              {slot.total_takeovers > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#ef4444",
                    color: "white",
                    fontSize: "8px",
                    padding: "1px 4px",
                    borderRadius: "4px",
                  }}
                >
                  {slot.total_takeovers}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Slot Detail */}
      {selectedSlot && (
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
            zIndex: 1000,
          }}
          onClick={() => setSelectedSlot(null)}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "var(--yellow)", marginBottom: "16px" }}>เลข {selectedSlot.slot_number}</h3>
            <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>ราคาซื้อ:</span>
                <span style={{ color: "var(--yellow)", fontWeight: "700" }}>
                  {selectedSlot.owner_id ? selectedSlot.current_price * 2 : selectedSlot.current_price} <GreenBullet />
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>จำนวนการแย่งซื้อ:</span>
                <span>{selectedSlot.total_takeovers} ครั้ง</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>เจ้าของปัจจุบัน:</span>
                <span>{selectedSlot.owner_id ? selectedSlot.owner?.display_name || "Unknown" : "ยังไม่มีเจ้าของ"}</span>
              </div>
            </div>

            <button
              className="button gold"
              onClick={() => {
                handleBuy(selectedSlot);
                setSelectedSlot(null);
              }}
              disabled={!demoMode && config?.status !== "open"}
              style={{ width: "100%", marginBottom: "8px", opacity: !demoMode && config?.status !== "open" ? 0.5 : 1 }}
            >
              {demoMode
                ? "🎮 ทดลองซื้อ"
                : config?.status === "open"
                ? "💰 ซื้อเลขนี้"
                : config?.status === "upcoming"
                ? "🔒 ยังไม่เปิด"
                : "⛔ ปิดรับซื้อ"}
            </button>
            <button className="button" onClick={() => setSelectedSlot(null)} style={{ width: "100%" }}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
