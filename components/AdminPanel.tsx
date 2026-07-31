"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AdminPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  feeRate: number;
  createdAt: string;
  entryCount: number;
  createdByUserId?: string | null;
  options: { id: string; label: string; sortOrder: number }[];
};

type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin";
  createdAt: string;
};

type DashboardPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  closesAt: string | null;
  createdAt: string;
  sponsorPool: number;
  userPoolCoins: number;
  totalPoolCoins: number;
  uniquePlayers: number;
  optionStats: {
    id: string;
    label: string;
    totalCoins: number;
    playerCount: number;
    multiplier: number;
  }[];
  playerBets: {
    id: string;
    email: string;
    displayName: string;
    userId?: string;
    optionLabel: string;
    amount: number;
    createdAt: string;
  }[];
  winningOptionId?: string | null;
};

type TournamentItem = {
  name: string;
  logoUrl: string;
  archived?: boolean;
};

type SiteSettings = {
  info: {
    content: string;
  };
  tournaments: (string | TournamentItem)[];
  savedQuestions: string[];
  savedRounds: string[];
  predictionOrder?: string[];
  announcement?: string;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type OptionSet = {
  id: string;
  name: string;
  options: string[];
  createdAt: string;
};

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function displayDate(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok"
  });
}

function statusLabel(status: string) {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  if (status === "resolved") return "Resolved";
  if (status === "canceled") return "Canceled";
  if (status === "draft") return "Draft";
  return status;
}

const defaultSettings: SiteSettings = {
  info: {
    content: "Login → Claim free coins every hour → Choose your team prediction → Enter coin amount and confirm your bet\n\nEach question has an independent countdown timer. When it closes, the admin resolves and distributes prize coins immediately"
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  savedRounds: [
    "รอบแบ่งกลุ่ม",
    "รอบ 16 ทีมสุดท้าย",
    "รอบกอนรองชนะเลิศ",
    "รอบชิงชนะเลิศ"
  ],
  announcement: "Welcome to SUPERWIN HUB! Claim your free coins every hour and predict live matches to reach the All time Top 10!"
};

function isRunningNow(item: AdminPrediction) {
  if (item.status !== "open") return false;
  if (!item.closesAt) return true;
  return new Date(item.closesAt).getTime() > Date.now();
}

function isPendingResult(item: AdminPrediction) {
  if (item.status === "closed") return true;
  if (item.status === "open") {
    if (!item.closesAt) return false;
    return new Date(item.closesAt).getTime() <= Date.now();
  }
  return false;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const targetUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const response = await fetch(targetUrl, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const shortText = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`API ${url} did not return JSON (status ${response.status}, type ${contentType || "none"}) ${shortText}`);
  }
  const payload = (await response.json()) as ApiResponse<T>;
  // For write operations (POST/PATCH/DELETE), only check response.ok and payload.ok
  // For read operations (GET), also require payload.data
  const isReadOperation = !init?.method || init.method.toUpperCase() === "GET";
  if (!response.ok || !payload.ok || (isReadOperation && payload.data === undefined)) {
    // Include validation details if available
    const detailStr = (payload as any).details?.length
      ? `\n→ ${(payload as any).details.join(", ")}`
      : "";
    throw new Error(`API ${url}: ${payload.error || "Request failed"}${detailStr}`);
  }
  return (payload.data ?? {}) as T;
}

function getTournamentInfo(t: string | TournamentItem) {
  if (typeof t === "string") return { name: t, logoUrl: "", archived: false };
  return { name: t.name, logoUrl: t.logoUrl || "", archived: t.archived || false };
}

