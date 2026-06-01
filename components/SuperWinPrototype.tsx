"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  options: PredictionOption[];
};

type WinnerClaim = {
  id: string;
  month: string;
  rewardName: string;
  winnerName: string;
  winnerEmail: string;
  receiverName: string;
  phone: string;
  address: string;
  note: string;
  status: "pending" | "contacting" | "completed";
  trackingNumber: string;
};

type HistoryItem = {
  month: string;
  date: string;
  time: string;
  action: "Claim" | "Predict" | "Payout" | "Refund";
  detail: string;
  amount: number;
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
  }>;
  error?: string;
};

type ApiPredictResponse = {
  ok: boolean;
  data?: {
    user: { coinBalance: number; monthlyProfit: number; lifetimeProfit: number };
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
  season?: {
    startAt: string;
    endAt: string;
    status: string;
  };
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

type UserProfileStats = {
  name: string;
  seasonProfit: number;
  winRate: number;
  wonCount: number;
  lostCount: number;
  totalSettled: number;
  totalCoinsBet: number;
  totalCoinsWon: number;
  badge: string;
  badgeDesc: string;
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
    monthlyProfit: number;
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
      monthlyProfit: number;
      lifetimeProfit: number;
      lastClaimAt: string | null;
      nextClaimAt: string | null;
    };
  };
  error?: string;
};

