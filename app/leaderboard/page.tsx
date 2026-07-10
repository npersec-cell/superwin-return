"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function maskName(name: string): string {
  if (!name) return "";
  if (name === "You") return name;
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

interface UserProfileStats {
  userId: string;
  displayName: string;
  avatarUrl: string;
  profitScore: number;
  predictionsCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  totalWagered: number;
  totalWon: number;
}

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
  tournamentName?: string;
  optionLabel?: string;
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
  const [selectedLiveBet, setSelectedLiveBet] = useState<LiveBet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function handleOpenProfile(userId: string, displayName: string) {
    // Show modal immediately with loading state
    setSelectedProfile({
      userId,
      displayName,
      avatarUrl: '',
      profitScore: 0,
      predictionsCount: 0,
      winsCount: 0,
      lossesCount: 0,
      winRate: 0,
      totalWagered: 0,
      totalWon: 0,
      loading: true
    });
    setProfileLoading(true);
    
    try {
      const response = await fetch(`/api/leaderboard/profile?userId=${userId}&_t=${Date.now()}`);
      const data = await response.json();
      if (data.ok && data.data) {
        setSelectedProfile({ ...data.data, loading: false });
      } else {
        // Show basic info if API fails
        setSelectedProfile({
          userId,
          displayName,
          avatarUrl: '',
          profitScore: 0,
          predictionsCount: 0,
          winsCount: 0,
          lossesCount: 0,
          winRate: 0,
          totalWagered: 0,
          totalWon: 0,
          loading: false
        });
      }
    } catch {
      setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfile() {
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
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--yellow)" }}>LIVE BIG PREDICT</span>
            <span style={{ fontSize: "10px", color: "var(--muted)" }}>
              ≥1,000&nbsp;
              <img src="https://superwinhub.app/ammo-icon.webp" alt="" width="12" height="12" style={{ display: "inline-block", verticalAlign: "middle" }} />
            </span>
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
                    onClick={() => setSelectedLiveBet(bet)}
                    style={{ 
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                      transition: "background 0.15s"
                    }}
                  >
                    <span style={{ 
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: "var(--yellow-soft)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "9px",
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
                      {maskName(bet.displayName || bet.userId?.slice(0, 8) || 'User')}
                    </span>
                    
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
      {selectedProfile && <ProfileModal profile={selectedProfile} onClose={closeProfile} profileLoading={profileLoading} />}
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
              {maskName(bet.displayName)}
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

function ProfileModal({ profile, onClose, profileLoading }: { profile: UserProfileStats | null; onClose: () => void; profileLoading: boolean }) {
  return (
    <section className="modal" aria-label="User Profile" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "360px" }}>
        <div className="modal-head">
          <h3>👤 User Profile</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        {profileLoading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>Loading...</div>
        ) : profile ? (
          <div className="modal-body" style={{ gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.displayName} style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  👤
                </div>
              )}
              <div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text)" }}>
                  {profile.displayName}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                  ID: {profile.userId.slice(0, 8)}...
                </div>
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>💰 Profit Score</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--yellow)" }}>
                  {profile.profitScore.toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>🎯 Predictions</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                  {profile.predictionsCount}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>✅ Wins</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                  {profile.winsCount}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>❌ Losses</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                  {profile.lossesCount}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>📈 Win Rate</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                  {profile.predictionsCount > 0 ? (profile.winRate * 100).toFixed(1) + "%" : "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "10px", color: "var(--muted)" }}>💵 Total Wagered</div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)" }}>
                  {profile.totalWagered.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
