"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { compact, getRankFromPosition, maskName, randomClaimAmount, formatCountdown } from "@/lib/utils";
import LiveBetModal, { type LiveBet } from "@/components/LiveBetModal";
import ChatBox from "@/components/ChatBox";

type PredictionOption = {
  id: string;
  name: string;
  returns: number;
};

type Question = {
  id: string;
  tournament: string;
  title: string;
  closeOffsetMinutes?: number;
  closesAt?: string;
  totalPool: number;
  playerCount: number;
  options: PredictionOption[];
  entries?: { optionId: string; userId: string; amount: number; status: string }[];
};

type HistoryItem = {
  date: string;
  time: string;
  action: "Reload" | "Payout" | "Refund";
  detail: string;
  amount: number;
};

type ApiHistoryResponse = {
  ok: boolean;
  data?: {
    rows: Array<HistoryItem & { id: string; balanceAfter: number }>;
  };
  error?: string;
};

type RunningPrediction = {
  id: string;
  questionId: string;
  question: string;
  tournamentName?: string;
  answer: string;
  coins: number;
  returns: number;
  createdAt?: string;
  status: "Running";
};

type ApiPredictionsResponse = {
  ok: boolean;
  data?: Array<{
    id: string;
    tournamentName: string;
    question: string;
    closesAt: string;
    totalPool: number;
    playerCount: number;
    options: Array<{ id: string; label: string; estimatedReturnPercent: number }>;
    entries?: Array<{ optionId: string; userId: string; amount: number; status: string }>;
  }>;
  error?: string;
};

type ApiRunningResponse = {
  ok: boolean;
  data?: Array<{
    id: string;
    predictionId: string;
    question: string;
    tournamentName: string;
    optionLabel: string;
    amount: number;
    estimatedReturnPercent: number | null;
    status: "running" | "won" | "lost" | "refunded";
    createdAt: string;
  }>;
  error?: string;
};

type ApiPredictResponse = {
  ok: boolean;
  data?: {
    user: { coinBalance: number; lifetimeProfit: number };
    entry: {
      id: string;
      predictionId: string;
      optionId: string;
      amount: number;
      estimatedReturnPercent: number;
      status: "running";
      question: string;
      tournamentName: string;
      optionLabel: string;
    };
  };
  error?: string;
};

type SiteSettings = {
  info: {
    howToPlay: string;
    questionTime: string;
  };
  tournaments: (string | { name: string; logoUrl: string })[];
  savedQuestions: string[];
  predictionOrder?: string[];
  announcement?: string;
};

type UserProfileStats = {
  name: string;
  displayName?: string | null;
  // Overall leaderboard
  overallScore: number;
  overallRank: number;
  // Most Orange Ammo (coinBalance)
  coinBalance: number;  // Actual coin balance value
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
  allTimeProfit?: number;  // Optional - not used in leaderboard stats
  winRate: number;
  winCount: number;
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
};
type ApiSettingsResponse = {
  ok: boolean;
  data?: SiteSettings;
  error?: string;
};

type ApiMeResponse = {
  ok: boolean;
  data?: {
    id: string;
    email: string;
    displayName: string | null;
    role: "user" | "admin";
    coinBalance: number;
    lifetimeProfit: number;
    nextClaimAt: string | null;
  };
  error?: string;
};

type ApiClaimResponse = {
  ok: boolean;
  data?: {
    amount: number;
    user: {
      coinBalance: number;
      lifetimeProfit: number;
      lastClaimAt: string | null;
      nextClaimAt: string | null;
    };
  };
  error?: string;
};

type ApiSpecialClaimResponse = {
  ok: boolean;
  data?: {
    amount: number;
    user: {
      coinBalance: number;
      lifetimeProfit: number;
      nextSpecialClaimAt: string | null;
    };
  };
  error?: string;
  th?: string;
};

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: new (
          options: { pageLanguage: string; includedLanguages: string; layout: unknown },
          elementId: string
        ) => void;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

const demoQuestions: Question[] = [
  {
    id: "demo-1",
    tournament: "Super League",
    title: "Which team will win the championship?",
    closeOffsetMinutes: 4300,
    totalPool: 0,
    playerCount: 0,
    options: [
      { id: "demo-1-alpha", name: "Alpha Esports", returns: 185 },
      { id: "demo-1-bravo", name: "Bravo Gaming", returns: 230 },
      { id: "demo-1-charlie", name: "Charlie Squad", returns: 310 },
      { id: "demo-1-delta", name: "Delta Force", returns: 420 },
      { id: "demo-1-echo", name: "Echo Team", returns: 560 },
      { id: "demo-1-falcon", name: "Falcon", returns: 690 },
      { id: "demo-1-ghost", name: "Ghost", returns: 760 },
      { id: "demo-1-hydra", name: "Hydra", returns: 840 },
      { id: "demo-1-inferno", name: "Inferno", returns: 920 },
      { id: "demo-1-joker", name: "Joker", returns: 980 }
    ]
  },
  {
    id: "demo-2",
    tournament: "Global Open",
    title: "Which region will finish first?",
    closeOffsetMinutes: 1480,
    totalPool: 0,
    playerCount: 0,
    options: [
      { id: "demo-2-sea", name: "SEA", returns: 210 },
      { id: "demo-2-sa", name: "South Asia", returns: 280 },
      { id: "demo-2-eu", name: "Europe", returns: 340 },
      { id: "demo-2-americas", name: "Americas", returns: 410 },
      { id: "demo-2-me", name: "Middle East", returns: 530 },
      { id: "demo-2-wildcard", name: "Wildcard", returns: 720 }
    ]
  },
  {
    id: "demo-3",
    tournament: "Scrim Night",
    title: "Most kills team in final map?",
    closeOffsetMinutes: 360,
    totalPool: 0,
    playerCount: 0,
    options: [
      { id: "demo-3-rex", name: "Rex", returns: 260 },
      { id: "demo-3-nova", name: "Nova", returns: 275 },
      { id: "demo-3-viper", name: "Viper", returns: 330 },
      { id: "demo-3-ghost", name: "Ghost", returns: 380 },
      { id: "demo-3-blaze", name: "Blaze", returns: 430 },
      { id: "demo-3-frost", name: "Frost", returns: 510 },
      { id: "demo-3-omega", name: "Omega", returns: 620 },
      { id: "demo-3-ruin", name: "Ruin", returns: 700 }
    ]
  },
  {
    id: "demo-4",
    tournament: "Weekly Final",
    title: "Which team gets the first chicken dinner?",
    closeOffsetMinutes: 90,
    totalPool: 0,
    playerCount: 0,
    options: [
      { id: "demo-4-alpha", name: "Alpha", returns: 220 },
      { id: "demo-4-bravo", name: "Bravo", returns: 260 },
      { id: "demo-4-charlie", name: "Charlie", returns: 335 },
      { id: "demo-4-delta", name: "Delta", returns: 430 },
      { id: "demo-4-echo", name: "Echo", returns: 520 },
      { id: "demo-4-falcon", name: "Falcon", returns: 640 }
    ]
  }
];