type ApiHistoryResponse = {
  ok: boolean;
  data?: {
    rows: Array<HistoryItem & { id: string; balanceAfter: number }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
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
    reward: "ลุ้นติดอันดับ Season Top 10 วัดจากกำไรสุทธิประจำซีซั่น (Season Profit) ผู้ชนะอันดับ 1 จะได้รับของรางวัลพิเศษหลังแอดมินยืนยัน",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  reward: {
    name: "Season Prize",
    winnerBy: "Season Profit",
    month: "Season 1"
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  season: {
    startAt: "2026-05-01T00:00",
    endAt: "2026-05-31T17:00",
    status: "active"
  },
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the Season Top 10!"
};

const defaultHistory: HistoryItem[] = [
  { month: "May 2026", date: "26 May", time: "16:02", action: "Claim", detail: "Hourly reward", amount: 100 },
  { month: "May 2026", date: "26 May", time: "16:10", action: "Predict", detail: "Tournament: Super League · Question: Which team will win the championship? · Pick: Alpha Esports · Approx return: 185% · Status: Running", amount: -500 },
  { month: "May 2026", date: "26 May", time: "16:38", action: "Payout", detail: "Tournament: Super League · Question: Which team will win the championship? · Pick: Alpha Esports · Result: Won · Approx return: 185%", amount: 890 },
  { month: "April 2026", date: "22 Apr", time: "20:14", action: "Claim", detail: "Hourly reward", amount: 100 },
  { month: "April 2026", date: "22 Apr", time: "20:21", action: "Predict", detail: "Tournament: Global Open · Question: Which region will finish first? · Pick: SEA · Approx return: 210% · Status: Running", amount: -600 }
];

type LeaderboardRow = {
  id?: string;
  name: string;
  profit: number;
  isReal?: boolean;
  avatarUrl?: string | null;
};

const defaultLeaderboard: LeaderboardRow[] = [];

function money(amount: number) {
  return `${amount >= 0 ? "+" : ""}${amount}`;
}

function currentMonth() {
  return "May 2026";
}

function currentDateLabel() {
  return "26 May";
}

function currentTimeLabel() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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
  const [nextClaimAt, setNextClaimAt] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [coinInputs, setCoinInputs] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<HistoryItem[]>(defaultHistory);
  const [historyCache, setHistoryCache] = useState<Record<string, { rows: HistoryItem[]; totalPages: number }>>({});
  const [historyFilter, setHistoryFilter] = useState<"All" | HistoryItem["action"]>("All");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [running, setRunning] = useState<RunningPrediction[]>([]);
  const [questionDeadlines, setQuestionDeadlines] = useState<Record<string, number>>({});
  const [claimLabel, setClaimLabel] = useState("Ready");
  const [monthLabel, setMonthLabel] = useState("--");
  const [monthEndUtcLabel, setMonthEndUtcLabel] = useState("--");
  const [winnerClaim, setWinnerClaim] = useState<WinnerClaim | null>(null);
  const [openModal, setOpenModal] = useState<"history" | "running" | "info" | "claim" | null>(null);
  const [toast, setToast] = useState<Record<string, string>>({});
  const [accountStatus, setAccountStatus] = useState<"demo" | "loading" | "synced" | "error">("demo");
  const [accountRole, setAccountRole] = useState<"user" | "admin">("user");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>(defaultLeaderboard);
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [captchaNum1, setCaptchaNum1] = useState(0);
  const [captchaNum2, setCaptchaNum2] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);

  const generateCaptcha = () => {
    setCaptchaNum1(Math.floor(Math.random() * 9) + 1);
    setCaptchaNum2(Math.floor(Math.random() * 9) + 1);
    setCaptchaAnswer("");
    setReportError(null);
  };

  useEffect(() => {
    if (showReportForm) {
      generateCaptcha();
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
          num1: captchaNum1,
          num2: captchaNum2,
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
    setHistory(safeJson("sr_history", defaultHistory).slice(0, 500));
    setRunning(safeJson("sr_running", []));
    loadOpenPredictions().catch(() => undefined);
    loadSettings().catch(() => undefined);
    loadLeaderboard().catch(() => undefined);
  }, []);

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
        setProfit(user.monthlyProfit);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
        setAccountStatus("synced");
        loadHistory("All", 1);
        loadRunningPredictions().catch(() => undefined);
        loadWinnerClaim().catch(() => undefined);
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
    localStorage.setItem("sr_history", JSON.stringify(history.slice(0, 500)));
    localStorage.setItem("sr_running", JSON.stringify(running.slice(0, 30)));
  }, [coins, profit, nextClaimAt, history, running, mounted]);

  useEffect(() => {
    const tick = () => {
      const claimRemaining = nextClaimAt - Date.now();
      if (claimRemaining <= 0) {
        setClaimLabel("Ready");
      } else {
        const minutes = Math.floor(claimRemaining / 60000);
        const seconds = Math.floor((claimRemaining % 60000) / 1000);
        setClaimLabel(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      }

      const isSeasonEnded = settings.season?.status === "ended";
      if (isSeasonEnded) {
        setMonthLabel("Season Ended");
        setMonthEndUtcLabel("Next Season Starting Soon");
        return;
      }

      const now = new Date();
      const seasonEnd = settings.season?.endAt ? new Date(settings.season.endAt) : new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      const monthRemaining = Math.max(0, seasonEnd.getTime() - now.getTime());
      if (monthRemaining <= 0) {
        setMonthLabel("Season Ended");
        setMonthEndUtcLabel("Finalizing Standings");
        return;
      }

      const days = Math.floor(monthRemaining / 86400000);
      const hours = Math.floor((monthRemaining % 86400000) / 3600000);
      const minutes = Math.floor((monthRemaining % 3600000) / 60000);
      setMonthLabel(`${days}d ${hours}h ${minutes}m`);

      const bkkDay = String(seasonEnd.getDate()).padStart(2, "0");
      const bkkMonth = seasonEnd.toLocaleString("en-GB", { month: "short", timeZone: "Asia/Bangkok" });
      const bkkYear = seasonEnd.getFullYear();
      const bkkTime = seasonEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
      setMonthEndUtcLabel(`${bkkDay} ${bkkMonth} ${bkkYear} ${bkkTime} (GMT+7)`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [nextClaimAt, settings]);

  const leaderboard = useMemo(() => {
    let rows = [...leaderboardRows];
    if (isSignedIn && currentUserId) {
      rows = rows.map((row) => {
        if (row.id === currentUserId) {
          return { ...row, id: currentUserId, name: "You", profit } as LeaderboardRow;
        }
        return row;
      });
      if (!rows.some((row) => row.id === currentUserId || row.name === "You")) {
        rows.push({ id: currentUserId, name: "You", profit, isReal: true });
      }
    } else {
      rows = rows.map((row) => (row.name === "You" ? { ...row, profit } as LeaderboardRow : row));
    }
    return rows.sort((a, b) => b.profit - a.profit).slice(0, 10);
  }, [leaderboardRows, profit, isSignedIn, currentUserId]);

  const userRank = leaderboard.findIndex((row) => row.name === "You") + 1;

  const isSeasonEnded = settings.season?.status === "ended";
  const openQuestions = useMemo(() => {
    if (isSeasonEnded) return [];
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
  }, [liveQuestions, questionDeadlines, isSeasonEnded, settings.predictionOrder]);
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

  const filteredHistory = historyFilter === "All" ? history : history.filter((item) => item.action === historyFilter);
  const demoHistoryTotalPages = Math.max(1, Math.ceil(filteredHistory.length / 10));
  const activeHistoryTotalPages = isSignedIn ? historyTotalPages : demoHistoryTotalPages;
  const historyRows = isSignedIn ? filteredHistory : filteredHistory.slice((historyPage - 1) * 10, historyPage * 10);

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const payload = (await response.json()) as ApiSettingsResponse;
    if (response.ok && payload.ok && payload.data) {
      setSettings(payload.data);
    }
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

  async function handleOpenProfile(userId: string) {
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/leaderboard/profile?userId=${userId}`);
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setSelectedProfile(payload.data);
      }
    } catch {
      // ignore
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
        setProfit(user.monthlyProfit);
        setNextClaimAt(user.nextClaimAt ? new Date(user.nextClaimAt).getTime() : 0);
        setAccountRole(user.role);
        setCurrentUserId(user.id);
      }
    } catch {
      // ignore
    }
  }

  async function loadWinnerClaim() {
    if (!isSignedIn) return;
    const response = await fetch("/api/claims");
    const payload = await response.json();
    if (response.ok && payload.ok && payload.data) {
      setWinnerClaim(payload.data);
    } else {
      setWinnerClaim(null);
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
      options: item.options.map((option) => ({
        id: option.id,
        name: option.label,
        returns: option.estimatedReturnPercent
      }))
    }));

    setLiveQuestions(apiQuestions);
    setSelected(Object.fromEntries(apiQuestions.map((question) => [question.id, question.options[0]?.name || ""])));
    setQuestionDeadlines(Object.fromEntries(apiQuestions.map((question) => [question.id, new Date(question.closesAt || 0).getTime()])));
  }

  async function loadRunningPredictions() {
    if (!isSignedIn) return;
    const response = await fetch("/api/predictions/running");
    const payload = (await response.json()) as ApiRunningResponse;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error || "Failed to load running predictions");
    }
    setRunning(payload.data.map((item) => ({
      id: item.id,
      questionId: item.predictionId,
      tournamentName: item.tournamentName,
      question: item.question,
      answer: item.optionLabel,
      coins: item.amount,
      returns: item.estimatedReturnPercent || 0,
      createdAt: item.createdAt,
      status: "Running" as const
    })));
  }

  async function loadHistory(filter = historyFilter, page = historyPage, forceRefetch = false) {
    if (!isSignedIn) {
      const localRows = filter === "All" ? history : history.filter((item) => item.action === filter);
      setHistoryTotalPages(Math.max(1, Math.ceil(localRows.length / 10)));
      return;
    }

    const cacheKey = `${filter}-${page}`;
    if (!forceRefetch && historyCache[cacheKey]) {
      setHistory(historyCache[cacheKey].rows);
      setHistoryPage(page);
      setHistoryTotalPages(historyCache[cacheKey].totalPages);
      return;
    }

    const response = await fetch(`/api/history?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=10`);
    const payload = (await response.json()) as ApiHistoryResponse;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error || "Failed to load history");
    }

    const rows = payload.data.rows;
    const totalPages = payload.data.totalPages;
    const actualPage = payload.data.page;

    setHistoryCache((current) => ({
      ...current,
      [cacheKey]: { rows, totalPages }
    }));
    setHistory(rows);
    setHistoryPage(actualPage);
    setHistoryTotalPages(totalPages);
  }

  function selectedOption(question: Question) {
    return question.options.find((option) => option.name === selected[question.id]) || question.options[0];
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
    if (!loggedIn || Date.now() < nextClaimAt) return;

    if (isSignedIn) {
      try {
        const response = await fetch("/api/claim", { method: "POST" });
        const payload = (await response.json()) as ApiClaimResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Claim failed");
        }
        setCoins(payload.data.user.coinBalance);
        setProfit(payload.data.user.monthlyProfit);
        setNextClaimAt(payload.data.user.nextClaimAt ? new Date(payload.data.user.nextClaimAt).getTime() : 0);
        await loadHistory(historyFilter, historyPage, true);
      } catch {
        setAccountStatus("error");
      }
      return;
    }

    setCoins((current) => current + 100);
    setNextClaimAt(Date.now() + 60 * 60 * 1000);
    setHistory((current) => [
      { month: currentMonth(), date: currentDateLabel(), time: currentTimeLabel(), action: "Claim" as const, detail: "Hourly reward", amount: 100 },
      ...current
    ].slice(0, 500));
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
      try {
        const response = await fetch("/api/predictions/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ predictionId: question.id, optionId: answer.id, amount })
        });
        const payload = (await response.json()) as ApiPredictResponse;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Prediction failed");
        }
        setCoins(payload.data.user.coinBalance);
        setProfit(payload.data.user.monthlyProfit);
        setCoinInputs((current) => ({ ...current, [question.id]: 0 }));
        setToast((current) => ({ ...current, [question.id]: `${amount} coins used on ${answer.name} · now running` }));
        await loadRunningPredictions();
        await loadHistory(historyFilter, historyPage, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Prediction failed";
        setToast((current) => ({ ...current, [question.id]: message }));
      }
      return;
    }

    setCoins((current) => current - amount);
    setProfit((current) => current - amount);
    setHistory((current) => [
      {
        month: currentMonth(),
        date: currentDateLabel(),
        time: currentTimeLabel(),
        action: "Predict" as const,
        detail: `Tournament: ${question.tournament} · Question: ${question.title} · Pick: ${answer.name} · Approx return: ${answer.returns}% · Status: Running`,
        amount: -amount
      },
      ...current
    ].slice(0, 500));
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
                <span className="pill gold" style={{ fontSize: "16px", padding: "4px 16px", height: "36px", fontWeight: "bold", border: "1.5px solid var(--yellow)", boxShadow: "0 0 12px rgba(255, 225, 0, 0.3)" }}>
                  <span>{coins}</span> Coins
                </span>
                <span className="pill">{accountStatus === "synced" ? "Synced" : accountStatus === "loading" ? "Syncing" : accountStatus === "error" ? "Sync Error" : "Demo"}</span>
                {winnerClaim && (
                  <button className="button gold" onClick={() => setOpenModal("claim")} style={{ animation: "pulse 1.8s infinite" }}>
                    🎁 Claim Reward
                  </button>
                )}
                <button className="button primary" disabled={claimLabel !== "Ready"} onClick={claim}>Claim 100</button>
                <button className="button gold" onClick={() => setOpenModal("running")}>Running {running.length}</button>
                <button className="button gold" onClick={() => { setHistoryPage(1); setOpenModal("history"); }}>History</button>
                {accountRole === "admin" && <Link className="button gold" href="/admin">Admin</Link>}
                <UserButton />
              </>
            )}
            <button className="button gold" onClick={() => setOpenModal("info")}>Info</button>
          </div>
        </header>

        {(settings.announcement || "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the Season Top 10!") && (
          <div className="announcement-bar" style={{ 
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
            <div className="announcement-container">
              <div className="announcement-marquee">
                {settings.announcement || "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the Season Top 10!"}
              </div>
            </div>
          </div>
        )}

        {winnerClaim && (
          <div className="winner-banner" onClick={() => setOpenModal("claim")} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "var(--yellow-soft)", border: "1px solid var(--yellow)", borderRadius: "10px", padding: "10px 14px", margin: "4px 0 10px 0", fontSize: "11px", color: "var(--yellow)", fontWeight: "bold", textAlign: "center" }}>
            {winnerClaim.status === "pending" && (
              <span>🎉 CONGRATULATIONS! You won the {winnerClaim.month} {winnerClaim.rewardName}! Click here to enter your delivery address & claim your prize!</span>
            )}
            {winnerClaim.status === "contacting" && (
              <span>📦 Address submitted! Admins are packing your {winnerClaim.month} {winnerClaim.rewardName}. Click to review details.</span>
            )}
            {winnerClaim.status === "completed" && (
              <span>🏆 Prize delivered! Your {winnerClaim.month} {winnerClaim.rewardName} has been delivered successfully! (Click for details)</span>
            )}
          </div>
        )}

        {isSignedIn && (
        <section className="stats" aria-label="Account stats">
          <div className="stat"><span className="label">Season Profit</span><b className="value">{profit}</b></div>
          <div className="stat"><span className="label">Season Rank</span><b className="value">{userRank ? `#${userRank}` : "--"}</b></div>
          <div className="stat"><span className="label">Next Claim</span><b className="value">{claimLabel}</b></div>
          <div className="stat">
            <span className="label">Season Ends</span>
            <b className="value">{monthLabel}</b>
            <span className="meta" style={{ display: "block", marginTop: "3px", fontSize: "8.5px", letterSpacing: "0", opacity: 0.8 }}>{monthEndUtcLabel}</span>
          </div>
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
                    return (
                      <div key={question.id} className={`question ${isActive ? "active" : ""} ${runningCount ? "running" : ""}`} onClick={(event) => {
                        if ((event.target as HTMLElement).closest("button")) return;
                        setActiveQuestion(question.id);
                        setOpenDropdown(null);
                      }}>
                        <div className="question-top">
                          <span className="question-title">{question.title}</span>
                          <div className="question-sub-row">
                            <span className="meta">Closes in {formatQuestionCountdown(question)} · {formatQuestionCloseTime(question)}{runningCount ? ` · ${runningCount} running` : ""}</span>
                            <div className={`dropdown ${openDropdown === question.id ? "open" : ""}`}>
                              <button className="dropdown-trigger" onClick={(event) => {
                                event.stopPropagation();
                                setActiveQuestion(question.id);
                                setOpenDropdown(openDropdown === question.id ? null : question.id);
                              }}>
                                <span className="dropdown-label">{option.name} · ~{option.returns}%</span>
                              </button>
                              <div className="dropdown-menu">
                                {question.options.map((choice) => (
                                  <button key={choice.id} className={`option-button ${choice.name === option.name ? "active" : ""}`} onClick={(event) => {
                                    event.stopPropagation();
                                    setSelected((current) => ({ ...current, [question.id]: choice.name }));
                                    setOpenDropdown(null);
                                  }}>
                                    <span>{choice.name}</span><span className="return">~{choice.returns}%</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="question-action">
                          <div className="amounts">
                            {[5, 10, 50, 100, 500].map((amount) => (
                              <button key={amount} className="button gold" onClick={() => setCoinInputs((current) => ({ ...current, [question.id]: Number(current[question.id] || 0) + amount }))}>{amount}</button>
                            ))}
                          </div>
                          <span className="pill gold">{coinInputs[question.id] || 0} Coins</span>
                          <button className="button" onClick={() => setCoinInputs((current) => ({ ...current, [question.id]: 0 }))}>Clear</button>
                          <button className="button primary confirm" onClick={() => confirmPrediction(question)}>Predict</button>
                        </div>
                        <div className="toast">{toast[question.id]}</div>
                      </div>
                    );
                  })}
                </div>
              )) : (
                <div className="question">
                  <span className="question-title">{isSeasonEnded ? "The season has ended!" : "No open questions"}</span>
                  <span className="meta">{isSeasonEnded ? "We are currently finalizing the leaderboard rankings and preparing the rewards. Please stay tuned for the next season!" : "Submitted predictions are waiting in Running"}</span>
                </div>
              )}
            </div>
          </section>

          <aside className="side">
            <section className="panel">
              <div className="panel-head"><h3>Season Top 10</h3><span className="micro">Profit this season</span></div>
              <div className="leaderboard-body">
                {leaderboard.map((row, index) => {
                  const targetId = row.id || (row.name === "You" ? currentUserId : null);
                  const isClickable = isSignedIn && targetId;
                  const avatarUrl = row.name === "You" ? (clerkUser?.imageUrl || row.avatarUrl) : row.avatarUrl;
                  return (
                    <div 
                      key={row.name} 
                      className="rank" 
                      onClick={() => isClickable && handleOpenProfile(targetId)}
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
                      </div>
                      <b>{money(row.profit)}</b>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h3>Prize</h3><span className="micro">Rank 1</span></div>
              <div className="reward">
                <div className="reward-line"><span>Season</span><b className="accent-gold">{settings.reward.month}</b></div>
                <div className="reward-line"><span>Reward</span><b className="accent-gold">{settings.reward.name}</b></div>
                <div className="reward-line"><span>Winner by</span><b className="accent-gold">{settings.reward.winnerBy}</b></div>
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
                          <span style={{ fontWeight: "bold", color: "var(--text-strong)" }}>{captchaNum1} + {captchaNum2} =</span>
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

      {openModal === "history" && <HistoryModal historyRows={historyRows} historyFilter={historyFilter} historyPage={historyPage} historyTotalPages={activeHistoryTotalPages} setHistoryFilter={(value) => { setHistoryFilter(value); setHistoryPage(1); if (isSignedIn) loadHistory(value, 1, true).catch(() => setAccountStatus("error")); }} setHistoryPage={(value) => { setHistoryPage(value); if (isSignedIn) loadHistory(historyFilter, value).catch(() => setAccountStatus("error")); }} onClose={() => setOpenModal(null)} />}
      {openModal === "running" && <RunningModal running={running} onClose={() => setOpenModal(null)} />}
      {openModal === "info" && <InfoModal settings={settings} onClose={() => setOpenModal(null)} />}
      {openModal === "claim" && winnerClaim && (
        <ClaimModal claim={winnerClaim} onClaimSubmitted={(updatedClaim) => { setWinnerClaim(updatedClaim); setOpenModal(null); }} onClose={() => setOpenModal(null)} />
      )}
      {selectedProfile && (
        <ProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} />
      )}
    </main>
  );
}

function renderHistoryDetail(detail: string) {
  return detail.split(" · ").map((part) => (
    <span key={part}>{part}</span>
  ));
}

function HistoryModal({
  historyRows,
  historyFilter,
  historyPage,
  historyTotalPages,
  setHistoryFilter,
  setHistoryPage,
  onClose
}: {
  historyRows: HistoryItem[];
  historyFilter: "All" | HistoryItem["action"];
  historyPage: number;
  historyTotalPages: number;
  setHistoryFilter: (value: "All" | HistoryItem["action"]) => void;
  setHistoryPage: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <section className="modal open" aria-label="Coin history" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Coin History</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="filter-row">
            {(["All", "Predict", "Claim", "Payout"] as const).map((filter) => (
              <button key={filter} className={`button ${historyFilter === filter ? "active" : ""}`} onClick={() => { setHistoryFilter(filter); setHistoryPage(1); }}>{filter}</button>
            ))}
          </div>
          <div>
            {historyRows.length ? historyRows.map((row, index) => (
              <div key={`${row.date}-${row.time}-${index}`} className="history-row">
                <span>{row.date}</span><span>{row.time}</span><span>{row.action}</span><span className="history-detail">{renderHistoryDetail(row.detail)}</span><b className={row.amount >= 0 ? "accent-gold" : "accent-red"}>{money(row.amount)}</b>
              </div>
            )) : <div className="history-row"><span>No {historyFilter} history</span><b className="accent-gold">0</b></div>}
          </div>
          <div className="history-footer">
            <button className="button" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Prev</button>
            <span className="micro">Page {historyPage} / {historyTotalPages}</span>
            <button className="button" disabled={historyPage >= historyTotalPages} onClick={() => setHistoryPage(historyPage + 1)}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RunningModal({ running, onClose }: { running: RunningPrediction[]; onClose: () => void }) {
  return (
    <section className="modal open" aria-label="Running predictions" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head"><h3>Running Predictions</h3><button className="button" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="running-list">
            {running.length ? running.map((item) => {
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
                    <span className="meta">{item.answer} · {item.coins} Coins · Predict time: {formattedDate}</span>
                  </div>
                  <b className="running-label">Running</b>
                </div>
              );
            }) : <div className="running-row"><span>No running predictions</span><b className="accent-gold">0</b></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoModal({ settings, onClose }: { settings: SiteSettings; onClose: () => void }) {
  return (
    <section className="modal open" aria-label="Game information" onClick={(event) => event.target === event.currentTarget && onClose()}>
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

function ClaimModal({
  claim,
  onClaimSubmitted,
  onClose
}: {
  claim: WinnerClaim;
  onClaimSubmitted: (updatedClaim: WinnerClaim) => void;
  onClose: () => void;
}) {
  const [receiverName, setReceiverName] = useState(claim.receiverName || "");
  const [phone, setPhone] = useState(claim.phone || "");
  const [address, setAddress] = useState(claim.address || "");
  const [note, setNote] = useState(claim.note || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiverName.trim() || !phone.trim() || !address.trim()) {
      setError("Please fill out Name, Phone and Address fields.");
      return;
    }
    setLoading(false);
    setError("");
    try {
      const response = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverName,
          phone,
          address,
          note
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to submit shipping details");
      }
      onClaimSubmitted(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="modal open" aria-label="Claim Reward" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "520px" }}>
        <div className="modal-head">
          <h3>Claim Reward · {claim.month}</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "14px" }}>
          {error && <div style={{ color: "#ff4d4f", fontSize: "11px", fontWeight: "bold" }}>⚠️ {error}</div>}

          <div className="info-block" style={{ background: "var(--card)" }}>
            <h4 style={{ color: "var(--yellow)", margin: "0 0 4px 0" }}>Reward Information</h4>
            <span style={{ fontSize: "12px", color: "var(--text)" }}>Month: <strong>{claim.month}</strong></span>
            <span style={{ fontSize: "12px", color: "var(--text)" }}>Reward: <strong>{claim.rewardName}</strong></span>
            <span style={{ fontSize: "12px", color: "var(--text)" }}>Winner Account: <strong>{claim.winnerName}</strong></span>
          </div>

          {claim.status === "pending" ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "4px" }}>
                <span className="meta" style={{ color: "var(--yellow)" }}>Receiver Full Name (ชื่อ-นามสกุลจริงผู้รับ)</span>
                <input value={receiverName} onChange={(event) => setReceiverName(event.target.value)} placeholder="Full Name" required style={{ height: "34px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px", padding: "0 10px", color: "#fff" }} />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span className="meta" style={{ color: "var(--yellow)" }}>Contact Phone Number (เบอร์โทรศัพท์)</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone Number" required style={{ height: "34px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px", padding: "0 10px", color: "#fff" }} />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span className="meta" style={{ color: "var(--yellow)" }}>Shipping Address (ที่อยู่จัดส่งโดยละเอียด)</span>
                <textarea rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter full shipping address, subdistrict, district, province, postal code" required style={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px", padding: "8px 10px", color: "#fff" }} />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <span className="meta" style={{ color: "var(--yellow)" }}>Note to Admin (หมายเหตุถึงแอดมิน - ถ้ามี)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" style={{ height: "34px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px", padding: "0 10px", color: "#fff" }} />
              </div>
              <button className="button gold" type="submit" disabled={loading} style={{ height: "38px", marginTop: "8px", borderRadius: "999px" }}>
                {loading ? "Submitting..." : "Submit Shipping Address & Claim Reward"}
              </button>
            </form>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifySelf: "center", gap: "8px", padding: "10px 16px", background: claim.status === "completed" ? "rgba(14, 203, 129, 0.14)" : "var(--yellow-soft)", border: claim.status === "completed" ? "1px solid var(--green)" : "1px solid var(--yellow)", borderRadius: "8px", width: "100%", justifyContent: "center" }}>
                <span style={{ fontSize: "20px" }}>{claim.status === "completed" ? "🏆" : "📦"}</span>
                <div style={{ display: "grid" }}>
                  <strong style={{ color: claim.status === "completed" ? "var(--green)" : "var(--yellow)", fontSize: "13px" }}>
                    Status: {claim.status === "completed" ? "Delivered Successfully" : "Preparing Shipment"}
                  </strong>
                  {claim.status === "completed" && claim.trackingNumber && (
                    <span style={{ fontSize: "11px", color: "var(--text-strong)" }}>
                      Shipping Details: <strong>{claim.trackingNumber}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="info-block" style={{ background: "var(--card)", gap: "6px" }}>
                <h4 style={{ color: "var(--yellow)", margin: "0 0 4px 0" }}>Submitted Delivery Details</h4>
                <span style={{ fontSize: "11px", color: "var(--text)" }}>Receiver: <strong>{claim.receiverName}</strong></span>
                <span style={{ fontSize: "11px", color: "var(--text)" }}>Phone: <strong>{claim.phone}</strong></span>
                <span style={{ fontSize: "11px", color: "var(--text)", lineHeight: "1.4" }}>Address: <strong>{claim.address}</strong></span>
                {claim.note && <span style={{ fontSize: "11px", color: "var(--text)" }}>Note: <i>{claim.note}</i></span>}
              </div>
            </div>
          )}
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
    <section className="modal open" aria-label="User Profile" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: "480px" }}>
        <div className="modal-head">
          <h3>🎮 {profile.name}'s Profile</h3>
          <button className="button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body" style={{ gap: "12px" }}>
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
              <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>SEASON PROFIT</span>
              <strong style={{ display: "block", fontSize: "18px", color: profile.seasonProfit >= 0 ? "var(--green)" : "var(--red)", marginTop: "4px" }}>
                {profile.seasonProfit >= 0 ? "+" : ""}{profile.seasonProfit}
              </strong>
              <span className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "none", marginTop: "2px", display: "block" }}>
                Total settled: {profile.totalSettled}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div className="info-block" style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
              <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>TOTAL COINS BET</span>
              <strong style={{ display: "block", fontSize: "14px", color: "var(--text-strong)", marginTop: "4px" }}>
                {profile.totalCoinsBet}
              </strong>
            </div>
            <div className="info-block" style={{ padding: "10px", background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "8px" }}>
              <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>TOTAL COINS WON</span>
              <strong style={{ display: "block", fontSize: "14px", color: "var(--yellow)", marginTop: "4px" }}>
                {profile.totalCoinsWon}
              </strong>
            </div>
          </div>

          {/* Last 5 Settled Predictions */}
          <div style={{ display: "grid", gap: "6px" }}>
            <h4 className="meta" style={{ color: "var(--yellow)", fontSize: "11px", margin: "4px 0" }}>⚡ Last 5 Settled Predictions</h4>
            {!profile.history || profile.history.length === 0 ? (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)", fontSize: "11px" }}>
                No settled predictions found for this season.
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
                        {h.status === "won" ? `+${h.payout}` : `-${h.amount}`}
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
        </div>
      </div>
    </section>
  );
}

