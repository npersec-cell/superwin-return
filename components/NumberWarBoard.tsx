"use client";

import { useEffect, useState } from "react";

function GreenBullet({ size = 10 }: { size?: number }) {
  return (
    <img
      src="https://superwinhub.app/ammo-556-icon.webp"
      alt=""
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "2px" }}
    />
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
  winning_score: number | null;
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

interface NwRound {
  id: string;
  name: string;
  status: string;
  open_at: string | null;
  close_at: string | null;
  winner_slot: number | null;
  computedStatus?: "upcoming" | "open" | "closed" | "resolved";
  created_at: string;
}

function getRoundStatus(round: { open_at: string | null; close_at: string | null; winner_slot: number | null }): "upcoming" | "open" | "closed" | "resolved" {
  const now = Date.now();
  const open = round.open_at ? new Date(round.open_at).getTime() : null;
  const close = round.close_at ? new Date(round.close_at).getTime() : null;
  if (round.winner_slot !== null && round.winner_slot !== undefined) return "resolved";
  if (open && now < open) return "upcoming";
  if (close && now > close) return "closed";
  if (open && close && now >= open && now <= close) return "open";
  return "closed";
}

// Convert datetime-local string (browser local) to UTC ISO string assuming Bangkok time (+7)
function toBangkokIso(dt: string): string {
  if (!dt) return "";
  // Append Bangkok offset and convert to UTC ISO
  return new Date(dt + ":00+07:00").toISOString();
}

