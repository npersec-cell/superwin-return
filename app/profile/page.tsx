"use client";

import { useState, useEffect, useRef } from "react";
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

function getRankFromPosition(rank: number, totalUsers: number): { name: string; icon: string } {
  if (totalUsers === 0) return { name: "Bronze", icon: "/ranks/bronze.png" };
  
  // Crown: #1 only (the absolute best)
  if (rank === 1) return { name: "Crown", icon: "/ranks/crown.png" };
  
  // Helper to check minimum count for each rank tier
  function minForTier(tierPercent: number): number {
    return Math.max(1, Math.ceil(totalUsers * tierPercent / 100));
  }
  
  // Conqueror: Top 3% OR at least 2 people
  const minConqueror = Math.max(2, minForTier(3));
  if (rank <= minConqueror) return { name: "Conqueror", icon: "/ranks/conqueror.png" };
  
  // Ace: Top 8% OR at least 3 people
  const minAce = Math.max(3, minForTier(8));
  if (rank <= minAce) return { name: "Ace", icon: "/ranks/ace.png" };
  
  // Diamond: Top 15% OR at least 5 people
  const minDiamond = Math.max(5, minForTier(15));
  if (rank <= minDiamond) return { name: "Diamond", icon: "/ranks/diamond.png" };
  
  // Calculate percentile: higher = better (100 = top)
  const percentile = ((totalUsers - rank) / totalUsers) * 100;
  
  // Platinum: Top 25%
  if (percentile >= 50) return { name: "Platinum", icon: "/ranks/platinum.png" };
  // Gold: Top 40%
  if (percentile >= 40) return { name: "Gold", icon: "/ranks/gold.png" };
  // Silver: 40-70%
  if (percentile >= 15) return { name: "Silver", icon: "/ranks/silver.png" };
  // Bronze: Bottom 30%
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

interface UserProfileStats {
  name: string;
  displayName?: string | null;
  // Overall leaderboard
  overallScore: number;
  overallRank: number;
  // Most Orange Ammo (coinBalance)
  coinBalance: number;
  mostOrangeAmmoRank: number;
  // Most Predictions
  predictionCount: number;
  mostPredictionsRank: number;
  // Highest Single Win
  highestSingleWin: number;
  highestSingleWinRank: number;
  // Most Active
  avgReloadPerDay: number;
  mostActiveRank: number;
  // Other stats
  rank: number;
  rankPercentile: number;
  rankName: string;
  rankIcon: string;
  totalUsers: number;
  winRate: number;
  wonCount: number;
  lostCount: number;
  totalSettled: number;
  badge: string;
  badgeDesc: string;
  loading?: boolean;
  history: Array<{
    id: string;
    tournament: string;
    question: string;
    pick: string;
    amount: number;
    payout: number;
    status: "won" | "lost";
    net: number;
    date: string;
  }>;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
  });
  const [dnMessage, setDnMessage] = useState("");
  const [dnError, setDnError] = useState("");
  const [dnSaving, setDnSaving] = useState(false);
  
  // Refresh interval
  const profileRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load profile data using the same API as Leaderboard
  async function loadProfile(userId?: string) {
    try {
      // Get current user's ID from /api/me first
      let currentUserId = userId;
      if (!currentUserId) {
        const meRes = await fetch("/api/me");
        const meData = await meRes.json();
        if (meData.ok && meData.data) {
          currentUserId = meData.data.id;
          setForm({ displayName: meData.data.displayName || "" });
        }
      }
      
      if (!currentUserId) {
        setError("Cannot load profile: user not authenticated");
        return;
      }
      
      // Fetch profile data using the same API as Leaderboard
      const response = await fetch(`/api/leaderboard/profile?userId=${currentUserId}&_t=${Date.now()}`);
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        const profileData = payload.data;
        setProfile({
          ...profileData,
          loading: false,
        });
        setError(null);
      } else {
        setError(payload.error || "Failed to load profile");
      }
    } catch (e) {
      console.error("Error loading profile:", e);
      setError("Failed to load profile");
    }
  }

  useEffect(() => {
    loadProfile();
    
    // Auto-refresh every 15 seconds
    profileRefreshRef.current = setInterval(() => loadProfile(), 15000);
    
    return () => {
      if (profileRefreshRef.current) {
        clearInterval(profileRefreshRef.current);
        profileRefreshRef.current = null;
      }
    };
  }, []);

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
        setForm({ displayName: raw || "" });
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
        <div className="app" style={{ width: "min(820px, 100%)" }}>
          <div className="topbar">
            <div className="brand">
              <img src="https://superwinhub.app/SuperWin_b.png" alt="SuperWinHub" width={24} height={24} style={{ borderRadius: 6, objectFit: "contain" }} />
              <div className="brand-text">
                <h1>SuperWinHub</h1>
                <span>My Profile</span>
              </div>
            </div>
            <div className="actions">
              <button className="button" onClick={() => router.push("/")}>← Back to Home</button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="app" style={{ width: "min(820px, 100%)" }}>
          <div className="topbar">
            <div className="brand">
              <img src="https://superwinhub.app/SuperWin_b.png" alt="SuperWinHub" width={24} height={24} style={{ borderRadius: 6, objectFit: "contain" }} />
              <div className="brand-text">
                <h1>SuperWinHub</h1>
                <span>My Profile</span>
              </div>
            </div>
            <div className="actions">
              <button className="button" onClick={() => router.push("/")}>← Back to Home</button>
            </div>
          </div>
          <div style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ color: "var(--red)", fontSize: "14px" }}>{error}</div>
            <button className="button" onClick={() => router.push("/")} style={{ marginTop: "12px" }}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <div className="app" style={{ width: "min(820px, 100%)" }}>
          <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
            No profile data available
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="app" style={{ width: "min(820px, 100%)" }}>
        <div className="topbar">
          <div className="brand">
            <img src="https://superwinhub.app/SuperWin_b.png" alt="SuperWinHub" width={24} height={24} style={{ borderRadius: 6, objectFit: "contain" }} />
            <div className="brand-text">
              <h1>SuperWinHub</h1>
              <span>My Profile</span>
            </div>
          </div>
          <div className="actions">
            <button className="button" onClick={() => router.push("/")}>← Back to Home</button>
          </div>
        </div>

        {/* Profile Content - Same as Leaderboard ProfileModal */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {/* Left Column: Stats & History */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* RANK - Full Width, Top */}
            <div className="info-block" style={{ padding: "14px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px", textAlign: "center" }}>
              <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>OVERALL RANK</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "8px" }}>
                <img src={profile.rankIcon} alt="" width={28} height={28} style={{ objectFit: "contain" }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <strong style={{ fontSize: "22px", color: "var(--yellow)", fontWeight: 700 }}>
                    #{profile.overallRank}
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>{profile.rankName}</span>
                </div>
              </div>
            </div>

            {/* Stats Grid - 6 columns, 2 rows */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>WIN RATE</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px" }}>
                  {profile.winRate}%
                </strong>
                <span style={{ fontSize: "8px", color: "var(--muted)", textTransform: "none", marginTop: "1px", display: "block" }}>
                  {profile.wonCount} won · {profile.lostCount} lost
                </span>
              </div>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>Overall</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                  {profile.overallScore ?? 0}
                </strong>
              </div>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>Most Orange Ammo</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                  {compact(Number.isNaN(profile.coinBalance) || profile.coinBalance === null ? 0 : Number(profile.coinBalance))}
                </strong>
                <span style={{ fontSize: "8px", color: "var(--muted)", textTransform: "none", marginTop: "1px", display: "block" }}>
                  #{profile.mostOrangeAmmoRank || "?"}
                </span>
              </div>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>Most Predictions</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                  {profile.predictionCount ?? 0}
                </strong>
                <span style={{ fontSize: "8px", color: "var(--muted)", textTransform: "none", marginTop: "1px", display: "block" }}>
                  #{profile.mostPredictionsRank || "?"}
                </span>
              </div>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>Highest Single Win</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                  {compact(Number.isNaN(profile.highestSingleWin) || profile.highestSingleWin === null ? 0 : Number(profile.highestSingleWin))}
                </strong>
                <span style={{ fontSize: "8px", color: "var(--muted)", textTransform: "none", marginTop: "1px", display: "block" }}>
                  #{profile.highestSingleWinRank || "?"}
                </span>
              </div>
              <div style={{ padding: "8px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "6px" }}>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>Most Active (avg/day)</span>
                <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                  {(profile.avgReloadPerDay ?? 0).toFixed(1)}
                </strong>
                <span style={{ fontSize: "8px", color: "var(--muted)", textTransform: "none", marginTop: "1px", display: "block" }}>
                  #{profile.mostActiveRank || "?"}
                </span>
              </div>
            </div>

            {/* Display Name Editor */}
            <div style={{ padding: "12px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px", color: "var(--text)" }}>
                Display Name <span style={{ color: "var(--muted)", fontWeight: 400 }}>· max 8 chars</span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Enter display name"
                  maxLength={8}
                  style={{
                    flex: 1,
                    height: "34px",
                    background: "var(--bg-deeper)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "6px",
                    padding: "0 12px",
                    color: "var(--text)",
                    fontSize: "12px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  className="button"
                  onClick={saveDisplayName}
                  disabled={dnSaving}
                  style={{ height: "34px", padding: "0 14px", fontSize: "11px", fontWeight: 600, borderRadius: "6px", opacity: dnSaving ? 0.6 : 1 }}
                >
                  {dnSaving ? "Saving..." : "Save"}
                </button>
              </div>
              {form.displayName.length > 0 && (
                <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--muted)" }}>
                  Preview: <span style={{ color: "var(--yellow)", fontWeight: 600 }}>{form.displayName}</span>
                </div>
              )}
              {dnError && (
                <div style={{ marginTop: "8px", padding: "8px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid var(--red)", borderRadius: "6px", color: "var(--red)", fontSize: "11px" }}>
                  {dnError}
                </div>
              )}
              {dnMessage && (
                <div style={{ marginTop: "8px", padding: "8px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", borderRadius: "6px", color: "var(--green)", fontSize: "11px" }}>
                  {dnMessage}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Last 5 Settled Predictions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Last 5 Settled Predictions */}
            <div style={{ display: "grid", gap: "6px" }}>
              <h4 className="meta" style={{ color: "var(--yellow)", fontSize: "11px", margin: "0" }}>⚡ Last 5 Settled Predictions</h4>
              {!profile.history || profile.history.length === 0 ? (
                <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)", fontSize: "11px" }}>
                  No settled predictions found.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "6px", maxHeight: "300px", overflowY: "auto" }}>
                  {profile.history.map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)", gap: "8px" }}>
                      <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                        <strong style={{ fontSize: "11px", color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.question}
                        </strong>
                        <span className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.tournament}{h.pick ? (<span> · Picked: <strong style={{ color: "var(--text-strong)" }}>{h.pick}</strong></span>) : ""}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {(() => {
                          const net = (h as any).net !== undefined
                            ? (h as any).net
                            : (h.status === "won" ? h.payout - h.amount : -h.amount);
                          const isPositive = net >= 0;
                          return (
                            <span className="pill" style={{
                              fontSize: "9px",
                              height: "18px",
                              padding: "0 6px",
                              background: isPositive ? "rgba(14, 203, 129, 0.12)" : "rgba(240, 84, 84, 0.12)",
                              color: isPositive ? "var(--green)" : "var(--red)",
                              borderColor: isPositive ? "rgba(14, 203, 129, 0.4)" : "rgba(240, 84, 84, 0.4)",
                              borderRadius: "4px",
                              fontWeight: "bold"
                            }}>
                              {isPositive ? `+${compact(net)}` : `-${compact(Math.abs(net))}`}
                            </span>
                          );
                        })()}
                        <span className="meta" style={{ display: "block", fontSize: "8px", marginTop: "2px" }}>
                          {h.date}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
