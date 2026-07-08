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

interface LiveBet {
  userId: string;
  displayName: string;
  predictionId: string;
  predictionTitle: string;
  optionName: string;
  amount: number;
  createdAt: string;
}

type Category = "overall" | "mostOrangeAmmo" | "mostPredictions" | "highestSingleWin" | "mostActive";

const categories: { id: Category; name: string; icon: string; iconUrl?: string; desc: string }[] = [
  { id: "overall", name: "Overall", icon: "📊", desc: "Average of all stats" },
  { id: "mostOrangeAmmo", name: "Most Orange Ammo", icon: "🟠", iconUrl: "https://superwinhub.app/ammo-icon.webp", desc: "Highest profit score" },
  { id: "mostPredictions", name: "Most Predictions", icon: "🎯", desc: "Most predictions made" },
  { id: "highestSingleWin", name: "Highest Single Win", icon: "🏆", desc: "Biggest single profit" },
  { id: "mostActive", name: "Most Active", icon: "⚡", desc: "Avg reloads per day" }
];

export default function LeaderboardPage() {
  const [leaderboards, setLeaderboards] = useState<LeaderboardData | null>(null);
  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch leaderboard
        const leaderboardResponse = await fetch(`/api/leaderboard/v2?t=${Date.now()}`);
        const leaderboardData = await leaderboardResponse.json();
        
        if (leaderboardData.leaderboards) {
          setLeaderboards(leaderboardData.leaderboards);
          setError(null);
        } else {
          setError(leaderboardData.error || "Failed to load leaderboard");
        }
        
        // Fetch live bets
        const betsResponse = await fetch(`/api/live-bets?t=${Date.now()}`);
        const betsData = await betsResponse.json();
        
        if (betsData.ok && betsData.data) {
          setLiveBets(betsData.data);
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

  // Special component for Overall
  function OverallSection({ cat, data }: { cat: { id: Category; name: string; icon: string; iconUrl?: string; desc: string }; data: LeaderboardEntry[] }) {
    return (
      <section 
        className="panel"
        style={{ 
          minWidth: 0,
          height: "430px",
          display: "flex",
          flexDirection: "column",
          border: "2px solid var(--yellow)",
          background: "linear-gradient(135deg, rgba(255, 225, 0, 0.05) 0%, rgba(255, 225, 0, 0.02) 100%)",
          padding: "8px"
        }}
      >
        <div className="panel-head" style={{ paddingBottom: "6px", flexShrink: 0 }}>
          <h2 style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "6px",
            fontSize: "13px",
            fontWeight: "800",
            color: "var(--yellow)"
          }}>
            {cat.iconUrl ? (
              <img src={cat.iconUrl} alt="" width={15} height={15} style={{ objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "15px" }}>{cat.icon}</span>
            )}
            {cat.name}
          </h2>
          <span className="micro" style={{ fontSize: "10px", opacity: 0.7 }}>{cat.desc}</span>
        </div>
        
        {error ? (
          <div style={{ padding: "8px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
            {error}
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: "8px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
            No data yet
          </div>
        ) : (
          <div style={{ 
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flexGrow: 1
          }}>
            {data.slice(0, 15).map((entry) => (
              <div 
                key={entry.userId + entry.rank}
                style={{ 
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.15s"
                }}
              >
                <span style={{ 
                  fontWeight: "700", 
                  color: "var(--text)",
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

  // Normal component for other categories
  function CategorySection({ 
    cat, 
    data
  }: { 
    cat: { id: Category; name: string; icon: string; iconUrl?: string; desc: string };
    data: LeaderboardEntry[];
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
            {cat.iconUrl ? (
              <img src={cat.iconUrl} alt="" width={14} height={14} style={{ objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "14px" }}>{cat.icon}</span>
            )}
            {cat.name}
          </h2>
          <span className="micro" style={{ fontSize: "10px", opacity: 0.6 }}>{cat.desc}</span>
        </div>
        
        {error ? (
          <div style={{ padding: "8px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
            {error}
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: "8px", textAlign: "center", color: "var(--muted)", fontSize: "11px" }}>
            No data
          </div>
        ) : (
          <div style={{ 
            display: "flex",
            flexDirection: "column",
            gap: "2px"
          }}>
            {data.slice(0, 15).map((entry) => (
              <div key={entry.userId + entry.rank} style={{ 
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px",
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

        {/* Live Bets Section */}
        <div className="panel" style={{ 
          marginBottom: "16px",
          border: "1px solid rgba(255, 225, 0, 0.3)",
          background: "rgba(255, 225, 0, 0.05)"
        }}>
          <div style={{ 
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)"
          }}>
            <span style={{ fontSize: "14px" }}>💥</span>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--yellow)" }}>LIVE BIG BETS</span>
            <span style={{ fontSize: "10px", color: "var(--muted)" }}>กำลังรอผล (≥1,000 <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="10" height="10" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "2px" }} />)</span>
          </div>
          
          {liveBets.length === 0 ? (
            <div style={{ 
              padding: "12px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "11px"
            }}>
              รอผู้เล่นวางเดิมพันใหญ่...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {liveBets.map((bet, index) => {
                const date = new Date(bet.createdAt);
                const timeStr = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div 
                    key={bet.userId + bet.predictionId + bet.createdAt}
                    style={{ 
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      fontSize: "12px"
                    }}
                  >
                    <span style={{ 
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "var(--yellow-soft)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "10px",
                      fontWeight: "700",
                      color: "var(--yellow)"
                    }}>
                      {index + 1}
                    </span>
                    
                    <span style={{ 
                      flex: 1,
                      color: "var(--text)",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {bet.displayName}
                    </span>
                    
                    <span style={{ 
                      color: "var(--muted)",
                      fontSize: "11px"
                    }}>
                      {bet.predictionTitle}
                    </span>
                    
                    <span style={{ 
                      color: "var(--yellow)",
                      fontWeight: "700",
                      fontFamily: "JetBrains Mono, monospace",
                      minWidth: "60px",
                      textAlign: "right"
                    }}>
                      {bet.amount.toLocaleString()} 🟠
                    </span>
                    
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                      {timeStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overall - single row */}
        <div style={{ marginBottom: "16px" }}>
          <OverallSection cat={categories.find(c => c.id === "overall")!} data={leaderboards?.overall || []} />
        </div>

        {/* Row 2: Most Orange Ammo + Most Predictions */}
        <div style={{ 
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          marginBottom: "16px"
        }}>
          <CategorySection cat={categories.find(c => c.id === "mostOrangeAmmo")!} data={leaderboards?.mostOrangeAmmo || []} />
          <CategorySection cat={categories.find(c => c.id === "mostPredictions")!} data={leaderboards?.mostPredictions || []} />
        </div>

        {/* Row 3: Highest Single Win + Most Active */}
        <div style={{ 
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px"
        }}>
          <CategorySection cat={categories.find(c => c.id === "highestSingleWin")!} data={leaderboards?.highestSingleWin || []} />
          <CategorySection cat={categories.find(c => c.id === "mostActive")!} data={leaderboards?.mostActive || []} />
        </div>
      </div>
    </div>
  );
}
