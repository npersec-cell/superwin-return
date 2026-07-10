"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function compact(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function maskName(name: string): string {
  if (!name) return "";
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

interface UserInfo {
  id: string;
  email: string;
  displayName: string | null;
  profitScore: number;
  addressCompleted: boolean;
  shippingName?: string;
  shippingAddress?: string;
  shippingZipcode?: string;
  shippingPhone?: string;
}

interface UserRankData {
  overallRank: number;
  profitScore: number;
  profitScoreRank: number;
  predictionCount: number;
  predictionCountRank: number;
  highestSingleWin: number;
  highestSingleWinRank: number;
  avgReloadPerDay: number;
  activeRank: number;
  totalUsers: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [rankData, setRankData] = useState<UserRankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [form, setForm] = useState({
    shippingName: "",
    shippingAddress: "",
    shippingZipcode: "",
    shippingPhone: "",
    displayName: "",
  });
  const [dnMessage, setDnMessage] = useState("");
  const [dnError, setDnError] = useState("");
  const [dnSaving, setDnSaving] = useState(false);

  async function loadUser() {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.ok) {
        setUser(data.data);
        setForm((f) => ({
          ...f,
          shippingName: data.data.shippingName || "",
          shippingAddress: data.data.shippingAddress || "",
          shippingZipcode: data.data.shippingZipcode || "",
          shippingPhone: data.data.shippingPhone || "",
          displayName: data.data.displayName || "",
        }));
        // ถ้ายังไม่เคยกรอก ที่อยู่ → เปิดโหมดแก้ไขให้เลย
        if (!data.data.addressCompleted) {
          setIsEditing(true);
        }
      }
    } catch (err) {
      console.error("Error loading user:", err);
    }
  }

  async function loadRankData(userId: string) {
    try {
      const res = await fetch(`/api/leaderboard/v2?userId=${userId}`);
      const data = await res.json();
      if (data.userRankData) {
        setRankData(data.userRankData);
      }
    } catch (err) {
      console.error("Error loading rank data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  // Load rank data after user is loaded
  useEffect(() => {
    if (user?.id) {
      loadRankData(user.id);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!form.shippingName.trim() || !form.shippingAddress.trim() || !form.shippingZipcode.trim() || !form.shippingPhone.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingName: form.shippingName,
          shippingAddress: form.shippingAddress,
          shippingZipcode: form.shippingZipcode,
          shippingPhone: form.shippingPhone,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(user?.addressCompleted ? "อัปเดตข้อมูลสำเร็จ!" : "บันทึกข้อมูลสำเร็จ!");
        setUser((prev) => prev ? { ...prev, addressCompleted: data.data.addressCompleted } : null);
        setIsEditing(false);
        if (!user?.addressCompleted) {
          setTimeout(() => {
            router.push("/number-war");
          }, 1500);
        }
      } else {
        setError(data.error || "ไม่สามารถบันทึกข้อมูลได้");
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit() {
    setIsEditing(true);
    setMessage("");
    setError("");
  }

  async function saveDisplayName() {
    setDnError("");
    setDnMessage("");

    const raw = form.displayName.trim();
    if (raw.length > 8) {
      setDnError("ชื่อเล่นต้องไม่เกิน 8 ตัวอักษร");
      return;
    }

    setDnSaving(true);
    try {
      const res = await fetch("/api/me/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: raw || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setDnMessage("บันทึกชื่อเล่นสำเร็จ!");
        setUser((prev) => prev ? { ...prev, displayName: raw || null } : null);
      } else {
        setDnError(data.error || "ไม่สามารถบันทึกชื่อเล่นได้");
      }
    } catch {
      setDnError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDnSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="app" style={{ textAlign: "center", padding: "40px" }}>
          <div style={{ color: "var(--muted)" }}>กำลังโหลด...</div>
        </div>
      </div>
    );
  }

  const readOnly = user?.addressCompleted && !isEditing;

  return (
    <div className="page">
      <div className="app" style={{ maxWidth: "480px" }}>
        {/* Header */}
        <div className="topbar" style={{ marginBottom: "12px" }}>
            <div className="brand">
              <img src="https://superwinhub.app/SuperWin_b.png" alt="" className="logo" />
              <div className="brand-text">
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--yellow)" }}>
                {readOnly ? "ข้อมูลโปรไฟล์" : "แก้ไขข้อมูลโปรไฟล์"}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted)" }}>
                {readOnly ? "ข้อมูลส่วนตัวของคุณ" : "กรอกข้อมูลให้ครบถ้วน"}
              </div>
            </div>
          </div>
          <button className="button" onClick={() => router.push("/")} style={{ height: "34px", padding: "0 14px", fontSize: "11px" }}>
            กลับ
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="panel" style={{ padding: "14px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--yellow-soft)", display: "grid", placeItems: "center", fontSize: "16px" }}>
                👤
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "12px" }}>{user.displayName || user.email}</div>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>{user.email}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
              <span style={{ color: "var(--muted)" }}>กระสุนเขียวคงเหลือ:</span>
              <span style={{ color: "var(--green)", fontWeight: 700 }}>{user.profitScore}</span>
              <img src="https://superwinhub.app/SuperWin_b.png" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
            </div>
          </div>
        )}

        {/* Leaderboard Stats */}
        {rankData && (
          <div className="panel" style={{ padding: "14px", marginBottom: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "var(--yellow)" }}>
              🏆 สถิติใน Leaderboard
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Overall</span>
                <strong style={{ display: "block", fontSize: "16px", color: "var(--yellow)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                  #{rankData.overallRank} ของ {rankData.totalUsers} คน
                </strong>
              </div>
              <div style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Most Orange Ammo</span>
                <strong style={{ display: "block", fontSize: "16px", color: "var(--yellow)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                  {compact(rankData.profitScore)}
                </strong>
                <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                  #{rankData.profitScoreRank}
                </span>
              </div>
              <div style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Most Predictions</span>
                <strong style={{ display: "block", fontSize: "16px", color: "var(--yellow)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                  {rankData.predictionCount}
                </strong>
                <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                  #{rankData.predictionCountRank}
                </span>
              </div>
              <div style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Highest Single Win</span>
                <strong style={{ display: "block", fontSize: "16px", color: "var(--yellow)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                  {compact(rankData.highestSingleWin)}
                </strong>
                <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                  #{rankData.highestSingleWinRank}
                </span>
              </div>
              <div style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Most Active (avg/day)</span>
                <strong style={{ display: "block", fontSize: "16px", color: "var(--yellow)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                  {(rankData.avgReloadPerDay || 0).toFixed(1)}
                </strong>
                <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                  #{rankData.activeRank}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Display Name Editor */}
        <div className="panel" style={{ padding: "14px", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px", color: "var(--text)" }}>
            ชื่อที่แสดงบนเว็บ (ชื่อเล่น) <span style={{ color: "var(--muted)", fontWeight: 400 }}>· ไม่เกิน 8 ตัวอักษร</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="ตั้งชื่อเล่น"
              maxLength={8}
              style={{
                flex: 1,
                height: "38px",
                background: "var(--bg)",
                border: "1px solid var(--hairline)",
                borderRadius: "8px",
                padding: "0 12px",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none",
              }}
            />
            <button
              type="button"
              className="button gold"
              onClick={saveDisplayName}
              disabled={dnSaving}
              style={{ height: "38px", padding: "0 16px", fontSize: "12px", fontWeight: 600, borderRadius: "8px", opacity: dnSaving ? 0.6 : 1 }}
            >
              {dnSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
          {form.displayName.length > 0 && (
            <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--muted)" }}>
              ตัวอย่างที่จะแสดง: <span style={{ color: "var(--yellow)", fontWeight: 600 }}>{form.displayName}</span>
            </div>
          )}
          {dnError && (
            <div style={{ marginTop: "8px", padding: "8px", background: "rgba(246, 70, 93, 0.1)", border: "1px solid var(--red)", borderRadius: "6px", color: "var(--red)", fontSize: "11px" }}>
              {dnError}
            </div>
          )}
          {dnMessage && (
            <div style={{ marginTop: "8px", padding: "8px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", borderRadius: "6px", color: "var(--green)", fontSize: "11px" }}>
              {dnMessage}
            </div>
          )}
        </div>

        {/* Address Status */}
        <div
          className="panel"
          style={{
            padding: "14px",
            marginBottom: "12px",
            background: user?.addressCompleted ? "rgba(14, 203, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
            borderColor: user?.addressCompleted ? "var(--green)" : "var(--red)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "20px" }}>{user?.addressCompleted ? "✅" : "⚠️"}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "12px", color: user?.addressCompleted ? "var(--green)" : "var(--red)" }}>
                  {user?.addressCompleted ? "ข้อมูลจัดส่งครบถ้วน" : "ยังไม่มีข้อมูลจัดส่ง"}
                </div>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>
                  {user?.addressCompleted
                    ? "คุณสามารถเล่น Number War และรับรางวัลได้"
                    : "กรุณากรอกข้อมูลด้านล่างให้ครบถ้วน"}
                </div>
              </div>
            </div>
            {user?.addressCompleted && !isEditing && (
              <button
                type="button"
                onClick={handleEdit}
                className="button"
                style={{ height: "32px", padding: "0 12px", fontSize: "11px", borderRadius: "6px" }}
              >
                แก้ไข
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        {isEditing ? (
          <form onSubmit={handleSubmit} className="panel" style={{ padding: "16px" }}>
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: "var(--text)" }}>
                  ชื่อ-นามสกุล ผู้รับ <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.shippingName}
                  onChange={(e) => setForm((f) => ({ ...f, shippingName: e.target.value }))}
                  placeholder="ชื่อ นามสกุล"
                  style={{
                    width: "100%",
                    height: "40px",
                    background: "var(--bg)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "8px",
                    padding: "0 12px",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: "var(--text)" }}>
                  ที่อยู่จัดส่ง <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <textarea
                  value={form.shippingAddress}
                  onChange={(e) => setForm((f) => ({ ...f, shippingAddress: e.target.value }))}
                  placeholder="บ้านเลขที่ หมู่บ้าน/อาคาร ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"
                  rows={3}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: "var(--text)" }}>
                    รหัสไปรษณีย์ <span style={{ color: "var(--red)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.shippingZipcode}
                    onChange={(e) => setForm((f) => ({ ...f, shippingZipcode: e.target.value }))}
                    placeholder="10110"
                    maxLength={10}
                    style={{
                      width: "100%",
                      height: "40px",
                      background: "var(--bg)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "8px",
                      padding: "0 12px",
                      color: "var(--text)",
                      fontSize: "12px",
                      outline: "none",
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: "var(--text)" }}>
                    เบอร์โทรศัพท์ <span style={{ color: "var(--red)" }}>*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.shippingPhone}
                    onChange={(e) => setForm((f) => ({ ...f, shippingPhone: e.target.value }))}
                    placeholder="081-234-5678"
                    maxLength={20}
                    style={{
                      width: "100%",
                      height: "40px",
                      background: "var(--bg)",
                      border: "1px solid var(--hairline)",
                      borderRadius: "8px",
                      padding: "0 12px",
                      color: "var(--text)",
                      fontSize: "12px",
                      outline: "none",
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div style={{ marginTop: "12px", padding: "10px", background: "rgba(246, 70, 93, 0.1)", border: "1px solid var(--red)", borderRadius: "8px", color: "var(--red)", fontSize: "11px" }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{ marginTop: "12px", padding: "10px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", borderRadius: "8px", color: "var(--green)", fontSize: "11px" }}>
                {message}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              {user?.addressCompleted && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setIsEditing(false)}
                  style={{ flex: 1, height: "44px", borderRadius: "8px", fontSize: "13px", fontWeight: 600 }}
                >
                  ยกเลิก
                </button>
              )}
              <button
                type="submit"
                className="button gold"
                disabled={saving}
                style={{
                  flex: 1,
                  height: "44px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 700,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "กำลังบันทึก..." : user?.addressCompleted ? "อัปเดตข้อมูล" : "บันทึกข้อมูลจัดส่ง"}
              </button>
            </div>
          </form>
        ) : (
          /* Read-only view */
          <div className="panel" style={{ padding: "16px" }}>
            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>ชื่อ-นามสกุล ผู้รับ</div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{user?.shippingName || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>ที่อยู่จัดส่ง</div>
                <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{user?.shippingAddress || "-"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>รหัสไปรษณีย์</div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{user?.shippingZipcode || "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>เบอร์โทรศัพท์</div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{user?.shippingPhone || "-"}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
