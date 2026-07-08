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
              <img src="/logo.png" alt="SuperWinHub" width={32} height={32} style={{ borderRadius: 8 }} />
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
            <img src="/logo.png" alt="SuperWinHub" width={32} height={32} style={{ borderRadius: 8 }} />
            <div className="brand-text">
              <h1>SuperWinHub</h1>
              <span>Leaderboard</span>
            </div>
          </div>
          <div className="actions">
            <Link href="/" className="button">← Back to Home</Link>
          </div>
        </div>

        {/* All 5 categories shown at once */}
        <div style={{ display: "grid", gap: "16px" }}>
          {categories.map((cat) => {
            const data = leaderboards?.[cat.id] || [];
            
            return (
              <section key={cat.id} className="panel">
                <div className="panel-head">
                  <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>{cat.icon}</span>
                    {cat.name}
                  </h2>
                  <span className="micro">{cat.desc}</span>
                </div>
                
                {error ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
                    <span>{error}</span>
                  </div>
                ) : data.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>
                    No data yet
                  </div>
                ) : (
                  <div className="leaderboard-body" style={{ maxHeight: "400px", overflowY: "auto" }}>
                    {data.slice(0, 10).map((entry) => (
                      <div key={entry.userId} className="rank">
                        <div style={{ fontSize: "14px", fontWeight: "700", color: entry.rank <= 3 ? "var(--yellow)" : "var(--text)" }}>
                          {getRankBadge(entry.rank)}
                        </div>
                        <div>
                          <strong style={{ fontSize: "12px", color: "var(--text-strong)" }}>
                            {entry.displayName || "Anonymous"}
                          </strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ 
                            color: "var(--yellow)", 
                            fontSize: "13px", 
                            fontWeight: "700",
                            fontFamily: "JetBrains Mono, monospace"
                          }}>
                            {formatValue(entry.value, cat.id)}
                          </span>
                        </div>
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