const defaultSettings: SiteSettings = {
  info: {
    howToPlay: "ล็อกอิน ➔ กดรับเหรียญฟรีทุก 1 ชั่วโมง ➔ เลือกวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนเหรียญแล้วกดยืนยันคำทายผล",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  announcement: ""
};

type LeaderboardRow = {
  id?: string;
  name: string;
  displayName?: string | null;
  profit: number;
  overallScore: number;
  rank: number;
  isReal?: boolean;
  avatarUrl?: string | null;
};

const defaultLeaderboard: LeaderboardRow[] = [];

function money(amount: number) {
  return `${amount >= 0 ? "+" : ""}${amount}`;
}

/** Safely read from localStorage with fallback */
function safeJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function createQuestionDeadlines(sourceQuestions = demoQuestions) {
  return Object.fromEntries(sourceQuestions.map((question) => [question.id, Date.now() + (question.closeOffsetMinutes || 60) * 60000]));
}

// ── Memoized YouTube Embed Component (prevents re-renders from parent state changes) ──
const YouTubeEmbedSection = memo(function YouTubeEmbedSection({ embedCode }: { embedCode: string }) {
  // Inject autoplay=1&mute=1 into YouTube iframe URLs for autoplay support
  const autoPlayCode = useMemo(() => {
    if (!embedCode) return embedCode;
    // Match any YouTube embed URL variant (youtube.com, youtube-nocookie.com, youtu.be)
    // and inject autoplay params. Also ensure iframe has allow="autoplay"
    let result = embedCode.replace(
      /(https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/[^\s"'?]+)(\?[^\s"']*)?/g,
      (match, baseUrl, existingParams) => {
        const separator = existingParams ? '&' : '?';
        const params = existingParams || '';
        // Add autoplay params if not already present
        let newParams = params;
        if (!params.includes('autoplay=')) newParams += `${separator}autoplay=1`;
        if (!params.includes('mute=')) newParams += `${newParams.includes('?') ? '&' : separator}mute=1`;
        if (!params.includes('controls=')) newParams += `${newParams.includes('?') ? '&' : separator}controls=1`;
        if (!params.includes('rel=')) newParams += `${newParams.includes('?') ? '&' : separator}rel=0`;
        return `${baseUrl}${newParams}`;
      }
    );
    // Also handle youtu.be short URLs
    result = result.replace(
      /(https?:\/\/(?:www\.)?youtu\.be\/[^\s"'?]+)(\?[^\s"']*)?/g,
      (match, baseUrl, existingParams) => {
        const separator = existingParams ? '&' : '?';
        const params = existingParams || '';
        let newParams = params;
        if (!params.includes('autoplay=')) newParams += `${separator}autoplay=1`;
        if (!params.includes('mute=')) newParams += `${newParams.includes('?') ? '&' : separator}mute=1`;
        return `${baseUrl}${newParams}`;
      }
    );
    // Ensure iframe has allow attribute for autoplay
    if (!result.includes('allow="autoplay"') && !result.includes("allow='autoplay'")) {
      result = result.replace(/<iframe([^>]*)>/gi, '<iframe$1 allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>');
    }
    // Force iframe to fill container: remove inline width/height and add style for full fill
    result = result.replace(/<iframe([^>]*)>/gi, (match, attrs) => {
      // Remove inline width/height attributes that break responsive layout
      let cleaned = attrs.replace(/\s*width="[^"]*"/gi, '').replace(/\s*height="[^"]*"/gi, '');
      // Remove style that sets width/height
      cleaned = cleaned.replace(/\s*style="[^"]*(?:width|height)[^"]*"/gi, (s: string) => {
        // Keep other style props but strip width/height
        const inner = s.slice(7, -1);
        const filtered = inner.split(/;\s*/).filter((p: string) => !/^(?:width|height)\s*:/.test(p.trim())).join('; ');
        return filtered ? ` style="${filtered}"` : '';
      });
      // Add style to make iframe fill the absolutely-positioned parent
      return `<iframe${cleaned} style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;">`;
    });
    return result;
  }, [embedCode]);

  return (
    <div style={{
      margin: "0 0 16px 0",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid var(--hairline)",
      background: "var(--card)",
      width: "100%",
      maxWidth: "720px",
      marginLeft: "auto",
      marginRight: "auto",
    }}>
      <div style={{
        position: "relative",
        width: "100%",
        paddingBottom: "56.25%", /* 16:9 aspect ratio */
        height: 0,
      }}>
        <div dangerouslySetInnerHTML={{ __html: autoPlayCode || embedCode }} style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }} />
      </div>
    </div>
  );
});

export default function SuperWinPrototype() {
  const { isSignedIn, user: clerkUser } = useUser();
  const [devBypass, setDevBypass] = useState(false);
  const [devUser, setDevUser] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [coins, setCoins] = useState(500);
  const [profit, setProfit] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [overallRank, setOverallRank] = useState<number | null>(null);
  const [rankName, setRankName] = useState<string | null>(null);
  const [rankIcon, setRankIcon] = useState<string | null>(null);
  const [nextClaimAt, setNextClaimAt] = useState(0);
  const [nextSpecialClaimAt, setNextSpecialClaimAt] = useState(0);
  const [specialClaimLoading, setSpecialClaimLoading] = useState(false);
  const [specialClaimLabel, setSpecialClaimLabel] = useState("⭐");
  const [youtubeEmbed, setYoutubeEmbed] = useState<string>('');
  const [youtubeScheduleStart, setYoutubeScheduleStart] = useState<string>('');
  const [youtubeScheduleEnd, setYoutubeScheduleEnd] = useState<string>('');
    const [frontendFeaturesEnabled, setFrontendFeaturesEnabled] = useState(true);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [coinInputs, setCoinInputs] = useState<Record<string, number>>({});
  const [running, setRunning] = useState<RunningPrediction[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [runningPage, setRunningPage] = useState(1);
  const runningPageSize = 10;
  const [questionDeadlines, setQuestionDeadlines] = useState<Record<string, number>>({});
  const [claimLabel, setClaimLabel] = useState("Ready");
  const [openModal, setOpenModal] = useState<"history" | "running" | "info" | "claimResult" | null>(null);
  const [claimResult, setClaimResult] = useState<number>(0);
  const [claimFlash, setClaimFlash] = useState(false);
  const claimFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<Record<string, string>>({});
  const [predictingIds, setPredictingIds] = useState<Set<string>>(new Set());
  const [confirmHighBet, setConfirmHighBet] = useState<{ questionId: string; amount: number } | null>(null);
  const [accountStatus, setAccountStatus] = useState<"demo" | "loading" | "synced" | "error">("demo");
  const [accountRole, setAccountRole] = useState<"user" | "admin">("user");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>(defaultLeaderboard);
  const [leaderboardTotalUsers, setLeaderboardTotalUsers] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Store leaderboard values for each category (for fallback in ProfileModal)
  const [leaderboardValueMap, setLeaderboardValueMap] = useState<{
    mostOrangeAmmo: Map<string, number>;
    mostPredictions: Map<string, number>;
    highestSingleWin: Map<string, number>;
    mostActive: Map<string, number>;
  }>({ mostOrangeAmmo: new Map(), mostPredictions: new Map(), highestSingleWin: new Map(), mostActive: new Map() });

  // Auto-refresh profile data while modal is open
  const profileRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const marqueeContainerRef = useRef<HTMLDivElement | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [contest, setContest] = useState<any>(null);
  const [contestLoading, setContestLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  
  // LIVE PREDICT
  const [liveBets, setLiveBets] = useState<LiveBet[]>([]);
  const [liveBetsLoading, setLiveBetsLoading] = useState(true);
  const [selectedLiveBet, setSelectedLiveBet] = useState<LiveBet | null>(null);

  // DEV BYPASS: Check for dev_bypass cookie OR URL param on mount
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cookies = document.cookie.split("; ").reduce((acc: Record<string, string>, curr) => {
      const [key, val] = curr.split("=");
      acc[key] = val;
      return acc;
    }, {});

    const hasCookieBypass = cookies["dev_bypass"] === "1";
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlBypass = urlParams.has("dev_bypass");

    if (!hasCookieBypass && !hasUrlBypass) return;

    // Cookie bypass: already validated by /api/dev-bypass route
    if (hasCookieBypass) {
      setDevBypass(true);
    }

    // Fetch user info (include URL params for server validation)
    const meUrl = hasUrlBypass ? `/api/me${window.location.search}` : "/api/me";
    fetch(meUrl, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.user) {
          if (hasUrlBypass) {
            setDevBypass(true);
          }
          setDevUser(data.user);
          setCoins(data.user.coinBalance ?? 500);
          setProfit(data.user.lifetimeProfit ?? 0);
          setCurrentUserId(data.user.id);
          setAccountStatus("synced");
          setAccountRole(data.user.role || "user");
        }
      })
      .catch(() => {});
  }, []);

  const loadCaptcha = async () => {
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      if (data.ok) {
        setCaptchaQuestion(data.question);
        setCaptchaToken(data.token);
      }
    } catch {
      setCaptchaQuestion("Refresh page");
      setCaptchaToken("");
    }
    setCaptchaAnswer("");
    setReportError(null);
  };

  useEffect(() => {
    if (showReportForm) {
      loadCaptcha();
      setReportSuccess(false);
      setReportMessage("");
    }
  }, [showReportForm]);

  const handleSendReport = async () => {
    try {
      setReportSubmitting(true);
      setReportError(null);
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: reportMessage,
          token: captchaToken,
          answer: captchaAnswer
        })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit report");
      }
      setReportSuccess(true);
      setReportMessage("");
      setCaptchaAnswer("");
      setTimeout(() => setShowReportForm(false), 3000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Error submitting report");
      setCaptchaAnswer("");
    } finally {
      setReportSubmitting(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    setCoins(Number(localStorage.getItem("sr_coins")) || 500);
    setProfit(Number(localStorage.getItem("sr_profit")) || 0);
    setNextClaimAt(Number(localStorage.getItem("sr_next_claim")) || 0);
    setNextSpecialClaimAt(Number(localStorage.getItem("sr_next_special_claim")) || 0);

    // Load site settings (YouTube embed, frontend features toggle, etc.)
    fetch('/api/settings')
      .then(res => res.json())
      .then(json => {
        if (json.ok && json.data) {
          // Try primary location first: youtube_embed.embed_code
          let embedCode = '';
          if (json.data.youtube_embed?.embed_code) {
            embedCode = json.data.youtube_embed.embed_code;
          }
          // Fallback: frontend_features may contain youtube_embed string directly
          // (due to saveFrontendSettings saving both enabled + youtube_embed in same object)
          if (!embedCode && json.data.frontend_features?.youtube_embed) {
            embedCode = json.data.frontend_features.youtube_embed;
          }
          setYoutubeEmbed(embedCode);

          // Load YouTube schedule times
          if (json.data.youtube_embed?.schedule_start) {
            setYoutubeScheduleStart(json.data.youtube_embed.schedule_start);
          }
          if (json.data.youtube_embed?.schedule_end) {
            setYoutubeScheduleEnd(json.data.youtube_embed.schedule_end);
          }

          if (json.data.frontend_features !== undefined) {
            setFrontendFeaturesEnabled(json.data.frontend_features.enabled !== false);
          }
        }
      })
      .catch(() => {});
    setRunning(safeJson("sr_running", []));
    loadOpenPredictions().catch(() => undefined);
    loadSettings().catch(() => undefined);
    loadLeaderboard().catch(() => undefined);

    const interval = setInterval(() => {
      loadOpenPredictions().catch(() => undefined);
    }, 10000);

    const lbInterval = setInterval(() => {
      loadLeaderboard().catch(() => undefined);
    }, 30000); // Refresh Top 10 every 30s

    return () => { clearInterval(interval); clearInterval(lbInterval); };
  }, []);

  // Track reload when user signs in (Clerk might take a moment to load)
  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/track-reload", { method: "POST" }).catch(() => {});
    }
  }, [isSignedIn]);

  // Load LIVE PREDICT
  useEffect(() => {
    async function fetchLiveBets() {
      setLiveBetsLoading(true);
      try {
        const response = await fetch("/api/live-bets");
        const data = await response.json();
        if (data.ok && data.data) {
          // Direct assignment without conversion
          setLiveBets(data.data);
        }
      } catch {
        // ignore
      } finally {
        setLiveBetsLoading(false);
      }
    }

    fetchLiveBets();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchLiveBets, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load contest
  useEffect(() => {
    loadContest();
  }, []);

  useEffect(() => {
    const marquee = marqueeRef.current;
    const container = marqueeContainerRef.current;
    if (!marquee || !container) return;

    let pos = container.offsetWidth;
    let rafId = 0;
    const speed = 0.6;

    function tick() {
      if (!marquee || !container) return;
      const textWidth = marquee.offsetWidth;
      pos -= speed;
      if (pos < -textWidth) {
        pos = container.offsetWidth;
      }
      marquee.style.transform = `translateX(${pos}px)`;
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [settings.announcement]);

  useEffect(() => {
    if (!(devBypass || isSignedIn)) {
      setAccountStatus("demo");
      setAccountRole("user");
      return;
    }

    let cancelled = false;
    setAccountStatus("loading");

    fetch("/api/me")
      .then(async (response) => {
        const payload = (await response.json()) as ApiMeResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Failed to sync user");
        }
        return payload.data;
      })
      .then((user) => {
        if (cancelled) return;
        setCoins(user.coinBalance);
        setProfit(user.lifetimeProfit);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
        setAccountStatus("synced");
        fetch(`/api/leaderboard/profile?userId=${user.id}`)
          .then(async (res) => {
            const payload = await res.json();
            if (payload.ok && payload.data) {
              setWinRate(payload.data.winRate || 0);
              setOverallScore(payload.data.overallScore ?? null);
              setOverallRank(payload.data.overallRank || null);
              setRankName(payload.data.rankName || null);
              setRankIcon(payload.data.rankIcon || null);
            }
          })
          .catch(() => undefined);
        loadRunningPredictions().catch(() => undefined);
        loadLeaderboard().catch(() => undefined);
      })
      .catch(() => {
        if (cancelled) return;
        setAccountStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, devBypass]);

  // ซิงค์คะแนนเหรียญและตารางคะแนนจากฐานข้อมูลโดยอัตโนมัติทุกๆ 10 seconds
  useEffect(() => {
    if (!devBypass && !isSignedIn) return;
    const interval = setInterval(() => {
      syncUserData();
      loadLeaderboard().catch(() => undefined);
    }, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [isSignedIn, devBypass]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("sr_coins", String(coins));
    localStorage.setItem("sr_profit", String(profit));
    localStorage.setItem("sr_next_claim", String(nextClaimAt));
    localStorage.setItem("sr_next_special_claim", String(nextSpecialClaimAt));
    localStorage.setItem("sr_running", JSON.stringify(running.slice(0, 30)));
  }, [coins, profit, nextClaimAt, running, mounted]);

  useEffect(() => {
    const tick = () => {
      // ── Regular Claim countdown ──
      if (nextClaimAt <= Date.now()) {
        setClaimLabel("Ready");
        setClaimFlash(false);
      } else {
        const claimRemaining = nextClaimAt - Date.now();
        const minutes = Math.floor(claimRemaining / 60000);
        const seconds = Math.floor((claimRemaining % 60000) / 1000);
        setClaimLabel(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      }

      // ── Special Claim countdown ──
      if (nextSpecialClaimAt <= Date.now()) {
        setSpecialClaimLabel("Ready");
      } else {
        const specialRemaining = nextSpecialClaimAt - Date.now();
        const mins = Math.floor(specialRemaining / 60000);
        const secs = Math.floor((specialRemaining % 60000) / 1000);
        setSpecialClaimLabel(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [nextClaimAt, nextSpecialClaimAt]);

  // Cleanup profile refresh interval on component unmount
  useEffect(() => {
    return () => { if (profileRefreshRef.current) clearInterval(profileRefreshRef.current); };
  }, []);

  const leaderboard = useMemo(() => {
    let rows = [...leaderboardRows];
    if (isSignedIn && currentUserId && accountRole !== "admin") {
      rows = rows.map((row) => {
        if (row.id === currentUserId) {
          return { ...row, id: currentUserId, name: "You", overallScore: row.overallScore, rank: row.rank } as LeaderboardRow;
        }
        return row;
      });
      if (!rows.some((row) => row.id === currentUserId || row.name === "You")) {
        rows.push({ id: currentUserId, name: "You", profit: 0, overallScore: 0, rank: 0, isReal: true });
      }
    }
    return rows.slice(0, 10);
  }, [leaderboardRows, isSignedIn, currentUserId, accountRole]);

  const userRank = leaderboard.findIndex((row) => row.name === "You") + 1;

  const openQuestions = useMemo(() => {
    const list = liveQuestions.filter((question) => Date.now() < Number(questionDeadlines[question.id] || 0));
    const order = settings.predictionOrder || [];
    return [...list].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [liveQuestions, questionDeadlines, settings.predictionOrder]);
  const groupedOpenQuestions = Object.entries(
    openQuestions.reduce<Record<string, Question[]>>((groups, question) => {
      groups[question.tournament] = groups[question.tournament] || [];
      groups[question.tournament].push(question);
      return groups;
    }, {})
  ).sort(([aName], [bName]) => {
    const tournamentNames = (settings.tournaments || []).map(t => typeof t === "string" ? t : t.name);
    const idxA = tournamentNames.indexOf(aName);
    const idxB = tournamentNames.indexOf(bName);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const payload = (await response.json()) as ApiSettingsResponse;
    if (response.ok && payload.ok && payload.data) {
      setSettings(payload.data);
    }
    setSettingsLoaded(true);
  }

  async function loadLeaderboard() {
    try {
      const response = await fetch(`/api/leaderboard/v2?t=${Date.now()}`);
      const payload = await response.json();
      if (response.ok && payload.leaderboards?.overall) {
        // Convert v2 leaderboard format to LeaderboardRow[] - use overall leaderboard
        const rows: LeaderboardRow[] = payload.leaderboards.overall.map((item: { userId: string; displayName: string; avatarUrl: string | null; value: number; rank: number }) => ({
          id: item.userId,
          name: item.displayName,
          displayName: item.displayName,
          profit: 0,
          overallScore: item.value,
          rank: item.rank,
          avatarUrl: item.avatarUrl
        }));
        setLeaderboardRows(rows);
        setLeaderboardTotalUsers(payload.totalUsers || 0);
        
        // Build leaderboard value maps for fallback in ProfileModal
        const valueMap: {
          mostOrangeAmmo: Map<string, number>;
          mostPredictions: Map<string, number>;
          highestSingleWin: Map<string, number>;
          mostActive: Map<string, number>;
        } = {
          mostOrangeAmmo: new Map(),
          mostPredictions: new Map(),
          highestSingleWin: new Map(),
          mostActive: new Map()
        };
        
        if (payload.leaderboards?.mostOrangeAmmo) {
          payload.leaderboards.mostOrangeAmmo.forEach((item: { userId: string; value: number }) => {
            valueMap.mostOrangeAmmo.set(item.userId, item.value);
          });
        }
        if (payload.leaderboards?.mostPredictions) {
          payload.leaderboards.mostPredictions.forEach((item: { userId: string; value: number }) => {
            valueMap.mostPredictions.set(item.userId, item.value);
          });
        }
        if (payload.leaderboards?.highestSingleWin) {
          payload.leaderboards.highestSingleWin.forEach((item: { userId: string; value: number }) => {
            valueMap.highestSingleWin.set(item.userId, item.value);
          });
        }
        if (payload.leaderboards?.mostActive) {
          payload.leaderboards.mostActive.forEach((item: { userId: string; value: number }) => {
            valueMap.mostActive.set(item.userId, item.value);
          });
        }
        
        setLeaderboardValueMap(valueMap);
      }
    } catch {
      // fallback
    }
  }

  async function handleOpenProfile(userId: string, userName: string) {
    // Prevent double opening - if same user's modal is already open, do nothing
    if (selectedProfile && selectedProfile.name === userName && !selectedProfile.loading) {
      return;
    }
    
    // Clear any existing refresh interval
    if (profileRefreshRef.current) { clearInterval(profileRefreshRef.current); profileRefreshRef.current = null; }

    // Get values from leaderboard data (for users in top 20 only)
    const coinBalanceFromLeaderboard = leaderboardValueMap.mostOrangeAmmo.get(userId);
    const predictionCountFromLeaderboard = leaderboardValueMap.mostPredictions.get(userId);
    const highestSingleWinFromLeaderboard = leaderboardValueMap.highestSingleWin.get(userId);
    const avgReloadPerDayFromLeaderboard = leaderboardValueMap.mostActive.get(userId);

    // Show modal immediately with loading state
    setSelectedProfile({
      name: userName,
      // Overall leaderboard
      overallScore: 0,
      overallRank: 0,
      // Most Orange Ammo
      coinBalance: coinBalanceFromLeaderboard ?? 0,
      mostOrangeAmmoRank: 0,
      // Most Predictions
      predictionCount: predictionCountFromLeaderboard ?? 0,
      mostPredictionsRank: 0,
      // Highest Single Win
      highestSingleWin: highestSingleWinFromLeaderboard ?? 0,
      highestSingleWinRank: 0,
      // Most Active
      avgReloadPerDay: avgReloadPerDayFromLeaderboard ?? 0,
      mostActiveRank: 0,
      // Other stats
      rank: 0,
      rankPercentile: 0,
      rankName: "Bronze",
      rankIcon: "/ranks/bronze.png",
      totalUsers: leaderboardTotalUsers,
      winRate: 0,
      winCount: 0,
      lostCount: 0,
      totalSettled: 0,
      badge: "",
      badgeDesc: "",
      loading: true,
      history: [],
    });
    setProfileLoading(true);

    async function fetchProfile() {
      try {
        const response = await fetch(`/api/leaderboard/profile?userId=${userId}&_t=${Date.now()}`);
        const payload = await response.json();
        if (response.ok && payload.ok && payload.data) {
          // Use Profile API values primarily, only use leaderboard values if Profile API returns NaN
          const profileData = payload.data;
          const safeProfile = {
            ...profileData,
            // Use Profile API value, fallback to leaderboard value if NaN
            predictionCount: (Number.isNaN(profileData.predictionCount) || profileData.predictionCount === null)
              ? (predictionCountFromLeaderboard ?? 0)
              : Number(profileData.predictionCount),
            highestSingleWin: (Number.isNaN(profileData.highestSingleWin) || profileData.highestSingleWin === null)
              ? (highestSingleWinFromLeaderboard ?? 0)
              : Number(profileData.highestSingleWin),
            avgReloadPerDay: (Number.isNaN(profileData.avgClaimPerDay) || profileData.avgClaimPerDay === undefined || profileData.avgClaimPerDay === null)
              ? (avgReloadPerDayFromLeaderboard ?? 0)
              : Number(profileData.avgClaimPerDay),
            loading: false,
          };
          setSelectedProfile(safeProfile);
        } else {
          setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
        }
      } catch {
        setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
      } finally {
        setProfileLoading(false);
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

  async function loadContest() {
    try {
      setContestLoading(true);
      const response = await fetch("/api/contests/current");
      const payload = await response.json();
      if (payload.ok && payload.data) {
        setContest(payload.data);
      }
    } catch {
      // Ignored
    } finally {
      setContestLoading(false);
    }
  }

  async function syncUserData() {
    if (!devBypass && !isSignedIn) return;
    try {
      const response = await fetch("/api/me");
      const payload = (await response.json()) as ApiMeResponse;
      if (response.ok && payload.ok && payload.data) {
        const user = payload.data;
        setCoins(user.coinBalance);
        setProfit(user.lifetimeProfit);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
      }
    } catch {
      // ignore
    }
  }

  async function loadOpenPredictions() {
    // NOTE: track-reload moved to isSignedIn useEffect (fires once on login)
    // Do NOT call track-reload here — this function runs every 10s via setInterval
    
    const response = await fetch("/api/predictions/open");
    const payload = (await response.json()) as ApiPredictionsResponse;
    if (!response.ok || !payload.ok) return;
    if (!payload.data || !payload.data.length) {
      setLiveQuestions([]);
      setSelected({});
      setQuestionDeadlines({});
      return;
    }

    const apiQuestions = payload.data.map((item) => ({
      id: item.id,
      tournament: item.tournamentName,
      title: item.question,
      closesAt: item.closesAt,
      totalPool: item.totalPool,
      playerCount: item.playerCount,
      options: item.options.map((option) => ({
        id: option.id,
        name: option.label,
        returns: option.estimatedReturnPercent
      })),
      entries: item.entries || [],
    }));

    setLiveQuestions(apiQuestions);

    // Merge selected: keep current selection if still available, otherwise fallback to highest return option
    setSelected((currentSelected) => {
      const merged: Record<string, string> = {};
      for (const question of apiQuestions) {
        const current = currentSelected[question.id];
        const stillAvailable = question.options.find((o) => o.name === current);
        // Fallback: pick option with highest return instead of first option
        const highestReturnOption = question.options.reduce((max, o) => 
          (o.returns || 0) > (max.returns || 0) ? o : max
        , question.options[0]);
        merged[question.id] = stillAvailable ? current : (highestReturnOption?.name || "");
      }
      return merged;
    });

    setQuestionDeadlines(Object.fromEntries(apiQuestions.map((question) => [question.id, new Date(question.closesAt || 0).getTime()])));
  }

  async function loadRunningPredictions() {
    if (!devBypass && !isSignedIn) return;
    const response = await fetch("/api/predictions/running");
    const payload = (await response.json()) as ApiRunningResponse;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error || "Failed to load running predictions");
    }
    const formatted = payload.data.map((item) => ({
      id: item.id,
      questionId: item.predictionId,
      tournamentName: item.tournamentName,
      question: item.question,
      answer: item.optionLabel,
      coins: item.amount,
      returns: item.estimatedReturnPercent || 0,
      createdAt: item.createdAt,
      status: "Running" as const
    }));
    setRunning(formatted);

    // Sync locked options: if user already predicted on a question, lock the dropdown to that answer
    setSelected((current) => {
      const updated = { ...current };
      for (const entry of formatted) {
        // Only set if not already set (preserve manual selection for non-running questions)
        if (!updated[entry.questionId]) {
          updated[entry.questionId] = entry.answer;
        }
      }
      return updated;
    });
  }

  async function loadHistory() {
    if (!devBypass && !isSignedIn) return;
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history");
      const payload = (await response.json()) as ApiHistoryResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to load history");
      }
      setHistory(payload.data.rows);
    } catch {
      setAccountStatus("error");
    } finally {
      setHistoryLoading(false);
    }
  }

  function selectedOption(question: Question) {
    return question.options.find((option) => option.name === selected[question.id]) || 
      question.options.reduce((max, o) => (o.returns || 0) > (max.returns || 0) ? o : max, question.options[0]);
  }

  function getLockedOptionName(_question: Question): string | null {
    // Lock mechanism disabled — users can predict freely on any option, any number of times
    return null;
  }

  function formatQuestionCountdown(question: Question) {
    const remaining = Math.max(0, Number(questionDeadlines[question.id] || 0) - Date.now());
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function formatQuestionCloseTime(question: Question) {
    const closeAt = new Date(Number(questionDeadlines[question.id] || 0));
    const date = closeAt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "Asia/Bangkok"
    });
    const time = closeAt.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok"
    });
    return `${date} ${time} UTC+7`;
  }

  async function claim() {
    if ((!devBypass && !isSignedIn) || Date.now() < nextClaimAt) return;

    if (devBypass || isSignedIn) {
      try {
        const response = await fetch("/api/claim", { method: "POST" });
        const payload = (await response.json()) as ApiClaimResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          console.error("[Claim API Error]", payload.error);
          throw new Error(payload.error || "Claim failed");
        }
        setCoins(payload.data.user.coinBalance);
        setProfit(payload.data.user.lifetimeProfit);
        setNextClaimAt(payload.data.user.nextClaimAt ? new Date(payload.data.user.nextClaimAt).getTime() : 0);
        setClaimResult(payload.data.amount);
        setOpenModal("claimResult");
        // Flash button with amount for 5 seconds
        setClaimFlash(true);
        if (claimFlashTimer.current) clearTimeout(claimFlashTimer.current);
        claimFlashTimer.current = setTimeout(() => { setClaimFlash(false); setOpenModal(null); }, 5000);
      } catch (err) {
        console.error("[Claim Error]", err);
        setAccountStatus("error");
      }
      return;
    }

    const amount = randomClaimAmount();
    setCoins((current) => current + amount);
    setNextClaimAt(Date.now() + 60 * 60 * 1000);
    setClaimResult(amount);
    setOpenModal("claimResult");
    // Flash button with amount for 5 seconds
    setClaimFlash(true);
    if (amount > 0) {
      claimFlashTimer.current = setTimeout(() => { setClaimFlash(false); setOpenModal(null); }, 5000);
    }
  }

  // ── Special Claim (Special 10-min Claim) ──
  async function specialClaim() {
    if ((!devBypass && !isSignedIn) || Date.now() < nextSpecialClaimAt) return;

    setSpecialClaimLoading(true);
    try {
      const response = await fetch("/api/special-claim", { method: "POST" });
      const result: ApiSpecialClaimResponse = await response.json();

      if (!result.ok) {
        alert(result.th || result.error || "Cannot claim right now");
        return;
      }

      if (result.data) {
        setCoins(result.data.user.coinBalance);
        setProfit(result.data.user.lifetimeProfit);
        if (result.data.user.nextSpecialClaimAt) {
          setNextSpecialClaimAt(new Date(result.data.user.nextSpecialClaimAt).getTime());
        }
        // Show reward animation
        setClaimResult(result.data.amount);
        setClaimFlash(true);
        setOpenModal("claimResult");
        if (claimFlashTimer.current) clearTimeout(claimFlashTimer.current);
        claimFlashTimer.current = setTimeout(() => { setClaimFlash(false); setOpenModal(null); }, 5000);
      }
    } catch (err) {
      console.error("Special claim error:", err);
      alert("An error occurred. Please try again.");
    } finally {
      setSpecialClaimLoading(false);
    }
  }

  async function confirmPrediction(question: Question) {
    const amount = Number(coinInputs[question.id] || 0);
    const answer = selectedOption(question);
    if (!(devBypass || isSignedIn)) {
      setToast((current) => ({ ...current, [question.id]: "Login first" }));
      return;
    }
    if (Date.now() >= Number(questionDeadlines[question.id] || 0)) return;
    if (!amount || amount < 1) {
      setToast((current) => ({ ...current, [question.id]: "Choose coins for this question" }));
      return;
    }
    if (amount > coins) {
      setToast((current) => ({ ...current, [question.id]: "Not enough coins" }));
      return;
    }

    // Confirmation dialog for high-stakes bets (>500 coins)
    if (amount >= 500 && !confirmHighBet) {
      setConfirmHighBet({ questionId: question.id, amount });
      return;
    }

    // Clear confirmation state if set
    if (confirmHighBet) {
      setConfirmHighBet(null);
    }

    if (devBypass || isSignedIn) {
      setPredictingIds((current) => new Set(current).add(question.id));
      
      // ── OPTIMISTIC UPDATE: Update UI immediately for snappy feel ──
      const previousCoins = coins;
      const previousProfit = profit;
      setCoins((c) => c - amount);
      setProfit((p) => p - amount);
      
      try {
        const response = await fetch("/api/predictions/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predictionId: question.id,
            optionId: answer.id,
            amount
          })
        });
        const payload = (await response.json()) as ApiPredictResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Unable to place prediction");
        }
        // Sync with actual server values
        setCoins(payload.data.user.coinBalance);
        setProfit(payload.data.user.lifetimeProfit);
        setCoinInputs((current) => ({ ...current, [question.id]: 0 }));
        setToast((current) => ({ ...current, [question.id]: `${amount} coins used on ${answer.name} · now running` }));
        await loadRunningPredictions();
      } catch (error) {
        // ── ROLLBACK: Restore previous values if API fails ──
        setCoins(previousCoins);
        setProfit(previousProfit);
        const message = error instanceof Error ? error.message : "Unable to place prediction";
        setToast((current) => ({ ...current, [question.id]: message }));
      } finally {
        setPredictingIds((current) => {
          const next = new Set(current);
          next.delete(question.id);
          return next;
        });
      }
      return;
    }

    // Demo mode
    setCoins((current) => current - amount);
    setProfit((current) => current - amount);
    setRunning((current) => [
      {
        id: `demo-running-${Date.now()}`,
        questionId: question.id,
        question: question.title,
        answer: answer.name,
        coins: amount,
        returns: answer.returns,
        status: "Running" as const
      },
      ...current
    ].slice(0, 30));
    setCoinInputs((current) => ({ ...current, [question.id]: 0 }));
    setToast((current) => ({ ...current, [question.id]: `${amount} coins used on ${answer.name} · now running` }));
  }

  function resetDemo() {
    ["sr_coins", "sr_profit", "sr_next_claim", "sr_history", "sr_running", "sr_question_deadlines"].forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }

  return (
    <main className="page" suppressHydrationWarning>
      <div className="app" suppressHydrationWarning>
        <header className="topbar" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", height: "auto !important", minHeight: "46px", gap: "6px", padding: "6px 8px" }}>
          {/* ── Announcement Row ── */}
          {settingsLoaded && settings.announcement && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              background: "rgba(255,255,255,0.03)", 
              border: "1px solid var(--hairline)", 
              borderRadius: "6px", 
              padding: "4px 10px", 
              fontSize: "11px", 
              color: "var(--text-strong)",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}>
              <span style={{ fontSize: "12px", flexShrink: 0 }}>📢</span>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", height: "18px", position: "relative" }} ref={marqueeContainerRef}>
                <div style={{ display: "inline-block", whiteSpace: "nowrap", fontWeight: 600, color: "var(--text-strong)", position: "absolute", willChange: "transform" }} ref={marqueeRef}>
                  {settings.announcement}
                </div>
              </div>
            </div>
          )}

          {/* ── Brand + Actions Row ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>

          <div className="brand">
            <img className="logo" src="/SuperWin_b.png" alt="SuperWin logo" />
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Prediction Room</span>
            </div>
          </div>
          <div className="actions">
            {!(devBypass || isSignedIn) ? (
              <SignInButton mode="modal">
                <button className="button primary">Sign In</button>
              </SignInButton>
            ) : (
              <>
                {/* Stats display */}
                <span className="actions-group">
                  <span className="button gold" style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "default" }}>
                    <span>{coins.toLocaleString()}</span>
                    <img src="/ammo-icon.webp" alt="" width={12} height={12} style={{ objectFit: "contain", opacity: 0.8 }} />
                  </span>
                </span>

                {/* Action buttons */}
                <span className="actions-group">
                  <button className="button primary" disabled={claimLabel !== "Ready"} onClick={claim}>
                    {claimFlash ? `+${claimResult}` : "Reload"}
                  </button>
                  <button className="button gold" onClick={() => setOpenModal("running")}>Running {running.length}</button>
                  <button className="button gold" onClick={() => { setOpenModal("history"); loadHistory(); }}>History</button>
                  {accountRole === "admin" && <Link className="button gold" href="/admin">Admin</Link>}
                </span>

                {/* User tools */}
                <span className="actions-group">
                  <Link className="button" href="/profile" style={{ fontSize: "11px", padding: "0 10px", height: "32px", display: "flex", alignItems: "center" }}>Profile</Link>
                  <UserButton showName={false} />
                </span>
              </>
            )}
            <button className="button gold" onClick={() => setOpenModal("info")}>Info</button>
          </div>
          </div>
        </header>

        {/* ── YouTube Embed Section (only if enabled by admin) ── */}
        {mounted && frontendFeaturesEnabled && youtubeEmbed && (() => {
          // Check schedule: only show YouTube embed within scheduled time window
          const now = new Date();
          let shouldShow = true;
          if (youtubeScheduleStart) {
            const startDate = new Date(youtubeScheduleStart);
            if (isNaN(startDate.getTime())) {
              // Invalid date format, ignore schedule
            } else if (now < startDate) {
              shouldShow = false;
            }
          }
          if (youtubeScheduleEnd) {
            const endDate = new Date(youtubeScheduleEnd);
            if (!isNaN(endDate.getTime()) && now > endDate) {
              shouldShow = false;
            }
          }
          return shouldShow ? <YouTubeEmbedSection embedCode={youtubeEmbed} /> : null;
        })()}

        {/* ── Special 10-min Claim (กระสุนส้มพเิ ศษ) ── */}
        {frontendFeaturesEnabled && (<div style={{
          margin: "0 0 12px 0",
          padding: "10px 16px",
          background: "linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,100,0,0.04))",
          border: "2px solid rgba(255,165,0,0.3)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute",
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            background: "radial-gradient(circle, rgba(255,165,0,0.05) 0%, transparent 70%)",
            animation: "pulse-glow 3s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          
          {/* Ammo Icon */}
          <img src="https://superwinhub.app/ammo-icon.webp" alt="" width={28} height={28} style={{ 
              flexShrink: 0, 
              zIndex: 1,
              filter: "drop-shadow(0 0 4px rgba(255,165,0,0.5))",
              objectFit: "contain",
              lineHeight: 1,
            }} />
          
          <div style={{ flex: 1, zIndex: 1 }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--yellow)", marginBottom: "1px" }}>
              Special Claim
            </div>
            <div style={{ fontSize: "9px", color: "var(--muted)" }}>
              Free coins every 10 minutes
            </div>
          </div>

          <button
            onClick={specialClaim}
            disabled={specialClaimLoading || (!devBypass && !isSignedIn) || Date.now() >= nextSpecialClaimAt === false}
            style={{
              flexShrink: 0,
              padding: "7px 16px",
              fontSize: "12px",
              fontWeight: "800",
              borderRadius: "18px",
              border: "none",
              cursor: (specialClaimLoading || (!devBypass && !isSignedIn) || Date.now() >= nextSpecialClaimAt === false) ? "not-allowed" : "pointer",
              background: Date.now() >= nextSpecialClaimAt
                ? "linear-gradient(135deg, #FFA500, #FF8C00)"
                : "var(--hairline)",
              color: Date.now() >= nextSpecialClaimAt ? "#000" : "var(--muted)",
              transition: "all 0.2s",
              boxShadow: Date.now() >= nextSpecialClaimAt ? "0 2px 10px rgba(255,165,0,0.4)" : "none",
              minWidth: "70px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {specialClaimLoading ? (
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
            ) : (
              <span style={{ fontSize: "12px", lineHeight: 1, fontWeight: "800" }}>{specialClaimLabel}</span>
            )}
          </button>
        </div>)}

        {(devBypass || isSignedIn) && (
        <section className="stats" aria-label="Account stats">
          {accountStatus === "loading" ? (
            // Skeleton Loader
            <>
              <div className="stat" style={{ textAlign: "center" }}>
                <div style={{ width: 60, height: 12, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto 4px" }} />
                <div style={{ width: 40, height: 18, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto" }} />
              </div>
              <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <div style={{ width: 70, height: 12, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto 4px" }} />
                <div style={{ width: 60, height: 18, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto" }} />
              </div>
              <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <div style={{ width: 50, height: 12, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto 4px" }} />
                <div style={{ width: 60, height: 18, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto" }} />
              </div>
              <div className="stat" style={{ textAlign: "center" }}>
                <div style={{ width: 70, height: 12, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto 4px" }} />
                <div style={{ width: 50, height: 18, background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "skeleton-loading 1.5s infinite", margin: "0 auto" }} />
              </div>
            </>
          ) : (
            <>
              <div className="stat" style={{ textAlign: "center" }}><span className="label">Win Rate</span><b className="value">{winRate}%</b></div>
              <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <span className="label">Overall Rank</span>
                {accountRole === "admin" ? (
                  <b className="value" style={{ opacity: 0.5 }}>Admin</b>
                ) : rankName ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={rankIcon || "/ranks/bronze.png"} alt="" width={21} height={21} style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "4px", objectFit: "contain" }} />
                    <b className="value">{rankName}</b>
                  </div>
                ) : (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src="/ranks/bronze.png" alt="" width={21} height={21} style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "4px", objectFit: "contain" }} />
                    <b className="value">Bronze</b>
                  </div>
                )}
              </div>
              <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <span className="label">Overall</span>
                <b className="value" style={{ fontSize: "18px" }}>{overallScore ?? 0}/100</b>
              </div>
              <div className="stat" style={{ textAlign: "center" }}><span className="label">Next Reload</span><b className="value">{claimLabel}</b></div>
            </>
          )}
        </section>
        )}

        <section className="content">
          <section className="panel">
            <div className="panel-head"><h2>Open Tournaments</h2><span className="micro">Select a question</span></div>
            <div className="questions">
              {groupedOpenQuestions.length ? groupedOpenQuestions.map(([tournament, questions]) => (
                <div key={tournament} className="tournament-group">
                  {(() => {
                    const matched = (settings.tournaments || []).find((t) => {
                      const tName = typeof t === "string" ? t : t.name;
                      return tName.toLowerCase() === tournament.toLowerCase();
                    });
                    const logoUrl = matched && typeof matched !== "string" ? matched.logoUrl : "";
                    return (
                      <div className="tournament-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {logoUrl ? (
                            <img src={logoUrl} alt="" style={{ width: "18px", height: "18px", borderRadius: "4px", objectFit: "contain", background: "transparent" }} />
                          ) : (
                            <span style={{ fontSize: "11px" }}>🏆</span>
                          )}
                          <strong>{tournament}</strong>
                        </div>
                        <span className="micro">{questions.length} questions</span>
                      </div>
                    );
                  })()}
                  {questions.map((question) => {
                    const option = selectedOption(question);
                    const userEntryCount = currentUserId
                      ? (question.entries || []).filter((e) => e.userId === currentUserId && e.status === "running").length
                      : 0;
                    const isActive = activeQuestion === question.id;
                    return (
                      <div key={question.id} className={`question ${isActive ? "active" : ""} ${userEntryCount ? "running" : ""}`} style={{ gap: "6px" }} onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button, input, .dropdown, .dropdown-new")) return;
                        if (isActive) {
                          setActiveQuestion(null);
                          setOpenDropdown(null);
                        } else {
                          setActiveQuestion(question.id);
                          setOpenDropdown(null);
                        }
                      }}>
                        {/* Header */}
                        <div className="question-card-header">
                          <span className="question-timer">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}>
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            {formatQuestionCountdown(question)}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="question-card-title">{question.title}</h3>

                        {/* Pool / Players meta */}
                        <div className="question-pool-meta">
                          <span>Pool: <b>{question.totalPool.toLocaleString()} Coins</b></span>
                          <span className="dot" />
                          <span>Players: <b>{question.playerCount.toLocaleString()}</b></span>
                        </div>

                        {/* Compact row when inactive */}
                        {!isActive && (
                          <div className="question-compact-row">
                            <div className="compact-team" onClick={(event) => { event.stopPropagation(); setActiveQuestion(question.id); }}>
                              <span className="compact-label">Pick:</span>
                              <span className="compact-name">{option.name}</span>
                              <span className="compact-returns">~{option.returns}%</span>
                            </div>
                            <button className="compact-predict-btn" disabled={predictingIds.has(question.id)} onClick={(event) => { event.stopPropagation(); setActiveQuestion(question.id); }}>
                              {predictingIds.has(question.id) ? "Placing..." : "Predict"}
                            </button>
                          </div>
                        )}

                        {/* Expanded form when active */}
                        {isActive && (
                          <>
                            {/* Step 1 */}
                            <div className="question-step">
                              <span className="step-num">1.</span>
                              <span className="step-label">Pick your choice</span>
                            </div>

                            {/* Team picker */}
                            <div className={`dropdown-new ${openDropdown === question.id ? "open" : ""}`}>
                              <button className="dropdown-trigger-new" onClick={(event) => {
                                event.stopPropagation();
                                setActiveQuestion(question.id);
                                setOpenDropdown(openDropdown === question.id ? null : question.id);
                              }}>
                                <span className="dropdown-label-new">{option.name}</span>
                                <span className="dropdown-returns">~{option.returns}%</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5, flexShrink: 0 }}>
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </button>
                              <div className="dropdown-menu-new">
                                {(() => {
                                  // Sort options: highest return first, then random pick if multiple have same max
                                  const opts = [...question.options];
                                  opts.sort((a, b) => (b.returns || 0) - (a.returns || 0));
                                  return opts.map((choice) => 
                                    <button key={choice.id} className={`option-button-new ${choice.name === option.name ? "active" : ""}`} onClick={(event) => {
                                      event.stopPropagation();
                                      setSelected((current) => ({ ...current, [question.id]: choice.name }));
                                      setOpenDropdown(null);
                                    }}>
                                      <span>{choice.name}</span>
                                      <span className="return">~{choice.returns}%</span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Step 2 */}
                            <div className="question-step">
                              <span className="step-num">2.</span>
                              <span className="step-label">Enter amount</span>
                            </div>

                            {/* Amount row */}
                            <div className="amount-row-new">
                              <div className="amount-input-wrap">
                                <input
                                  type="number"
                                  min="0"
                                  readOnly
                                  value={coinInputs[question.id] || 0}
                                  onChange={(e) => setCoinInputs((current) => ({ ...current, [question.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                  onClick={(e) => e.stopPropagation()}
                                  className="amount-input-new"
                                  style={{ cursor: "default" }}
                                />
                                <img src="/ammo-icon.webp" alt="" width={16} height={16} style={{ objectFit: "contain", opacity: 0.5, flexShrink: 0 }} />
                              </div>
                              <div className="returns-box">
                                <span className="returns-label">Est. payout</span>
                                <span className="returns-value">~ {Math.round((coinInputs[question.id] || 0) * (1 + option.returns / 100))}</span>
                              </div>
                            </div>

                            {/* Amount chips */}
                            <div className="amount-chips-new" style={{ display: "flex", gap: "8px" }}>
                              {[5, 10, 50, 100, 500].map((amount) => (
                                <button key={amount} className="chip" onClick={(event) => {
                                  event.stopPropagation();
                                  setCoinInputs((current) => ({ ...current, [question.id]: Number(current[question.id] || 0) + amount }));
                                }}>{amount}</button>
                              ))}
                              <button className="chip" style={{ opacity: 0.6 }} onClick={(event) => {
                                event.stopPropagation();
                                setCoinInputs((current) => ({ ...current, [question.id]: 0 }));
                              }}>Clear</button>
                            </div>

                            {/* Big predict button */}
                            <button className="predict-big-btn" disabled={predictingIds.has(question.id)} onClick={(event) => {
                              event.stopPropagation();
                              confirmPrediction(question);
                            }}>
                              {predictingIds.has(question.id) ? "Placing..." : "Predict"}
                            </button>
                          </>
                        )}

                        <div className="question-close-time">Closes: {formatQuestionCloseTime(question)}</div>

                        <div className="toast">{toast[question.id]}</div>
                      </div>
                    );
                  })}
                </div>
              )) : (
                <div className="question">
                  <span className="question-title">No open questions</span>
                  <span className="meta">Submitted predictions are waiting in Running</span>
                </div>
              )}
            </div>
          </section>

          <aside className="side">
            <section className="panel">
              <div className="panel-head"><h3>All time Top 10</h3><span className="micro" style={{ display: "flex", alignItems: "center", gap: "4px" }}>Average Score</span></div>
              <div className="leaderboard-body">
                {leaderboard.map((row, index) => {
                  const targetId = row.id || (row.name === "You" ? currentUserId : null);
                  const isClickable = isSignedIn && targetId;
                  const avatarUrl = row.name === "You" ? (clerkUser?.imageUrl || row.avatarUrl) : row.avatarUrl;
                  return (
                    <div 
                      key={row.name} 
                      className="rank" 
                      onClick={(e) => {
                        // Prevent double click / rapid clicks
                        if (!isClickable) return;
                        // Prevent default and stop propagation to avoid double triggers
                        e.preventDefault();
                        e.stopPropagation();
                        // Check if modal is already open for this user
                        if (selectedProfile && selectedProfile.name === (row.displayName || maskName(row.name))) {
                          return;
                        }
                        handleOpenProfile(targetId, row.name);
                      }}
                      style={{ cursor: isClickable ? "pointer" : "default" }}
                      title={isClickable ? `Click to view ${row.name}'s stats` : undefined}
                    >
                      <span>{row.rank}</span>
                      <div className="rank-name-container" style={{ display: "flex", alignItems: "center", gap: "6px", flexGrow: 1, minWidth: 0 }}>
                        {avatarUrl ? (
                          <img 
                            src={avatarUrl} 
                            alt={row.name} 
                            style={{ width: "16px", height: "16px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} 
                          />
                        ) : (
                          <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#20252b", border: "1px solid #30353b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", flexShrink: 0 }}>
                            👤
                          </div>
                        )}
                        <span style={{ 
                          color: isClickable ? "var(--yellow)" : "var(--text-strong)", 
                          fontWeight: row.name === "You" ? "bold" : "600",
                          textDecoration: isClickable ? "underline" : "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {row.displayName || maskName(row.name)}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--muted)", fontSize: "10px", fontWeight: 500, flexShrink: 0 }}>
                          <img src={getRankFromPosition(row.rank, leaderboardTotalUsers).icon} alt="" width={18} height={18} style={{ objectFit: "contain" }} />
                          {getRankFromPosition(row.rank, leaderboardTotalUsers).name}
                        </span>
                      </div>
                      <b style={{ display: "flex", alignItems: "center", gap: "3px" }}>{compact(row.overallScore || 0)}</b>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--hairline)" }}>
                <a href="/leaderboard" target="_blank" rel="noopener noreferrer" style={{ 
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--yellow)",
                  fontWeight: 600,
                  textDecoration: "none"
                }}>
                  📊 View Full Leaderboard →
                </a>
              </div>
            </section>
            
            {/* LIVE PREDICT - 5 รายการล่าสุด */}
            {liveBets.length > 0 && (
              <section className="panel" style={{ 
                border: "1px solid rgba(255, 225, 0, 0.3)",
                background: "rgba(255, 225, 0, 0.05)",
                marginBottom: "12px"
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
                
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {liveBets.map((bet: any, index: number) => {
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
                          backgroundColor: isBigBet ? "rgba(255, 225, 0, 0.15)" : undefined,
                          border: isBigBet ? "1px solid rgba(255, 225, 0, 0.4)" : undefined,
                          borderRadius: isBigBet ? "6px" : undefined
                        }}
                      >
                        <span style={{ 
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: isBigBet ? "var(--yellow)" : "var(--yellow-soft)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "9px",
                          fontWeight: "700",
                          color: isBigBet ? "#000" : "var(--yellow)"
                        }}>
                          {isBigBet ? "🔥" : index + 1}
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
                          color: isBigBet ? "var(--yellow)" : "var(--yellow)",
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
                          {isBigBet && <span style={{ fontSize: "9px", marginLeft: "4px", color: "var(--yellow)" }}>🔥 BIG</span>}
                        </span>
                        
                        <span style={{ fontSize: "9px", color: "var(--muted)" }}>
                          {timeStr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            
            {/* ── CHAT BOX ── */}
            <ChatBox />
            
            {/* Contest Box - Prize Contest */}
            {contest && contest.status === "active" && (
              <section className="panel" style={{ border: "1px solid var(--yellow)", background: "linear-gradient(135deg, rgba(255,225,0,0.06) 0%, var(--card) 60%)" }}>
                <div className="panel-head">
                  <h3 style={{ color: "var(--yellow)" }}>Prize Contest</h3>
                  <span className="micro" style={{ color: "var(--yellow)", opacity: 0.8 }}>All Time Top 1 ณ เวลาสิ้นสุด (GMT+7) จะได้รับTotal Prizes</span>
                </div>
                <div style={{ padding: "14px 16px", display: "grid", gap: "10px" }}>
                  <p style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>
                    {contest.description || "แข่งขันเพื่อคว้ารางวัล! ผู้ที่อยู่อันดับ 1 ณ เวลาสิ้นสุดจะได้รับTotal Prizes"}
                  </p>
                  <div style={{ fontSize: "11px" }}>
                    <div style={{ color: "var(--yellow)" }}>🏆 Total Prizes:</div>
                    {contest.prize_1 && <div style={{ color: "var(--text)", marginTop: "2px" }}>🎁 {contest.prize_1}</div>}
                    {contest.prize_2 && <div style={{ color: "var(--text)", marginTop: "2px" }}>🎁 {contest.prize_2}</div>}
                    {contest.prize_3 && <div style={{ color: "var(--text)", marginTop: "2px" }}>🎁 {contest.prize_3}</div>}
                    {contest.prize_4 && <div style={{ color: "var(--text)", marginTop: "2px" }}>🎁 {contest.prize_4}</div>}
                    {contest.prize_5 && <div style={{ color: "var(--text)", marginTop: "2px" }}>🎁 {contest.prize_5}</div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11px" }}>
                    <div style={{ color: "var(--muted)" }}>
                      ⏰ End Time (GMT+7): <strong style={{ color: "var(--text-strong)" }}>{new Date(contest.end_time).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</strong>
                    </div>
                  </div>
                  {/* Countdown */}
                  {contest.end_time && (() => {
                    const endTime = new Date(contest.end_time).getTime();
                    const now = Date.now();
                    const diff = endTime - now;
                    if (diff > 0) {
                      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                      return (
                        <div style={{ padding: "8px", background: "rgba(76, 175, 80, 0.1)", borderRadius: "6px", textAlign: "center", fontSize: "11px", color: "#4caf50" }}>
                          ⏱️ เMore {days} day {hours} h {minutes} m
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </section>
            )}

            {/* Sidebar-integrated Bug Report / Feedback Card (ปุ่มเต่าทองสีทองสวยงาม เปิดพับเก็บได้ในตัว) */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", marginTop: "12px" }}>
              {!showReportForm ? (
                <button
                  onClick={() => setShowReportForm(true)}
                  className="button gold"
                  style={{ height: "24px", borderRadius: "12px", padding: "0 12px", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px", boxShadow: "0 2px 6px rgba(0,0,0,0.3)", cursor: "pointer" }}
                >
                  <span>🐞</span> Report Issue
                </button>
              ) : (
                <div className="panel" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
                    <b style={{ color: "var(--yellow)" }}>🐞 Report Issue / Feedback</b>
                    <button onClick={() => setShowReportForm(false)} style={{ background: "transparent", border: "none", color: "var(--text-weak)", cursor: "pointer", fontSize: "12px" }}>×</button>
                  </div>
                  
                  {reportSuccess ? (
                    <div style={{ color: "#4caf50", padding: "10px 0", textAlign: "center", fontWeight: "bold" }}>
                      ✓ Thank you! Message sent to admin.
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={reportMessage}
                        onChange={(e) => setReportMessage(e.target.value)}
                        placeholder="Describe your issue or suggestion..."
                        rows={3}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-strong)", resize: "none" }}
                      />
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ color: "var(--text-weak)" }}>Solve captcha to submit:</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontWeight: "bold", color: "var(--text-strong)" }}>{captchaQuestion}</span>
                          <input
                            type="text"
                            value={captchaAnswer}
                            onChange={(e) => setCaptchaAnswer(e.target.value)}
                            placeholder="?"
                            style={{ width: "36px", height: "20px", padding: "2px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-strong)", textAlign: "center" }}
                          />
                        </div>
                      </div>

                      {reportError && (
                        <div style={{ color: "var(--red)", fontSize: "10px", marginTop: "2px" }}>
                          ⚠ {reportError}
                        </div>
                      )}

                      <button
                        onClick={handleSendReport}
                        disabled={reportSubmitting || !reportMessage.trim() || !captchaAnswer.trim()}
                        className="button primary"
                        style={{ width: "100%", height: "24px", fontSize: "11px", fontWeight: "bold", padding: 0 }}
                      >
                        {reportSubmitting ? "Sending..." : "Submit Message"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>

      {/* High Stakes Confirmation Dialog */}
      {confirmHighBet && (
        <section className="modal" aria-label="Confirm high stakes bet" onClick={(event) => event.target === event.currentTarget && setConfirmHighBet(null)}>
          <div className="modal-card" style={{ maxWidth: 380, textAlign: "center", padding: "32px 24px", border: "2px solid var(--yellow)" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🔥</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "var(--yellow)", marginBottom: 8 }}>High Stakes Bet!</h3>
            <p style={{ fontSize: 14, color: "var(--text)", margin: "8px 0" }}>
              You are about to bet <strong style={{ color: "var(--yellow)", fontSize: 18 }}>{confirmHighBet.amount.toLocaleString()}</strong> coins
            </p>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0" }}>
              Are you sure? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: 20 }}>
              <button 
                className="button" 
                style={{ flex: 1, height: 40 }} 
                onClick={() => setConfirmHighBet(null)}
              >
                Cancel
              </button>
              <button 
                className="button primary" 
                style={{ flex: 1, height: 40, background: "var(--yellow)", color: "#000", fontWeight: 800 }} 
                onClick={() => {
                  // Will be handled by confirmPrediction on next call
                  const qId = confirmHighBet.questionId;
                  setConfirmHighBet(null);
                  // Trigger predict again - the state update will allow it through
                  setTimeout(() => {
                    const question = liveQuestions.find(q => q.id === qId);
                    if (question) confirmPrediction(question);
                  }, 50);
                }}
              >
                Confirm Bet 🔥
              </button>
            </div>
          </div>
        </section>
      )}

      {openModal === "running" && <RunningModal running={running} runningPage={runningPage} runningPageSize={runningPageSize} setRunningPage={(page) => { setRunningPage(page); }} onClose={() => setOpenModal(null)} />}
      {openModal === "info" && <InfoModal settings={settings} onClose={() => setOpenModal(null)} />}
      {openModal === "claimResult" && (
        <section className="modal" aria-label="Reload result" onClick={(event) => event.target === event.currentTarget && setOpenModal(null)}>
          <div className="modal-card" style={{ maxWidth: 360, textAlign: "center", padding: "32px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}></div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Reload Result</h3>
            <p style={{ fontSize: 32, fontWeight: 700, color: "var(--yellow)", margin: "12px 0" }}>
              +{claimResult} <img src="/ammo-icon.webp" alt="" width={24} height={24} style={{ verticalAlign: "middle" }} />
            </p>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Ammo reloaded!</p>
            <button className="button primary" style={{ marginTop: 20, width: "100%" }} onClick={() => setOpenModal(null)}>OK</button>
          </div>
        </section>
      )}
      {openModal === "history" && <HistoryModal history={history} running={running} historyLoading={historyLoading} historyPage={historyPage} historyPageSize={historyPageSize} setHistoryPage={(page) => { setHistoryPage(page); }} onClose={() => setOpenModal(null)} />}
      {selectedProfile && (
        <ProfileModal profile={selectedProfile} onClose={closeProfile} />
      )}
      {selectedLiveBet && (
        <LiveBetModal 
          bet={selectedLiveBet as any} 
          onClose={() => setSelectedLiveBet(null)} 
        />
      )}
    </main>
  );
}

function RunningModal({ running, runningPage, runningPageSize, setRunningPage, onClose }: { running: RunningPrediction[]; runningPage: number; runningPageSize: number; setRunningPage: (page: number) => void; onClose: () => void }) {
  const totalPages = Math.max(1, Math.ceil(running.length / runningPageSize));
  const start = (runningPage - 1) * runningPageSize;
  const rows = running.slice(start, start + runningPageSize);
  return (
    <section className="modal" aria-label="Running predictions" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Running Predictions</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="running-list">
            {rows.length ? rows.map((item) => {
              const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Bangkok"
              }) : "--";
              return (
                <div key={item.id} className="running-row">
                  <div className="running-detail">
                    <strong>{item.question}</strong>
                    <span className="meta">{item.answer} · {item.coins} <img src="/ammo-icon.webp" alt="" width={14} height={14} style={{ objectFit: "contain", verticalAlign: "middle" }} /> · Predict time: {formattedDate}</span>
                  </div>
                  <b className="running-label">Running</b>
                </div>
              );
            }) : <div className="running-row"><span>No running predictions</span><b className="accent-gold">0</b></div>}
          </div>
          {totalPages > 1 && (
            <div className="history-footer">
              <button className="button" disabled={runningPage <= 1} onClick={() => setRunningPage(runningPage - 1)}>Prev</button>
              <span className="micro">{runningPage} / {totalPages}</span>
              <button className="button" disabled={runningPage >= totalPages} onClick={() => setRunningPage(runningPage + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoModal({ settings, onClose }: { settings: SiteSettings; onClose: () => void }) {
  return (
    <section className="modal" aria-label="Game information" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Info</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="info-block"><h4>How to Play</h4><p style={{ whiteSpace: "pre-line" }}>{settings.info.howToPlay}</p></div>
          <div className="info-block"><h4>Question Time</h4><p style={{ whiteSpace: "pre-line" }}>{settings.info.questionTime}</p></div>
        </div>
      </div>
    </section>
  );
}

function ProfileModal({
  profile,
  onClose
}: {
  profile: UserProfileStats;
  onClose: () => void;
}) {
  return (
    <section className="modal" aria-label="User Profile" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "520px" }}>
        <div className="modal-head">
          <h3>🎮 {profile.displayName || maskName(profile.name)}'s Profile</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "12px", minHeight: "200px" }}>
          {profile.loading ? (
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
                              : ((h as any).payoutAmount || 0) - (h as any).amount || 0;
                            const isWin = net > 0;
                            return (
                              <span className="pill" style={{
                                fontSize: "9px",
                                height: "18px",
                                padding: "0 6px",
                                background: isWin ? "rgba(14, 203, 129, 0.12)" : "rgba(240, 84, 84, 0.12)",
                                color: isWin ? "var(--green)" : "var(--red)",
                                borderColor: isWin ? "rgba(14, 203, 129, 0.4)" : "rgba(240, 84, 84, 0.4)",
                                borderRadius: "4px",
                                fontWeight: "bold"
                              }}>
                                {isWin ? `+${compact(net)}` : `-${compact(Math.abs(net))}`}
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

function HistoryModal({
  history,
  running,
  historyLoading,
  historyPage,
  historyPageSize,
  setHistoryPage,
  onClose
}: {
  history: HistoryItem[];
  running: RunningPrediction[];
  historyLoading: boolean;
  historyPage: number;
  historyPageSize: number;
  setHistoryPage: (page: number) => void;
  onClose: () => void;
}) {
  // Create map of running predictions by question
  const runningByQuestion = useMemo(() => {
    const map = new Map<string, RunningPrediction>();
    for (const item of running) {
      map.set(item.question, item);
    }
    return map;
  }, [running]);

  const totalPages = Math.max(1, Math.ceil(history.length / historyPageSize));
  const start = (historyPage - 1) * historyPageSize;
  const rows = history.slice(start, start + historyPageSize);

  return (
    <section className="modal" aria-label="Coin history" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card history-modal-card">
        <div className="modal-head"><h3>Coin History</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body history-modal-body">
          <div className="history-list-scroll">
            {historyLoading ? (
              <div className="history-row-simple" style={{ justifyContent: "center", padding: "24px 0" }}>
                <span className="micro" style={{ color: "var(--muted)" }}>Loading...</span>
              </div>
            ) : rows.length ? rows.map((row, index) => {
              // Try to find answer from running predictions using question from detail
              const questionMatch = row.detail?.match(/Question:\s*(.+?)(?:\s*·|$)/i);
              const question = questionMatch?.[1]?.trim();
              const runningItem = question ? runningByQuestion.get(question) : undefined;
              const answer = runningItem?.answer;
              
              // Replace "Status: Running" with "Answer: xxx" if found
              let displayDetail = row.detail || row.action;
              if (answer && displayDetail.includes("Status: Running")) {
                displayDetail = displayDetail.replace("Status: Running", `Answer: ${answer}`);
              }

              return (
                <div key={`${row.date}-${row.time}-${index}`} className="history-row-simple">
                  <span className="history-date">{row.date}</span>
                  <span className="history-detail-simple">{displayDetail}</span>
                  <b className={`history-amount ${row.amount >= 0 ? "accent-gold" : "accent-red"}`}>{money(row.amount)}</b>
                </div>
              );
            }) : (
              <div className="history-row-simple" style={{ justifyContent: "center", padding: "24px 0" }}>
                <span className="micro" style={{ color: "var(--muted)" }}>No history</span>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="history-footer">
              <button className="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Prev</button>
              <span className="micro">{historyPage} / {totalPages}</span>
              <button className="button" disabled={historyPage >= totalPages} onClick={() => setHistoryPage(historyPage + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
