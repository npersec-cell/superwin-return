"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
};

type HistoryItem = {
  date: string;
  time: string;
  action: "Reload" | "Predict" | "Payout" | "Refund";
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
  insurance: boolean;
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
    insurance: boolean;
  }>;
  error?: string;
};

type ApiPredictResponse = {
  ok: boolean;
  data?: {
    user: { coinBalance: number; profitScore: number; lifetimeProfit: number };
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
    reward: string;
    questionTime: string;
  };
  reward: {
    name: string;
    winnerBy: string;
    month: string;
  };
  tournaments: (string | { name: string; logoUrl: string })[];
  savedQuestions: string[];
  predictionOrder?: string[];
  announcement?: string;
};
function maskName(name: string): string {
  if (!name) return "";
  if (name === "You") return name;
  // Censor last 2 chars with "xx"
  if (name.length <= 2) return name + "xx";
  return name.slice(0, -2) + "xx";
}

function getRankInfo(profitScore: number) {
  if (profitScore >= 50000) return { name: "Conqueror", icon: "/ranks/conqueror.png" };
  if (profitScore >= 20000) return { name: "Ace", icon: "/ranks/ace.png" };
  if (profitScore >= 5000) return { name: "Diamond", icon: "/ranks/diamond.png" };
  if (profitScore >= 1000) return { name: "Gold", icon: "/ranks/gold.png" };
  return { name: "Bronze", icon: "/ranks/bronze.png" };
}

type UserProfileStats = {
  name: string;
  profitScore: number;
  allTimeProfit: number;
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
    profitScore: number;
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
      profitScore: number;
      lastClaimAt: string | null;
      nextClaimAt: string | null;
    };
  };
  error?: string;
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
    reward: "เล่นได้ตลอดเวลาไม่มีจบ สะสมกำไรสุทธิเพื่อขึ้นอันดับ All time Top 10 และแลกของรางวัลผ่าน Shop (เร็วๆ นี้)",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  reward: {
    name: "Shop",
    winnerBy: "Rank",
    month: "Continuous"
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
  profit: number;
  profitScore: number;
  isReal?: boolean;
  avatarUrl?: string | null;
};

const defaultLeaderboard: LeaderboardRow[] = [];

function money(amount: number) {
  return `${amount >= 0 ? "+" : ""}${amount}`;
}