// Convert UTC ISO string to datetime-local format (YYYY-MM-DDTHH:mm) for Bangkok time
function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Format as Bangkok time manually to avoid timezone issues
  const bangkokOffset = 7 * 60; // minutes
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const bangkokTime = new Date(utc + bangkokOffset * 60000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${bangkokTime.getFullYear()}-${pad(bangkokTime.getMonth() + 1)}-${pad(bangkokTime.getDate())}T${pad(bangkokTime.getHours())}:${pad(bangkokTime.getMinutes())}`;
}

export default function NumberWarBoard() {
  const [slots, setSlots] = useState<NumberSlot[]>([]);
  const [winners, setWinners] = useState<WinnerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<NumberSlot | null>(null);
  const [winningScore, setWinningScore] = useState("");
  const [calculatedNumber, setCalculatedNumber] = useState<number | null>(null);
  const [setWinnerLoading, setSetWinnerLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeView, setActiveView] = useState<"board" | "winners">("board");
  const [rounds, setRounds] = useState<NwRound[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>("");
  const [boardRoundId, setBoardRoundId] = useState<string>("");
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newRoundName, setNewRoundName] = useState("");
  const [newRoundOpenAt, setNewRoundOpenAt] = useState("");
  const [newRoundCloseAt, setNewRoundCloseAt] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string>("");
  const [editRoundName, setEditRoundName] = useState("");
  const [editRoundOpenAt, setEditRoundOpenAt] = useState("");
  const [editRoundCloseAt, setEditRoundCloseAt] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  async function loadSlots(roundId?: string) {
    try {
      const url = roundId ? `/api/number-war/slots?roundId=${roundId}` : "/api/number-war/slots";
      const data = await fetchJson<{ ok: boolean; data: NumberSlot[]; round: NwRound | null }>(url);
      if (data.ok) {
        setSlots(data.data);
        if (data.round) {
          setBoardRoundId(data.round.id);
        }
      }
    } catch (error) {
      console.error("Error loading slots:", error);
    }
  }

  async function loadWinners() {
    try {
      const response = await fetch("/api/admin/number-war/winners");
      const data = await response.json();
      if (data.ok) {
        setWinners(data.data);
      }
    } catch (error) {
      console.error("Error loading winners:", error);
    }
  }

  async function loadRounds() {
    try {
      const data = await fetchJson<{ ok: boolean; data: NwRound[] }>("/api/number-war/rounds");
      if (data.ok) {
        const enriched = data.data.map((r) => ({ ...r, computedStatus: getRoundStatus(r) }));
        setRounds(enriched);
      }
    } catch (error) {
      console.error("Error loading rounds:", error);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadSlots(), loadWinners(), loadRounds()]);
      setLoading(false);
    }
    init();
  }, []);

  // Calculate winning number when score changes
  useEffect(() => {
    if (!winningScore.trim()) {
      setCalculatedNumber(null);
      return;
    }
    const score = Number(winningScore.trim());
    if (!isNaN(score)) {
      setCalculatedNumber(score);
    } else {
      setCalculatedNumber(null);
    }
  }, [winningScore]);

  async function handleSetWinner() {
    if (!selectedRoundId) {
      setMessage("กรุณาเลือกรายการแข่งขัน");
      return;
    }

    if (!winningScore.trim()) {
      setMessage("กรุณากรอกเลขที่ชนะ");
      return;
    }

    const slotNumber = Number(winningScore.trim());
    
    if (isNaN(slotNumber)) {
      setMessage("กรุณากรอกตัวเลขที่ถูกต้อง");
      return;
    }

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
      const response = await fetch("/api/admin/number-war/set-winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          winningScore: slotNumber,
          roundId: selectedRoundId,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        const roundName = rounds.find((r) => r.id === selectedRoundId)?.name || "";
        setMessage(`ประกาศผลสำเร็จ! เลข ${slotNumber} ชนะรางวัลจาก "${roundName}"`);
        setWinningScore("");
        setCalculatedNumber(null);
        setSelectedRoundId("");
        await Promise.all([loadWinners(), loadRounds()]);
      } else {
        setMessage(`ผิดพลาด: ${data.error || "เกิดข้อผิดพลาด"}`);
      }
    } catch (error) {
      setMessage("เกิดข้อผิดพลาดในการประกาศผล");
    } finally {
      setSetWinnerLoading(false);
    }
  }

  async function handleUpdateShipping(winnerId: string, status: string, trackingNumber?: string) {
    try {
      const response = await fetch("/api/admin/number-war/update-shipping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        <h2 style={{ color: "var(--yellow)", marginBottom: "8px" }}>Number War</h2>
        <p style={{ color: "var(--muted)", fontSize: "12px" }}>
          ระบบทายเลข 0-200 | ซื้อครั้งแรก 10 <GreenBullet /> | แย่งซื้อ x2 ทุกครั้ง
        </p>
      </div>

      {/* Number War Rounds List */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--hairline)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ color: "var(--yellow)", fontSize: "14px" }}>
            รายการแข่งขัน Number War
          </h3>
          <button
            className="button"
            style={{ height: "28px", fontSize: "11px", padding: "0 12px" }}
            onClick={() => setCreateFormOpen((v) => !v)}
          >
            {createFormOpen ? "ปิด" : "+ สร้างรายการใหม่"}
          </button>
        </div>

        {createFormOpen && (
          <div style={{ background: "var(--bg)", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <div>
                <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>ชื่อรายการแข่งขัน</label>
                <input type="text" value={newRoundName} onChange={(e) => setNewRoundName(e.target.value)} placeholder="เช่น PUBG Tournament Round 3" style={{ width: "100%", height: "36px" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>เปิดรับซื้อ</label>
                  <input type="datetime-local" value={newRoundOpenAt} onChange={(e) => setNewRoundOpenAt(e.target.value)} style={{ width: "100%", height: "36px" }} />
                </div>
                <div>
                  <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>ปิดรับซื้อ</label>
                  <input type="datetime-local" value={newRoundCloseAt} onChange={(e) => setNewRoundCloseAt(e.target.value)} style={{ width: "100%", height: "36px" }} />
                </div>
              </div>
              <button
                className="button primary"
                disabled={createLoading || !newRoundName.trim() || !newRoundOpenAt || !newRoundCloseAt}
                onClick={async () => {
                  setCreateLoading(true);
                  try {
                    const res = await fetch("/api/number-war/rounds", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newRoundName.trim(), openAt: toBangkokIso(newRoundOpenAt), closeAt: toBangkokIso(newRoundCloseAt) }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setNewRoundName("");
                      setNewRoundOpenAt("");
                      setNewRoundCloseAt("");
                      setCreateFormOpen(false);
                      await loadRounds();
                    } else {
                      alert(data.error || "สร้างไม่สำเร็จ");
                    }
                  } catch (e) {
                    alert("เกิดข้อผิดพลาด");
                  } finally {
                    setCreateLoading(false);
                  }
                }}
                style={{ height: "36px" }}
              >
                {createLoading ? "กำลังสร้าง..." : "สร้างรายการ"}
              </button>
            </div>
          </div>
        )}

        {rounds.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "12px", textAlign: "center", padding: "20px" }}>
            ยังไม่มีรายการแข่งขัน Number War
            <br />
            <span style={{ fontSize: "11px" }}>กด "สร้างรายการใหม่" เพื่อเริ่มต้น</span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {rounds.map((r) => {
              const status = r.computedStatus || getRoundStatus(r);
              const statusLabel = status === "open" ? "เปิดรับซื้อ" : status === "upcoming" ? "เร็วๆ นี้" : status === "resolved" ? "ประกาศผลแล้ว" : "ปิดรับซื้อ";
              const statusColor = status === "open" ? "var(--green)" : status === "upcoming" ? "var(--info)" : status === "resolved" ? "var(--green)" : "var(--yellow)";
              const isSelected = boardRoundId === r.id;
              const isEditing = editingRoundId === r.id;
              return (
                <div key={r.id}>
                  <div
                    onClick={() => {
                      if (isEditing) return;
                      setBoardRoundId(isSelected ? "" : r.id);
                      loadSlots(isSelected ? undefined : r.id);
                    }}
                    style={{
                      background: isSelected ? "rgba(255, 225, 0, 0.08)" : "var(--bg)",
                      border: `1px solid ${isSelected ? "var(--yellow)" : "var(--hairline)"}`,
                      borderRadius: "8px",
                      padding: "10px 12px",
                      cursor: isEditing ? "default" : "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>
                        {r.open_at && new Date(r.open_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} -{" "}
                        {r.close_at && new Date(r.close_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        {statusLabel}
                      </span>
                      {status === "closed" && r.winner_slot === null && (
                        <span style={{ fontSize: "10px", color: "#ef4444", fontWeight: "600" }}>ยังไม่ประกาศผล</span>
                      )}
                      {r.winner_slot !== null && (
                        <span style={{ fontSize: "10px", color: "var(--green)", fontWeight: "600" }}>
                          ชนะเลข {r.winner_slot}
                        </span>
                      )}
                      {status !== "resolved" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRoundId(isEditing ? "" : r.id);
                            setEditRoundName(r.name);
                            setEditRoundOpenAt(toDatetimeLocal(r.open_at || ""));
                            setEditRoundCloseAt(toDatetimeLocal(r.close_at || ""));
                          }}
                          style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: "var(--card)",
                            border: "1px solid var(--hairline)",
                            color: "var(--muted)",
                            cursor: "pointer",
                          }}
                        >
                          แก้ไข
                        </button>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <div
                      style={{
                        background: "var(--card)",
                        border: "1px solid var(--hairline)",
                        borderTop: "none",
                        borderRadius: "0 0 8px 8px",
                        padding: "10px 12px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div>
                          <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>เปิดรับซื้อ</label>
                          <input
                            type="datetime-local"
                            value={editRoundOpenAt}
                            onChange={(e) => setEditRoundOpenAt(e.target.value)}
                            style={{ width: "100%", height: "34px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "0 8px", fontSize: "12px" }}
                          />
                        </div>
                        <div>
                          <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>ปิดรับซื้อ</label>
                          <input
                            type="datetime-local"
                            value={editRoundCloseAt}
                            onChange={(e) => setEditRoundCloseAt(e.target.value)}
                            style={{ width: "100%", height: "34px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "0 8px", fontSize: "12px" }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setEditingRoundId("")}
                          style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "6px", background: "transparent", border: "1px solid var(--hairline)", color: "var(--muted)", cursor: "pointer" }}
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={async () => {
                            setEditLoading(true);
                            try {
                              const res = await fetch("/api/admin/number-war/update-round", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  roundId: r.id,
                                  name: editRoundName,
                                  openAt: editRoundOpenAt ? toBangkokIso(editRoundOpenAt) : null,
                                  closeAt: editRoundCloseAt ? toBangkokIso(editRoundCloseAt) : null,
                                }),
                              });
                              const data = await res.json();
                              if (data.ok) {
                                setEditingRoundId("");
                                await loadRounds();
                              } else {
                                alert(data.error || "แก้ไขไม่สำเร็จ");
                              }
                            } catch (e) {
                              alert("เกิดข้อผิดพลาด");
                            } finally {
                              setEditLoading(false);
                            }
                          }}
                          disabled={editLoading}
                          style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "6px", background: "var(--yellow)", color: "#000", border: "none", cursor: "pointer", fontWeight: "600" }}
                        >
                          {editLoading ? "กำลังบันทึก..." : "บันทึก"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View Toggle */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          className={`button ${activeView === "board" ? "gold" : ""}`}
          onClick={() => setActiveView("board")}
          style={{ borderRadius: "8px" }}
        >
          กระดานเลข
        </button>
        <button
          className={`button ${activeView === "winners" ? "gold" : ""}`}
          onClick={() => setActiveView("winners")}
          style={{ borderRadius: "8px" }}
        >
          ผู้ชนะ ({winners.length})
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
              ประกาศผลรางวัล
            </h3>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
              เลือกรายการแข่งขันที่ปิดรับซื้อแล้ว แล้วกรอกเลขที่ชนะ (0-200)
            </p>

            {/* Round Select */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>
                รายการแข่งขัน
              </label>
              <select
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
                style={{ width: "100%", height: "40px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "0 10px" }}
              >
                <option value="">-- เลือกรายการแข่งขัน --</option>
                {rounds
                  .filter((r) => (r.computedStatus || getRoundStatus(r)) === "closed")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.winner_slot !== null ? `(ประกาศผลแล้ว: เลข ${r.winner_slot})` : "(ยังไม่ประกาศผล)"}
                    </option>
                  ))}
              </select>
            </div>

            {/* Winning Score */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ color: "var(--muted)", fontSize: "11px", display: "block", marginBottom: "4px" }}>
                เลขที่ชนะ (0-200)
              </label>
              <input
                type="number"
                value={winningScore}
                onChange={(e) => setWinningScore(e.target.value)}
                placeholder="เช่น 55"
                min="0"
                max="200"
                style={{ width: "100%", height: "40px" }}
              />
              {calculatedNumber !== null && (
                <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(255, 225, 0, 0.1)", borderRadius: "6px", fontSize: "12px" }}>
                  <span style={{ color: "var(--yellow)", fontWeight: "700" }}>
                    เลขชนะ: {calculatedNumber}
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
                  background: message.includes("สำเร็จ") ? "rgba(14, 203, 129, 0.1)" : "rgba(240, 84, 84, 0.1)",
                  color: message.includes("สำเร็จ") ? "var(--green)" : "#ef4444",
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
                    {slot.current_price} <GreenBullet />
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
                      {selectedSlot.current_price} <GreenBullet />
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
                      {new Date(selectedSlot.updated_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
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
          <h3 style={{ color: "var(--yellow)", marginBottom: "16px" }}>รายชื่อผู้ชนะ</h3>
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
                      {winner.shipping_status === "pending" && "รอดำเนินการ"}
                      {winner.shipping_status === "processing" && "กำลังเตรียม"}
                      {winner.shipping_status === "shipped" && "จัดส่งแล้ว"}
                      {winner.shipping_status === "delivered" && "ส่งถึงแล้ว"}
                    </span>
                  </div>

                  {/* Match Info */}
                  {winner.match_name && (
                    <div style={{ fontSize: "11px", color: "var(--yellow)", marginBottom: "4px" }}>
                      {winner.match_name}
                    </div>
                  )}
                  {winner.winning_score !== null && winner.winning_score !== undefined && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                      เลขที่ชนะ: {winner.winning_score}
                    </div>
                  )}

                  {/* Shipping Info */}
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                    <div>{winner.user?.shipping_name || "-"}</div>
                    <div>{winner.user?.shipping_address || "-"}</div>
                    <div>{winner.user?.shipping_zipcode || "-"} | {winner.user?.shipping_phone || "-"}</div>
                  </div>

                  {/* Admin Actions */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {winner.shipping_status === "pending" && (
                      <button
                        className="button"
                        style={{ height: "28px", fontSize: "11px", padding: "0 12px" }}
                        onClick={() => handleUpdateShipping(winner.id, "processing")}
                      >
                        เริ่มเตรียม
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
                        จัดส่ง
                      </button>
                    )}
                    {winner.shipping_status === "shipped" && (
                      <button
                        className="button"
                        style={{ height: "28px", fontSize: "11px", padding: "0 12px", background: "rgba(14, 203, 129, 0.1)", borderColor: "var(--green)", color: "var(--green)" }}
                        onClick={() => handleUpdateShipping(winner.id, "delivered")}
                      >
                        ส่งถึงแล้ว
                      </button>
                    )}
                  </div>

                  {winner.tracking_number && (
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--info)" }}>
                      Tracking: {winner.tracking_number}
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
