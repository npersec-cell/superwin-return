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

// Layout: 3 rows
// Row 1: Overall (full width, prominent)
// Row 2: Most Orange Ammo | Most Predictions (2 columns)
// Row 3: Highest Single Win | Most Active (2 columns)
const layoutRows: { ids: Category[]; height: string }[] = [
  { ids: ["overall"], height: "220px" },
  { ids: ["mostOrangeAmmo", "mostPredictions"], height: "180px" },
  { ids: ["highestSingleWin", "mostActive"], height: "180px" }
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

  function CategorySection({ 
    cat, 
    data, 
    isProminent = false, 
    maxHeight = "320px" 
  }: { 
    cat: { id: Category; name: string; icon: string; desc: string };
    data: LeaderboardEntry[];
    isProminent?: boolean;
    maxHeight?: string;
  }) {
    return (
      <section 
        className={isProminent ? "panel" : "panel"}
        style={{ 
          minWidth: 0,
          ...(isProminent ? { 
            border: "2px solid var(--yellow)",
            background: "linear-gradient(135deg, rgba(255, 225, 0, 0.05) 0%, rgba(255, 225, 0, 0.02) 100%)"
          } : {})
        }}
      >
        <div className="panel-head" style={{ 
          paddingBottom: isProminent ? "12px" : "8px"
        }}>
            <h2 style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: isProminent ? "8px" : "5px",
            fontSize: isProminent ? "14px" : "11px",
            fontWeight: "700",
            color: isProminent ? "var(--yellow)" : "var(--text)"
          }}>
            <span style={{ fontSize: isProminent ? "16px" : "12px" }}>{cat.icon}</span>
            {cat.name}
          </h2>
          <span className="micro" style={{ 
            fontSize: isProminent ? "10px" : "9px", 
            opacity: 0.6
          }}>{cat.desc}</span>
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
            maxHeight: isProminent ? "160px" : "140px", 
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: isProminent ? "4px" : "3px"
          }}>
            {data.slice(0, isProminent ? 12 : 10).map((entry) => (
              <div key={entry.userId} style={{ 
                display: "flex",
                alignItems: "center",
                gap: isProminent ? "8px" : "5px",
                padding: isProminent ? "5px 8px" : "4px 6px",
                fontSize: isProminent ? "12px" : "10px",
                borderBottom: "1px solid var(--border)"
              }}>
                <span style={{ 
                  fontWeight: "700", 
                  color: entry.rank <= 3 ? "var(--yellow)" : "var(--text)",
                  width: isProminent ? "24px" : "16px",
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
                  minWidth: isProminent ? "45px" : "35px",
                  textAlign: "right",
                  fontSize: isProminent ? "11px" : "10px"
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
              
              return (
                <CategorySection
                  key={catId}
                  cat={cat}
                  data={data}
                  isProminent={catId === "overall"}
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