function compact(n: number): string {
  if (n < 1000) return `${n >= 0 ? "+" : ""}${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function getInsuranceCost(betAmount: number): number {
  if (betAmount <= 100) return 20;
  if (betAmount <= 300) return 60;
  if (betAmount <= 500) return 100;
  if (betAmount <= 1000) return 200;
  const multiplier = 1 + Math.floor((betAmount - 1001) / 1000);
  return 200 * multiplier;
}

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

export default function SuperWinPrototype() {
  const { isSignedIn, user: clerkUser } = useUser();
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [coins, setCoins] = useState(500);
  const [profit, setProfit] = useState(0);
  const [profitScore, setProfitScore] = useState(0);
  const [winRate, setWinRate] = useState(0);
  const [nextClaimAt, setNextClaimAt] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [coinInputs, setCoinInputs] = useState<Record<string, number>>({});
  const [running, setRunning] = useState<RunningPrediction[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"All" | HistoryItem["action"]>("All");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 7;
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
  const [insuranceEnabled, setInsuranceEnabled] = useState<Set<string>>(new Set());
  const [accountStatus, setAccountStatus] = useState<"demo" | "loading" | "synced" | "error">("demo");
  const [accountRole, setAccountRole] = useState<"user" | "admin">("user");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>(defaultLeaderboard);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const marqueeContainerRef = useRef<HTMLDivElement | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);

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
    setProfitScore(Number(localStorage.getItem("sr_profit_score")) || 0);
    setNextClaimAt(Number(localStorage.getItem("sr_next_claim")) || 0);
    setRunning(safeJson("sr_running", []));
    loadOpenPredictions().catch(() => undefined);
    loadSettings().catch(() => undefined);
    loadLeaderboard().catch(() => undefined);

    const interval = setInterval(() => {
      loadOpenPredictions().catch(() => undefined);
    }, 10000);

    return () => clearInterval(interval);
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
    setLoggedIn(Boolean(isSignedIn));

    if (!isSignedIn) {
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
        setProfitScore(user.profitScore || 0);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
        setAccountStatus("synced");
        fetch(`/api/leaderboard/profile?userId=${user.id}`)
          .then(async (res) => {
            const payload = await res.json();
            if (payload.ok && payload.data) {
              setWinRate(payload.data.winRate || 0);
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
  }, [isSignedIn]);

  // ซิงค์คะแนนเหรียญและตารางคะแนนจากฐานข้อมูลโดยอัตโนมัติทุกๆ 10 วินาที
  useEffect(() => {
    if (!isSignedIn) return;
    const interval = setInterval(() => {
      syncUserData();
      loadLeaderboard().catch(() => undefined);
    }, 10000); // 10 วินาที
    return () => clearInterval(interval);
  }, [isSignedIn]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("sr_coins", String(coins));
    localStorage.setItem("sr_profit", String(profit));
    localStorage.setItem("sr_next_claim", String(nextClaimAt));
    localStorage.setItem("sr_running", JSON.stringify(running.slice(0, 30)));
  }, [coins, profit, nextClaimAt, running, mounted]);

  useEffect(() => {
    const tick = () => {
      const claimRemaining = nextClaimAt - Date.now();
      if (claimRemaining <= 0) {
        setClaimLabel("Ready");
        setClaimFlash(false);
      } else {
        const minutes = Math.floor(claimRemaining / 60000);
        const seconds = Math.floor((claimRemaining % 60000) / 1000);
        setClaimLabel(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [nextClaimAt, settings]);

  useEffect(() => {
    loadOpenPredictions();
    const timer = window.setInterval(loadOpenPredictions, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const leaderboard = useMemo(() => {
    let rows = [...leaderboardRows];
    if (isSignedIn && currentUserId) {
      rows = rows.map((row) => {
        if (row.id === currentUserId) {
          return { ...row, id: currentUserId, name: "You", profitScore } as LeaderboardRow;
        }
        return row;
      });
      if (!rows.some((row) => row.id === currentUserId || row.name === "You")) {
        rows.push({ id: currentUserId, name: "You", profit: 0, profitScore, isReal: true });
      }
    } else {
      rows = rows.map((row) => (row.name === "You" ? { ...row, profitScore } as LeaderboardRow : row));
    }
    return rows.sort((a, b) => b.profitScore - a.profitScore).slice(0, 10);
  }, [leaderboardRows, profitScore, isSignedIn, currentUserId]);

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
      const response = await fetch("/api/leaderboard");
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setLeaderboardRows(payload.data);
      }
    } catch {
      // fallback
    }
  }

  async function handleOpenProfile(userId: string, userName: string) {
    // show modal immediately with loading state
    setSelectedProfile({
      name: userName,
      profitScore: 0,
      allTimeProfit: 0,
      winRate: 0,
      wonCount: 0,
      lostCount: 0,
      totalSettled: 0,
      badge: "",
      badgeDesc: "",
      loading: true,
      history: [],
    });
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/leaderboard/profile?userId=${userId}`);
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setSelectedProfile({ ...payload.data, loading: false });
      } else {
        // if fetch fails, remove loading flag
        setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
      }
    } catch {
      setSelectedProfile(prev => prev ? { ...prev, loading: false } : null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function syncUserData() {
    if (!isSignedIn) return;
    try {
      const response = await fetch("/api/me");
      const payload = (await response.json()) as ApiMeResponse;
      if (response.ok && payload.ok && payload.data) {
        const user = payload.data;
        setCoins(user.coinBalance);
        setProfit(user.lifetimeProfit);
        setProfitScore(user.profitScore || 0);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
      }
    } catch {
      // ignore
    }
  }

  async function loadOpenPredictions() {
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
      options: (() => {
        const shuffled = item.options.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.map((option) => ({
          id: option.id,
          name: option.label,
          returns: option.estimatedReturnPercent
        }));
      })()
    }));

    setLiveQuestions(apiQuestions);

    // Merge selected: keep current selection if still available, otherwise fallback to first option
    setSelected((currentSelected) => {
      const merged: Record<string, string> = {};
      for (const question of apiQuestions) {
        const current = currentSelected[question.id];
        const stillAvailable = question.options.find((o) => o.name === current);
        merged[question.id] = stillAvailable ? current : (question.options[0]?.name || "");
      }
      return merged;
    });

    setQuestionDeadlines(Object.fromEntries(apiQuestions.map((question) => [question.id, new Date(question.closesAt || 0).getTime()])));
  }

  async function loadRunningPredictions() {
    if (!isSignedIn) return;
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
      status: "Running" as const,
      insurance: item.insurance || false
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

  async function loadHistory(filter = historyFilter) {
    if (!isSignedIn) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/history?filter=${encodeURIComponent(filter)}`);
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
    return question.options.find((option) => option.name === selected[question.id]) || question.options[0];
  }

  function getLockedOptionName(questionId: string): string | null {
    const entries = running.filter((item) => item.questionId === questionId);
    if (entries.length === 0) return null;
    return entries[0].answer;
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

  function randomClaimAmount(): number {
    const r = Math.random();
    if (r < 0.50) return Math.floor(Math.random() * 21) + 10;
    if (r < 0.80) return Math.floor(Math.random() * 30) + 31;
    if (r < 0.95) return Math.floor(Math.random() * 30) + 61;
    return Math.floor(Math.random() * 10) + 91;
  }

  async function claim() {
    if (!loggedIn || Date.now() < nextClaimAt) return;

    if (isSignedIn) {
      try {
        const response = await fetch("/api/claim", { method: "POST" });
        const payload = (await response.json()) as ApiClaimResponse;
        if (!response.ok || !payload.ok || !payload.data) {
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
      } catch {
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
    if (claimFlashTimer.current) clearTimeout(claimFlashTimer.current);
    claimFlashTimer.current = setTimeout(() => { setClaimFlash(false); setOpenModal(null); }, 5000);
  }

  async function confirmPrediction(question: Question) {
    const amount = Number(coinInputs[question.id] || 0);
    const answer = selectedOption(question);
    if (!loggedIn) {
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

    if (isSignedIn) {
      setPredictingIds((current) => new Set(current).add(question.id));
      try {
        const response = await fetch("/api/predictions/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predictionId: question.id,
            optionId: answer.id,
            amount,
            insurance: insuranceEnabled.has(question.id)
          })
        });
        const payload = (await response.json()) as ApiPredictResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Prediction failed");
        }
        setCoins(payload.data.user.coinBalance);
        setProfitScore(payload.data.user.profitScore);
        setProfit(payload.data.user.lifetimeProfit);
        setCoinInputs((current) => ({ ...current, [question.id]: 0 }));
        setToast((current) => ({ ...current, [question.id]: `${amount} coins used on ${answer.name} · now running` }));
        await loadRunningPredictions();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Prediction failed";
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
        status: "Running" as const,
        insurance: insuranceEnabled.has(question.id)
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
        <header className="topbar">
          <div className="brand">
            <img className="logo" src="/SuperWin_b.png" alt="SuperWin logo" />
            <div className="brand-text">
              <h1>SUPERWIN HUB</h1>
              <span>Prediction Room</span>
            </div>
          </div>
          <div className="actions">
            {!isSignedIn ? (
              <SignInButton mode="modal">
                <button className="button primary">Sign In</button>
              </SignInButton>
            ) : (
              <>
                <span className="button gold" style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "default" }}>
                  <span>{coins.toLocaleString()}</span>
                  <img src="/ammo-icon.webp" alt="" width={12} height={12} style={{ objectFit: "contain", opacity: 0.8 }} />
                </span>
                <span className="button gold" style={{ display: "flex", alignItems: "center", gap: "3px", cursor: "default" }}>
                  <span>{profitScore.toLocaleString()}</span>
                  <img src="/ammo-556-icon.webp" alt="" width={12} height={12} style={{ objectFit: "contain", opacity: 0.8 }} />
                </span>
                <button className="button primary" disabled={claimLabel !== "Ready"} onClick={claim}>
                  {claimFlash ? `+${claimResult}` : "Reload"}
                </button>
                <button className="button gold" onClick={() => setOpenModal("running")}>Running {running.length}</button>
                <button className="button gold" onClick={() => { setOpenModal("history"); loadHistory("All"); }}>History</button>
                {accountRole === "admin" && <Link className="button gold" href="/admin">Admin</Link>}
                <UserButton showName={false} />
              </>
            )}
            <button className="button gold" onClick={() => setOpenModal("info")}>Info</button>
          </div>
        </header>

        {settingsLoaded && settings.announcement && (
          <div className="announcement-bar" suppressHydrationWarning={true} style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px", 
            background: "var(--card)", 
            border: "1px solid var(--border)", 
            borderRadius: "6px", 
            padding: "6px 12px", 
            margin: "0 0 10px 0", 
            fontSize: "11px", 
            color: "var(--text-strong)",
            overflow: "hidden",
            whiteSpace: "nowrap"
          }}>
            <span style={{ fontSize: "12px", flexShrink: 0 }}>📢</span>
            <div className="announcement-container" ref={marqueeContainerRef}>
              <div className="announcement-marquee" ref={marqueeRef}>
                {settings.announcement}
              </div>
            </div>
          </div>
        )}

        {isSignedIn && (
        <section className="stats" aria-label="Account stats">
          <div className="stat"><span className="label">Win Rate</span><b className="value">{winRate}%</b></div>
          <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span className="label">Rank</span>
            <div style={{ position: "relative", display: "inline-block" }}>
              <img src={getRankInfo(profitScore).icon} alt="" width={21} height={21} style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "4px", objectFit: "contain" }} />
              <b className="value">{getRankInfo(profitScore).name}</b>
            </div>
          </div>
          <div className="stat"><span className="label">All time Rank</span><b className="value">{userRank ? `#${userRank}` : "--"}</b></div>
          <div className="stat"><span className="label">Next Reload</span><b className="value">{claimLabel}</b></div>
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
                    const runningCount = running.filter((item) => item.questionId === question.id).length;
                    const isActive = activeQuestion === question.id;
                    const lockedOptionName = getLockedOptionName(question.id);
                    const isLocked = lockedOptionName !== null;
                    return (
                      <div key={question.id} className={`question ${isActive ? "active" : ""} ${runningCount ? "running" : ""} ${isLocked ? "locked" : ""}`} style={{ gap: "6px" }} onClick={(event) => {
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
                              <span className="compact-label">{isLocked ? "Locked:" : "Pick:"}</span>
                              <span className="compact-name">{option.name}</span>
                              <span className="compact-returns">~{option.returns}%</span>
                            </div>
                            <button className="compact-predict-btn" disabled={predictingIds.has(question.id)} onClick={(event) => { event.stopPropagation(); setActiveQuestion(question.id); }}>
                              {isLocked ? "Top Up" : "Predict"}
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
                            {isLocked ? (
                              <button className="team-picker locked" disabled={predictingIds.has(question.id)} onClick={(event) => { event.stopPropagation(); confirmPrediction(question); }}>
                                <span className="team-name">{option.name}</span>
                                <span className="team-returns">~{option.returns}%</span>
                                <span className="locked-badge">Locked</span>
                              </button>
                            ) : (
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
                                  {question.options.map((choice) => (
                                    <button key={choice.id} className={`option-button-new ${choice.name === option.name ? "active" : ""}`} onClick={(event) => {
                                      event.stopPropagation();
                                      setSelected((current) => ({ ...current, [question.id]: choice.name }));
                                      setOpenDropdown(null);
                                    }}>
                                      <span>{choice.name}</span>
                                      <span className="return">~{choice.returns}%</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

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

                            {/* Amount chips + Insurance */}
                            <div className="amount-chips-new" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                              <div style={{ display: "flex", gap: "8px" }}>
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
                              <div className="insurance-row" style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }}>
                                  <img src="/vest-3.png" alt="" width={14} height={14} style={{ objectFit: "contain", opacity: 0.7 }} />
                                  <input
                                    type="checkbox"
                                    checked={insuranceEnabled.has(question.id)}
                                    onChange={(e) => {
                                      const next = new Set(insuranceEnabled);
                                      if (e.target.checked) {
                                        next.add(question.id);
                                      } else {
                                        next.delete(question.id);
                                      }
                                      setInsuranceEnabled(next);
                                    }}
                                    disabled={profitScore < getInsuranceCost(coinInputs[question.id] || 0)}
                                    style={{ cursor: "pointer", width: "14px", height: "14px" }}
                                  />
                                  <span>Insure -50%</span>
                                </label>
                                {insuranceEnabled.has(question.id) && (coinInputs[question.id] || 0) > 0 && (
                                  <span style={{ fontSize: "10px", color: "var(--yellow)", opacity: 0.9, whiteSpace: "nowrap" }}>
                                    -{getInsuranceCost(coinInputs[question.id] || 0)} <img src="/ammo-556-icon.webp" alt="" width={10} height={10} style={{ objectFit: "contain", verticalAlign: "middle" }} />
                                  </span>
                                )}
                                {!insuranceEnabled.has(question.id) && (coinInputs[question.id] || 0) > 0 && profitScore < getInsuranceCost(coinInputs[question.id] || 0) && (
                                  <span style={{ fontSize: "10px", color: "#888", opacity: 0.7, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px" }}>
                                    Need {getInsuranceCost(coinInputs[question.id] || 0) - profitScore} <img src="/ammo-556-icon.webp" alt="" width={10} height={10} style={{ objectFit: "contain", verticalAlign: "middle" }} />
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Big predict button */}
                            <button className="predict-big-btn" disabled={predictingIds.has(question.id)} onClick={(event) => {
                              event.stopPropagation();
                              confirmPrediction(question);
                            }}>
                              {isLocked ? "Top Up" : "Predict"}
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
              <div className="panel-head"><h3>All time Top 10</h3><span className="micro" style={{ display: "flex", alignItems: "center", gap: "4px" }}>Rank <img src="/ammo-556-icon.webp" alt="" width={12} height={12} style={{ objectFit: "contain", opacity: 0.8 }} /></span></div>
              <div className="leaderboard-body">
                {leaderboard.map((row, index) => {
                  const targetId = row.id || (row.name === "You" ? currentUserId : null);
                  const isClickable = isSignedIn && targetId;
                  const avatarUrl = row.name === "You" ? (clerkUser?.imageUrl || row.avatarUrl) : row.avatarUrl;
                  return (
                    <div 
                      key={row.name} 
                      className="rank" 
                      onClick={() => isClickable && handleOpenProfile(targetId, row.name)}
                      style={{ cursor: isClickable ? "pointer" : "default" }}
                      title={isClickable ? `Click to view ${row.name}'s stats` : undefined}
                    >
                      <span>{index + 1}</span>
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
                          {maskName(row.name)}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--muted)", fontSize: "10px", fontWeight: 500, flexShrink: 0 }}>
                          <img src={getRankInfo(row.profitScore).icon} alt="" width={18} height={18} style={{ objectFit: "contain" }} />
                          {getRankInfo(row.profitScore).name}
                        </span>
                      </div>
                      <b style={{ display: "flex", alignItems: "center", gap: "3px" }}>{compact(row.profitScore)} <img src="/ammo-556-icon.webp" alt="" width={10} height={10} style={{ objectFit: "contain", opacity: 0.8 }} /></b>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h3>Shop</h3><span className="micro">Coming soon</span></div>
              <div style={{ padding: "18px 16px", textAlign: "center", color: "var(--muted)" }}>
                บริการเร็วๆ นี้
              </div>
            </section>

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
      {openModal === "history" && <HistoryModal history={history} historyFilter={historyFilter} historyLoading={historyLoading} historyPage={historyPage} historyPageSize={historyPageSize} setHistoryPage={(page) => { setHistoryPage(page); }} setHistoryFilter={(value) => { setHistoryFilter(value); loadHistory(value); }} onClose={() => setOpenModal(null)} />}
      {selectedProfile && (
        <ProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
      )}
    </main>
  );
}

function RunningModal({ running, runningPage, runningPageSize, setRunningPage, onClose }: { running: RunningPrediction[]; runningPage: number; runningPageSize: number; setRunningPage: (page: number) => void; onClose: () => void }) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => modalRef.current?.classList.add("open")));
  }, []);
  const totalPages = Math.max(1, Math.ceil(running.length / runningPageSize));
  const start = (runningPage - 1) * runningPageSize;
  const rows = running.slice(start, start + runningPageSize);
  return (
    <section ref={modalRef} className="modal" aria-label="Running predictions" onClick={(event) => event.target === event.currentTarget && onClose()}>
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
                    <span className="meta">{item.answer} · {item.coins} <img src="/ammo-icon.webp" alt="" width={14} height={14} style={{ objectFit: "contain", verticalAlign: "middle" }} /> · Predict time: {formattedDate}{item.insurance && <span style={{ fontSize: "10px", color: "var(--yellow)", marginLeft: "6px" }}>🛡️ Insured</span>}</span>
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
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => modalRef.current?.classList.add("open")));
  }, []);
  return (
    <section ref={modalRef} className="modal" aria-label="Game information" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Info</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="info-block"><h4>How to Play</h4><p style={{ whiteSpace: "pre-line" }}>{settings.info.howToPlay}</p></div>
          <div className="info-block"><h4>Reward</h4><p style={{ whiteSpace: "pre-line" }}>{settings.info.reward}</p></div>
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
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => modalRef.current?.classList.add("open")));
  }, []);
  return (
    <section ref={modalRef} className="modal" aria-label="User Profile" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "480px" }}>
        <div className="modal-head">
          <h3>🎮 {maskName(profile.name)}'s Profile</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "12px", minHeight: "180px" }}>
          {profile.loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "160px" }}>
              <div className="spinner" />
            </div>
          ) : (
            <>
              {/* Quick Stats Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div className="info-block" style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>WIN RATE</span>
                  <strong style={{ display: "block", fontSize: "18px", color: "var(--yellow)", marginTop: "4px" }}>
                    {profile.winRate}%
                  </strong>
                  <span className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                    {profile.wonCount} won · {profile.lostCount} lost
                  </span>
                </div>
                <div className="info-block" style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>RANK</span>
                  <strong style={{ display: "flex", justifyContent: "center", fontSize: "18px", color: "var(--yellow)", marginTop: "4px" }}>
                    <span style={{ position: "relative", display: "inline-block" }}>
                      <img src={getRankInfo(profile.profitScore).icon} alt="" width={27} height={27} style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: "6px", objectFit: "contain" }} />
                      {getRankInfo(profile.profitScore).name}
                    </span>
                  </strong>
                  <span className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                    Profit Score: {profile.profitScore.toLocaleString()}
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
                            {h.tournament} · Picked: <strong style={{ color: "var(--text-strong)" }}>{h.pick}</strong>
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <span className="pill" style={{ 
                            fontSize: "9px", 
                            height: "18px", 
                            padding: "0 6px", 
                            background: h.status === "won" ? "rgba(14, 203, 129, 0.12)" : "rgba(240, 84, 84, 0.12)", 
                            color: h.status === "won" ? "var(--green)" : "var(--red)",
                            borderColor: h.status === "won" ? "rgba(14, 203, 129, 0.4)" : "rgba(240, 84, 84, 0.4)",
                            borderRadius: "4px",
                            fontWeight: "bold"
                          }}>
                            {h.status === "won" ? `+${h.payout - h.amount}` : `-${h.amount}`}
                          </span>
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
          )}
        </div>
      </div>
    </section>
  );
}

function renderHistoryDetail(detail: string) {
  return detail.split(" · ")
    .filter((part) => !part.toLowerCase().includes("approx return"))
    .map((part) => (
      <span key={part}>{part}</span>
    ));
}

function HistoryModal({
  history,
  historyFilter,
  historyLoading,
  historyPage,
  historyPageSize,
  setHistoryPage,
  setHistoryFilter,
  onClose
}: {
  history: HistoryItem[];
  historyFilter: "All" | HistoryItem["action"];
  historyLoading: boolean;
  historyPage: number;
  historyPageSize: number;
  setHistoryPage: (page: number) => void;
  setHistoryFilter: (value: "All" | HistoryItem["action"]) => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => modalRef.current?.classList.add("open")));
  }, []);
  const filtered = historyFilter === "All" ? history : history.filter((item) => item.action === historyFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / historyPageSize));
  const start = (historyPage - 1) * historyPageSize;
  const rows = filtered.slice(start, start + historyPageSize);

  return (
    <section ref={modalRef} className="modal" aria-label="Coin history" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Coin History</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="filter-row">
            {(["All", "Predict", "Reload", "Payout"] as const).map((filter) => (
              <button key={filter} className={`button ${historyFilter === filter ? "active" : ""}`} onClick={() => { setHistoryFilter(filter); setHistoryPage(1); }}>{filter}</button>
            ))}
          </div>
          <div>
            {historyLoading ? (
              <div className="history-row" style={{ justifyContent: "center", padding: "24px 0" }}>
                <span className="micro" style={{ color: "var(--muted)" }}>Loading...</span>
              </div>
            ) : rows.length ? rows.map((row, index) => (
              <div key={`${row.date}-${row.time}-${index}`} className="history-row">
                <span>{row.date}</span><span>{row.time}</span><span>{row.action}</span><span className="history-detail">{renderHistoryDetail(row.detail)}</span><b className={row.amount >= 0 ? "accent-gold" : "accent-red"}>{money(row.amount)}</b>
              </div>
            )) : (
              <div className="history-row" style={{ justifyContent: "center", padding: "24px 0" }}>
                <span className="micro" style={{ color: "var(--muted)" }}>No {historyFilter} history</span>
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

