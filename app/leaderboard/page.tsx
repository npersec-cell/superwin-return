"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function maskName(name: string): string {
  if (!name) return "";
  if (name === "You") return name;
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

function compact(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function getRankInfo(coinBalance: number) {
  if (coinBalance >= 100000) return { name: "Crown", icon: "/ranks/crown.png" };
  if (coinBalance >= 50000) return { name: "Conqueror", icon: "/ranks/conqueror.png" };
  if (coinBalance >= 20000) return { name: "Ace", icon: "/ranks/ace.png" };
  if (coinBalance >= 10000) return { name: "Diamond", icon: "/ranks/diamond.png" };
  if (coinBalance >= 5000) return { name: "Platinum", icon: "/ranks/platinum.png" };
  if (coinBalance >= 1000) return { name: "Gold", icon: "/ranks/gold.png" };
  if (coinBalance >= 100) return { name: "Silver", icon: "/ranks/silver.png" };
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

// Get rank based on position (1-based) and total users
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

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
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
  displayName: string | null;
  rawEmailPrefix?: string;
  predictionId: string;
  predictionTitle: string;
  tournamentName?: string;
  optionLabel?: string;
  amount: number;
  createdAt: string;
}

type Category = "overall" | "mostOrangeAmmo" | "mostPredictions" | "highestSingleWin" | "mostActive";

const categories: { id: Category; name: string; icon: string; iconUrl?: string; desc: string }[] = [
  { id: "overall", name: "Overall", icon: "📊", desc: "Average of all stats" },
  { id: "mostOrangeAmmo", name: "Most Orange Ammo", icon: "🟠", iconUrl: "https://superwinhub.app/ammo-icon.webp", desc: "Total ammo used for predictions" },
  { id: "mostPredictions", name: "Most Predictions", icon: "🎯", desc: "Most predictions made" },
  { id: "highestSingleWin", name: "Highest Single Win", icon: "🏆", desc: "Biggest single profit" },
  { id: "mostActive", name: "Most Active", icon: "⚡", desc: "Avg reloads per day" }
];

export default function LeaderboardPage() {
  const [leaderboards, setLeaderboards] = useState<LeaderboardData | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
  const [selectedLiveBet, setSelectedLiveBet] = useState<LiveBet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null);
  const profileRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create a map of userId -> value for each leaderboard category
  const leaderboardValueMap = {
    mostOrangeAmmo: new Map<string, number>(),
    mostPredictions: new Map<string, number>(),
    highestSingleWin: new Map<string, number>(),
    mostActive: new Map<string, number>()
  };

  // Initialize the maps when leaderboard data is loaded
  useEffect(() => {
    if (leaderboards) {
      leaderboards.mostOrangeAmmo?.forEach(entry => {
        leaderboardValueMap.mostOrangeAmmo.set(entry.userId, entry.value);
      });
      leaderboards.mostPredictions?.forEach(entry => {
        leaderboardValueMap.mostPredictions.set(entry.userId, entry.value);
      });
      leaderboards.highestSingleWin?.forEach(entry => {
        leaderboardValueMap.highestSingleWin.set(entry.userId, entry.value);
      });
      leaderboards.mostActive?.forEach(entry => {
        leaderboardValueMap.mostActive.set(entry.userId, entry.value);
      });
    }
  }, [leaderboards]);

  async function handleOpenProfile(userId: string, displayName: string) {
    // Clear any existing refresh interval
    if (profileRefreshRef.current) { clearInterval(profileRefreshRef.current); profileRefreshRef.current = null; }

    // Get values from leaderboard data (more reliable than Profile API)
    const coinBalanceFromLeaderboard = leaderboardValueMap.mostOrangeAmmo.get(userId) || 0;
    const predictionCountFromLeaderboard = leaderboardValueMap.mostPredictions.get(userId) || 0;
    const highestWinFromLeaderboard = leaderboardValueMap.highestSingleWin.get(userId) || 0;
    const avgReloadFromLeaderboard = leaderboardValueMap.mostActive.get(userId) || 0;

    // Show modal immediately with loading state
    setSelectedProfile({
      name: displayName,
      // Overall leaderboard
      overallScore: 0,
      overallRank: 0,
      // Most Orange Ammo - use value from leaderboard
      coinBalance: coinBalanceFromLeaderboard,
      mostOrangeAmmoRank: 0,
      // Most Predictions
      predictionCount: predictionCountFromLeaderboard,
      mostPredictionsRank: 0,
      // Highest Single Win
      highestSingleWin: highestWinFromLeaderboard,
      highestSingleWinRank: 0,
      // Most Active
      avgReloadPerDay: avgReloadFromLeaderboard,
      mostActiveRank: 0,
      // Other stats
      rank: 0,
      rankPercentile: 0,
      rankName: "Bronze",
      rankIcon: "/ranks/bronze.png",
      totalUsers: 0,
      winRate: 0,
      wonCount: 0,
      lostCount: 0,
      totalSettled: 0,
      badge: "",
      badgeDesc: "",
      loading: true,
      history: [],
    });

    async function fetchProfile() {
      try {
        const response = await fetch(`/api/leaderboard/profile?userId=${userId}&_t=${Date.now()}`);
        const payload = await response.json();
        if (response.ok && payload.ok && payload.data) {
          // Use coinBalance from leaderboard if Profile API returns NaN or invalid value
          const profileData = payload.data;
          const finalProfile = {
            ...profileData,
            loading: false,
            // Force use leaderboard values for numeric stats to avoid NaN issues
            coinBalance: Number.isNaN(profileData.coinBalance) || profileData.coinBalance === null ? coinBalanceFromLeaderboard : profileData.coinBalance,
            predictionCount: Number.isNaN(profileData.predictionCount) || profileData.predictionCount === null ? predictionCountFromLeaderboard : profileData.predictionCount,
            highestSingleWin: Number.isNaN(profileData.highestSingleWin) || profileData.highestSingleWin === null ? highestWinFromLeaderboard : profileData.highestSingleWin,
            avgReloadPerDay: Number.isNaN(profileData.avgReloadPerDay) || profileData.avgReloadPerDay === null ? avgReloadFromLeaderboard : profileData.avgReloadPerDay,
          };
          setSelectedProfile(finalProfile);
        } else {
          setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
        }
      } catch {
        setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
      }
    }

    await fetchProfile();

    // Auto-refresh every 15 seconds while modal is open
    profileRefreshRef.current = setInterval(fetchProfile, 15000);
  }

  function closeProfile() {
    if (profileRefreshRef.current) { clearInterval(profileRefreshRef.current); profileRefreshRef.current = null; }
    setSelectedProfile(null);
  }

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch leaderboard
        const leaderboardResponse = await fetch(`/api/leaderboard/v2?t=${Date.now()}`);
        const leaderboardData = await leaderboardResponse.json();
        
        if (leaderboardData.leaderboards) {
          setLeaderboards(leaderboardData.leaderboards);
          setTotalUsers(leaderboardData.totalUsers || 0);
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
          height: "450px",
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
                onClick={() => handleOpenProfile(entry.userId, entry.displayName || "User")}
                style={{ 
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.15s",
                  cursor: "pointer"
                }}
              >
                {/* Rank badge */}
                <span style={{ 
                  fontWeight: "700", 
                  color: "var(--text)",
                  width: "18px",
                  textAlign: "center"
                }}>
                  {getRankBadge(entry.rank)}
                </span>
                
                {/* Avatar + Name + Rank */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexGrow: 1, minWidth: 0 }}>
                  {/* Avatar */}
                  {entry.avatarUrl ? (
                    <img 
                      src={entry.avatarUrl} 
                      alt={entry.displayName} 
                      style={{ width: "16px", height: "16px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} 
                    />
                  ) : (
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#20252b", border: "1px solid #30353b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", flexShrink: 0 }}>
                      👤
                    </div>
                  )}
                  
                  {/* Name */}
                  <strong style={{ 
                    color: "var(--text-strong)",
                    fontWeight: "600",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {entry.displayName || maskName(entry.userId.slice(0, 8))}
                  </strong>
                  
                  {/* Rank icon */}
                  <span style={{ display: "flex", alignItems: "center", gap: "2px", color: "var(--muted)", fontSize: "9px", fontWeight: 500, flexShrink: 0 }}>
                    <img src={getRankFromPosition(entry.rank, totalUsers).icon} alt="" width={14} height={14} style={{ objectFit: "contain" }} />
                    {getRankFromPosition(entry.rank, totalUsers).name}
                  </span>
                </div>
                
                {/* Value */}
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
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--yellow)" }}>LIVE PREDICT</span>
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
                const isBigBet = bet.amount >= 1000;
                return (
                  <div 
                    key={bet.userId + bet.predictionId + bet.createdAt}
                    onClick={() => setSelectedLiveBet(bet)}
                    style={{ 
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      background: isBigBet ? "rgba(255, 225, 0, 0.15)" : "transparent",
                      border: isBigBet ? "1px solid rgba(255, 225, 0, 0.3)" : "none"
                    }}
                  >
                    <span style={{ 
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: isBigBet ? "rgba(255, 225, 0, 0.3)" : "var(--yellow-soft)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "9px",
                      fontWeight: "700",
                      color: isBigBet ? "var(--yellow)" : "var(--yellow)"
                    }}>
                      {isBigBet ? "🔥" : (index + 1)}
                    </span>
                    
                    <span style={{ 
                      flex: 1,
                      color: "var(--text)",
                      fontWeight: "600",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {bet.displayName || maskName(bet.rawEmailPrefix || bet.userId?.slice(0, 8) || 'User')}
                    </span>
                    
                    <span style={{ 
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                      fontWeight: "700",
                      color: isBigBet ? "var(--yellow)" : "var(--text)",
                      fontFamily: isBigBet ? "JetBrains Mono, monospace" : "inherit"
                    }}>
                      {isBigBet ? <span>🔥 BIG</span> : null}
                      <span style={{ 
                        color: "var(--yellow)",
                        fontWeight: "700",
                        fontFamily: "JetBrains Mono, monospace",
                        minWidth: "55px",
                        textAlign: "right",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px"
                      }}>
                        {bet.amount.toLocaleString()}
                        <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="14" height="14" style={{ display: "inline-block", verticalAlign: "middle" }} />
                      </span>
                    </span>
                    
                    <span style={{ fontSize: "9px", color: "var(--muted)" }}>
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

      {selectedLiveBet && <LiveBetModal bet={selectedLiveBet} onClose={() => setSelectedLiveBet(null)} />}
      {selectedProfile && <ProfileModal profile={selectedProfile} onClose={closeProfile} />}
    </div>
  );
}

function LiveBetModal({ bet, onClose }: { bet: LiveBet; onClose: () => void }) {
  const date = new Date(bet.createdAt);
  const formattedDate = date.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  
  return (
    <section className="modal" aria-label="Live Bet Details" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "400px" }}>
        <div className="modal-head">
          <h3>💥 Live Predict Details</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>User</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--yellow)" }}>
              {bet.displayName || maskName(bet.rawEmailPrefix || bet.userId?.slice(0, 8) || 'User')}
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🏆 {bet.tournamentName || 'PUBG Mobile Esports'}
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Prediction</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🎯 {bet.predictionTitle}
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Option</div>
            <div style={{ fontSize: "13px", color: "var(--text)" }}>
              🎯 {bet.optionLabel || 'Option'}
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Amount</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--yellow)" }}>
              {bet.amount.toLocaleString()}&nbsp;
              <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="16" height="16" style={{ display: "inline-block", verticalAlign: "middle" }} />
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Status</div>
            <div style={{ fontSize: "13px", color: "var(--text-weak)" }}>
              ⏳ Waiting for result...
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Placed at</div>
            <div style={{ fontSize: "12px", color: "var(--text-weak)" }}>
              {formattedDate}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileModal({ profile, onClose }: { profile: UserProfileStats | null; onClose: () => void }) {
  return (
    <section className="modal" aria-label="User Profile" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "520px" }}>
        <div className="modal-head">
          <h3>🎮 {profile?.displayName || maskName(profile?.name || "")}'s Profile</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "12px", minHeight: "200px" }}>
          {profile?.loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "180px" }}>
              <div className="spinner" />
            </div>
          ) : profile ? (
            <>
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

              {/* Last 5 Settled Predictions */}
              <div style={{ display: "grid", gap: "6px" }}>
                <h4 className="meta" style={{ color: "var(--yellow)", fontSize: "11px", margin: "4px 0" }}>⚡ Last 5 Settled Predictions</h4>
                {!profile.history || profile.history.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)", fontSize: "11px" }}>
                    No settled predictions found.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
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
                                {isPositive ? `+${net}` : `${net}`}
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
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