export default function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [allPredictions, setAllPredictions] = useState<AdminPrediction[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setmessage] = useState("");
  const [tournamentName, setTournamentName] = useState("");
  const [question, setQuestion] = useState("");
  const [round, setRound] = useState("");
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(new Date()));
  const [closesAt, setClosesAt] = useState(toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [feeRate, setFeeRate] = useState("0.03");
  const [optionInput, setOptionInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [newTournamentInput, setNewTournamentInput] = useState("");
  const [newTournamentLogoUrl, setNewTournamentLogoUrl] = useState("");
  const [optionsBulkInput, setOptionsBulkInput] = useState("");
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardPrediction[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [selectedDashboardTournament, setSelectedDashboardTournament] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>([]);
  const [savedOptionSets, setSavedOptionSets] = useState<OptionSet[]>([]);
  const [showSaveOptionSet, setShowSaveOptionSet] = useState(false);
  const [optionSetNameInput, setOptionSetNameInput] = useState("");
  const [editingOptionSetId, setEditingOptionSetId] = useState<string | null>(null);
  const [editOptionSetNameInput, setEditOptionSetNameInput] = useState("");
  const [winningOptions, setWinningOptions] = useState<Record<string, string>>({});
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editTemplateInput, setEditTemplateInput] = useState("");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [showArchived, setShowArchived] = useState(false);
  const [topUsers, setTopUsers] = useState<Array<{ id: string; email: string; displayName: string; lifetimeProfit?: number }>>([]);
  const [editClosesAt, setEditClosesAt] = useState<Record<string, string>>({});
  const [editQuestions, setEditQuestions] = useState<Record<string, string>>({});
  const [editOptionsInputs, setEditOptionsInputs] = useState<Record<string, Record<string, string>>>({}); // deprecated — options are now locked
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTournamentNames, setEditTournamentNames] = useState<Record<string, string>>({});

  // ── Payout breakdown for resolved predictions ──
  interface PayoutParticipant {
    userId: string;
    userName: string;
    optionId: string | null;
    optionLabel: string;
    betAmount: number;
    status: string;
    payoutAmount: number;
    insuranceCost: number;
    insuranceRefund: number;  // Add this field
    hasInsurance: boolean;
  }
  interface PayoutSummary {
    totalPool: number;
    userPool: number;
    sponsorPool: number;
    feeRate: number;
    feeTaken: number;
    distributablePool: number;
    totalDistributed: number;
    totalInsuranceRefunded: number;
    winnersCount: number;
    losersCount: number;
    entryCount: number;
    verificationOk: boolean;
    roundingDifference: number;
  }
  interface PayoutData {
    prediction: { id: string; question: string; tournamentName: string; winningOptionLabel: string | null };
    summary: PayoutSummary;
    participants: PayoutParticipant[];
  }
  const [expandedPayoutId, setExpandedPayoutId] = useState<string | null>(null);
  const [payoutDetails, setPayoutDetails] = useState<Record<string, PayoutData>>({});
  const [payoutLoading, setPayoutLoading] = useState<Record<string, boolean>>({});

  async function togglePayoutDetails(predictionId: string) {
    if (expandedPayoutId === predictionId) {
      setExpandedPayoutId(null);
      return;
    }
    setExpandedPayoutId(predictionId);
    if (payoutDetails[predictionId]) return; // already loaded
    setPayoutLoading((prev) => ({ ...prev, [predictionId]: true }));
    try {
      const res = await fetch(`/api/admin/predictions/${predictionId}/payouts`);
      const payload = await res.json();
      if (res.ok && payload.ok && payload.data) {
        setPayoutDetails((prev) => ({ ...prev, [predictionId]: payload.data }));
      } else {
        console.error("[Payouts]", payload.error);
      }
    } catch (err) {
      console.error("[Payouts] fetch error", err);
    } finally {
      setPayoutLoading((prev) => ({ ...prev, [predictionId]: false }));
    }
  }

  // ── Admin panel tabs ──
  const [activeTab, setActiveTab] = useState<"questions" | "running" | "settings" | "admins" | "tournaments" | "dashboard" | "reports" | "users" | "contests">("dashboard");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSort, setUserSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [userPage, setUserPage] = useState(1);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [contests, setContests] = useState<any[]>([]);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [showNewContestForm, setShowNewContestForm] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeScheduleStart, setYoutubeScheduleStart] = useState("");
  const [youtubeScheduleEnd, setYoutubeScheduleEnd] = useState("");
  const [youtubeOpenNow, setYoutubeOpenNow] = useState(false);
  const [frontendEnabled, setFrontendEnabled] = useState(true);


  const [showEditContestForm, setShowEditContestForm] = useState(false);
  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [newContestName, setNewContestName] = useState("");
  const [newContestDescription, setNewContestDescription] = useState("");
  const [newContestEndTime, setNewContestEndTime] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [newContestPrize1, setNewContestPrize1] = useState("");
  const [newContestPrize2, setNewContestPrize2] = useState("");
  const [newContestPrize3, setNewContestPrize3] = useState("");
  const [newContestPrize4, setNewContestPrize4] = useState("");
  const [newContestPrize5, setNewContestPrize5] = useState("");

  async function handleCreateContest() {
    if (!newContestName.trim() || !newContestEndTime || !newContestPrize1.trim()) {
      alert("Please fill in all required fields (Contest Name, End Time, 1st Prize)");
      return;
    }
    try {
      const response = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newContestName.trim(),
          description: newContestDescription.trim(),
          end_time: newContestEndTime.replace(" ", "T") + ":00", // GMT+7
          prize_1: newContestPrize1.trim(),
          prize_2: newContestPrize2.trim() || null,
          prize_3: newContestPrize3.trim() || null,
          prize_4: newContestPrize4.trim() || null,
          prize_5: newContestPrize5.trim() || null,
        }),
      });
      const payload = await response.json();
      if (payload.ok) {
        setShowNewContestForm(false);
        setNewContestName("");
        setNewContestDescription("");
        setNewContestEndTime(() => {
          const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 16);
        });
        setNewContestPrize1("");
        setNewContestPrize2("");
        setNewContestPrize3("");
        setNewContestPrize4("");
        setNewContestPrize5("");
        loadContests();
      } else {
        alert("Failed to create contest: " + (payload.error || ""));
      }
    } catch {
      alert("Failed to create contest");
    }
  }

  async function handleEditContest() {
    if (!newContestName.trim() || !newContestEndTime || !newContestPrize1.trim()) {
      alert("Please fill in all required fields (Contest Name, End Time, 1st Prize)");
      return;
    }
    if (!editingContestId) {
      alert("No contest found to edit");
      return;
    }
    try {
      const response = await fetch("/api/admin/contests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingContestId,
          name: newContestName.trim(),
          description: newContestDescription.trim(),
          end_time: newContestEndTime.replace(" ", "T") + ":00", // GMT+7
          prize_1: newContestPrize1.trim(),
          prize_2: newContestPrize2.trim() || null,
          prize_3: newContestPrize3.trim() || null,
          prize_4: newContestPrize4.trim() || null,
          prize_5: newContestPrize5.trim() || null,
        }),
      });
      const payload = await response.json();
      if (payload.ok) {
        setShowEditContestForm(false);
        setEditingContestId(null);
        setNewContestName("");
        setNewContestDescription("");
        setNewContestEndTime(() => {
          const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 16);
        });
        setNewContestPrize1("");
        setNewContestPrize2("");
        setNewContestPrize3("");
        setNewContestPrize4("");
        setNewContestPrize5("");
        loadContests();
      } else {
        alert("Failed to edit contest: " + (payload.error || ""));
      }
    } catch {
      alert("Failed to edit contest");
    }
  }

  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setmessage("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Load saved option sets from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("superwin_option_sets");
      if (raw) setSavedOptionSets(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    const list = predictions.filter(isRunningNow);
    const order = settings.predictionOrder || [];
    const sorted = [...list].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    setLocalOrder(sorted.map(p => p.id));
  }, [predictions, settings.predictionOrder]);

  const sortedRunningPredictions = useMemo(() => {
    const list = predictions.filter(isRunningNow);
    return [...list].sort((a, b) => {
      const idxA = localOrder.indexOf(a.id);
      const idxB = localOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [predictions, localOrder]);

  const runningPredictions = useMemo(() => predictions.filter(isRunningNow), [predictions]);
  const pendingPredictions = useMemo(() => predictions.filter(isPendingResult), [predictions]);
  const resolvedPredictions = useMemo(() => predictions.filter((item) => item.status === "resolved"), [predictions]);

  // ── Pagination for Running Questions ──
  const [runningPage, setRunningPage] = useState(1);
  const [runningTournamentFilter, setRunningTournamentFilter] = useState("");
  const MAX_HISTORY_PAGES = 10;
  const runningPageSize = 5;

  const filteredRunningPredictions = useMemo(() => {
    if (!runningTournamentFilter) return [];
    return sortedRunningPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [sortedRunningPredictions, runningTournamentFilter]);

  const runningTotalPages = Math.max(1, Math.min(MAX_HISTORY_PAGES, Math.ceil(filteredRunningPredictions.length / runningPageSize)));
  const currentRunning = useMemo(() => {
    const start = (runningPage - 1) * runningPageSize;
    return filteredRunningPredictions.slice(start, start + runningPageSize);
  }, [filteredRunningPredictions, runningPage]);

  useEffect(() => {
    setRunningPage(1);
  }, [runningTournamentFilter]);

  // ── Pagination for Awaiting Results ──
  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 5;
  const filteredPendingPredictions = useMemo(() => {
    if (!runningTournamentFilter) return pendingPredictions;
    return pendingPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [pendingPredictions, runningTournamentFilter]);
  const pendingTotalPages = Math.max(1, Math.min(MAX_HISTORY_PAGES, Math.ceil(filteredPendingPredictions.length / pendingPageSize)));
  const currentPending = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return filteredPendingPredictions.slice(start, start + pendingPageSize);
  }, [filteredPendingPredictions, pendingPage]);

  useEffect(() => { setPendingPage(1); }, [runningTournamentFilter]);

  // ── Pagination for Resolved Questions ──
  const [resolvedPage, setResolvedPage] = useState(1);
  const resolvedPageSize = 5;
  const filteredResolvedPredictions = useMemo(() => {
    if (!runningTournamentFilter) return resolvedPredictions;
    return resolvedPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [resolvedPredictions, runningTournamentFilter]);
  const resolvedTotalPages = Math.max(1, Math.min(MAX_HISTORY_PAGES, Math.ceil(filteredResolvedPredictions.length / resolvedPageSize)));
  const currentResolved = useMemo(() => {
    const start = (resolvedPage - 1) * resolvedPageSize;
    return filteredResolvedPredictions.slice(start, start + resolvedPageSize);
  }, [filteredResolvedPredictions, resolvedPage]);

  useEffect(() => { setResolvedPage(1); }, [runningTournamentFilter]);

  // ── Pagination for All Questions ──
  const [allPage, setAllPage] = useState(1);
  const allPageSize = 5;
  const allTotalPages = Math.max(1, Math.ceil(predictions.length / allPageSize));
  const currentAll = useMemo(() => {
    const start = (allPage - 1) * allPageSize;
    return predictions.slice(start, start + allPageSize);
  }, [predictions, allPage]);


  async function loadPredictions() {
    const data = await requestJson<AdminPrediction[]>("/api/admin/predictions");
    setPredictions(data);
    setAllPredictions(data);
  }

  async function loadAllPredictions() {
    const data = await requestJson<AdminPrediction[]>("/api/admin/predictions");
    setAllPredictions(data);
  }

  async function loadAdmins() {
    const data = await requestJson<any[]>("/api/admin/users");
    const adminsOnly = data
      .filter((u) => u.isAdmin)
      .map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.name || null,
        role: "admin" as const,
        createdAt: u.createdAt || new Date().toISOString(),
      }));
    setAdmins(adminsOnly);
  }

  async function loadSettings() {
    const data = await requestJson<SiteSettings>("/api/admin/settings");
    setSettings(data);
  }

  async function loadTopUsers() {
    const data = await requestJson<Array<{ id: string; email: string; displayName: string }>>("/api/admin/leaderboard");
    setTopUsers(data);
  }

  async function loadDashboardData() {
    const data = await requestJson<DashboardPrediction[]>("/api/admin/dashboard");
    setDashboardData(data);
    if (data.length > 0) {
      if (!selectedDashboardTournament) {
        setSelectedDashboardTournament(data[0].tournamentName);
      }
      // NOTE: Do NOT auto-initialize tournamentName from dashboard data.
      // That caused bugs where new questions were saved under the wrong tournament
      // (data[0] = newest prediction, not necessarily the desired tournament).
      // Admin must explicitly select a tournament from the dropdown.
    }
  }

  async function loadReports() {
    try {
      setReportsLoading(true);
      const response = await fetch("/api/admin/reports");
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setReports(payload.data);
      }
    } catch {
      // Ignored
    } finally {
      setReportsLoading(false);
    }
  }

  async function loadContests() {
    try {
      setContestsLoading(true);
      const response = await fetch("/api/admin/contests");
      const payload = await response.json();
      if (response.ok && payload.ok && payload.data) {
        setContests(payload.data);
      }
    } catch {
      // Ignored
    } finally {
      setContestsLoading(false);
    }
  }

  async function handleUpdateReport(id: string, status: "pending" | "resolved", isDelete = false) {
    try {
      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, delete: isDelete })
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        await loadReports();
      } else {
        alert(payload.error || "Action failed");
      }
    } catch {
      alert("Network error occurred");
    }
  }


  async function reloadAll() {
    await Promise.all([loadPredictions(), loadAdmins(), loadSettings(), loadTopUsers(), loadDashboardData()]);
  }

  useEffect(() => {
    reloadAll().catch((error) => setmessage(error.message));
  }, []);

  async function loadYoutubeEmbed() {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.ok && json.data) {
        // Load YouTube embed code or URL
        if (json.data.youtube_embed?.embed_code) {
          // Try to extract URL from embed code for display
          const urlMatch = json.data.youtube_embed.embed_code.match(/src="([^"]+)"/);
          if (urlMatch) {
            setYoutubeUrl(urlMatch[1]);
          }
        }
        // Load YouTube URL directly (new format)
        if (json.data.youtube_embed?.url) {
          setYoutubeUrl(json.data.youtube_embed.url);
        }
        // Load open_now flag
        if (json.data.youtube_embed?.open_now !== undefined) {
          setYoutubeOpenNow(!!json.data.youtube_embed.open_now);
        }
        // Load schedule times (convert UTC back to Thai local for datetime-local input)
        if (json.data.youtube_embed?.schedule_start) {
          const start = new Date(json.data.youtube_embed.schedule_start);
          if (!isNaN(start.getTime())) {
            setYoutubeScheduleStart(toLocalDateTimeInput(start));
          } else {
            setYoutubeScheduleStart(json.data.youtube_embed.schedule_start);
          }
        }
        if (json.data.youtube_embed?.schedule_end) {
          const end = new Date(json.data.youtube_embed.schedule_end);
          if (!isNaN(end.getTime())) {
            setYoutubeScheduleEnd(toLocalDateTimeInput(end));
          } else {
            setYoutubeScheduleEnd(json.data.youtube_embed.schedule_end);
          }
        }
        // Load frontend features enabled state
        if (json.data.frontend_features !== undefined) {
          setFrontendEnabled(!!json.data.frontend_features.enabled);

        }
      }
    } catch (e) {
      console.error('Failed to load YouTube embed:', e);
    }
  }

  async function saveFrontendSettings() {
    try {
      // Build youtube_embed object to save separately
      const youtubeEmbedValue: Record<string, any> = {};
      if (youtubeUrl.trim()) {
        youtubeEmbedValue.url = youtubeUrl.trim();
        youtubeEmbedValue.open_now = youtubeOpenNow;
        if (!youtubeOpenNow && youtubeScheduleStart) {
          youtubeEmbedValue.schedule_start = youtubeScheduleStart;
        }
        if (youtubeScheduleEnd) {
          youtubeEmbedValue.schedule_end = youtubeScheduleEnd;
        }
      }

      // Use PATCH to save multiple keys at once
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontend_features: { enabled: frontendEnabled },
          ...(Object.keys(youtubeEmbedValue).length > 0 ? { youtube_embed: youtubeEmbedValue } : {}),
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.ok) {
        alert('Frontpage Settings saved successfully');
      } else {
        alert('Save failed: ' + (payload.error || res.status));
      }
    } catch (e: any) {
      alert('An error occurred: ' + (e?.message || String(e)));
    }
  }

  // Convert YouTube URL to embed iframe code
  function youtubeUrlToEmbed(url: string): string {
    const trimmed = url.trim();
    let videoId = "";

    // Match various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        videoId = match[1];
        break;
      }
    }

    if (!videoId) {
      return trimmed; // Return as-is if we can't extract video ID
    }

    return `<iframe width="720" height="405" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  /** Convert datetime-local value (Thai time) to UTC ISO string for storage */
  function thaiLocalToUTC(datetimeLocal: string): string {
    if (!datetimeLocal) return "";
    // datetime-local gives "2026-07-30T20:00" without timezone
    // Treat it as Thai time (UTC+7) and convert to UTC
    const [datePart, timePart] = datetimeLocal.split("T");
    if (!datePart || !timePart) return datetimeLocal;
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
    return utcDate.toISOString();
  }

  /** Convert UTC Date object to datetime-local format (Thai local time for input display) */
  function toLocalDateTimeInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  async function saveYoutubeEmbed(e?: React.FormEvent) {
    if (e) e.preventDefault();
    try {
      const embedCode = youtubeUrlToEmbed(youtubeUrl);
      const scheduleData: any = {
        enabled: true,
        url: youtubeUrl,
        embed_code: embedCode,
      };
      // Mode 1: Open now — clear start time (shows immediately), keep end time if set
      if (youtubeOpenNow) {
        scheduleData.schedule_start = "";
        scheduleData.schedule_end = youtubeScheduleEnd ? thaiLocalToUTC(youtubeScheduleEnd) : "";
      } else {
        // Mode 2: Scheduled — use both start and end times (convert Thai local to UTC)
        scheduleData.schedule_start = youtubeScheduleStart ? thaiLocalToUTC(youtubeScheduleStart) : "";
        scheduleData.schedule_end = youtubeScheduleEnd ? thaiLocalToUTC(youtubeScheduleEnd) : "";
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'youtube_embed', value: scheduleData }),
      });
      if (res.ok) {
        alert('Saved successfully');
      } else {
        alert('Save failed');
      }
    } catch {
      alert('An error occurred');
    }
  }

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    loadYoutubeEmbed();
    loadDashboardData().catch(() => undefined);
    const timer = setInterval(() => {
      loadDashboardData().catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [activeTab]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await requestJson<any[]>("/api/admin/users");
      setUsers(data);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "users") loadUsers().catch(() => undefined);
  }, [activeTab]);

  function addOption() {
    const next = optionInput.trim();
    if (!next) return;
    setDraftOptions((current) => [...current, next]);
    setOptionInput("");
  }

  function removeOption(index: number) {
    setDraftOptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function usePreviousOptions() {
    const latest = [...predictions].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })[0];
    if (!latest || !latest.options.length) {
      setmessage("No previous question found");
      return;
    }
    const labels = latest.options.sort((a, b) => a.sortOrder - b.sortOrder).map((o) => o.label);
    setDraftOptions(labels);
    setmessage(`Loaded options from previous question: ${latest.question}`);
  }

  // ── Option Set management ───────────────────────
  function persistOptionSets(sets: OptionSet[]) {
    setSavedOptionSets(sets);
    localStorage.setItem("superwin_option_sets", JSON.stringify(sets));
  }

  function saveOptionSet() {
    const name = optionSetNameInput.trim();
    if (!name) {
      setmessage("Please enter a name for this option set");
      return;
    }
    if (draftOptions.length < 2) {
      setmessage("At least 2 options required to save as a set");
      return;
    }
    const newSet: OptionSet = {
      id: crypto.randomUUID(),
      name,
      options: [...draftOptions],
      createdAt: new Date().toISOString()
    };
    const updated = [...savedOptionSets, newSet];
    persistOptionSets(updated);
    setOptionSetNameInput("");
    setShowSaveOptionSet(false);
    setmessage(`Saved set "${name}" (${draftOptions.length} options)`);
  }

  function loadOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    setDraftOptions([...set.options]);
    setmessage(`Loaded set "${set.name}" (${set.options.length} options)`);
  }

  function deleteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (!window.confirm(`Delete option set "${set.name}"?`)) return;
    const updated = savedOptionSets.filter((s) => s.id !== id);
    persistOptionSets(updated);
    if (editingOptionSetId === id) {
      setEditingOptionSetId(null);
      setEditOptionSetNameInput("");
    }
    setmessage(`Deleted set "${set.name}"`);
  }

  function updateOptionSetName(id: string) {
    const name = editOptionSetNameInput.trim();
    if (!name) return;
    const updated = savedOptionSets.map((s) =>
      s.id === id ? { ...s, name } : s
    );
    persistOptionSets(updated);
    setEditingOptionSetId(null);
    setEditOptionSetNameInput("");
    setmessage(`Edited set name to "${name}"`);
  }

  function overwriteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (
      !window.confirm(
        `Overwrite set "${set.name}" with current options (${draftOptions.length} options)?`
      )
    )
      return;
    const updated = savedOptionSets.map((s) =>
      s.id === id ? { ...s, options: [...draftOptions] } : s
    );
    persistOptionSets(updated);
    setmessage(`Overwrote set "${set.name}"`);
  }

  async function createPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tournamentName.trim()) {
      setmessage("⚠️ Please select a tournament before creating a question");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const options = draftOptions.map((item) => item.trim()).filter(Boolean);
      const fullQuestion = round.trim() ? `รอบ ${round.trim()} - ${question.trim()}` : question.trim();
      const data = await requestJson<AdminPrediction>("/api/admin/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentName, question: fullQuestion, opensAt, closesAt, feeRate: Number(feeRate), status: "open", options })
      });
      // Auto-sort: insert new prediction ID into predictionOrder by closesAt
      const currentOrder = settings.predictionOrder || [];
      const allPredictions = [...predictions, data];
      const sorted = [...allPredictions].sort((a, b) => {
        const timeA = a.closesAt ? new Date(a.closesAt).getTime() : Infinity;
        const timeB = b.closesAt ? new Date(b.closesAt).getTime() : Infinity;
        return timeA - timeB;
      });
      const newOrder = sorted.map(p => p.id);
      await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionOrder: newOrder })
      });
      setmessage("Question created");
      setQuestion("");
      setRound("");
      setDraftOptions([]);
      setTournamentName("");
      await loadPredictions();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to create question");
    } finally {
      setLoading(false);
    }
  }

  async function makeAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setmessage("");
    try {
      const data = await requestJson<{ email: string; role: string }>("/api/admin/users/make-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmailInput })
      });
      setmessage(`Added ${data.email} as admin`);
      setAdminEmailInput("");
      await loadAdmins();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to add admin");
    } finally {
      setLoading(false);
    }
  }

  async function addTournament() {
    const name = newTournamentInput.trim();
    if (!name) return;
    const exists = (settings.tournaments || []).some((t) => {
      const tName = typeof t === "string" ? t : t.name;
      return tName.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      setmessage("A tournament with this name already exists");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const newTour: TournamentItem = { name, logoUrl: newTournamentLogoUrl };
      const nextTournaments = [...(settings.tournaments || []), newTour];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      setNewTournamentInput("");
      setNewTournamentLogoUrl("");
      setmessage(`Tournament added: ${name}`);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Tournament addedFailed");
    } finally {
      setLoading(false);
    }
  }

  async function removeTournament(name: string) {
    const confirmed = window.confirm(`Delete tournament "${name}"? (Existing questions will not be deleted, but this tournament will no longer appear in the new question dropdown)`);
    if (!confirmed) return;
    setLoading(true);
    setmessage("");
    try {
      const nextTournaments = (settings.tournaments || []).filter((t) => {
        const tName = typeof t === "string" ? t : t.name;
        return tName !== name;
      });
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      if (tournamentName === name) {
        const first = data.tournaments?.[0];
        const firstName = typeof first === "string" ? first : (first?.name || "");
        setTournamentName(firstName);
      }
      setmessage(`Tournament deleted: ${name}`);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Tournament deletedFailed");
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchiveTournament(name: string) {
    setLoading(true);
    setmessage("");
    try {
      const nextTournaments = (settings.tournaments || []).map((t) => {
        const tName = typeof t === "string" ? t : t.name;
        if (tName === name) {
          if (typeof t === "string") {
            return { name: t, logoUrl: "", archived: true };
          }
          return { ...t, archived: !t.archived };
        }
        return t;
      });
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      const info = getTournamentInfo(nextTournaments.find((t) => getTournamentInfo(t).name === name) || name);
      setmessage(info.archived ? `Tournament hidden: ${name}` : `Tournament shown: ${name}`);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to update tournament status");
    } finally {
      setLoading(false);
    }
  }

  async function updateTournamentLogo(tName: string, file: File | undefined) {
    if (!file) return;
    compressImage(file, async (b64) => {
      setLoading(true);
      setmessage("");
      try {
        const nextTournaments = (settings.tournaments || []).map((t) => {
          const name = typeof t === "string" ? t : t.name;
          if (name === tName) {
            return { name, logoUrl: b64 };
          }
          return t;
        });
        const data = await requestJson<SiteSettings>("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournaments: nextTournaments })
        });
        setSettings(data);
        setmessage(`Tournament logo updated: "${tName}"`);
      } catch (error) {
        setmessage(error instanceof Error ? error.message : "Failed to update logo");
      } finally {
        setLoading(false);
      }
    });
  }

  function compressImage(file: File, callback: (b64: string) => void) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 96; // perfect 1:1 square canvas dimension
        canvas.width = size;
        canvas.height = size;
        
        let scaledWidth = img.width;
        let scaledHeight = img.height;
        
        if (img.width > img.height) {
          scaledWidth = size;
          scaledHeight = Math.round((img.height * size) / img.width);
        } else {
          scaledHeight = size;
          scaledWidth = Math.round((img.width * size) / img.height);
        }
        
        const offsetX = Math.round((size - scaledWidth) / 2);
        const offsetY = Math.round((size - scaledHeight) / 2);
        
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Clear canvas to ensure perfect transparency
          ctx.clearRect(0, 0, size, size);
          // Draw image beautifully centered with aspect ratio fully preserved
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
          
          // ── Auto-invert dark logos to white ──
          // Analyze pixel colors to detect if logo is predominantly dark
          const imageData = ctx.getImageData(0, 0, size, size);
          const data = imageData.data;
          let totalBrightness = 0;
          let opaquePixels = 0;
          
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha > 10) { // Only count non-transparent pixels
              // Calculate perceived brightness (luminance formula)
              const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              totalBrightness += brightness;
              opaquePixels++;
            }
          }
          
          const avgBrightness = opaquePixels > 0 ? totalBrightness / opaquePixels : 255;
          
          // If average brightness is below threshold (dark logo), invert to white
          const DARK_THRESHOLD = 100; // 0 = pure black, 255 = pure white
          if (avgBrightness < DARK_THRESHOLD && opaquePixels > 10) {
            for (let i = 0; i < data.length; i += 4) {
              const alpha = data[i + 3];
              if (alpha > 10) {
                // Invert RGB channels (creates white from black)
                data[i] = 255 - data[i];     // R
                data[i + 1] = 255 - data[i + 1]; // G
                data[i + 2] = 255 - data[i + 2]; // B
              }
            }
            ctx.putImageData(imageData, 0, 0);
          }
          
          // Export as PNG to support transparent backgrounds (prevents black border issues)
          const b64 = canvas.toDataURL("image/png");
          callback(b64);
        } else {
          callback(String(reader.result || ""));
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  }

  function handleTournamentLogo(file: File | undefined) {
    if (!file) return;
    compressImage(file, (b64) => {
      setNewTournamentLogoUrl(b64);
    });
  }

  function addBulkOptions() {
    const lines = optionsBulkInput.split("\n");
    const parsed = lines.map((l) => l.trim()).filter(Boolean);
    if (parsed.length === 0) return;
    setDraftOptions((current) => [...current, ...parsed]);
    setOptionsBulkInput("");
    setShowBulkOptions(false);
  }

  async function saveQuestionTemplate() {
    const name = question.trim();
    if (!name) return;
    if (settings.savedQuestions?.includes(name)) {
      setmessage("This question template already exists");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const nextQuestions = [...(settings.savedQuestions || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setmessage(`Question template saved`);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to save question template");
    } finally {
      setLoading(false);
    }
  }

  async function removeQuestionTemplate(name: string) {
    const confirmed = window.confirm(`Delete question template "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setmessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).filter((q) => q !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setmessage(`Question template deleted`);
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to delete question template");
    } finally {
      setLoading(false);
    }
  }

  async function renameQuestionTemplate(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) {
      setEditingTemplate(null);
      return;
    }
    if (settings.savedQuestions?.includes(trimmed)) {
      setmessage("A question with this name already exists");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).map((q) => (q === oldName ? trimmed : q));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setEditingTemplate(null);
      setmessage("Question template edited successfully");
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to edit question template");
    } finally {
      setLoading(false);
    }
  }

  async function saveRoundTemplate() {
    const name = round.trim();
    if (!name) return;
    if (settings.savedRounds?.includes(name)) {
      setmessage("This round already exists");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const nextRounds = [...(settings.savedRounds || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setmessage("บันทึกรูปแบบรอบเรียบร้อย");
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to save round template");
    } finally {
      setLoading(false);
    }
  }

  async function removeRoundTemplate(name: string) {
    const confirmed = window.confirm(`Delete round template "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setmessage("");
    try {
      const nextRounds = (settings.savedRounds || []).filter((r) => r !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setmessage("ลบรูปแบบรอบเรียบร้อย");
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to delete round template");
    } finally {
      setLoading(false);
    }
  }

  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [editRoundInput, setEditRoundInput] = useState("");

  async function renameRoundTemplate(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) {
      setEditingRound(null);
      return;
    }
    if (settings.savedRounds?.includes(trimmed)) {
      setmessage("A round with this name already exists");
      return;
    }
    setLoading(true);
    setmessage("");
    try {
      const nextRounds = (settings.savedRounds || []).map((r) => (r === oldName ? trimmed : r));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setEditingRound(null);
      setmessage("แก้ไของค์ประกอบรอบเรียบร้อย");
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to edit round template");
    } finally {
      setLoading(false);
    }
  }

  function moveLocalOrder(id: string, direction: "up" | "down") {
    const arr = [...localOrder];
    const idx = arr.indexOf(id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    const temp = arr[idx];
    arr[idx] = arr[targetIdx];
    arr[targetIdx] = temp;
    setLocalOrder(arr);
  }

  async function savePredictionOrder() {
    setLoading(true);
    setmessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionOrder: localOrder })
      });
      setSettings(data);
      setmessage("Question order saved successfully");
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to save question order");
    } finally {
      setLoading(false);
    }
  }

  async function savePredictionEdits(id: string) {
    const newTime = editClosesAt[id];
    const newQuestion = editQuestions[id];
    const newTournament = editTournamentNames[id];

    setLoading(true);
    setmessage("");
    try {
      await requestJson<{ ok: boolean }>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(newTournament !== undefined && { tournamentName: newTournament }),
          closesAt: newTime,
          question: newQuestion
        })
      });
      setmessage("Question details updated successfully");
      setEditingId(null);
      await reloadAll();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  async function removeAdmin(email: string) {
    const confirmed = window.confirm(`Remove admin privileges from ${email}?`);
    if (!confirmed) return;
    setLoading(true);
    setmessage("");
    try {
      await requestJson<{ email: string; role: string }>("/api/admin/users/remove-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setmessage(`${email} removed from admins`);
      await loadAdmins();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to remove admin");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    setLoading(true);
    setmessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      setmessage(`Status changed to ${statusLabel(nextStatus)}`);
      setPredictions((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      await loadPredictions();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  async function deletePrediction(id: string) {
    const confirmed = window.confirm("Permanently delete this question from the system? (All answer options and bet entries for this question will also be deleted and cannot be recovered.)");
    if (!confirmed) return;
    setLoading(true);
    setmessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, { method: "DELETE" });
      setmessage("Question permanently deleted");
      await loadPredictions();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to delete question");
    } finally {
      setLoading(false);
    }
  }

  async function resolvePrediction(item: AdminPrediction) {
    const winningOptionId = winningOptions[item.id];
    if (!winningOptionId) {
      setmessage("Select the winning answer first");
      return;
    }
    const winningLabel = item.options.find((option) => option.id === winningOptionId)?.label || "";
    const confirmed = window.confirm(`Confirm resolution?\n\nQuestion: ${item.question}\nWinning Answer: ${winningLabel}\n\nAfter confirmation, the system will process payouts and this cannot be undone from this page.`);
    if (!confirmed) return;

    setLoading(true);
    setmessage("");
    try {
      const data = await requestJson<{ winnersCount: number; totalLosersCount: number; totalPaid: number }>(`/api/admin/predictions/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningOptionId })
      });
      setmessage(`Resolved: Won ${data.winnersCount || 0}, Lost ${data.totalLosersCount || 0}, Paid ${data.totalPaid || 0}`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "resolved" } : row));
      await loadPredictions();
    } catch (error) {
      setmessage(error instanceof Error ? error.message : "Failed to resolve");
    } finally {
      setLoading(false);
    }
  }

  async function refundPrediction(item: AdminPrediction) {
    const confirmed = window.confirm(`Confirm cancellation and refund?\n\nQuestion: ${item.question}`);
    if (!confirmed) return;

    setLoading(true);
    setmessage("");
    try {
      const data = await requestJson<{ refundedEntries: number; totalRefunded: number }>(`/api/admin/predictions/${item.id}/refund`, { method: "POST" });
      setmessage(`Refunded: ${data.refundedEntries || 0} entries, ${data.totalRefunded || 0} coins`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "canceled" } : row));
      await loadPredictions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Refund failed";
      if (msg.includes("No running entries")) {
        setmessage("No entries to refund (no bets placed or already refunded)");
      } else {
        setmessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function renderPredictionControls(item: AdminPrediction) {
    const disabled = loading || item.status === "resolved" || item.status === "canceled";
    const hasEntries = (item.entryCount || 0) > 0;
    return (
      <div className="admin-actions">
        {/* Close Now / Reopen Betting */}
        {item.status !== "resolved" && item.status !== "canceled" && (
          item.status === "open" ? (
            <button className="button" disabled={loading} onClick={() => updateStatus(item.id, "closed")}>Close Now</button>
          ) : (
            <button className="button gold" disabled={loading} onClick={() => updateStatus(item.id, "open")}>Reopen Betting</button>
          )
        )}
        {/* Resolve */}
        {!disabled && (
          <>
            <select className="button" value={winningOptions[item.id] || ""} onChange={(event) => setWinningOptions((current) => ({ ...current, [item.id]: event.target.value }))}>
              <option value="">Select Winning Answer</option>
              {item.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button className="button primary" disabled={disabled} onClick={() => resolvePrediction(item)}>Resolve</button>
          </>
        )}
        {/* Cancel + Refund or Delete */}
        {!disabled && hasEntries && (
          <button className="button" disabled={loading} onClick={() => refundPrediction(item)}>Cancel + Refund</button>
        )}
        {(!hasEntries || item.status === "resolved" || item.status === "canceled") && (
          <button className="button" type="button" disabled={loading} onClick={() => deletePrediction(item.id)} style={{ color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }}>
            Delete Permanently
          </button>
        )}
      </div>
    );
  }

  function renderPayoutBreakdown(item: AdminPrediction) {
    if (item.status !== "resolved") return null;
    const data = payoutDetails[item.id];
    const isLoading = payoutLoading[item.id];
    const isExpanded = expandedPayoutId === item.id;

    return (
      <div style={{ marginTop: "8px" }}>
        <button
          className="button"
          type="button"
          onClick={() => togglePayoutDetails(item.id)}
          style={{
            width: "100%",
            height: "28px",
            fontSize: "10px",
            background: isExpanded ? "rgba(255,225,0,0.08)" : "transparent",
            border: "1px solid var(--hairline)",
            borderRadius: "6px",
            color: "var(--yellow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px"
          }}
        >
          {isExpanded ? "▼" : "▶"} Payout Details ({item.entryCount || 0} players)
        </button>

        {isExpanded && (
          <div style={{
            marginTop: "8px",
            padding: "12px",
            background: "var(--bg)",
            border: "1px solid var(--hairline)",
            borderRadius: "8px",
            display: "grid",
            gap: "10px"
          }}>
            {isLoading && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "11px", padding: "12px" }}>Loading...</div>
            )}

            {!isLoading && !data && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "11px", padding: "8px" }}>Unable to load data</div>
            )}

            {!isLoading && data && (
              <>
                {/* ── Summary Bar ── */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: "8px",
                  padding: "10px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "6px",
                  border: "1px solid var(--hairline)"
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Total Pool</div>
                    <strong style={{ fontSize: "13px", color: "var(--yellow)" }}>{data.summary.totalPool.toLocaleString()}</strong>
                    {data.summary.sponsorPool ? (
                      <div style={{ fontSize: "8px", color: "#ff8c00", marginTop: "2px" }}>++ Sponsor {data.summary.sponsorPool.toLocaleString()}</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Fee ({Math.round(data.summary.feeRate * 100)}%)</div>
                    <strong style={{ fontSize: "13px", color: "var(--red)" }}>-{data.summary.feeTaken.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Net Paid</div>
                    <strong style={{ fontSize: "13px", color: "var(--green)" }}>{data.summary.totalDistributed.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Difference (FLOOR)</div>
                    <strong style={{ fontSize: "11px", color: data.summary.roundingDifference === 0 ? "var(--green)" : "var(--yellow)" }}>
                      {data.summary.roundingDifference === 0 ? "0 ✅" : `${data.summary.roundingDifference > 0 ? "+" : ""}${data.summary.roundingDifference}`}
                    </strong>
                  </div>
                </div>

                {/* ── Verification ── */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: data.summary.verificationOk ? "rgba(14,203,129,0.06)" : "rgba(240,84,84,0.06)",
                  border: `1px solid ${data.summary.verificationOk ? "rgba(14,203,129,0.3)" : "rgba(240,84,84,0.3)"}`,
                  borderRadius: "6px",
                  fontSize: "11px"
                }}>
                  <span style={{ fontSize: "16px" }}>{data.summary.verificationOk ? "✅" : "⚠️"}</span>
                  <span style={{ color: data.summary.verificationOk ? "var(--green)" : "var(--red)", fontWeight: "bold" }}>
                    {data.summary.verificationOk
                      ? `Distribution verified — paid ${data.summary.totalDistributed.toLocaleString()} coins from pool ${data.summary.totalPool.toLocaleString()} (+ Sponsor ${data.summary.sponsorPool.toLocaleString()}) (${Math.round(data.summary.feeRate * 100)}% fee = ${data.summary.feeTaken.toLocaleString()})`
                      : `⚠️ Difference ${Math.abs(data.summary.roundingDifference)} coins — please verify`
                    }
                  </span>
                </div>

                {/* ── Participant List ── */}
                <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "bold" }}>
                  ▸ Participants ({data.participants.length} players) — Won {data.summary.winnersCount} · Lost {data.summary.losersCount}
                </div>
                <div style={{
                  display: "grid",
                  gap: "4px",
                  maxHeight: "200px",
                  overflowY: "auto"
                }}>
                  {/* Header */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 120px 70px 70px",
                    gap: "6px",
                    padding: "4px 8px",
                    fontSize: "9px",
                    color: "var(--muted)",
                    fontWeight: "bold",
                    borderBottom: "1px solid var(--hairline)"
                  }}>
                    <span>Player</span>
                    <span>Pick</span>
                    <span>Option</span>
                    <span style={{ textAlign: "right" }}>Bet</span>
                    <span style={{ textAlign: "right" }}>Result</span>
                  </div>

                  {/* Rows - sort by won first, then by amount desc */}
                  {[...data.participants]
                    .sort((a, b) => {
                      if (a.status === "won" && b.status !== "won") return -1;
                      if (a.status !== "won" && b.status === "won") return 1;
                      return b.betAmount - a.betAmount;
                    })
                    .map((p) => (
                    <div key={p.userId} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 120px 70px 70px",
                      gap: "6px",
                      padding: "5px 8px",
                      fontSize: "10px",
                      background: p.status === "won" ? "rgba(14,203,129,0.04)" : "transparent",
                      borderRadius: "4px",
                      alignItems: "center",
                      borderBottom: "1px solid rgba(255,255,255,0.03)"
                    }}>
                      <span style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.userName}
                        {p.hasInsurance && <span title="Has insurance">Insured</span>}
                      </span>
                      <span className="meta" style={{ fontSize: "9px", color: p.optionLabel === data.prediction.winningOptionLabel ? "var(--green)" : "var(--muted)" }}>
                        {p.optionLabel === data.prediction.winningOptionLabel ? "✅" : ""} {p.optionLabel}
                      </span>
                      <span className="meta">{p.status === "won" ? "Won" : p.hasInsurance && p.insuranceRefund > 0 ? "Lost+Refund" : "Lost"}</span>
                      <span style={{ textAlign: "right" }}>{p.betAmount.toLocaleString()}</span>
                      <span style={{
                        textAlign: "right",
                        fontWeight: "bold",
                        color: (() => {
                          const net = p.status === "won"
                            ? p.payoutAmount - p.betAmount
                            : p.hasInsurance && p.insuranceRefund > 0
                              ? p.insuranceRefund - p.betAmount  // Use actual refund
                              : -p.betAmount;
                          return net >= 0 ? "var(--green)" : "var(--red)";
                        })()
                      }}>
                        {p.status === "won"
                          ? `${(p.payoutAmount - p.betAmount).toLocaleString()}`
                          : p.hasInsurance && p.insuranceRefund > 0
                            ? `${(p.insuranceRefund - p.betAmount).toLocaleString()}`
                            : `-${p.betAmount.toLocaleString()}`
                        }
                      </span>
                    </div>
                  ))}
                </div>
                {data.prediction.winningOptionLabel && (
                  <div className="meta" style={{ fontSize: "9px", textAlign: "center", paddingTop: "4px" }}>
                    Winning Answer: <strong style={{ color: "var(--green)" }}>{data.prediction.winningOptionLabel}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="page admin-page" style={{ padding: "10px 16px" }}>
      <div className="app admin-app" style={{ maxWidth: "1000px" }}>
        <header className="topbar" style={{ marginBottom: "8px" }}>
          <div className="brand-text">
            <h1>SUPERWIN Admin</h1>
            <span>{adminEmail} · Admin</span>
          </div>
          <div className="actions" style={{ gap: "6px" }}>
            <Link className="button gold" href="/">Back to Site</Link>
          </div>
        </header>

        {message && <div className="admin-message" style={{ marginBottom: "12px" }}>{message}</div>}

        <div className="filter-row" style={{ justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
          <button className={`button ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => { setActiveTab("dashboard"); loadDashboardData().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Dashboard</button>
          <button className={`button ${activeTab === "tournaments" ? "active" : ""}`} onClick={() => setActiveTab("tournaments")} style={{ borderRadius: "999px" }}>Tournaments</button>
          <button className={`button ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")} style={{ borderRadius: "999px" }}>Create Question</button>
          <button className={`button ${activeTab === "running" ? "active" : ""}`} onClick={() => setActiveTab("running")} style={{ borderRadius: "999px" }}>Running Questions</button>
          <button className={`button ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")} style={{ borderRadius: "999px" }}>Settings</button>
          <button className={`button ${activeTab === "admins" ? "active" : ""}`} onClick={() => setActiveTab("admins")} style={{ borderRadius: "999px" }}>Admins ({admins.length})</button>
          <button className={`button ${activeTab === "reports" ? "active" : ""}`} onClick={() => { setActiveTab("reports"); loadReports().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Reports ({reports.length})</button>
          <button className={`button ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")} style={{ borderRadius: "999px" }}>User Management ({users.length})</button>
          <button className={`button ${activeTab === "contests" ? "active" : ""}`} onClick={() => { setActiveTab("contests"); loadContests().catch(() => undefined); }} style={{ borderRadius: "999px" }}>Contests ({contests.length})</button>
        </div>

        <section className="admin-content" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", width: "100%", maxWidth: "100%", justifyItems: "center", alignContent: "start", margin: "0 auto" }}>
          
          {activeTab === "dashboard" && (
            <>

              <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "20px", margin: "0 auto" }}>
                <div className="panel-head" style={{ padding: "0 0 4px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>Dashboard Overview</h2>
                  <span className="micro">All tournament statistics at a glance</span>
                </div>

                {/* ── Tournament Selector ── */}
                <div style={{ display: "grid", gap: "4px" }}>
                  <label className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Select Tournament</label>
                  <select className="button" value={selectedDashboardTournament} onChange={(e) => setSelectedDashboardTournament(e.target.value)} style={{ width: "100%", height: "40px", fontSize: "13px", fontWeight: "600" }}>
                    <option value="">-- Select Tournament --</option>
                    {Array.from(new Set(dashboardData.map((d) => d.tournamentName)))
                      .filter((tour) => {
                        const info = (settings.tournaments || []).find((t) => getTournamentInfo(t).name.toLowerCase() === tour.toLowerCase());
                        return info && !getTournamentInfo(info).archived;
                      })
                      .sort((a, b) => a.localeCompare(b))
                      .map((tour) => (
                        <option key={tour} value={tour}>
                          {tour}
                        </option>
                      ))}
                  </select>
                </div>

                {(() => {
                  if (!selectedDashboardTournament) {
                    return (
                      <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                        <div style={{ fontSize: "40px", marginBottom: "12px", fontWeight: "700", color: "var(--yellow)" }}>?</div>
                        <p style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>Select a tournament to view statistics</p>
                        <p style={{ fontSize: "12px", marginTop: "4px" }}>Charts and data will appear when you select a tournament</p>
                      </div>
                    );
                  }

                  const tournamentQuestions = dashboardData.filter((d) => d.tournamentName === selectedDashboardTournament);
                  if (tournamentQuestions.length === 0) {
                    return <div className="question"><span>No questions found in this tournament</span></div>;
                  }

                  // Sort: open questions first (by closesAt ascending), then resolved (by closesAt descending)
                  const sortedQuestions = [...tournamentQuestions].sort((a, b) => {
                    // Open questions come before resolved
                    if (a.status === "open" && b.status !== "open") return -1;
                    if (a.status !== "open" && b.status === "open") return 1;
                    // Within same status: sort by closesAt
                    const aTime = new Date(a.closesAt || a.createdAt || 0).getTime();
                    const bTime = new Date(b.closesAt || b.createdAt || 0).getTime();
                    // Open: soonest first; Resolved: most recent first
                    return a.status === "open" ? aTime - bTime : bTime - aTime;
                  });

                  const totalTourCoins = sortedQuestions.reduce((sum, q) => sum + q.totalPoolCoins, 0);
                  const totalSponsorPool = sortedQuestions.reduce((sum, q) => sum + (q.sponsorPool || 0), 0);
                  const totalTourPlayers = new Set(sortedQuestions.flatMap((q) => q.playerBets.map((b) => b.email))).size;
                  const totalBets = sortedQuestions.reduce((sum, q) => sum + q.playerBets.length, 0);
                  const openCount = sortedQuestions.filter((q) => q.status === "open").length;
                  const resolvedCount = sortedQuestions.filter((q) => q.status === "resolved").length;

                  // Colors for charts and UI
                  const colors = {
                    gold: "#FFD700",
                    goldDim: "rgba(255, 215, 0, 0.12)",
                    green: "#0ECB81",
                    greenDim: "rgba(14, 203, 129, 0.12)",
                    red: "#F05454",
                    blue: "#4DABF7",
                    blueDim: "rgba(77, 171, 247, 0.12)",
                    purple: "#B197FC",
                    purpleDim: "rgba(177, 151, 252, 0.12)",
                    teal: "#63E6BE",
                    tealDim: "rgba(99, 230, 190, 0.12)",
                    orange: "#FFA94D",
                    orangeDim: "rgba(255, 169, 77, 0.12)",
                    pink: "#F783AC",
                    pinkDim: "rgba(247, 131, 172, 0.12)",
                  };
                  const chartColors = ["#fff", "#fff", "#fff", "#fff", "#fff", "#fff", "#fff", "#fff"];

                  return (
                    <div style={{ display: "grid", gap: "24px" }}>

                      {/* -- Summary Stat Cards -- */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Total Pool</div>
                          <strong style={{ fontSize: "26px", color: "#fff", fontWeight: 600, display: "block", letterSpacing: "-0.5px" }}>{totalTourCoins.toLocaleString()}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>coins</span>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Sponsor Pool</div>
                          <strong style={{ fontSize: "26px", color: "#fff", fontWeight: 600, display: "block", letterSpacing: "-0.5px" }}>{totalSponsorPool.toLocaleString()}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>coins</span>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Players</div>
                          <strong style={{ fontSize: "26px", color: "#fff", fontWeight: 600, display: "block", letterSpacing: "-0.5px" }}>{totalTourPlayers}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>active</span>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Questions</div>
                          <strong style={{ fontSize: "26px", color: "#fff", fontWeight: 600, display: "block", letterSpacing: "-0.5px" }}>{tournamentQuestions.length}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>total</span>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Total Bets</div>
                          <strong style={{ fontSize: "26px", color: "#fff", fontWeight: 600, display: "block", letterSpacing: "-0.5px" }}>{totalBets}</strong>
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>placed</span>
                        </div>
                      </div>

                      {/* -- Status Overview -- */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                          <strong style={{ fontSize: "20px", color: "#fff", fontWeight: 600 }}>{openCount}</strong>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Open</div>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                          <strong style={{ fontSize: "20px", color: "#fff", fontWeight: 600 }}>{resolvedCount}</strong>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Resolved</div>
                        </div>
                        <div style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                          <strong style={{ fontSize: "20px", color: "#fff", fontWeight: 600 }}>{sortedQuestions.length > 0 ? Math.round(totalTourCoins / sortedQuestions.length).toLocaleString() : 0}</strong>
                          <div className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Avg per Question</div>
                        </div>
                      </div>
                      {/* ── Question Details ── */}
                      <div style={{ display: "grid", gap: "14px" }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)", padding: "8px 4px", borderBottom: "1px solid var(--hairline)" }}>
                          Question Details ({sortedQuestions.length} questions)
                        </div>
                        {sortedQuestions.map((q, qIdx) => (
                          <div key={q.id} style={{ border: "1px solid var(--hairline)", borderRadius: "12px", background: "var(--bg)", padding: "14px", display: "grid", gap: "10px" }}>
                            {/* Header with icon, question, status badge */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", minWidth: "20px", textAlign: "center" }}>{qIdx + 1}.</span>
                                <strong style={{ fontSize: "14px", color: "#fff" }}>{q.question}</strong>
                              </div>
                              <span className="pill" style={{ 
                                fontSize: "10px", 
                                height: "22px", 
                                padding: "0 10px",
                                borderRadius: "999px",
                                border: 0,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: q.status === "open" ? "rgba(255, 225, 0, 0.08)" : q.status === "resolved" ? "rgba(14, 203, 129, 0.12)" : "rgba(255, 255, 255, 0.06)", 
                                color: q.status === "open" ? "var(--yellow)" : q.status === "resolved" ? "var(--green)" : "var(--text)" 
                              }}>
                                {statusLabel(q.status)}
                              </span>
                            </div>

                            {/* Quick Stats Row */}
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "11px", color: "var(--muted)" }}>
                              <span>Pool: <strong style={{ color: "#fff" }}>{q.totalPoolCoins.toLocaleString()} coins</strong></span>
                              {q.sponsorPool ? (
                                <span>+ Sponsor: <strong style={{ color: "#fff" }}>{q.sponsorPool.toLocaleString()}</strong></span>
                              ) : null}
                              <span>Players: <strong style={{ color: "#fff" }}>{q.uniquePlayers} players</strong></span>
                              <span>Bets: <strong style={{ color: colors.blue }}>{q.playerBets.length} bets</strong></span>
                              {q.totalPoolCoins > 0 && q.playerBets.length > 0 && (
                                <span>Avg/Player: <strong style={{ color: colors.purple }}>{Math.round(q.totalPoolCoins / q.uniquePlayers).toLocaleString()}</strong></span>
                              )}
                            </div>

                            {/* Visual Odds Bars (colored progress bars) */}
                            <div style={{ display: "grid", gap: "6px", marginTop: "2px" }}>
                              <span className="meta" style={{ color: "var(--muted)", fontSize: "10px", fontWeight: "500" }}>Betting Distribution</span>
                              <div style={{ display: "grid", gap: "6px" }}>
                                {q.optionStats.map((stat, si) => {
                                  const pct = q.totalPoolCoins > 0 ? ((stat.totalCoins / q.totalPoolCoins) * 100).toFixed(1) : "0";
                                  const barColor = chartColors[si % chartColors.length];
                                  return (
                                    <div key={stat.id} style={{ display: "grid", gap: "3px" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "500" }}>
                                        <span style={{ color: "#fff" }}>{stat.label}</span>
                                        <span>
                                          <strong style={{ color: barColor }}>{pct}%</strong>
                                          <span style={{ color: "var(--muted)", marginLeft: "8px" }}>Multiplier {stat.multiplier > 0 ? `~${stat.multiplier}x` : "--"}</span>
                                        </span>
                                      </div>
                                      <div style={{ width: "100%", height: "8px", background: "var(--bg)", borderRadius: "4px", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: "4px", transition: "width 0.5s ease" }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Player List - same format as Manage Questions tab */}
                            <div style={{ marginTop: "4px" }}>
                              <details style={{ cursor: "pointer" }}>
                                <summary style={{ fontSize: "11px", color: "var(--muted)", outline: "none", fontWeight: "500", padding: "4px 0" }}>
                                  ▸ Participants ({q.playerBets.length} players){q.status === "resolved" && q.winningOptionId ? ` — Won ${q.playerBets.filter(b => { const winOpt = q.optionStats.find(s => s.id === q.winningOptionId); return b.optionLabel === winOpt?.label; }).length} · Lost ${q.playerBets.length - q.playerBets.filter(b => { const winOpt = q.optionStats.find(s => s.id === q.winningOptionId); return b.optionLabel === winOpt?.label; }).length}` : ""}
                                </summary>
                                <div style={{ display: "grid", gap: "5px", marginTop: "8px", maxHeight: "200px", overflowY: "auto", padding: "4px", background: "var(--card)", borderRadius: "8px", border: "1px solid var(--hairline)" }}>
                                  {/* Header */}
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 70px 70px", gap: "6px", padding: "4px 8px", fontSize: "9px", color: "var(--muted)", fontWeight: "bold", borderBottom: "1px solid var(--hairline)" }}>
                                    <span>Player</span>
                                    <span>Pick</span>
                                    <span>Option</span>
                                    <span style={{ textAlign: "right" }}>Bet</span>
                                    <span style={{ textAlign: "right" }}>Result</span>
                                  </div>
                                  {/* Rows */}
                                  {[...q.playerBets]
                                    .sort((a, b) => {
                                      // If resolved: sort winners first, then by amount desc
                                      if (q.status === "resolved" && q.winningOptionId) {
                                        const winOpt = q.optionStats.find(s => s.id === q.winningOptionId);
                                        const winningLabel = winOpt?.label || "";
                                        const aWon = a.optionLabel === winningLabel;
                                        const bWon = b.optionLabel === winningLabel;
                                        if (aWon && !bWon) return -1;
                                        if (!aWon && bWon) return 1;
                                      }
                                      return b.amount - a.amount;
                                    })
                                    .map((bet) => {
                                      const winningLabel = (q.status === "resolved" && q.winningOptionId) ? (q.optionStats.find(s => s.id === q.winningOptionId)?.label || null) : null;
                                      const isWinner = q.status === "resolved" && bet.optionLabel === winningLabel;
                                      return (
                                        <div key={bet.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 70px 70px", gap: "6px", padding: "5px 8px", fontSize: "10px", background: isWinner ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: "4px", alignItems: "center" }}>
                                          <span style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff" }}>
                                            {bet.displayName || bet.email || bet.userId || "Unknown User"}
                                          </span>
                                          <span className="meta" style={{ fontSize: "9px", color: isWinner ? "var(--green)" : "var(--muted)" }}>
                                            {bet.optionLabel}
                                          </span>
                                          <span className="meta" style={{ fontSize: "10px" }}>{q.status === "resolved" ? (isWinner ? "Won" : "Lost") : "--"}</span>
                                          <span style={{ textAlign: "right", color: "#fff", fontWeight: "600" }}>{bet.amount.toLocaleString()}</span>
                                          <span style={{ textAlign: "right", fontWeight: 600, color: isWinner ? "var(--green)" : "var(--muted)" }}>
                                            {q.status === "resolved" ? (isWinner ? `${Math.round(bet.amount * 0.63).toLocaleString()}` : `-${bet.amount.toLocaleString()}`) : "--"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  {!q.playerBets.length && <div style={{ fontSize: "11px", color: "var(--muted)", textAlign: "center", padding: "8px" }}>No bets yet</div>}
                                </div>
                              </details>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  );
                })()}
              </section>
            </>
          )}


          {activeTab === "questions" && (
            <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", maxWidth: "600px", width: "100%", margin: "0 auto" }}>
              <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>Create Question</h2><span className="micro">Opens immediately after creation</span></div>
              <form className="modal-body" onSubmit={createPrediction} style={{ padding: "12px 0 0 0" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament</span>
                  <select
                    className="button"
                    value={tournamentName}
                    onChange={(event) => setTournamentName(event.target.value)}
                    style={{
                      width: "100%",
                      height: "38px",
                      textAlign: "left",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: tournamentName.trim()
                        ? "2px solid var(--green)"
                        : "2px dashed var(--red)",
                      background: tournamentName.trim()
                        ? "rgba(14, 203, 129, 0.08)"
                        : "rgba(255, 60, 60, 0.06)",
                      color: tournamentName.trim()
                        ? "var(--green)"
                        : "var(--muted)",
                    }}
                  >
                    <option value="">⚠️ -- Must select a tournament first --</option>
                    {(settings.tournaments || [])
                      .map((t) => {
                        const name = getTournamentInfo(t).name;
                        const info = getTournamentInfo(t);
                        // Skip hidden (archived) tournaments
                        if (info.archived) return null;
                        // Find latest question createdAt for this tournament
                        const latestQuestion = dashboardData
                          .filter((d) => d.tournamentName === name)
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        return { name, latestCreatedAt: latestQuestion ? latestQuestion.createdAt : null };
                      })
                      .filter(Boolean)
                      .sort((a: any, b: any) => {
                        if (a.latestCreatedAt && b.latestCreatedAt) {
                          return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
                        }
                        if (a.latestCreatedAt && !b.latestCreatedAt) return -1;
                        if (!a.latestCreatedAt && b.latestCreatedAt) return 1;
                        return 0;
                      })
                      .map((t: any) => (
                        <option key={t.name} value={t.name}>
                          {t.name}{t.latestCreatedAt ? " ★" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>รอบ</span>
                    <button className="button" type="button" disabled={!round.trim()} onClick={saveRoundTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      บันทึกรอบนี้
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-strong)", whiteSpace: "nowrap" }}>รอบ</span>
                    <input value={round} onChange={(event) => setRound(event.target.value)} placeholder="เช่น รอบแบ่งกลุ่ม, รอบ 8 ทีมสุดท้าย" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setRound(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "140px", maxWidth: "200px" }}>
                      <option value="">-- รอบ --</option>
                      {(settings.savedRounds || []).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedRounds && settings.savedRounds.length > 0 && (
                    <details style={{ marginTop: "4px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ Manage Saved Rounds</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "4px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedRounds.map((r) => (
                          <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingRound === r ? (
                              <>
                                <input value={editRoundInput} onChange={(event) => setEditRoundInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameRoundTemplate(r, editRoundInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>Save</button>
                                  <button className="button" type="button" onClick={() => setEditingRound(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{r}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingRound(r); setEditRoundInput(r); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>Edit</button>
                                  <button className="button" type="button" onClick={() => removeRoundTemplate(r)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>Delete</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Question</span>
                    <button className="button" type="button" disabled={!question.trim()} onClick={saveQuestionTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      Save Question Template
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                    <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Type question or pick from templates" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setQuestion(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "260px", maxWidth: "400px" }}>
                      <option value="">-- Question Template --</option>
                      {(settings.savedQuestions || []).map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedQuestions && settings.savedQuestions.length > 0 && (
                    <details style={{ marginTop: "6px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ Manage Saved Question Templates</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "6px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedQuestions.map((q) => (
                          <div key={q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingTemplate === q ? (
                              <>
                                <input value={editTemplateInput} onChange={(event) => setEditTemplateInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameQuestionTemplate(q, editTemplateInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>Save</button>
                                  <button className="button" type="button" onClick={() => setEditingTemplate(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>Cancel</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{q}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingTemplate(q); setEditTemplateInput(q); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>Edit</button>
                                  <button className="button" type="button" onClick={() => removeQuestionTemplate(q)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>Delete</button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Open Time</span>
                      <button className="button" type="button" onClick={() => setOpensAt(toDateTimeLocal(new Date()))} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                        Open betting immediately
                      </button>
                    </div>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>Open <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)", height: "18px", display: "flex", alignItems: "center" }}>Close Time</span>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>Close <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                </div>
                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Fee Rate</span>
                    <input value={feeRate} onChange={(event) => setFeeRate(event.target.value)} placeholder="e.g., 0.03" style={{ height: "34px" }} />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Status (Initial Status)</span>
                    <span className="pill gold" style={{ height: "34px", justifyContent: "center" }}>Create & Open Immediately</span>
                  </div>
                </div>

                <div className="admin-box" style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <strong>Answer Options</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button type="button" onClick={usePreviousOptions} style={{ fontSize: "10px", color: "var(--green)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        Use options from previous question
                      </button>
                      <button type="button" onClick={() => setShowBulkOptions(!showBulkOptions)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        {showBulkOptions ? "Paste multiple at once" : "Enter multiple options (one per line)"}
                      </button>
                    </div>
                  </div>

                  {!showBulkOptions ? (
                    <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={optionInput} onChange={(event) => setOptionInput(event.target.value)} placeholder="Add one option per line" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(); } }} style={{ border: "1px solid var(--hairline)", height: "34px" }} />
                      <button className="button gold" type="button" onClick={addOption}>Add Option</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <textarea rows={3} value={optionsBulkInput} onChange={(event) => setOptionsBulkInput(event.target.value)} placeholder="Paste options here, one per line&#10;Team A&#10;Team B&#10;Team C" style={{ border: "1px solid var(--hairline)", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", padding: "8px" }} />
                      <button className="button gold" type="button" onClick={addBulkOptions} style={{ width: "100%", height: "34px" }}>Quick-add all answers as options</button>
                    </div>
                  )}

                  <div className="admin-option-list" style={{ marginTop: "6px" }}>
                    {draftOptions.map((option, index) => (
                      <div key={`${option}-${index}`} className="reward-line">
                        <span>{index + 1}. {option}</span>
                        <button className="button" type="button" onClick={() => removeOption(index)}>Delete</button>
                      </div>
                    ))}
                  </div>

                  {/* ── Saved Option Sets ── */}
                  <div style={{ marginTop: "10px", borderTop: "1px solid var(--hairline)", paddingTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Saved Option Sets ({savedOptionSets.length})</span>
                      {draftOptions.length >= 2 && (
                        <button
                          type="button"
                          className="button gold"
                          style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                          onClick={() => setShowSaveOptionSet(!showSaveOptionSet)}
                        >
                          {showSaveOptionSet ? "Cancel" : "Save Option Set"}
                        </button>
                      )}
                    </div>

                    {showSaveOptionSet && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                        <input
                          value={optionSetNameInput}
                          onChange={(e) => setOptionSetNameInput(e.target.value)}
                          placeholder="Option set name, e.g., Top 16 Teams"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveOptionSet(); } }}
                          style={{ border: "1px solid var(--hairline)", height: "34px", flex: 1 }}
                        />
                        <button type="button" className="button gold" onClick={saveOptionSet} style={{ height: "34px", fontSize: "12px", padding: "0 14px" }}>
                          Save
                        </button>
                      </div>
                    )}

                    {savedOptionSets.length > 0 && (
                      <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                        {savedOptionSets.map((set) => (
                          <div
                            key={set.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 10px",
                              background: "var(--bg)",
                              borderRadius: "8px",
                              border: "1px solid var(--hairline)"
                            }}
                          >
                            {editingOptionSetId === set.id ? (
                              <>
                                <input
                                  value={editOptionSetNameInput}
                                  onChange={(e) => setEditOptionSetNameInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateOptionSetName(set.id); } }}
                                  style={{ border: "1px solid var(--hairline)", height: "28px", flex: 1, fontSize: "12px" }}
                                  autoFocus
                                />
                                <button type="button" className="button gold" onClick={() => updateOptionSetName(set.id)} style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}>OK</button>
                                <button type="button" className="button" onClick={() => { setEditingOptionSetId(null); setEditOptionSetNameInput(""); }} style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <span style={{ flex: 1, fontSize: "13px" }}>
                                  <strong>{set.name}</strong>
                                  <span className="meta" style={{ fontSize: "11px", marginLeft: "6px", color: "var(--muted)" }}>({set.options.length} options)</span>
                                </span>
                                <button
                                  type="button"
                                  className="button gold"
                                  onClick={() => loadOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                                  title="Load this option set"
                                >
                                  Load
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => {
                                    setEditingOptionSetId(set.id);
                                    setEditOptionSetNameInput(set.name);
                                  }}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="Edit name"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => overwriteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="SaveOverwritewith current options"
                                >
                                  Overwrite
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => deleteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px", color: "var(--red)" }}
                                  title="Delete this set"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* Tournament Confirmation Banner */}
                {tournamentName.trim() ? (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(14, 203, 129, 0.1)",
                    border: "1px solid var(--green)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <span style={{ fontSize: "16px" }}>✅</span>
                    <span style={{ fontSize: "12px", color: "var(--text)" }}>
                      This question will be created under: <strong style={{ color: "var(--green)", fontSize: "13px" }}>{tournamentName}</strong>
                    </span>
                  </div>
                ) : (
                  <div style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(255, 60, 60, 0.08)",
                    border: "1px dashed var(--red)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <span style={{ fontSize: "16px" }}>⚠️</span>
                    <span style={{ fontSize: "12px", color: "var(--red)" }}>
                      No tournament selected — Create button disabled
                    </span>
                  </div>
                )}

                <button
                  className="button primary"
                  disabled={loading || !tournamentName.trim() || !question.trim() || draftOptions.filter(Boolean).length < 2 || !closesAt || !feeRate}
                  type="submit"
                  style={{ width: "100%", marginTop: "12px" }}
                >
                  Create Question & Open Betting
                </button>
              </form>
            </section>
          )}

          {activeTab === "running" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Running Questions</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {runningTournamentFilter && filteredRunningPredictions.length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={savePredictionOrder} style={{ height: "24px", fontSize: "10px", padding: "0 10px" }}>
                        Save Question Order
                      </button>
                    )}
                    <span className="micro">{runningTournamentFilter ? `${filteredRunningPredictions.length} Question` : `${runningPredictions.length} items`}</span>
                  </div>
                </div>
                <div className="admin-help" style={{ padding: "8px 0", margin: "4px 0" }}>
                  <span>Close Now = Stop accepting bets (question moves to table below awaiting resolution)</span>
                  <span>Resolve = Select winning answer and distribute prizes</span>
                  <span>Cancel + Refund = Cancel question and refund all coins</span>
                </div>

                {/* Tournament Selector */}
                <div style={{ display: "grid", gap: "4px", marginBottom: "12px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Select Tournament to view Running Questions</span>
                  <select 
                    className="button" 
                    value={runningTournamentFilter} 
                    onChange={(e) => setRunningTournamentFilter(e.target.value)} 
                    style={{ width: "100%", height: "38px" }}
                  >
                    <option value="">-- Select Tournament --</option>
                    {settings.tournaments
                      ?.map((t) => {
                        const info = getTournamentInfo(t);
                        return { name: info.name, archived: info.archived };
                      })
                      .sort((a, b) => {
                        if (a.archived !== b.archived) return a.archived ? 1 : -1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.archived ? "" : ""}{t.name}
                        </option>
                      ))}
                  </select>
                </div>
                
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {!runningTournamentFilter ? (
                    <div className="question"><strong>Please Select a Tournament</strong><span className="meta">Select a tournament from the dropdown above to view and manage questions</span></div>
                  ) : (
                    currentRunning.length > 0 ? currentRunning.map((item) => {
                    const globalIdx = localOrder.indexOf(item.id);
                    return (
                      <div key={item.id} className="question running" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                        {/* Hamburger menu & reorder questions */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                          <span style={{ fontSize: "14px", color: "var(--muted)", cursor: "grab", lineHeight: "1" }} title="Drag to reorder question">☰</span>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button className="button" type="button" disabled={globalIdx <= 0} onClick={() => moveLocalOrder(item.id, "up")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                            <button className="button" type="button" disabled={globalIdx === -1 || globalIdx >= localOrder.length - 1} onClick={() => moveLocalOrder(item.id, "down")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "6px", width: "100%" }}>
                          <div className="question-main">
                            <strong>{item.question}</strong>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "2px", marginBottom: "4px" }}>
                              <span className="meta">{item.tournamentName} · Closes {displayDate(item.closesAt)} UTC+7 · {item.options.length} answers</span>
                              {editingId !== item.id ? (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => {
                                    setEditingId(item.id);
                                    setEditClosesAt((current) => ({ ...current, [item.id]: toDateTimeLocal(new Date(item.closesAt || "")) }));
                                    setEditQuestions((current) => ({ ...current, [item.id]: item.question }));
                                    setEditTournamentNames((current) => ({ ...current, [item.id]: item.tournamentName }));

                                    const initialOpts: Record<string, string> = {};
                                    item.options.forEach(o => {
                                      initialOpts[o.id] = o.label;
                                    });
                                    setEditOptionsInputs((current) => ({ ...current, [item.id]: initialOpts }));
                                  }} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ✏️ Edit Question & Answers
                                </button>
                              ) : (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => setEditingId(null)} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>

                            {/* Edit Q&A slide-open full form */}
                            {editingId === item.id && (
                              <div style={{ display: "grid", gap: "10px", marginTop: "10px", marginBottom: "10px", background: "rgba(255,225,0,0.03)", padding: "12px", borderRadius: "8px", border: "1px solid var(--hairline)", width: "100%", textAlign: "left" }}>
                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Move Tournament:</span>
                                  <select
                                    value={editTournamentNames[item.id] || item.tournamentName}
                                    onChange={(e) => setEditTournamentNames((current) => ({ ...current, [item.id]: e.target.value }))}
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%", color: editTournamentNames[item.id] !== item.tournamentName ? "var(--yellow)" : "var(--text)" }}
                                  >
                                    {(settings.tournaments || []).map((t) => {
                                      const info = getTournamentInfo(t);
                                      return <option key={info.name} value={info.name}>{info.archived ? `${info.name}` : info.name}</option>;
                                    })}
                                  </select>
                                  {editTournamentNames[item.id] && editTournamentNames[item.id] !== item.tournamentName && (
                                    <span className="meta" style={{ fontSize: "9px", color: "var(--yellow)" }}>⚠️ Moving from "{item.tournamentName}" → "{editTournamentNames[item.id]}"</span>
                                  )}
                                </div>

                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Edit Question Text:</span>
                                  <input 
                                    type="text" 
                                    value={editQuestions[item.id] !== undefined ? editQuestions[item.id] : item.question} 
                                    onChange={(e) => setEditQuestions((current) => ({ ...current, [item.id]: e.target.value }))} 
                                    placeholder="Enter new question text..." 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Edit Closing Time (UTC+7):</span>
                                  <input 
                                    type="datetime-local" 
                                    value={editClosesAt[item.id] || ""} 
                                    onChange={(event) => setEditClosesAt((current) => ({ ...current, [item.id]: event.target.value }))} 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", width: "100%", background: "var(--card)" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "6px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Answer Options (locked — cannot be changed after creation):</span>
                                  <div style={{ display: "grid", gap: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                                    {item.options.map((option) => {
                                      return (
                                        <div key={option.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", alignItems: "center", gap: "8px" }}>
                                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>#{option.sortOrder + 1}</span>
                                          <input 
                                            type="text" 
                                            value={option.label} 
                                            disabled
                                            style={{ height: "26px", fontSize: "11px", padding: "0 8px", background: "var(--card-2)", width: "100%", cursor: "not-allowed", opacity: 0.5 }} 
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <button 
                                  className="button gold" 
                                  type="button" 
                                  disabled={loading} 
                                  onClick={() => savePredictionEdits(item.id)} 
                                  style={{ height: "32px", fontSize: "11px", fontWeight: "bold", marginTop: "4px" }}
                                >
                                  Save Q&A Edits
                                </button>
                              </div>
                            )}
                          </div>
                          {renderPredictionControls(item)}
                          {renderPayoutBreakdown(item)}
                        </div>
                      </div>
                    );
                    }
                  ) : <div className="question"><strong>No questions in this tournament</strong></div>
                )}
                </div>
                {runningTournamentFilter && runningTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={runningPage <= 1} onClick={() => setRunningPage(runningPage - 1)}>Previous</button>
                    <span className="micro">Page {runningPage} / {runningTotalPages}</span>
                    <button className="button" disabled={runningPage >= runningTotalPages} onClick={() => setRunningPage(runningPage + 1)}>Next</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>Awaiting Results</h3><span className="micro">{filteredPendingPredictions.length} items</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentPending.length ? currentPending.map((item) => (
                    <div key={item.id} className="question closed" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · Closed {displayDate(item.closesAt)} UTC+7 · {item.options.length} answers</span>
                      </div>
                      {renderPredictionControls(item)}
                      {renderPayoutBreakdown(item)}
                    </div>
                  )) : <div className="question"><strong>No questions closed and awaiting results at this time</strong></div>}
                </div>
                {pendingTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={pendingPage <= 1} onClick={() => setPendingPage(pendingPage - 1)}>Previous</button>
                    <span className="micro">Page {pendingPage} / {pendingTotalPages}</span>
                    <button className="button" disabled={pendingPage >= pendingTotalPages} onClick={() => setPendingPage(pendingPage + 1)}>Next</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>Resolved Questions</h3><span className="micro">{filteredResolvedPredictions.length} items</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentResolved.length ? currentResolved.map((item) => (
                    <div key={item.id} className="question resolved" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                        <span style={{ fontSize: "14px", color: "var(--green)" }}>✅</span>
                      </div>
                      <div style={{ display: "grid", gap: "6px", width: "100%" }}>
                        <div className="question-main">
                          <strong>{item.question}</strong>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "2px", marginBottom: "4px" }}>
                            <span className="meta">{item.tournamentName} · Closes {displayDate(item.closesAt)} UTC+7 · {item.options.length} answers · {item.entryCount || 0} bettors</span>
                            <span className="pill" style={{ background: "rgba(14,203,129,0.12)", color: "var(--green)", fontSize: "9px" }}>Resolved</span>
                          </div>
                        </div>
                        {renderPredictionControls(item)}
                        {renderPayoutBreakdown(item)}
                      </div>
                    </div>
                  )) : <div className="question"><strong>No resolved questions yet</strong></div>}
                </div>
                {resolvedTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={resolvedPage <= 1} onClick={() => setResolvedPage(resolvedPage - 1)}>Previous</button>
                    <span className="micro">Page {resolvedPage} / {resolvedTotalPages}</span>
                    <button className="button" disabled={resolvedPage >= resolvedTotalPages} onClick={() => setResolvedPage(resolvedPage + 1)}>Next</button>
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>

              {/* ── Frontpage Features (Enable/Disable) ── */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>Frontpage Features</h2>
                </div>
                <form className="modal-body" onSubmit={(e) => { e.preventDefault(); saveFrontendSettings(); }} style={{ padding: "12px 0 0 0", display: "grid", gap: "12px" }}>
                  
                  {/* Enable/Disable Toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text)" }}>Enable Frontpage Features</div>
                      <div style={{ fontSize: "10px", color: "var(--muted)" }}>Show YouTube embed + Special Claim on homepage</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFrontendEnabled(v => !v)}
                      style={{
                        width: "48px",
                        height: "26px",
                        borderRadius: "13px",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        background: frontendEnabled ? "var(--green)" : "var(--hairline)",
                        position: "relative",
                      }}
                    >
                      <div style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: "3px",
                        left: frontendEnabled ? "24px" : "3px",
                        transition: "left 0.2s",
                      }} />
                    </button>
                  </div>

                  {/* YouTube Embed */}
                  <div style={{ display: "grid", gap: "8px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>YouTube URL</span>
                    <input 
                      type="text"
                      value={youtubeUrl} 
                      onChange={(event) => setYoutubeUrl(event.target.value)} 
                      placeholder="https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
                      style={{ fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "8px", color: "var(--text)" }}
                    />
                    
                    {/* ── Mode Toggle ── */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                      <input 
                        type="checkbox" 
                        id="youtubeOpenNow"
                        checked={youtubeOpenNow} 
                        onChange={(e) => setYoutubeOpenNow(e.target.checked)}
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--green)" }}
                      />
                      <label htmlFor="youtubeOpenNow" style={{ fontSize: "11px", fontWeight: "600", color: "var(--text)", cursor: "pointer" }}>
                        Always On (No schedule needed)
                      </label>
                    </div>

                    {/* Schedule inputs — always show end time, start time only when not "open now" */}
                    <div style={{ display: "grid", gridTemplateColumns: youtubeOpenNow ? "1fr" : "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                      {!youtubeOpenNow && (
                        <div>
                          <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>Start Time (Thai Time)</span>
                          <input 
                            type="datetime-local"
                            value={youtubeScheduleStart} 
                            onChange={(event) => setYoutubeScheduleStart(event.target.value)} 
                            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "6px", color: "var(--text)", marginTop: "2px" }}
                          />
                        </div>
                      )}
                      <div>
                        <span className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>End Time (Thai Time)</span>
                        <input 
                          type="datetime-local"
                          value={youtubeScheduleEnd} 
                          onChange={(event) => setYoutubeScheduleEnd(event.target.value)} 
                          style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: "11px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--hairline)", borderRadius: "6px", padding: "6px", color: "var(--text)", marginTop: "2px" }}
                        />
                      </div>
                    </div>
                    <span className="meta" style={{ fontSize: "9px", color: "var(--muted)" }}>Leave end time empty to display continuously</span>
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", height: "36px", fontWeight: "bold", marginTop: "4px" }}>Save Frontpage Settings</button>
                </form>
              </div>


            </section>
          )}

          {activeTab === "tournaments" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>Tournaments (Tournament List)</h2></div>
                <div className="modal-body" style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament Name</span>
                      <input value={newTournamentInput} onChange={(event) => setNewTournamentInput(event.target.value)} placeholder="e.g., PUBG Mobile Pro League" style={{ height: "34px", border: "1px solid var(--hairline)" }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTournament(); } }} />
                    </div>
                    
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--muted)" }}>Tournament Logo (small square image)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input type="file" accept="image/*" onChange={(event) => handleTournamentLogo(event.target.files?.[0])} style={{ flex: 1 }} />
                        {newTournamentLogoUrl && (
                          <img src={newTournamentLogoUrl} alt="Preview" style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "contain", background: "transparent" }} />
                        )}
                      </div>
                    </div>
                    
                    <button className="button gold" disabled={loading || !newTournamentInput.trim()} type="button" onClick={addTournament} style={{ height: "34px", marginTop: "4px" }}>Add Tournament</button>
                  </div>
                  
                  <div className="admin-option-list">
                    {!(settings.tournaments && settings.tournaments.length > 0) ? (
                      <div className="reward-line"><span>No tournaments listed</span></div>
                    ) : (
                      (() => {
                        const all = (settings.tournaments || []).map((t, i) => ({ ...getTournamentInfo(t), originalIndex: i }));
                        const active = all.filter((t) => !t.archived);
                        const archived = all.filter((t) => t.archived);
                        return (
                          <>
                            {/* Active tournaments */}
                            {active.map((tInfo, idx) => {
                              const tName = tInfo.name;
                              const tLogo = tInfo.logoUrl;
                              const realIdx = tInfo.originalIndex;
                              return (
                                <div key={tName} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "8px", alignItems: "center" }}>
                                  {/* Move up/down buttons */}
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                    <button className="button" type="button" disabled={idx <= 0} onClick={() => {
                                      const arr = [...(settings.tournaments || [])];
                                      if (realIdx > 0) {
                                        [arr[realIdx - 1], arr[realIdx]] = [arr[realIdx], arr[realIdx - 1]];
                                        setSettings(current => ({ ...current, tournaments: arr }));
                                      }
                                    }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                                    <button className="button" type="button" disabled={idx >= active.length - 1} onClick={() => {
                                      const arr = [...(settings.tournaments || [])];
                                      if (realIdx >= 0 && realIdx < arr.length - 1) {
                                        [arr[realIdx], arr[realIdx + 1]] = [arr[realIdx + 1], arr[realIdx]];
                                        setSettings(current => ({ ...current, tournaments: arr }));
                                      }
                                    }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    {tLogo ? (
                                      <img src={tLogo} alt="" style={{ width: "20px", height: "20px", borderRadius: "4px", objectFit: "contain", background: "transparent" }} />
                                    ) : (
                                      <span style={{ fontSize: "12px" }}>#</span>
                                    )}
                                    <span>{tName}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <label style={{ cursor: "pointer" }}>
                                      <span className="button gold" style={{ height: "24px", fontSize: "10px", padding: "0 8px", display: "inline-flex", alignItems: "center" }}>
                                        {tLogo ? "Change Logo" : "Upload Logo"}
                                      </span>
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={(event) => updateTournamentLogo(tName, event.target.files?.[0])} 
                                        style={{ display: "none" }} 
                                      />
                                    </label>
                                    <button className="button" type="button" disabled={loading} onClick={() => toggleArchiveTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>hidden</button>
                                    <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>Delete</button>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Archived tournaments (compact, collapsible) */}
                            {archived.length > 0 && (
                              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed var(--hairline)" }}>
                                <button
                                  type="button"
                                  onClick={() => setShowArchived((v) => !v)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--muted)",
                                    fontSize: "10px",
                                    padding: "4px",
                                    cursor: "pointer",
                                    textAlign: "left"
                                  }}
                                >
                                  <span style={{ fontSize: "10px", display: "inline-block", width: "12px" }}>
                                    {showArchived ? "▼" : "▶"}
                                  </span>
                                  <span>Hidden Tournaments ({archived.length})</span>
                                </button>
                                {showArchived && (
                                  <div style={{ marginTop: "4px" }}>
                                    {archived.map((tInfo) => {
                                      const tName = tInfo.name;
                                      return (
                                        <div key={tName} className="reward-line" style={{ padding: "4px 0", borderBottom: "1px solid var(--hairline-soft)", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "center", opacity: 0.5 }}>
                                          <span style={{ fontSize: "12px", textDecoration: "line-through" }}>{tName}</span>
                                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <button className="button" type="button" disabled={loading} onClick={() => toggleArchiveTournament(tName)} style={{ height: "20px", fontSize: "10px", padding: "0 6px" }}>Show</button>
                                            <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "20px", fontSize: "10px", padding: "0 6px" }}>Delete</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                    {(settings.tournaments || []).length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={async () => {
                        try {
                          setLoading(true);
                          const res = await fetch("/api/admin/settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tournaments: settings.tournaments })
                          });
                          const payload = await res.json();
                          if (payload.ok) {
                            setSettings(current => ({ ...current, tournaments: payload.data?.tournaments || current.tournaments }));
                            alert("Tournament order saved");
                          }
                        } catch (e) {
                          alert("An error occurred");
                        } finally {
                          setLoading(false);
                        }
                      }} style={{ height: "34px", fontSize: "12px", padding: "0 16px", marginTop: "12px", width: "100%" }}>
                        Save Tournament Order
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "admins" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>System Admins</h3><span className="micro">{admins.length} players</span></div>
                <form className="modal-body" onSubmit={makeAdmin} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px" }}>
                    <input value={adminEmailInput} onChange={(event) => setAdminEmailInput(event.target.value)} placeholder="Enter user email here" style={{ height: "34px", border: "1px solid var(--hairline)" }} />
                    <button className="button gold" disabled={loading} type="submit">Add New Admin</button>
                  </div>
                  <div className="admin-option-list">
                    {admins.map((admin) => (
                      <div key={admin.id} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                        <span>{admin.displayName || admin.email} ({admin.email})</span>
                        {admin.email.toLowerCase() === adminEmail.toLowerCase() ? (
                          <b className="accent-gold">You (Main Admin)</b>
                        ) : (
                          <button className="button" type="button" disabled={loading} onClick={() => removeAdmin(admin.email)}>Remove Admin</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="meta" style={{ display: "block", marginTop: "12px", lineHeight: "1.4" }}>Note: New admin must have previously signed up/in on the main site at least once for their data to exist in the Supabase database</span>
                </form>
              </section>
            </section>
          )}

          {activeTab === "users" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>User Management ({users.length} users)</h3>
                  <button className="button gold" onClick={loadUsers} disabled={usersLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    Refresh
                  </button>
                </div>

                {usersLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>Loading user data...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "name", dir: s.key === "name" && s.dir === "asc" ? "desc" : "asc" })); }}>Username ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "email", dir: s.key === "email" && s.dir === "asc" ? "desc" : "asc" })); }}>Email ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", textAlign: "right", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "coinBalance", dir: s.key === "coinBalance" && s.dir === "asc" ? "desc" : "asc" })); }}>Coin Balance ⬍</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Admin</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "createdAt", dir: s.key === "createdAt" && s.dir === "asc" ? "desc" : "asc" })); }}>Created ⬍</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Address</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Last Claim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const sorted = [...users].sort((a, b) => {
                            const dir = userSort.dir === "asc" ? 1 : -1;
                            const key = userSort.key;
                            if (key === "name") return dir * (a.name || "").localeCompare(b.name || "");
                            if (key === "email") return dir * (a.email || "").localeCompare(b.email || "");
                            if (key === "coinBalance") return dir * ((a.coinBalance || 0) - (b.coinBalance || 0));
                            if (key === "createdAt") return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                            return 0;
                          });
                          const userPageSize = 20;
                          const totalPages = Math.max(1, Math.ceil(sorted.length / userPageSize));
                          const safePage = Math.min(userPage, totalPages);
                          const start = (safePage - 1) * userPageSize;
                          const paged = sorted.slice(start, start + userPageSize);
                          return paged.map((u) => (
                            <tr key={u.id} style={{ borderBottom: "1px solid var(--hairline-soft)", transition: "background 120ms" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                              <td style={{ padding: "8px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{u.name || "-"}</td>
                              <td style={{ padding: "8px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>{u.email || "-"}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600 }}>{Number(u.coinBalance || 0).toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "center" }}>{u.isAdmin ? "✅" : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.createdAt ? new Date(u.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--text)", fontSize: "10px", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={u.shippingAddress || u.shippingName || undefined}>
                                {u.shippingName ? `${u.shippingName}${u.shippingAddress ? ', ' + u.shippingAddress.slice(0, 30) + '...' : ''}` : (u.shippingAddress ? u.shippingAddress.slice(0, 30) + '...' : '-')}
                              </td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.lastClaimAt ? new Date(u.lastClaimAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>

                    {users.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "8px", borderTop: "1px solid var(--hairline-soft)" }}>
                        <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                          Showing {Math.min((userPage - 1) * 20 + 1, users.length)}–{Math.min(userPage * 20, users.length)} of {users.length} users
                        </span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button className="button" disabled={userPage <= 1} onClick={() => setUserPage(p => Math.max(1, p - 1))} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>◀ Previous</button>
                          <span style={{ color: "var(--text)", fontSize: "11px", fontWeight: 600, minWidth: "40px", textAlign: "center" }}>Page {userPage}</span>
                          <button className="button" disabled={userPage >= Math.max(1, Math.ceil(users.length / 20))} onClick={() => setUserPage(p => p + 1)} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>Next ▶</button>
                        </div>
                      </div>
                    )}

                    {users.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>No users in the system</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "contests" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", margin: "0 auto", background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>Contests</h3>
                <div>
                  <button className="button gold" onClick={() => setShowNewContestForm(true)} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    + Create Contest
                  </button>
                </div>
              </div>

              {/* New Contest Form */}
              {showNewContestForm && (
                <section style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.02)", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                  <h4 style={{ color: "var(--yellow)", marginBottom: "12px", fontSize: "12px" }}>+ Create Contest</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Contest Name *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="e.g., July Competition"
                        value={newContestName}
                        onChange={(e) => setNewContestName(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Description</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="Additional description (optional)"
                        value={newContestDescription}
                        onChange={(e) => setNewContestDescription(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>1st Prize *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="e.g., Concert tickets, T-shirt, Trophy..."
                        value={newContestPrize1}
                        onChange={(e) => setNewContestPrize1(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>2nd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize2}
                        onChange={(e) => setNewContestPrize2(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>3rd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize3}
                        onChange={(e) => setNewContestPrize3(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>4th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize4}
                        onChange={(e) => setNewContestPrize4(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>5th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize5}
                        onChange={(e) => setNewContestPrize5(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ color: "var(--text)", fontSize: "10px", padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: "4px" }}>
                      ⚠️ Winner (Top 1) will receive all 5 prizes
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>End Time * (GMT+7)</label>
                      <input
                        type="datetime-local"
                        className="button"
                        value={newContestEndTime}
                        onChange={(e) => setNewContestEndTime(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button type="button" className="button" onClick={() => {
                        setShowNewContestForm(false);
                        setShowEditContestForm(false);
                        setEditingContestId(null);
                      }} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Cancel
                      </button>
                      {editingContestId ? (
                        <button type="button" className="button gold" onClick={handleEditContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                          Save
                        </button>
                      ) : (
                        <button type="button" className="button gold" onClick={handleCreateContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                          Create
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Edit Contest Modal */}
              {showEditContestForm && editingContestId && (
                <section style={{ border: "1px solid var(--hairline)", background: "rgba(255,255,255,0.02)", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
                  <h4 style={{ color: "var(--yellow)", marginBottom: "12px", fontSize: "12px" }}>✏️ Edit Contest</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Contest Name *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="Contest Name"
                        value={newContestName}
                        onChange={(e) => setNewContestName(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>Description</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="Description ( facultative)"
                        value={newContestDescription}
                        onChange={(e) => setNewContestDescription(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>1st Prize *</label>
                      <input
                        type="text"
                        className="button"
                        placeholder="e.g., Concert tickets, T-shirt, Trophy..."
                        value={newContestPrize1}
                        onChange={(e) => setNewContestPrize1(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>2nd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize2}
                        onChange={(e) => setNewContestPrize2(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>3rd Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize3}
                        onChange={(e) => setNewContestPrize3(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>4th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize4}
                        onChange={(e) => setNewContestPrize4(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>5th Prize</label>
                      <input
                        type="text"
                        className="button"
                        placeholder=" facultative"
                        value={newContestPrize5}
                        onChange={(e) => setNewContestPrize5(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ color: "var(--text)", fontSize: "10px", padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: "4px" }}>
                      ⚠️ Winner (Top 1) will receive all 5 prizes
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "var(--muted)" }}>End Time * (GMT+7)</label>
                      <input
                        type="datetime-local"
                        className="button"
                        value={newContestEndTime}
                        onChange={(e) => setNewContestEndTime(e.target.value)}
                        style={{ width: "100%", height: "32px", padding: "0 8px", fontSize: "12px" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button type="button" className="button" onClick={() => {
                        setShowEditContestForm(false);
                        setEditingContestId(null);
                      }} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Cancel
                      </button>
                      <button type="button" className="button gold" onClick={handleEditContest} style={{ flex: 1, height: "30px", fontSize: "11px" }}>
                        Save
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {contestsLoading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>Loading...</div>
              ) : contests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                  <strong>No contests yet</strong>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {contests.map((contest) => (
                    <div key={contest.id} style={{ border: "1px solid var(--hairline)", borderRadius: "8px", padding: "12px", background: "var(--bg)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                        <div>
                          <strong style={{ color: "var(--yellow)", fontSize: "14px" }}>{contest.name}</strong>
                          {contest.status === "active" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--green)", color: "white", borderRadius: "4px" }}>Active</span>
                          )}
                          {contest.status === "ended" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--muted)", color: "white", borderRadius: "4px" }}>Ended</span>
                          )}
                          {contest.status === "cancelled" && (
                            <span style={{ marginLeft: "8px", fontSize: "10px", padding: "2px 6px", background: "var(--red)", color: "white", borderRadius: "4px" }}>Cancel</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {contest.status === "active" && (
                            <>
                              <button className="button" onClick={() => {
                                // Open edit modal
                                setEditingContestId(contest.id);
                                setNewContestName(contest.name || "");
                                setNewContestDescription(contest.description || "");
                                // Convert UTC to GMT+7 for datetime-local
                                const localDate = new Date(new Date(contest.end_time).getTime() + 7 * 60 * 60 * 1000);
                                setNewContestEndTime(localDate.toISOString().slice(0, 16));
                                setNewContestPrize1(contest.prize_1 || "");
                                setNewContestPrize2(contest.prize_2 || "");
                                setNewContestPrize3(contest.prize_3 || "");
                                setNewContestPrize4(contest.prize_4 || "");
                                setNewContestPrize5(contest.prize_5 || "");
                                setShowEditContestForm(true);
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                ✏️ Edit
                              </button>
                              <button className="button gold" onClick={async () => {
                                if (confirm(`Confirm ending this contest?\nThe system will check Rank 1 on the leaderboard and set as winner\nWinner will receive all prizes ${[contest.prize_1, contest.prize_2, contest.prize_3, contest.prize_4, contest.prize_5].filter(Boolean).length} prizes`)) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "end_contest", status: "ended" }),
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                      const winner = updatePayload.winner;
                                      if (winner) {
                                        alert(`Contest ended!\n\nWinner: ${winner.display_name || winner.shipping_name || winner.id}\n\n${winner.shipping_address ? '✅ Shipping Address:\n' + winner.shipping_name + '\n' + winner.shipping_address + '\n' + winner.shipping_zipcode + '\n' + winner.shipping_phone : '⚠️ Winner has not filled in shipping address!'}`);
                                      } else {
                                        alert("Contest ended! Winner (Top 1) receives all prizes");
                                      }
                                    } else {
                                      alert("Failed: " + updatePayload.error);
                                    }
                                  } catch (e) {
                                    alert("Failed");
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                End Contest (Top 1 gets all prizes)
                              </button>
                              <button className="button" onClick={async () => {
                                if (confirm("Confirm canceling this contest?")) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ status: "cancelled" }),
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                    }
                                  } catch (e) {
                                    // Ignored
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px", color: "#ff4d4f", borderColor: "#ff4d4f" }}>
                                ❌ Cancel
                              </button>
                            </>
                          )}
                          {contest.status === "ended" && (
                            <>
                              <button className="button" onClick={async () => {
                                const newWinnerId = prompt("Enter new winner User ID:");
                                if (!newWinnerId) return;
                                try {
                                  const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ winner_user_id: newWinnerId }),
                                  });
                                  const updatePayload = await updateRes.json();
                                  if (updatePayload.ok) {
                                    loadContests();
                                    alert("Winner updated");
                                  } else {
                                    alert("Failed: " + updatePayload.error);
                                  }
                                } catch (e) {
                                  alert("Failed");
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px" }}>
                                Change Winner
                              </button>
                              <button className="button" onClick={async () => {
                                if (confirm("Confirm deleting this contest?")) {
                                  try {
                                    const updateRes = await fetch(`/api/admin/contests/${contest.id}`, {
                                      method: "DELETE",
                                    });
                                    const updatePayload = await updateRes.json();
                                    if (updatePayload.ok) {
                                      loadContests();
                                    }
                                  } catch (e) {
                                    // Ignored
                                  }
                                }
                              }} style={{ fontSize: "10px", padding: "4px 8px", height: "24px", color: "#ff4d4f", borderColor: "#ff4d4f" }}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {contest.description && (
                        <div style={{ fontSize: "11px", color: "var(--text)", marginBottom: "8px" }}>
                          {contest.description}
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                        <div>
                          <span style={{ color: "var(--muted)" }}>End Time:</span>
                          <strong style={{ marginLeft: "4px", color: "var(--text-strong)" }}>
                            {new Date(contest.end_time).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--muted)" }}>All prizes (Top 1 gets all):</span>
                          <div style={{ marginLeft: "4px", marginTop: "4px" }}>
                            {contest.prize_1 && <div style={{ color: "var(--yellow)", fontSize: "11px" }}>{contest.prize_1}</div>}
                            {contest.prize_2 && <div style={{ color: "var(--text)", fontSize: "11px" }}>{contest.prize_2}</div>}
                            {contest.prize_3 && <div style={{ color: "var(--text)", fontSize: "11px" }}>{contest.prize_3}</div>}
                            {contest.prize_4 && <div style={{ color: "var(--muted)", fontSize: "11px" }}>{contest.prize_4}</div>}
                            {contest.prize_5 && <div style={{ color: "var(--muted)", fontSize: "11px" }}>{contest.prize_5}</div>}
                            {!contest.prize_1 && !contest.prize_2 && !contest.prize_3 && !contest.prize_4 && !contest.prize_5 && <strong style={{ color: "var(--yellow)" }}>No prizes listed</strong>}
                          </div>
                        </div>
                      </div>

                      {contest.winner_user_id && (
                        <div style={{ marginTop: "12px", padding: "8px", background: "rgba(255, 225, 0, 0.1)", borderRadius: "6px", border: "1px solid rgba(255, 225, 0, 0.3)" }}>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                            Winner:
                            <strong style={{ color: "var(--yellow)", marginLeft: "4px" }}>
                              {contest.winner?.display_name || contest.winner?.shipping_name || "Unknown"}
                            </strong>
                          </div>
                          {contest.winner && contest.winner.shipping_address ? (
                            <div style={{ fontSize: "10px", color: "var(--text)", whiteSpace: "pre-wrap" }}>
                              ✅ Shipping Address:
                              <div style={{ marginTop: "4px", color: "var(--text-strong)" }}>
                                {contest.winner.shipping_name}<br />
                                {contest.winner.shipping_address}<br />
                                {contest.winner.shipping_zipcode}<br />
                                {contest.winner.shipping_phone}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "10px", color: "var(--red)" }}>
                              ⚠️ Winner has not filled in shipping address!
                              <button className="button" style={{ marginLeft: "6px", fontSize: "9px", padding: "2px 6px", height: "20px" }} onClick={() => {
                                if (confirm("Send notification to winner to fill in shipping address?")) {
                                  // Just show alert for now
                                  alert("Notification will be sent to the winner");
                                }
                              }}>
                                Notify
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "reports" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Reports ({reports.length} items)</h3>
                  <div style={{ display: "flex", gap: "6px" }}>

                    <button className="button gold" onClick={loadReports} disabled={reportsLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                      Refresh
                    </button>
                  </div>
                </div>

                {reportsLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>Loading...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Email</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>message</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Status</th>

                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Date</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid var(--hairline-soft)", transition: "background 120ms" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "8px", color: "var(--text)", whiteSpace: "nowrap" }}>{r.email || "-"}</td>
                            <td style={{ padding: "8px", color: "var(--text-strong)", maxWidth: "400px", whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.5" }}>{r.message || "-"}</td>
                            <td style={{ padding: "8px", textAlign: "center" }}>
                              {r.status === "pending" ? (
                                <span style={{ color: "var(--yellow)", fontWeight: 700, fontSize: "10px" }}>⏳ Pending</span>
                              ) : (
                                <span style={{ color: "var(--green)", fontWeight: 700, fontSize: "10px" }}>✅ Completed</span>
                              )}
                            </td>
                            <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>
                              {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                            </td>
                            <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                              {r.status === "pending" && (
                                <button className="button gold" style={{ height: "22px", fontSize: "10px", padding: "0 8px", marginLeft: "4px" }} onClick={() => handleUpdateReport(r.id, "resolved")}>
                                  Resolved
                                </button>
                              )}
                              <button className="button" style={{ height: "22px", fontSize: "10px", padding: "0 8px", marginLeft: "4px", color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }} onClick={() => handleUpdateReport(r.id, r.status, true)}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reports.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>No reports</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}


        </section>
      </div>
    </main>
  );
}
