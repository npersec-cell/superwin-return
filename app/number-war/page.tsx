"use client";

import { useEffect, useState } from "react";

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

export default function NumberWarPage() {
  const [slots, setSlots] = useState<NumberSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<NumberSlot | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [demoProfitScore, setDemoProfitScore] = useState(1000);
  const [message, setMessage] = useState("");

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

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadSlots();
      setLoading(false);
    }
    init();
  }, []);

  async function handleBuy(slot: NumberSlot) {
    if (demoMode) {
      // Demo mode: just show message, don't actually buy
      const price = slot.owner_id ? slot.current_price * 2 : slot.current_price;
      setMessage(`🎮 Demo Mode: จะซื้อเลข ${slot.slot_number} ราคา ${price} กระสุนเขียว (กดซื้อจริงจะหักกระสุนเขียวและบันทึกเจ้าของ)`);
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
          ทายเลข 0-200 | ซื้อครั้งแรก 10 กระสุนเขียว | แย่งซื้อ x2 ทุกครั้ง | ชนะตามคะแนนทีม
        </p>
      </div>

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
              ? "ทดลองเล่นแบบไม่บันทึกข้อมูล (Demo กระสุนเขียว: " + demoProfitScore + ")"
              : "เล่นจริง หักกระสุนเขียวจริง"}
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
              <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "2px" }}>{price} กระสุนเขียว</div>
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
                  {selectedSlot.owner_id ? selectedSlot.current_price * 2 : selectedSlot.current_price} กระสุนเขียว
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
              style={{ width: "100%", marginBottom: "8px" }}
            >
              {demoMode ? "🎮 ทดลองซื้อ" : "💰 ซื้อเลขนี้"}
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
