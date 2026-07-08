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

const layoutRows: { ids: Category[]; height: string }[] = [
  { ids: ["overall"], height: "380px" },
  { ids: ["mostOrangeAmmo", "mostPredictions"], height: "320px" },
  { ids: ["highestSingleWin", "mostActive"], height: "320px" }
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

  // Special component for Overall (prominent)
  function OverallSection({ cat, data }: { cat: { id: Category; name: string; icon: string; desc: string }; data: LeaderboardEntry[] }) {
    return (
      <section 
        className="panel"
        style={{ 
          minWidth: 0,
          border: "2px solid var(--yellow)",
          background: "linear-gradient(135deg, rgba(255, 225, 0, 0.05) 0%, rgba(255, 225, 0, 0.02) 100%)"
        }}
      >
        <div className="panel-head" style={{ paddingBottom: "12px" }}>
          <h2 style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "10px",
            fontSize: "16px",
            fontWeight: "800",
            color: "var(--yellow)"
          }}>
            <span style={{ fontSize: "20px" }}>{cat.icon}</span>
            {cat.name}
          </h2>
          <span className="micro" style={{ fontSize: "12px", opacity: 0.7 }}>{cat.desc}</span>
        </div>
        
        {error ? (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
            {error}
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
            No data yet
          </div>
        ) : (
          <div className="leaderboard-scroll" style={{ 
            maxHeight: "300px", 
            overflowY: "auto",
            display: "flex",
            flexDirection: "column"
          }}>
            {data.slice(0, 10).map((entry) => (
              <div 
                key={entry.userId} 
                style={{ 
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  fontSize: "14px",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.15s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 225, 0, 0.08)"; (e.currentTarget.firstChild as HTMLElement)?.style.color = "var(--yellow)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; (e.currentTarget.firstChild as HTMLElement)?.style.color = "var(--text)"; }}
              >
                {/* Rank - big and prominent on the left */}
                <span style={{ 
                  fontWeight: "800", 
                  color: "var(--text)",
                  width: "48px",
                  textAlign: "center",
                  fontSize: "16px",
                  fontFamily: "JetBrains Mono, monospace"
                }}>
                  {getRankBadge(entry.rank)}
                </span>
                
                {/* Name - center, takes most space */}
                <strong style={{ 
                  flex: 1, 
                  color: "var(--text-strong)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: "600",
                  fontSize: "14px"
                }}>
                  {entry.displayName || "Anonymous"}
                </strong>
                
                {/* Value - right side, highlighted */}
                <span style={{ 
                  color: "var(--yellow)", 
                  fontWeight: "700",
                  fontFamily: "JetBrains Mono, monospace",
                  background: "rgba(255, 225, 0, 0.1)",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  minWidth: "60px",
                  textAlign: "right",
                  fontSize: "13px"
                }}>
                  {formatValue(entry.value, cat.id)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  // Normal component for other categories
  function CategorySection({ 
    cat, 
    data, 
    maxHeight = "320px" 
  }: { 
    cat: { id: Category; name: string; icon: string; desc: string };
    data: LeaderboardEntry[];
    maxHeight?: string;
  }) {
    return (
      <section className="panel" style={{ minWidth: 0 }}>
        <div className="panel-head" style={{ paddingBottom: "8px" }}>
          <h2 style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "6px",
            fontSize: "12px",
            fontWeight: "700",
            color: "var(--text)"
          }}>
            <span style={{ fontSize: "14px" }}>{cat.icon}</span>
            {cat.name}
          </h2>
          <span className="micro" style={{ fontSize: "10px", opacity: 0.6 }}>{cat.desc}</span>
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
          <div className="leaderboard-scroll" style={{ 
            maxHeight: "260px", 
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "3px"
          }}>
            {data.slice(0, 10).map((entry) => (
              <div key={entry.userId} style={{ 
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 8px",
                fontSize: "11px",
                borderBottom: "1px solid var(--border)"
              }}>
                <span style={{ 
                  fontWeight: "700", 
                  color: entry.rank <= 3 ? "var(--yellow)" : "var(--text)",
                  width: "18px",
                  textAlign: "center"
                }}>
                  {getRankBadge(entry.rank)}
                </span>
                <strong style={{ 
                  flex: 1, 
                  color: "var(--text-strong)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: "600"
                }}>
                  {entry.displayName || "Anonymous"}
                </strong>
                <span style={{ 
                  color: "var(--yellow)", 
                  fontWeight: "700",
                  fontFamily: "JetBrains Mono, monospace",
                  minWidth: "35px",
                  textAlign: "right",
                  fontSize: "10px"
                }}>
                  {formatValue(entry.value, cat.id)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
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

        {/* 3-row layout */}
        {layoutRows.map((row, rowIdx) => (
          <div 
            key={rowIdx}
            style={{ 
              display: "grid",
              gridTemplateColumns: `repeat(${row.ids.length}, 1fr)`,
              gap: "12px",
              marginBottom: rowIdx < layoutRows.length - 1 ? "16px" : 0
            }}
          >
            {row.ids.map((catId) => {
              const cat = categories.find(c => c.id === catId)!;
              const data = leaderboards?.[catId] || [];
              
              // Use special component for Overall
              if (catId === "overall") {
                return <OverallSection key={catId} cat={cat} data={data} />;
              }
              
              return (
                <CategorySection
                  key={catId}
                  cat={cat}
                  data={data}
                  maxHeight={row.height}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
