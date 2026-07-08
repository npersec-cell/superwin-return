"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  value: number;
}

interface LeaderboardData {
  overall: LeaderboardEntry[];
  mostOrangeAmmo: LeaderboardEntry[];
  mostPredictions: LeaderboardEntry[];
  highestSingleWin: LeaderboardEntry[];
  mostActive: LeaderboardEntry[];
}

interface ApiResponse {
  leaderboards: LeaderboardData;
  timestamp: string;
}

type Category = "overall" | "mostOrangeAmmo" | "mostPredictions" | "highestSingleWin" | "mostActive";

const categories: { id: Category; name: string; icon: string; desc: string }[] = [
  { id: "overall", name: "Overall", icon: "📊", desc: "Average of all stats" },
  { id: "mostOrangeAmmo", name: "Most Orange Ammo", icon: "🟠", desc: "Highest profit score" },
  { id: "mostPredictions", name: "Most Predictions", icon: "🎯", desc: "Most predictions made" },
  { id: "highestSingleWin", name: "Highest Single Win", icon: "🏆", desc: "Biggest single profit" },
  { id: "mostActive", name: "Most Active", icon: "⚡", desc: "Avg reloads per day" }
];

export default function LeaderboardPage() {
  const [leaderboards, setLeaderboards] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/leaderboard/v2?t=${Date.now()}`);
        const data = await response.json();
        
        if (data.leaderboards) {
          setLeaderboards(data.leaderboards);
          setError(null);
        } else {
          setError(data.error || "Failed to load leaderboard");
        }
      } catch (e) {
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  function formatValue(value: number, category: Category): string {
    if (category === "mostActive") {
      return value.toFixed(2);
    }
    return value.toLocaleString();
  }

  function getRankBadge(rank: number): string {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
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
                <span>Leaderboard</span>
              </div>
            </div>
            <div className="actions">
              <Link href="/" className="button">← Back</Link>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><div className="label">Loading...</div><span className="value">📊</span></div>
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
                <span>Leaderboard</span>
              </div>
            </div>
            <div className="actions">
              <Link href="/" className="button">← Back to Home</Link>
            </div>
          </div>

        {/* All 5 categories shown at once - HORIZONTAL layout */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(5, 1fr)", 
          gap: "12px",
          alignItems: "start"
        }}>
          {categories.map((cat) => {
            const data = leaderboards?.[cat.id] || [];
            
            return (
              <section key={cat.id} className="panel" style={{ minWidth: 0 }}>
                <div className="panel-head" style={{ paddingBottom: "8px" }}>
                  <h2 style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}>
                    <span>{cat.icon}</span>
                    {cat.name}
                  </h2>
                  <span className="micro" style={{ fontSize: "10px" }}>{cat.desc}</span>
                </div>
                
                {error ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                    {error}
                  </div>
                ) : data.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
                    No data
                  </div>
                ) : (
                  <div style={{ 
                    maxHeight: "320px", 
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    {data.slice(0, 15).map((entry) => (
                      <div key={entry.userId} style={{ 
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 8px",
                        fontSize: "11px",
                        borderBottom: "1px solid var(--border)"
                      }}>
                        <span style={{ 
                          fontWeight: "700", 
                          color: entry.rank <= 3 ? "var(--yellow)" : "var(--text)",
                          width: "14px"
                        }}>
                          {getRankBadge(entry.rank)}
                        </span>
                        <strong style={{ 
                          flex: 1, 
                          color: "var(--text-strong)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}>
                          {entry.displayName || "Anonymous"}
                        </strong>
                        <span style={{ 
                          color: "var(--yellow)", 
                          fontWeight: "700",
                          fontFamily: "JetBrains Mono, monospace",
                          minWidth: "40px",
                          textAlign: "right"
                        }}>
                          {formatValue(entry.value, cat.id)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
