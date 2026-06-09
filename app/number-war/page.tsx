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

interface NwRound {
  id: string;
  name: string;
  open_at: string | null;
  close_at: string | null;
  winner_slot: number | null;
  prize_name: string | null;
  prize_image_url: string | null;
  status: string;
  computedStatus?: "upcoming" | "open" | "closed" | "resolved";
  created_at: string;
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

interface NwHistory {
  id: string;
  user_id: string;
  round_id: string;
  slot_number: number;
  type: "buy" | "takeover" | "sold";
  amount: number;
  price: number;
  profit: number;
  opponent_id: string | null;
  created_at: string;
  round?: { id: string; name: string } | null;
  opponent?: { id: string; display_name: string; email: string } | null;
}

interface NwInfo {
  id: string | null;
  title: string;
  content: string;
  updated_at: string | null;
}

function maskName(name: string): string {
  if (!name) return "";
  if (name === "You") return name;
  // Use only the local part for emails
  const local = name.includes("@") ? name.split("@")[0] : name;
  if (local.length <= 2) return local + "xx";
  return local.slice(0, -2) + "xx";
}

export default function NumberWarPage() {
  const [slots, setSlots] = useState<NumberSlot[]>([]);
  const [round, setRound] = useState<NwRound | null>(null);
  const [myWins, setMyWins] = useState<WinnerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<NumberSlot | null>(null);
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState("");
  const [profitScore, setProfitScore] = useState<number | null>(null);
  const [addressRequired, setAddressRequired] = useState(false);
  const [addressCompleted, setAddressCompleted] = useState(false);
  const [recheckMessage, setRecheckMessage] = useState("");
  const [history, setHistory] = useState<NwHistory[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "buy" | "takeover" | "sold">("all");
  const [showHistory, setShowHistory] = useState(false);
  const [info, setInfo] = useState<NwInfo | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  async function loadSlots() {
    try {
      const data = await fetchJson<{ ok: boolean; data: NumberSlot[]; round: NwRound | null }>("/api/number-war/slots");
      if (data.ok) {
        console.log("Slots loaded:", data.data.slice(0, 5));
        setSlots(data.data);
        if (data.round) {
          setRound(data.round);
        }
      }
    } catch (error) {
      console.error("Error loading slots:", error);
    }
  }

  async function loadMyWins() {
    try {
      const res = await fetch("/api/number-war/my-wins");
      const data = await res.json();
      if (data.ok) {
        setMyWins(data.data);
      }
    } catch (error) {
      console.error("Error loading my wins:", error);
    }
  }

  async function loadUserInfo() {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.ok) {
        setProfitScore(data.data.profitScore);
        const completed = data.data.addressCompleted ?? false;
        setAddressCompleted(completed);
        setAddressRequired(!completed);
        if (!completed) {
          setRecheckMessage("ยังไม่พบข้อมูลจัดส่ง กรุณากรอกข้อมูลให้ครบถ้วนก่อน");
        } else {
          setRecheckMessage("✅ ข้อมูลจัดส่งครบถ้วนแล้ว");
          setTimeout(() => {
            setRecheckMessage("");
            setAddressRequired(false);
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  }

  async function loadHistory() {
    try {
      const typeParam = historyFilter !== "all" ? `?type=${historyFilter}` : "";
      const data = await fetchJson<{ ok: boolean; data: NwHistory[] }>(`/api/number-war/history${typeParam}`);
      if (data.ok) {
        setHistory(data.data);
      }
    } catch (error) {
      console.error("Error loading history:", error);
    }
  }

  async function loadInfo() {
    try {
      const data = await fetchJson<{ ok: boolean; data: NwInfo }>("/api/number-war/info");
      if (data.ok) {
        setInfo(data.data);
      }
    } catch (error) {
      console.error("Error loading info:", error);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadSlots(), loadMyWins(), loadUserInfo(), loadHistory(), loadInfo()]);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (showHistory) {
      loadHistory();
    }
  }, [showHistory, historyFilter]);

  // Countdown timer
  useEffect(() => {
    if (!round) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const status = round.computedStatus || round.status;
      if (status === "open" && round.close_at) {
        const remaining = new Date(round.close_at).getTime() - now;
        if (remaining > 0) {
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
          setCountdown(`เหลือเวลา: ${hours}ชม ${minutes}น ${seconds}วิ`);
        } else {
          setCountdown("ปิดรับซื้อแล้ว");
        }
      } else if (status === "upcoming" && round.open_at) {
        const remaining = new Date(round.open_at).getTime() - now;
        if (remaining > 0) {
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
          setCountdown(`เปิดในอีก: ${hours}ชม ${minutes}น ${seconds}วิ`);
        } else {
          setCountdown("");
        }
      } else {
        setCountdown("ปิดรับซื้อแล้ว");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [round]);

  async function handleBuy(slot: NumberSlot) {
    try {
      const res = await fetch("/api/number-war/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotNumber: slot.slot_number }),
      });

      const data = await res.json();
      if (data.ok) {
        setMessage(`ซื้อเลข ${slot.slot_number} สำเร็จ!`);
        setProfitScore(data.data.newProfitScore);
        await loadSlots();
      } else if (data.error === "ADDRESS_REQUIRED") {
        setAddressRequired(true);
        setMessage("");
      } else {
        setMessage(`ผิดพลาด: ${data.error}`);
      }
    } catch (error) {
      setMessage("เกิดข้อผิดพลาด");
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
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ color: "var(--yellow)", marginBottom: "8px" }}>Number War</h1>
          <p style={{ color: "var(--muted)", fontSize: "12px" }}>
            ทายเลข 0-200 | ซื้อครั้งแรก 10 <GreenBullet /> | แย่งซื้อ x2 ทุกครั้ง | ชนะตามเลขที่ประกาศ
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="button"
            onClick={() => window.location.href = "/"}
            style={{ height: "36px", borderRadius: "8px", padding: "0 16px", fontSize: "12px" }}
          >
            กลับ
          </button>
          <button
            className="button"
            onClick={() => setShowInfo((v) => !v)}
            style={{ height: "36px", borderRadius: "8px", padding: "0 16px", fontSize: "12px" }}
          >
            วิธีเล่น {showInfo ? "▲" : "▼"}
          </button>
          <button
            className="button"
            onClick={() => setShowHistory(true)}
            style={{ height: "36px", borderRadius: "8px", padding: "0 16px", fontSize: "12px" }}
          >
            ประวัติ
          </button>
        </div>
      </div>

      {/* Profit Score Display */}
      {profitScore !== null && (
        <div
          style={{
            background: "rgba(14, 203, 129, 0.1)",
            border: "1px solid var(--green)",
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>กระสุนเขียวคงเหลือ</span>
          <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--green)" }}>
            {profitScore} <GreenBullet size={14} />
          </span>
        </div>
      )}

      {/* Round Name */}
      {round && (
        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>
          {round.name}
        </div>
      )}

      {/* Prize Section */}
      {round && (round.prize_name || round.prize_image_url) && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--hairline)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {round.prize_image_url && (
            <div style={{ flexShrink: 0 }}>
              <img
                src={round.prize_image_url}
                alt={round.prize_name || " prize"}
                style={{
                  width: "150px",
                  height: "150px",
                  objectFit: "cover",
                  borderRadius: "8px",
                  border: "1px solid var(--hairline)",
                }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ color: "var(--yellow)", fontSize: "11px", fontWeight: "600", marginBottom: "4px", textTransform: "uppercase" }}>
              ของรางวัล
            </div>
            {round.prize_name && (
              <div style={{ color: "var(--text)", fontSize: "16px", fontWeight: "700", lineHeight: "1.4" }}>
                {round.prize_name}
              </div>
            )}
            {!round.prize_name && (
              <div style={{ color: "var(--muted)", fontSize: "12px" }}>
                ดูรายละเอียดเพิ่มเติมได้จากการประกาศผล
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Banner */}
      {round && (
        <div
          style={{
            background: round.computedStatus === "open" ? "rgba(14, 203, 129, 0.1)" : round.computedStatus === "upcoming" ? "rgba(255, 225, 0, 0.1)" : "rgba(240, 84, 84, 0.1)",
            border: `1px solid ${round.computedStatus === "open" ? "var(--green)" : round.computedStatus === "upcoming" ? "var(--yellow)" : "#ef4444"}`,
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", color: round.computedStatus === "open" ? "var(--green)" : round.computedStatus === "upcoming" ? "var(--yellow)" : "#ef4444" }}>
            {round.computedStatus === "open" && "เปิดรับซื้อ"}
            {round.computedStatus === "upcoming" && "ยังไม่เปิด"}
            {(round.computedStatus === "closed" || round.computedStatus === "resolved") && "ปิดรับซื้อแล้ว"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            {countdown}
          </div>
        </div>
      )}

      {/* Info Section */}
      {showInfo && info && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--hairline)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ color: "var(--yellow)", marginBottom: "10px", fontSize: "14px" }}>
            {info.title}
          </h3>
          <div
            style={{
              color: "var(--text)",
              fontSize: "12px",
              lineHeight: "1.7",
              whiteSpace: "pre-wrap",
            }}
          >
            {info.content}
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
            ยินดีด้วย! คุณเป็นผู้โชคดี!
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
                    {win.shipping_status === "pending" && "รอดำเนินการ"}
                    {win.shipping_status === "processing" && "กำลังเตรียม"}
                    {win.shipping_status === "shipped" && "จัดส่งแล้ว"}
                    {win.shipping_status === "delivered" && "ส่งถึงแล้ว"}
                  </span>
                </div>
                {win.match_name && (
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>
                    {win.match_name}
                  </div>
                )}
                {win.tracking_number && (
                  <div style={{ fontSize: "11px", color: "var(--info)" }}>
                    Tracking: {win.tracking_number}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Address Wall */}
      {addressRequired && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid #ef4444",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📦</div>
          <h3 style={{ color: "#ef4444", marginBottom: "8px", fontSize: "16px" }}>
            กรุณากรอกข้อมูลจัดส่งก่อนเล่น
          </h3>
          <p style={{ color: "var(--muted)", fontSize: "12px", marginBottom: "16px", lineHeight: "1.6" }}>
            ระบบต้องมีที่อยู่จัดส่งสำหรับส่งรางวัลให้คุณ<br />
            กรุณากรอกข้อมูลให้ครบถ้วน
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <button
              className="button"
              onClick={async () => {
                await loadUserInfo();
                if (addressCompleted) setAddressRequired(false);
              }}
              style={{ height: "40px", borderRadius: "8px", padding: "0 16px" }}
            >
              ตรวจสอบอีกครั้ง
            </button>
            <button
              className="button gold"
              onClick={() => window.location.href = "/profile"}
              style={{ height: "40px", borderRadius: "8px", padding: "0 24px" }}
            >
              ไปกรอกที่อยู่จัดส่ง
            </button>
          </div>
          {recheckMessage && (
            <div style={{ marginTop: "12px", padding: "8px 12px", background: recheckMessage.includes("✅") ? "rgba(14, 203, 129, 0.1)" : "rgba(246, 70, 93, 0.1)", border: `1px solid ${recheckMessage.includes("✅") ? "var(--green)" : "#ef4444"}`, borderRadius: "8px", color: recheckMessage.includes("✅") ? "var(--green)" : "#ef4444", fontSize: "11px" }}>
              {recheckMessage}
            </div>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "12px",
          background: message.includes("สำเร็จ") ? "rgba(14, 203, 129, 0.1)" : "rgba(255, 225, 0, 0.1)",
          color: message.includes("สำเร็จ") ? "var(--green)" : "var(--yellow)",
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
                  {maskName(slot.owner?.display_name || slot.owner?.email || "Unknown")}
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
                <span>{selectedSlot.owner_id ? maskName(selectedSlot.owner?.display_name || selectedSlot.owner?.email || "Unknown") : "ยังไม่มีเจ้าของ"}</span>
              </div>
            </div>

            <button
              className="button gold"
              onClick={() => {
                handleBuy(selectedSlot);
                setSelectedSlot(null);
              }}
              disabled={round?.computedStatus !== "open"}
              style={{ width: "100%", marginBottom: "8px", opacity: round?.computedStatus !== "open" ? 0.5 : 1 }}
            >
              {round?.computedStatus === "open"
                ? "ซื้อเลขนี้"
                : round?.computedStatus === "upcoming"
                ? "ยังไม่เปิด"
                : "ปิดรับซื้อ"}
            </button>
            <button className="button" onClick={() => setSelectedSlot(null)} style={{ width: "100%" }}>
              ปิด
            </button>
          </div>
        </div>
      )}
      {/* History Modal */}
      {showHistory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              background: "#161b22",
              border: "1px solid #2a2f35",
              borderRadius: "12px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px", borderBottom: "1px solid #2a2f35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", color: "var(--yellow)" }}>ประวัติ Number War</h2>
              <button className="button" onClick={() => setShowHistory(false)} style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}>
                ปิด
              </button>
            </div>

            {/* Filter Tabs */}
            <div style={{ padding: "12px 20px", display: "flex", gap: "8px", borderBottom: "1px solid #2a2f35", overflowX: "auto" }}>
              {(["all", "buy", "takeover", "sold"] as const).map((f) => (
                <button
                  key={f}
                  className={historyFilter === f ? "button gold" : "button"}
                  onClick={() => setHistoryFilter(f)}
                  style={{ height: "32px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
                >
                  {f === "all" ? "ทั้งหมด" : f === "buy" ? "ซื้อ" : f === "takeover" ? "แย่ง" : "ถูกแย่ง"}
                </button>
              ))}
            </div>

            {/* History List */}
            <div style={{ padding: "16px 20px" }}>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: "20px" }}>ยังไม่มีประวัติ</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {history.map((h) => {
                    const date = new Date(h.created_at);
                    const dateStr = date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
                    const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
                    const isPositive = h.amount > 0;
                    const typeLabel = h.type === "buy" ? "ซื้อ" : h.type === "takeover" ? "แย่ง" : "ถูกแย่ง";
                    const typeColor = h.type === "buy" ? "var(--info)" : h.type === "takeover" ? "var(--yellow)" : "var(--green)";
                    return (
                      <div
                        key={h.id}
                        style={{
                          background: "#0d1013",
                          border: "1px solid #2a2f35",
                          borderRadius: "8px",
                          padding: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>{dateStr} {timeStr}</span>
                            <span style={{ fontSize: "11px", fontWeight: "600", color: typeColor, background: `${typeColor}20`, padding: "2px 8px", borderRadius: "4px" }}>
                              {typeLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--text)" }}>
                            เลข {h.slot_number} · {h.round?.name || "-"}
                            {h.opponent && (
                              <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                                {" "}· {h.type === "sold" ? "โดน" : "จาก"} {maskName(h.opponent.display_name || h.opponent.email)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "14px", fontWeight: "700", color: isPositive ? "var(--green)" : "var(--red)" }}>
                            {isPositive ? "+" : ""}{h.amount} <GreenBullet size={10} />
                          </div>
                          {h.profit > 0 && (
                            <div style={{ fontSize: "10px", color: "var(--green)" }}>กำไร +{h.profit}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
