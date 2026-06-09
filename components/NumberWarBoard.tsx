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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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

interface WinnerLog {
  id: string;
  user_id: string;
  slot_number: number;
  match_name: string | null;
  winning_scores: number[] | null;
  shipping_status: string;
  tracking_number: string | null;
  admin_notes: string | null;
  created_at: string;
  user?: {
    id: string;
    display_name: string;
    email: string;
    shipping_name: string | null;
    shipping_address: string | null;
    shipping_zipcode: string | null;
    shipping_phone: string | null;
  };
}

export default function NumberWarBoard() {
  const [slots, setSlots] = useState<NumberSlot[]>([]);
  const [winners, setWinners] = useState<WinnerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<NumberSlot | null>(null);
  const [matchName, setMatchName] = useState("");
  const [winningScores, setWinningScores] = useState("");
  const [calculatedNumber, setCalculatedNumber] = useState<number | null>(null);
  const [setWinnerLoading, setSetWinnerLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState<"board" | "winners">("board");

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

  async function loadWinners() {
    try {
      const token = localStorage.getItem("sb-token");
      const response = await fetch("/api/admin/number-war/winners", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.ok) {
        setWinners(data.data);
      }
    } catch (error) {
      console.error("Error loading winners:", error);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadSlots(), loadWinners()]);
      setLoading(false);
    }
    init();
  }, []);

  // Calculate winning number when scores change
  useEffect(() => {
    if (!winningScores.trim()) {
      setCalculatedNumber(null);
      return;
    }
    const scores = winningScores.split(/[,\s]+/).filter(s => s.trim() !== "").map(Number);
    const validScores = scores.filter(s => !isNaN(s));
    if (validScores.length > 0) {
      const sum = validScores.reduce((a, b) => a + b, 0);
      setCalculatedNumber(sum);
    } else {
      setCalculatedNumber(null);
    }
  }, [winningScores]);

  async function handleSetWinner() {
    if (!matchName.trim()) {
      setMessage("กรุณากรอกชื่อการแข่งขัน");
      return;
    }

    if (!winningScores.trim()) {
      setMessage("กรุณากรอกคะแนนทีมชนะ");
      return;
    }

    const scores = winningScores.split(/[,\s]+/).filter(s => s.trim() !== "").map(Number);
    const validScores = scores.filter(s => !isNaN(s));
    
    if (validScores.length === 0) {
      setMessage("กรุณากรอกคะแนนที่ถูกต้อง");
      return;
    }

    const slotNumber = validScores.reduce((a, b) => a + b, 0);

    if (slotNumber < 0 || slotNumber > 200) {
      setMessage(`เลขชนะที่คำนวณได้คือ ${slotNumber} ซึ่งไม่อยู่ในช่วง 0-200`);
      return;
    }

    const slot = slots.find((s) => s.slot_number === slotNumber);
    if (!slot?.owner_id) {
      setMessage(`เลข ${slotNumber} ยังไม่มีเจ้าของ!`);
      return;
    }

    setSetWinnerLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("sb-token");
      const response = await fetch("/api/admin/number-war/set-winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          matchName: matchName.trim(),
          winningScores: validScores 
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage(`✅ ประกาศผลสำเร็จ! เลข ${slotNumber} ชนะรางวัลจาก "${matchName.trim()}"`);
        setMatchName("");
        setWinningScores("");
        setCalculatedNumber(null);
        await loadWinners();
      } else {
        setMessage(`❌ ${data.error || "เกิดข้อผิดพลาด"}`);
      }
    } catch (error) {
      setMessage("❌ เกิดข้อผิดพลาดในการประกาศผล");
    } finally {
      setSetWinnerLoading(false);
    }
  }

  async function handleUpdateShipping(winnerId: string, status: string, trackingNumber?: string) {
    try {
      const token = localStorage.getItem("sb-token");
      const response = await fetch("/api/admin/number-war/update-shipping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          winnerId,
          shippingStatus: status,
          trackingNumber: trackingNumber || undefined,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadWinners();
      }
    } catch (error) {
      console.error("Error updating shipping:", error);
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
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ color: "var(--yellow)", marginBottom: "8px" }}>🏆 PUBG Number War</h2>
        <p style={{ color: "var(--muted)", fontSize: "12px" }}>
          ระบบทายเลข 0-200 | ซื้อครั้งแรก 10 กระสุนเขียว | แย่งซื้อ x2 ทุกครั้ง
        </p>
      </div>

      {/* View Toggle */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <button
          className={`button ${activeView === "board" ? "gold" : ""}`}
          onClick={() => setActiveView("board")}
          style={{ borderRadius: "8px" }}
        >
          📋 กระดานเลข
        </button>
        <button
          className={`button ${activeView === "winners" ? "gold" : ""}`}
          onClick={() => setActiveView("winners")}
          style={{ borderRadius: "8px" }}
        >
          🏆 ผู้ชนะ ({winners.length})
        </button>
      </div>

      {activeView === "board" && (
        <>
          {/* Set Winner Section */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <h3 style={{ color: "var(--yellow)", marginBottom: "12px", fontSize: "14px" }}>
              🎯 ประกาศผลรางวัล
            </h3>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
              กรอกชื่อการแข่งขันและคะแนนทีมชนะ (ระบบจะคำนวณเลขชนะอัตโนมัติจากผลรวมคะแนน)
            </p>
            
            {/* Match Name */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>
                ชื่อการแข่งขัน
              </label>
              <input
                type="text"
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                placeholder="เช่น PUBG Tournament Round 3"
                style={{ width: "100%", height: "40px" }}
              />
            </div>

            {/* Winning Scores */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>
                คะแนนทีมชนะ (คั่นด้วยเว้นวรรคหรือจุลภาค)
              </label>
              <input
                type="text"
                value={winningScores}
                onChange={(e) => setWinningScores(e.target.value)}
                placeholder="เช่น 18, 22, 15"
                style={{ width: "100%", height: "40px" }}
              />
              {calculatedNumber !== null && (
                <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(255, 225, 0, 0.1)", borderRadius: "6px", fontSize: "12px" }}>
                  <span style={{ color: "var(--yellow)", fontWeight: "700" }}>
                    🎯 เลขชนะที่คำนวณได้: {calculatedNumber}
                  </span>
                  <span style={{ color: "var(--muted)", marginLeft: "8px" }}>
                    (0-200)
                  </span>
                </div>
              )}
            </div>

            <button
              className="button gold"
              onClick={handleSetWinner}
              disabled={setWinnerLoading || calculatedNumber === null}
              style={{ height: "40px", width: "100%" }}
            >
              {setWinnerLoading ? "กำลังประกาศ..." : "ประกาศผลรางวัล"}
            </button>

            {message && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  background: message.includes("✅") ? "rgba(14, 203, 129, 0.1)" : "rgba(240, 84, 84, 0.1)",
                  color: message.includes("✅") ? "var(--green)" : "#ef4444",
                }}
              >
                {message}
              </div>
            )}
          </div>

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
                  <div style={{ fontSize: "16px", fontWeight: "700", color: colors.text }}>
                    {slot.slot_number}
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--muted)", marginTop: "2px" }}>
                    {slot.current_price} กระสุนเขียว
                  </div>
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
                <h3 style={{ color: "var(--yellow)", marginBottom: "16px" }}>
                  เลข {selectedSlot.slot_number}
                </h3>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>ราคาปัจจุบัน:</span>
                    <span style={{ color: "var(--yellow)", fontWeight: "700" }}>
                      {selectedSlot.current_price} กระสุนเขียว
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>จำนวนการแย่งซื้อ:</span>
                    <span>{selectedSlot.total_takeovers} ครั้ง</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>เจ้าของ:</span>
                    <span>
                      {selectedSlot.owner_id
                        ? selectedSlot.owner?.display_name || "Unknown"
                        : "ยังไม่มีเจ้าของ"}
                    </span>
                  </div>
                  {selectedSlot.owner_id && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted)" }}>อีเมล:</span>
                      <span style={{ fontSize: "12px" }}>{selectedSlot.owner?.email}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>อัปเดตล่าสุด:</span>
                    <span style={{ fontSize: "12px" }}>
                      {new Date(selectedSlot.updated_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                </div>
                <button
                  className="button"
                  onClick={() => setSelectedSlot(null)}
                  style={{ marginTop: "16px", width: "100%" }}
                >
                  ปิด
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeView === "winners" && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--hairline)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h3 style={{ color: "var(--yellow)", marginBottom: "16px" }}>🏆 รายชื่อผู้ชนะ</h3>
          {winners.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>
              ยังไม่มีผู้ชนะ
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {winners.map((winner) => (
                <div
                  key={winner.id}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div>
                      <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--yellow)" }}>
                        เลข {winner.slot_number}
                      </span>
                      <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted)" }}>
                        {winner.user?.display_name || "Unknown"}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: "600",
                        background:
                          winner.shipping_status === "delivered"
                            ? "rgba(14, 203, 129, 0.2)"
                            : winner.shipping_status === "shipped"
                            ? "rgba(59, 130, 246, 0.2)"
                            : "rgba(255, 225, 0, 0.1)",
                        color:
                          winner.shipping_status === "delivered"
                            ? "var(--green)"
                            : winner.shipping_status === "shipped"
                            ? "var(--info)"
                            : "var(--yellow)",
                      }}
                    >
                      {winner.shipping_status === "pending" && "⏳ รอดำเนินการ"}
                      {winner.shipping_status === "processing" && "🔧 กำลังเตรียม"}
                      {winner.shipping_status === "shipped" && "📦 จัดส่งแล้ว"}
                      {winner.shipping_status === "delivered" && "✅ ส่งถึงแล้ว"}
                    </span>
                  </div>

                  {/* Match Info */}
                  {winner.match_name && (
                    <div style={{ fontSize: "11px", color: "var(--yellow)", marginBottom: "4px" }}>
                      🏆 {winner.match_name}
                    </div>
                  )}
                  {winner.winning_scores && winner.winning_scores.length > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                      คะแนนทีมชนะ: {winner.winning_scores.join(" + ")} = {winner.slot_number}
                    </div>
                  )}

                  {/* Shipping Info */}
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                    <div>👤 {winner.user?.shipping_name || "-"}</div>
                    <div>📍 {winner.user?.shipping_address || "-"}</div>
                    <div>📮 {winner.user?.shipping_zipcode || "-"} | 📞 {winner.user?.shipping_phone || "-"}</div>
                  </div>

                  {/* Admin Actions */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {winner.shipping_status === "pending" && (
                      <button
                        className="button"
                        style={{ height: "28px", fontSize: "11px", padding: "0 12px" }}
                        onClick={() => handleUpdateShipping(winner.id, "processing")}
                      >
                        🔧 เริ่มเตรียม
                      </button>
                    )}
                    {winner.shipping_status === "processing" && (
                      <button
                        className="button"
                        style={{ height: "28px", fontSize: "11px", padding: "0 12px" }}
                        onClick={() => {
                          const tracking = prompt("กรอกเลข Tracking:");
                          if (tracking) {
                            handleUpdateShipping(winner.id, "shipped", tracking);
                          }
                        }}
                      >
                        📦 จัดส่ง
                      </button>
                    )}
                    {winner.shipping_status === "shipped" && (
                      <button
                        className="button"
                        style={{ height: "28px", fontSize: "11px", padding: "0 12px", background: "rgba(14, 203, 129, 0.1)", borderColor: "var(--green)", color: "var(--green)" }}
                        onClick={() => handleUpdateShipping(winner.id, "delivered")}
                      >
                        ✅ ส่งถึงแล้ว
                      </button>
                    )}
                  </div>

                  {winner.tracking_number && (
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--info)" }}>
                      📋 Tracking: {winner.tracking_number}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
