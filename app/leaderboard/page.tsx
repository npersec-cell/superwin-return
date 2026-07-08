"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";

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
  const [activeCategory, setActiveCategory] = useState<Category>("overall");

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
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentData = leaderboards?.[activeCategory] || [];

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
              <div className="logo" />
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
            <div className="logo" />
            <div className="brand-text">
              <h1>SuperWinHub</h1>
              <span>Leaderboard</span>
            </div>
          </div>
          <div className="actions">
            <Link href="/" className="button">← Back to Home</Link>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="label">Last Updated</div>
            <span className="value">{leaderboards ? "Just now" : "—"}</span>
          </div>
        </div>

        <div className="content" style={{ gridTemplateColumns: "1fr 2fr" }}>
          {/* Left: Category Navigation */}
          <aside className="side" style={{ gridRow: "1 / 2", borderRight: "1px solid var(--hairline)" }}>
            <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <div className="panel-head">
                <h3>Categories</h3>
                <span className="micro">Top 20 each</span>
              </div>
              <div style={{ display: "grid", gap: "4px", padding: "10px" }}>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    className={`button ${activeCategory === cat.id ? "primary" : ""}`}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
              <div style={{ padding: "12px", borderTop: "1px solid var(--hairline)" }}>
                <span className="micro">Auto-refresh every 30s</span>
              </div>
            </div>
          </aside>

          {/* Right: Leaderboard List */}
          <section className="content" style={{ gridRow: "1 / 2", gridColumn: "2" }}>
            <section className="panel">
              <div className="panel-head">
                <h2>{categories.find(c => c.id === activeCategory)?.name}</h2>
                <span className="micro">
                  {categories.find(c => c.id === activeCategory)?.desc}
                </span>
              </div>
              
              {error ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
                  <span>{error}</span>
                </div>
              ) : currentData.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
                  No data yet. Be the first to appear on the leaderboard!
                </div>
              ) : (
                <div className="leaderboard-body">
                  {currentData.map((entry) => (
                    <div key={entry.userId} className="rank">
                      <div style={{ fontSize: "14px", fontWeight: "700", color: entry.rank <= 3 ? "var(--yellow)" : "var(--text)" }}>
                        {getRankBadge(entry.rank)}
                      </div>
                      <div>
                        <strong style={{ fontSize: "12px", color: "var(--text-strong)" }}>
                          {entry.displayName || "Anonymous"}
                        </strong>
                        <span className="meta" style={{ fontSize: "9px" }}>ID: {entry.userId.slice(0, 8)}...</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ 
                          color: "var(--yellow)", 
                          fontSize: "13px", 
                          fontWeight: "700",
                          fontFamily: "JetBrains Mono, monospace"
                        }}>
                          {formatValue(entry.value, activeCategory)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </div>
    </div>
  );
}
