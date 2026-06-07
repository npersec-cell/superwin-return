"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NotificationBell from "./NotificationBell";

type AdminPrediction = {
  id: string;
  tournamentName: string;
  question: string;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  feeRate: number;
  createdAt: string;
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
    optionLabel: string;
    amount: number;
    createdAt: string;
  }[];
};

type TournamentItem = {
  name: string;
  logoUrl: string;
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
    approved: boolean;
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
  if (status === "open") return "กำลังเปิด";
  if (status === "closed") return "ปิดรับแล้ว";
  if (status === "resolved") return "สรุปผลแล้ว";
  if (status === "canceled") return "ยกเลิกแล้ว";
  if (status === "draft") return "ฉบับร่าง";
  return status;
}

const defaultSettings: SiteSettings = {
  info: {
    howToPlay: "ล็อกอิน ➔ กดรับเหรียญฟรีทุก 1 ชั่วโมง ➔ เลือกวิเคราะห์ทีมที่ชอบ ➔ ใส่จำนวนเหรียญแล้วกดยืนยันคำทายผล",
    reward: "เล่นได้ตลอดเวลาไม่มีจบ สะสมกำไรสุทธิเพื่อขึ้นอันดับ All time Top 10 และแลกของรางวัลผ่าน Shop (เร็วๆ นี้)",
    questionTime: "แต่ละคำถามมีเวลานับถอยหลังปิดรับทายแยกอิสระ เมื่อปิดทายผลแล้วแอดมินจะทำการสรุปและแจกจ่ายเหรียญรางวัลสุทธิทันที"
  },
  reward: {
    name: "Shop",
    winnerBy: "All time Profit",
    month: "Continuous",
    approved: false
  },
  tournaments: [{ name: "Super League", logoUrl: "" }],
  savedQuestions: [
    "Which team will win the championship?",
    "Which team will get the Chicken Dinner?",
    "Who will get the most kills in this match?"
  ],
  savedRounds: [
    "แบ่งกลุ่ม",
    "รอบ 16 ทีม",
    "รอบ 8 ทีม",
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
    throw new Error(`API ${url} ไม่ได้ตอบ JSON (status ${response.status}, type ${contentType || "none"}) ${shortText}`);
  }
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(`API ${url}: ${payload.error || "คำสั่งไม่สำเร็จ"}`);
  }
  return payload.data;
}

export default function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [predictions, setPredictions] = useState<AdminPrediction[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tournamentName, setTournamentName] = useState("Super League");
  const [question, setQuestion] = useState("");
  const [round, setRound] = useState("");
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(new Date()));
  const [closesAt, setClosesAt] = useState(toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [feeRate, setFeeRate] = useState("0.03");
  const [optionInput, setOptionInput] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [newTournamentInput, setNewTournamentInput] = useState("");
  const [newTournamentLogoUrl, setNewTournamentLogoUrl] = useState("");
  const [showQuickTournament, setShowQuickTournament] = useState(false);
  const [quickTournamentInput, setQuickTournamentInput] = useState("");
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
  const [topUsers, setTopUsers] = useState<Array<{ id: string; email: string; displayName: string; lifetimeProfit?: number }>>([]);
  const [editClosesAt, setEditClosesAt] = useState<Record<string, string>>({});
  const [editQuestions, setEditQuestions] = useState<Record<string, string>>({});
  const [editOptionsInputs, setEditOptionsInputs] = useState<Record<string, Record<string, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // แท็บเมนูหลังบ้าน
  const [activeTab, setActiveTab] = useState<"questions" | "running" | "settings" | "admins" | "tournaments" | "shop" | "dashboard" | "reports" | "users">("dashboard");
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSort, setUserSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [userPage, setUserPage] = useState(1);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [localOrder, setLocalOrder] = useState<string[]>([]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage("");
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

  // การแบ่งหน้าสำหรับคำถามที่กำลังรัน
  const [runningPage, setRunningPage] = useState(1);
  const [runningTournamentFilter, setRunningTournamentFilter] = useState("");
  const runningPageSize = 5;

  const filteredRunningPredictions = useMemo(() => {
    if (!runningTournamentFilter) return [];
    return sortedRunningPredictions.filter(p => p.tournamentName === runningTournamentFilter);
  }, [sortedRunningPredictions, runningTournamentFilter]);

  const runningTotalPages = Math.max(1, Math.ceil(filteredRunningPredictions.length / runningPageSize));
  const currentRunning = useMemo(() => {
    const start = (runningPage - 1) * runningPageSize;
    return filteredRunningPredictions.slice(start, start + runningPageSize);
  }, [filteredRunningPredictions, runningPage]);

  useEffect(() => {
    setRunningPage(1);
  }, [runningTournamentFilter]);

  // การแบ่งหน้าสำหรับคำถามที่หมดเวลา รอคำตอบ
  const [pendingPage, setPendingPage] = useState(1);
  const pendingPageSize = 5;
  const pendingTotalPages = Math.max(1, Math.ceil(pendingPredictions.length / pendingPageSize));
  const currentPending = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return pendingPredictions.slice(start, start + pendingPageSize);
  }, [pendingPredictions, pendingPage]);

  // การแบ่งหน้าสำหรับคำถามทั้งหมด
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
    if (data.tournaments && data.tournaments.length > 0) {
      const first = data.tournaments[0];
      const firstName = typeof first === "string" ? first : first.name;
      setTournamentName(firstName);
    }
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
        alert(payload.error || "ทำรายการไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย");
    }
  }

  async function reloadAll() {
    await Promise.all([loadPredictions(), loadAdmins(), loadSettings(), loadTopUsers(), loadDashboardData()]);
  }

  useEffect(() => {
    reloadAll().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
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
      setMessage(error instanceof Error ? error.message : "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
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
      setMessage("ไม่พบคำถามก่อนหน้า");
      return;
    }
    const labels = latest.options.sort((a, b) => a.sortOrder - b.sortOrder).map((o) => o.label);
    setDraftOptions(labels);
    setMessage(`ดึงตัวเลือกจากคำถามก่อนหน้า: ${latest.question}`);
  }

  // ── Option Set (ชุดตัวเลือก) management ───────────────────────
  function persistOptionSets(sets: OptionSet[]) {
    setSavedOptionSets(sets);
    localStorage.setItem("superwin_option_sets", JSON.stringify(sets));
  }

  function saveOptionSet() {
    const name = optionSetNameInput.trim();
    if (!name) {
      setMessage("กรุณาใส่ชื่อชุดตัวเลือก");
      return;
    }
    if (draftOptions.length < 2) {
      setMessage("ต้องมีตัวเลือกอย่างน้อย 2 ข้อถึงจะบันทึกเป็นชุดได้");
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
    setMessage(`บันทึกชุด "${name}" แล้ว (${draftOptions.length} ตัวเลือก)`);
  }

  function loadOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    setDraftOptions([...set.options]);
    setMessage(`โหลดชุด "${set.name}" แล้ว (${set.options.length} ตัวเลือก)`);
  }

  function deleteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (!window.confirm(`ลบชุดตัวเลือก "${set.name}"?`)) return;
    const updated = savedOptionSets.filter((s) => s.id !== id);
    persistOptionSets(updated);
    if (editingOptionSetId === id) {
      setEditingOptionSetId(null);
      setEditOptionSetNameInput("");
    }
    setMessage(`ลบชุด "${set.name}" แล้ว`);
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
    setMessage(`แก้ไขชื่อชุดเป็น "${name}" แล้ว`);
  }

  function overwriteOptionSet(id: string) {
    const set = savedOptionSets.find((s) => s.id === id);
    if (!set) return;
    if (
      !window.confirm(
        `บันทึกทับชุด "${set.name}" ด้วยตัวเลือกปัจจุบัน (${draftOptions.length} ข้อ)?`
      )
    )
      return;
    const updated = savedOptionSets.map((s) =>
      s.id === id ? { ...s, options: [...draftOptions] } : s
    );
    persistOptionSets(updated);
    setMessage(`บันทึกทับชุด "${set.name}" แล้ว`);
  }

  async function createPrediction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
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
      setMessage("สร้างคำถามแล้ว");
      setQuestion("");
      setRound("");
      setDraftOptions([]);
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function makeAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ email: string; role: string }>("/api/admin/users/make-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmailInput })
      });
      setMessage(`เพิ่ม ${data.email} เป็นแอดมินแล้ว`);
      setAdminEmailInput("");
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มแอดมินไม่สำเร็จ");
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
      setMessage("มีชื่อทัวร์นาเมนต์นี้อยู่แล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
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
      setMessage(`เพิ่มทัวร์นาเมนต์ ${name} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มทัวร์นาเมนต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeTournament(name: string) {
    const confirmed = window.confirm(`ลบทัวร์นาเมนต์ "${name}"? (คำถามที่มีอยู่จะไม่ถูกลบ แต่ทัวร์นาเมนต์นี้จะไม่แสดงในตัวเลือกสร้างคำถามใหม่)`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
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
      setMessage(`ลบทัวร์นาเมนต์ ${name} สำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบทัวร์นาเมนต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function updateTournamentLogo(tName: string, file: File | undefined) {
    if (!file) return;
    compressImage(file, async (b64) => {
      setLoading(true);
      setMessage("");
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
        setMessage(`อัปเดตโลโก้ทัวร์นาเมนต์ "${tName}" สำเร็จ`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "อัปเดตโลโก้ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    });
  }

  async function saveQuickTournament() {
    const name = quickTournamentInput.trim();
    if (!name) return;
    const exists = (settings.tournaments || []).some((t) => {
      const tName = typeof t === "string" ? t : t.name;
      return tName.toLowerCase() === name.toLowerCase();
    });
    if (exists) {
      setTournamentName(name);
      setQuickTournamentInput("");
      setShowQuickTournament(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const newTour: TournamentItem = { name, logoUrl: "" };
      const nextTournaments = [...(settings.tournaments || []), newTour];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournaments: nextTournaments })
      });
      setSettings(data);
      setTournamentName(name);
      setQuickTournamentInput("");
      setShowQuickTournament(false);
      setMessage(`เพิ่มและเลือกทัวร์นาเมนต์ ${name} แล้ว`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เพิ่มทัวร์นาเมนต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
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
      setMessage("มีคำถามนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = [...(settings.savedQuestions || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setMessage(`บันทึกแม่แบบคำถามสำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกแม่แบบคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeQuestionTemplate(name: string) {
    const confirmed = window.confirm(`ลบแม่แบบคำถาม "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).filter((q) => q !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setMessage(`ลบแม่แบบคำถามสำเร็จ`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบแม่แบบคำถามไม่สำเร็จ");
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
      setMessage("มีชื่อคำถามนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextQuestions = (settings.savedQuestions || []).map((q) => (q === oldName ? trimmed : q));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQuestions: nextQuestions })
      });
      setSettings(data);
      setEditingTemplate(null);
      setMessage("แก้ไขแม่แบบคำถามสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "แก้ไขแม่แบบคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveRoundTemplate() {
    const name = round.trim();
    if (!name) return;
    if (settings.savedRounds?.includes(name)) {
      setMessage("มีรอบนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = [...(settings.savedRounds || []), name];
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setMessage("บันทึกแม่แบบรอบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกแม่แบบรอบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeRoundTemplate(name: string) {
    const confirmed = window.confirm(`ลบแม่แบบรอบ "${name}"?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = (settings.savedRounds || []).filter((r) => r !== name);
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setMessage("ลบแม่แบบรอบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบแม่แบบรอบไม่สำเร็จ");
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
      setMessage("มีชื่อรอบนี้ในระบบแล้ว");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const nextRounds = (settings.savedRounds || []).map((r) => (r === oldName ? trimmed : r));
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRounds: nextRounds })
      });
      setSettings(data);
      setEditingRound(null);
      setMessage("แก้ไขแม่แบบรอบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "แก้ไขแม่แบบรอบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveInfoSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ info: settings.info })
      });
      setSettings(data);
      setMessage("บันทึกข้อความ Info สำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก Info ไม่สำเร็จ");
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
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionOrder: localOrder, announcement: settings.announcement })
      });
      setSettings(data);
      setMessage("บันทึกลำดับคำถามเข้าสู่ระบบสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกลำดับคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function savePredictionEdits(id: string) {
    const newTime = editClosesAt[id];
    const newQuestion = editQuestions[id];
    
    const updatedOptionsMap = editOptionsInputs[id] || {};
    const updatedOptionsList = Object.entries(updatedOptionsMap).map(([optId, label]) => ({
      id: optId,
      label
    }));

    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ ok: boolean }>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          closesAt: newTime,
          question: newQuestion,
          options: updatedOptionsList
        })
      });
      setMessage("อัปเดตรายละเอียดคำถามและคำตอบสำเร็จ");
      setEditingId(null);
      await reloadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveAnnouncementSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          announcement: settings.announcement
        })
      });
      setSettings(data);
      setMessage("บันทึกข้อความประกาศวิ่งหน้าแรกสำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อความประกาศไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<SiteSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward: settings.reward })
      });
      setSettings(data);
      setMessage("บันทึกการตั้งค่า Shop สำเร็จ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function removeAdmin(email: string) {
    const confirmed = window.confirm(`ถอดสิทธิ์แอดมินของ ${email}?`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<{ email: string; role: string }>("/api/admin/users/remove-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setMessage(`ถอด ${email} ออกจากแอดมินแล้ว`);
      await loadAdmins();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ถอดแอดมินไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      setMessage(`เปลี่ยนสถานะเป็น ${statusLabel(nextStatus)} แล้ว`);
      setPredictions((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function deletePrediction(id: string) {
    const confirmed = window.confirm("ลบคำถามนี้ถาวรออกจากระบบ? (ตัวเลือกคำตอบและรายการทายผลของคำถามนี้ทั้งหมดจะถูกลบออกไปด้วย และไม่สามารถย้อนคืนได้)");
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await requestJson<unknown>(`/api/admin/predictions/${id}`, { method: "DELETE" });
      setMessage("ลบคำถามถาวรเรียบร้อยแล้ว");
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบคำถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function resolvePrediction(item: AdminPrediction) {
    const winningOptionId = winningOptions[item.id];
    if (!winningOptionId) {
      setMessage("เลือกคำตอบที่ชนะก่อน");
      return;
    }
    const winningLabel = item.options.find((option) => option.id === winningOptionId)?.label || "";
    const confirmed = window.confirm(`ยืนยันสรุปผล?\n\nคำถาม: ${item.question}\nคำตอบที่ชนะ: ${winningLabel}\n\nหลังยืนยัน ระบบจะจ่ายผลและแก้กลับเองไม่ได้ในหน้านี้`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ winnersCount: number; insuredLosersCount: number; totalPaid: number }>(`/api/admin/predictions/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningOptionId })
      });
      setMessage(`สรุปผลแล้ว: ชนะ ${data.winnersCount || 0}, แพ้ ${data.insuredLosersCount || 0}, จ่าย ${data.totalPaid || 0}`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "resolved" } : row));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สรุปผลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function refundPrediction(item: AdminPrediction) {
    const confirmed = window.confirm(`ยืนยันยกเลิกและคืนเหรียญ?\n\nคำถาม: ${item.question}`);
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const data = await requestJson<{ refundedEntries: number; totalRefunded: number }>(`/api/admin/predictions/${item.id}/refund`, { method: "POST" });
      setMessage(`คืนเหรียญแล้ว: ${data.refundedEntries || 0} รายการ, ${data.totalRefunded || 0} เหรียญ`);
      setPredictions((current) => current.map((row) => row.id === item.id ? { ...row, status: "canceled" } : row));
      await loadPredictions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "คืนเหรียญไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function renderPredictionControls(item: AdminPrediction) {
    const disabled = loading || item.status === "resolved" || item.status === "canceled";
    return (
      <div className="admin-actions">
        {item.status !== "open" && item.status !== "resolved" && item.status !== "canceled" && (
          <button className="button gold" disabled={loading} onClick={() => updateStatus(item.id, "open")}>เปิดรับคำทาย</button>
        )}
        {item.status === "open" && (
          <button className="button" disabled={loading} onClick={() => updateStatus(item.id, "closed")}>ปิดทันที</button>
        )}
        {!disabled && (
          <>
            <select className="button" value={winningOptions[item.id] || ""} onChange={(event) => setWinningOptions((current) => ({ ...current, [item.id]: event.target.value }))}>
              <option value="">เลือกคำตอบที่ชนะ</option>
              {item.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button className="button primary" disabled={disabled} onClick={() => resolvePrediction(item)}>สรุปผล</button>
            <button className="button" disabled={disabled} onClick={() => refundPrediction(item)}>ยกเลิก + คืนเหรียญ</button>
          </>
        )}
        {(item.status === "resolved" || item.status === "canceled") && (
          <button className="button" type="button" disabled={loading} onClick={() => deletePrediction(item.id)} style={{ color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }}>
            🗑️ ลบคำถามถาวร
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="page admin-page" style={{ padding: "10px 16px" }}>
      <div className="app admin-app" style={{ maxWidth: "1000px" }}>
        <header className="topbar" style={{ marginBottom: "8px" }}>
          <div className="brand-text">
            <h1>หลังบ้าน SUPERWIN</h1>
            <span>{adminEmail} · แอดมิน</span>
          </div>
          <div className="actions" style={{ gap: "6px" }}>
            <Link className="button gold" href="/">กลับหน้าเว็บ</Link>
            <NotificationBell />
          </div>
        </header>

        {message && <div className="admin-message" style={{ marginBottom: "12px" }}>{message}</div>}

        <div className="filter-row" style={{ justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
          <button className={`button ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => { setActiveTab("dashboard"); loadDashboardData().catch(() => undefined); }} style={{ borderRadius: "999px" }}>แดชบอร์ด</button>
          <button className={`button ${activeTab === "tournaments" ? "active" : ""}`} onClick={() => setActiveTab("tournaments")} style={{ borderRadius: "999px" }}>จัดการทัวร์นาเมนต์</button>
          <button className={`button ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")} style={{ borderRadius: "999px" }}>สร้างคำถามใหม่</button>
          <button className={`button ${activeTab === "running" ? "active" : ""}`} onClick={() => setActiveTab("running")} style={{ borderRadius: "999px" }}>จัดการคำถาม</button>
          <button className={`button ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")} style={{ borderRadius: "999px" }}>ตั้งค่าหน้าเว็บ</button>
          <button className={`button ${activeTab === "shop" ? "active" : ""}`} onClick={() => setActiveTab("shop")} style={{ borderRadius: "999px" }}>Shop</button>
          <button className={`button ${activeTab === "admins" ? "active" : ""}`} onClick={() => setActiveTab("admins")} style={{ borderRadius: "999px" }}>แอดมิน ({admins.length})</button>
          <button className={`button ${activeTab === "reports" ? "active" : ""}`} onClick={() => { setActiveTab("reports"); loadReports().catch(() => undefined); }} style={{ borderRadius: "999px" }}>แจ้งปัญหา ({reports.length})</button>
          <button className={`button ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")} style={{ borderRadius: "999px" }}>จัดการผู้ใช้ ({users.length})</button>
        </div>

        <section className="admin-content" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", width: "100%", maxWidth: "100%", justifyItems: "center", alignContent: "start", margin: "0 auto" }}>
          
          {activeTab === "dashboard" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>กระดานวิเคราะห์ข้อมูล (Esports Pool Dashboard)</h2>
                  <span className="micro">ดูยอดทายแบบเรียลไทม์</span>
                </div>
                <div className="modal-body" style={{ padding: "12px 0 0 0", gap: "14px" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>เลือกทัวร์นาเมนต์เพื่อวิเคราะห์สถิติทั้งหมด</span>
                    <select className="button" value={selectedDashboardTournament} onChange={(e) => setSelectedDashboardTournament(e.target.value)} style={{ width: "100%", height: "38px" }}>
                      <option value="">-- เลือกทัวร์นาเมนต์ --</option>
                      {Array.from(new Set(dashboardData.map((d) => d.tournamentName))).map((tour) => (
                        <option key={tour} value={tour}>{tour}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    if (!selectedDashboardTournament) {
                      return <div className="question"><span>กรุณาเลือกทัวร์นาเมนต์ที่ต้องการดูวิเคราะห์ข้อมูลสถิติ</span></div>;
                    }

                    const tournamentQuestions = dashboardData.filter((d) => d.tournamentName === selectedDashboardTournament);
                    if (tournamentQuestions.length === 0) {
                      return <div className="question"><span>ไม่พบข้อมูลคำถามในทัวร์นาเมนต์นี้</span></div>;
                    }

                    const totalTourCoins = tournamentQuestions.reduce((sum, q) => sum + q.totalPoolCoins, 0);
                    const totalTourPlayers = new Set(tournamentQuestions.flatMap((q) => q.playerBets.map((b) => b.email))).size;

                    return (
                      <div style={{ display: "grid", gap: "16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>จำนวนคำถามทั้งหมด</span>
                            <strong style={{ fontSize: "18px", color: "#fff", display: "block", marginTop: "4px" }}>{tournamentQuestions.length} คำถาม</strong>
                          </div>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>ยอดรวมเหรียญทั้งทัวร์</span>
                            <strong style={{ fontSize: "18px", color: "var(--yellow)", display: "block", marginTop: "4px" }}>{totalTourCoins} Coins</strong>
                          </div>
                          <div className="info-block" style={{ background: "var(--bg)", textAlign: "center", padding: "10px" }}>
                            <span className="meta" style={{ fontSize: "9px" }}>ผู้เล่นร่วมสนุกทั้งทัวร์</span>
                            <strong style={{ fontSize: "18px", color: "#fff", display: "block", marginTop: "4px" }}>{totalTourPlayers} คน</strong>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "14px" }}>
                          {tournamentQuestions.map((q) => (
                            <div key={q.id} style={{ border: "1px solid var(--hairline)", borderRadius: "12px", background: "var(--bg)", padding: "12px", display: "grid", gap: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--hairline-soft)", paddingBottom: "6px" }}>
                                <strong style={{ fontSize: "13px", color: "#fff" }}>Q: {q.question}</strong>
                                <span className="pill" style={{ 
                                  fontSize: "10px", 
                                  height: "20px", 
                                  border: 0,
                                  background: q.status === "open" ? "rgba(255, 225, 0, 0.12)" : "rgba(255, 255, 255, 0.08)", 
                                  color: q.status === "open" ? "var(--yellow)" : "var(--text)" 
                                }}>
                                  {statusLabel(q.status)}
                                </span>
                              </div>

                              <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--muted)" }}>
                                <span>ยอดรวมเหรียญพูล: <strong style={{ color: "var(--yellow)" }}>{q.totalPoolCoins} Coins</strong></span>
                                <span>ผู้เล่นร่วมทาย: <strong style={{ color: "#fff" }}>{q.uniquePlayers} คน</strong></span>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                                <span className="meta" style={{ color: "var(--yellow)", fontSize: "10px" }}>สัดส่วนและอัตราคูณ (Odds)</span>
                                <div style={{ display: "grid", gap: "6px", maxHeight: "180px", overflowY: "auto", paddingRight: "4px" }}>
                                  {q.optionStats.map((stat) => {
                                    const pct = q.totalPoolCoins > 0 ? ((stat.totalCoins / q.totalPoolCoins) * 100).toFixed(1) : "0";
                                    return (
                                      <div key={stat.id} style={{ display: "grid", gap: "2px", padding: "4px 8px", background: "var(--card)", borderRadius: "6px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                          <span style={{ color: "#fff" }}>{stat.label}</span>
                                          <strong style={{ color: "var(--yellow)" }}>คูณ {stat.multiplier > 0 ? `~${stat.multiplier}x` : "--"}</strong>
                                        </div>
                                        <div style={{ width: "100%", height: "2px", background: "var(--bg)", borderRadius: "1px", overflow: "hidden" }}>
                                          <div style={{ width: `${pct}%`, height: "100%", background: "var(--yellow)" }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div style={{ marginTop: "6px" }}>
                                <details style={{ cursor: "pointer" }}>
                                  <summary style={{ fontSize: "11px", color: "var(--yellow)", outline: "none" }}>ดูรายละเอียดผู้เล่นที่ทายข้อนี้ ({q.playerBets.length} รายการ)</summary>
                                  <div style={{ display: "grid", gap: "5px", marginTop: "6px", maxHeight: "150px", overflowY: "auto" }}>
                                    {q.playerBets.length ? q.playerBets.map((bet) => (
                                      <div key={bet.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "var(--card)", borderRadius: "4px", fontSize: "11px" }}>
                                        <span style={{ color: "var(--muted)" }}>{bet.displayName} ({bet.email}) ➔ {bet.optionLabel}</span>
                                        <strong className="accent-gold">-{bet.amount} Coins</strong>
                                      </div>
                                    )) : <div style={{ fontSize: "11px", color: "var(--muted)", textAlign: "center", padding: "6px" }}>ยังไม่มีรายการทายผล</div>}
                                  </div>
                                </details>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            </section>
          )}

          {activeTab === "questions" && (
            <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px", maxWidth: "600px", width: "100%", margin: "0 auto" }}>
              <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>สร้างคำถามใหม่</h2><span className="micro">เปิดทันทีหลังสร้าง</span></div>
              <form className="modal-body" onSubmit={createPrediction} style={{ padding: "12px 0 0 0" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Tournament (ชื่อทัวร์นาเมนต์)</span>
                    <button type="button" onClick={() => setShowQuickTournament(!showQuickTournament)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                      {showQuickTournament ? "ปิด" : "+ เพิ่มทัวร์นาเมนต์ใหม่"}
                    </button>
                  </span>
                  {!showQuickTournament ? (
                    <select className="button" value={tournamentName} onChange={(event) => setTournamentName(event.target.value)} style={{ width: "100%", height: "34px", textAlign: "left" }}>
                      {!(settings.tournaments && settings.tournaments.length > 0) && (
                        <option value="">-- กรุณาเพิ่มชื่อทัวร์นาเมนต์ก่อน --</option>
                      )}
                      {(settings.tournaments || []).map((t) => {
                        const name = typeof t === "string" ? t : t.name;
                        return <option key={name} value={name}>{name}</option>;
                      })}
                    </select>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={quickTournamentInput} onChange={(event) => setQuickTournamentInput(event.target.value)} placeholder="พิมพ์ชื่อทัวร์นาเมนต์ใหม่" style={{ height: "34px", border: "1px solid var(--hairline)" }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveQuickTournament(); } }} />
                      <button className="button gold" type="button" onClick={saveQuickTournament}>เพิ่มและเลือก</button>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>รอบ (Round)</span>
                    <button className="button" type="button" disabled={!round.trim()} onClick={saveRoundTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      💾 บันทึกรอบนี้
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-strong)", whiteSpace: "nowrap" }}>รอบ</span>
                    <input value={round} onChange={(event) => setRound(event.target.value)} placeholder="เช่น แบ่งกลุ่ม, รอบ 16 ทีม" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setRound(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "140px", maxWidth: "200px" }}>
                      <option value="">-- รอบ --</option>
                      {(settings.savedRounds || []).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedRounds && settings.savedRounds.length > 0 && (
                    <details style={{ marginTop: "4px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ จัดการรอบที่บันทึกไว้</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "4px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedRounds.map((r) => (
                          <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingRound === r ? (
                              <>
                                <input value={editRoundInput} onChange={(event) => setEditRoundInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameRoundTemplate(r, editRoundInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>บันทึก</button>
                                  <button className="button" type="button" onClick={() => setEditingRound(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>ยกเลิก</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{r}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingRound(r); setEditRoundInput(r); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>แก้ไข</button>
                                  <button className="button" type="button" onClick={() => removeRoundTemplate(r)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>ลบ</button>
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
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question (คำถาม)</span>
                    <button className="button" type="button" disabled={!question.trim()} onClick={saveQuestionTemplate} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                      💾 บันทึกแม่แบบคำถามนี้
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                    <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="คีย์คำถาม หรือเลือกจากแม่แบบขวา" style={{ height: "34px" }} />
                    <select className="button" value="" onChange={(event) => { if (event.target.value) setQuestion(event.target.value); }} style={{ height: "34px", width: "auto", minWidth: "260px", maxWidth: "400px" }}>
                      <option value="">-- แม่แบบคำถาม --</option>
                      {(settings.savedQuestions || []).map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </div>
                  {settings.savedQuestions && settings.savedQuestions.length > 0 && (
                    <details style={{ marginTop: "6px", cursor: "pointer" }}>
                      <summary className="meta" style={{ fontSize: "10px", color: "var(--muted)" }}>✏️ จัดการแม่แบบคำถามที่บันทึกไว้</summary>
                      <div style={{ display: "grid", gap: "4px", marginTop: "6px", maxHeight: "120px", overflowY: "auto", padding: "4px", background: "var(--bg)", borderRadius: "6px", border: "1px solid var(--hairline)" }}>
                        {settings.savedQuestions.map((q) => (
                          <div key={q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "4px 8px", background: "var(--card)", borderRadius: "4px" }}>
                            {editingTemplate === q ? (
                              <>
                                <input value={editTemplateInput} onChange={(event) => setEditTemplateInput(event.target.value)} style={{ flex: 1, height: "26px", fontSize: "11px" }} autoFocus />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => renameQuestionTemplate(q, editTemplateInput)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(14, 203, 129, 0.1)", border: "1px solid var(--green)", color: "var(--green)" }}>บันทึก</button>
                                  <button className="button" type="button" onClick={() => setEditingTemplate(null)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)" }}>ยกเลิก</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: "11px", color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{q}</span>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button className="button" type="button" onClick={() => { setEditingTemplate(q); setEditTemplateInput(q); }} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid var(--info)", color: "var(--info)" }}>แก้ไข</button>
                                  <button className="button" type="button" onClick={() => removeQuestionTemplate(q)} style={{ height: "20px", fontSize: "9px", padding: "0 6px", background: "rgba(240, 84, 84, 0.1)", border: "1px solid #ef4444", color: "#ef4444" }}>ลบ</button>
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
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Open Time (เวลาเริ่มทาย)</span>
                      <button className="button" type="button" onClick={() => setOpensAt(toDateTimeLocal(new Date()))} style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px" }}>
                        ⚡ เปิดทายทันที
                      </button>
                    </div>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>เปิด <input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)", height: "18px", display: "flex", alignItems: "center" }}>Close Time (เวลาปิดทาย)</span>
                    <label className="pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr", height: "34px", padding: "0 10px" }}>ปิด <input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} style={{ border: 0, padding: 0, height: "100%", background: "transparent", color: "var(--text)" }} /></label>
                  </div>
                </div>
                <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "4px 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Fee Rate (ค่าธรรมเนียม)</span>
                    <input value={feeRate} onChange={(event) => setFeeRate(event.target.value)} placeholder="ค่าธรรมเนียม เช่น 0.03" style={{ height: "34px" }} />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Status (สถานะแรกเริ่ม)</span>
                    <span className="pill gold" style={{ height: "34px", justifyContent: "center" }}>สร้างแล้วเปิดทันที</span>
                  </div>
                </div>

                <div className="admin-box" style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <strong>ตัวเลือกคำตอบ</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button type="button" onClick={usePreviousOptions} style={{ fontSize: "10px", color: "var(--green)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        ใช้ตัวเลือกจากข้อที่แล้ว
                      </button>
                      <button type="button" onClick={() => setShowBulkOptions(!showBulkOptions)} style={{ fontSize: "10px", color: "var(--yellow)", background: "transparent", border: "0", cursor: "pointer", textDecoration: "underline" }}>
                        {showBulkOptions ? "ใส่ทีละข้อ" : "ใส่ทีละหลายคำตอบ (เว้นบรรทัด)"}
                      </button>
                    </div>
                  </div>

                  {!showBulkOptions ? (
                    <div className="filter-row" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
                      <input value={optionInput} onChange={(event) => setOptionInput(event.target.value)} placeholder="เพิ่มคำตอบทีละข้อ" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(); } }} style={{ border: "1px solid var(--hairline)", height: "34px" }} />
                      <button className="button gold" type="button" onClick={addOption}>เพิ่มคำตอบ</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <textarea rows={3} value={optionsBulkInput} onChange={(event) => setOptionsBulkInput(event.target.value)} placeholder="วางรายชื่อตัวเลือกที่นี่ แยกบรรทัดกัน เช่น&#10;ทีม A&#10;ทีม B&#10;ทีม C" style={{ border: "1px solid var(--hairline)", borderRadius: "8px", background: "var(--bg)", color: "var(--text)", padding: "8px" }} />
                      <button className="button gold" type="button" onClick={addBulkOptions} style={{ width: "100%", height: "34px" }}>ดึงคำตอบทั้งหมดกระจายเป็นตัวเลือกด่วน</button>
                    </div>
                  )}

                  <div className="admin-option-list" style={{ marginTop: "6px" }}>
                    {draftOptions.map((option, index) => (
                      <div key={`${option}-${index}`} className="reward-line">
                        <span>{index + 1}. {option}</span>
                        <button className="button" type="button" onClick={() => removeOption(index)}>ลบ</button>
                      </div>
                    ))}
                  </div>

                  {/* ── ชุดตัวเลือกที่บันทึกไว้ ── */}
                  <div style={{ marginTop: "10px", borderTop: "1px solid var(--hairline)", paddingTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ชุดตัวเลือกที่บันทึกไว้ ({savedOptionSets.length})</span>
                      {draftOptions.length >= 2 && (
                        <button
                          type="button"
                          className="button gold"
                          style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                          onClick={() => setShowSaveOptionSet(!showSaveOptionSet)}
                        >
                          {showSaveOptionSet ? "ยกเลิก" : "💾 บันทึกชุดตัวเลือก"}
                        </button>
                      )}
                    </div>

                    {showSaveOptionSet && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                        <input
                          value={optionSetNameInput}
                          onChange={(e) => setOptionSetNameInput(e.target.value)}
                          placeholder="ชื่อชุดตัวเลือก เช่น ทีม 16 ทีม"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveOptionSet(); } }}
                          style={{ border: "1px solid var(--hairline)", height: "34px", flex: 1 }}
                        />
                        <button type="button" className="button gold" onClick={saveOptionSet} style={{ height: "34px", fontSize: "12px", padding: "0 14px" }}>
                          บันทึก
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
                                <button type="button" className="button" onClick={() => { setEditingOptionSetId(null); setEditOptionSetNameInput(""); }} style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}>ยกเลิก</button>
                              </>
                            ) : (
                              <>
                                <span style={{ flex: 1, fontSize: "13px" }}>
                                  <strong>{set.name}</strong>
                                  <span className="meta" style={{ fontSize: "11px", marginLeft: "6px", color: "var(--muted)" }}>({set.options.length} ตัวเลือก)</span>
                                </span>
                                <button
                                  type="button"
                                  className="button gold"
                                  onClick={() => loadOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 10px" }}
                                  title="โหลดชุดตัวเลือกนี้"
                                >
                                  โหลด
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => {
                                    setEditingOptionSetId(set.id);
                                    setEditOptionSetNameInput(set.name);
                                  }}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="แก้ไขชื่อ"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => overwriteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px" }}
                                  title="บันทึกทับด้วยตัวเลือกปัจจุบัน"
                                >
                                  ทับ
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  onClick={() => deleteOptionSet(set.id)}
                                  style={{ height: "28px", fontSize: "11px", padding: "0 8px", color: "var(--red)" }}
                                  title="ลบชุดนี้"
                                >
                                  ลบ
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <button
                  className="button primary"
                  disabled={loading || !tournamentName.trim() || !question.trim() || draftOptions.filter(Boolean).length < 2 || !closesAt || !feeRate}
                  type="submit"
                  style={{ width: "100%", marginTop: "12px" }}
                >
                  สร้างคำถามและเปิดรับทาย
                </button>
              </form>
            </section>
          )}

          {activeTab === "running" && (
            <section className="panel" style={{ width: "100%", maxWidth: "760px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>คำถามที่กำลังรัน</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {runningTournamentFilter && filteredRunningPredictions.length > 1 && (
                      <button className="button gold" type="button" disabled={loading} onClick={savePredictionOrder} style={{ height: "24px", fontSize: "10px", padding: "0 10px" }}>
                        💾 บันทึกลำดับคำถาม
                      </button>
                    )}
                    <span className="micro">{runningTournamentFilter ? `${filteredRunningPredictions.length} คำถาม` : `${runningPredictions.length} รายการ`}</span>
                  </div>
                </div>
                <div className="admin-help" style={{ padding: "8px 0", margin: "4px 0" }}>
                  <span>ปิดทันที = หยุดรับคำทาย (คำถามจะย้ายไปเก็บที่ตารางด้านล่างเพื่อรอสรุปผล)</span>
                  <span>สรุปผล = เลือกคำตอบที่ชนะและจ่ายผลเหรียญ</span>
                  <span>ยกเลิก + คืนเหรียญ = ยกเลิกคำถามและคืนเหรียญเต็มจำนวน</span>
                </div>

                {/* Tournament Selector */}
                <div style={{ display: "grid", gap: "4px", marginBottom: "12px" }}>
                  <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>เลือกทัวร์นาเมนต์เพื่อจัดการคำถาม</span>
                  <select 
                    className="button" 
                    value={runningTournamentFilter} 
                    onChange={(e) => setRunningTournamentFilter(e.target.value)} 
                    style={{ width: "100%", height: "38px" }}
                  >
                    <option value="">-- เลือกทัวร์นาเมนต์ --</option>
                    {settings.tournaments?.map((t) => {
                      const name = typeof t === "string" ? t : t.name;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
                
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {!runningTournamentFilter ? (
                    <div className="question"><strong>กรุณาเลือกทัวร์นาเมนต์</strong><span className="meta">เลือกทัวร์นาเมนต์จาก dropdown ด้านบนเพื่อดูและจัดการคำถาม</span></div>
                  ) : (
                    currentRunning.length > 0 ? currentRunning.map((item) => {
                    const globalIdx = localOrder.indexOf(item.id);
                    return (
                      <div key={item.id} className="question running" style={{ padding: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px", alignItems: "center" }}>
                        {/* แฮมเบอร์เกอร์ & เลื่อนลำดับคำถาม */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingRight: "8px", borderRight: "1px solid var(--hairline)", alignSelf: "stretch", justifyContent: "center" }}>
                          <span style={{ fontSize: "14px", color: "var(--muted)", cursor: "grab", lineHeight: "1" }} title="ลากหรือเลื่อนคำถาม">☰</span>
                          <div style={{ display: "flex", gap: "2px" }}>
                            <button className="button" type="button" disabled={globalIdx <= 0} onClick={() => moveLocalOrder(item.id, "up")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                            <button className="button" type="button" disabled={globalIdx === -1 || globalIdx >= localOrder.length - 1} onClick={() => moveLocalOrder(item.id, "down")} style={{ width: "18px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "6px", width: "100%" }}>
                          <div className="question-main">
                            <strong>{item.question}</strong>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "2px", marginBottom: "4px" }}>
                              <span className="meta">{item.tournamentName} · ปิด {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                              {editingId !== item.id ? (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => {
                                    setEditingId(item.id);
                                    setEditClosesAt((current) => ({ ...current, [item.id]: toDateTimeLocal(new Date(item.closesAt || "")) }));
                                    setEditQuestions((current) => ({ ...current, [item.id]: item.question }));
                                    
                                    const initialOpts: Record<string, string> = {};
                                    item.options.forEach(o => {
                                      initialOpts[o.id] = o.label;
                                    });
                                    setEditOptionsInputs((current) => ({ ...current, [item.id]: initialOpts }));
                                  }} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--yellow)", color: "var(--yellow)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ✏️ แก้ไขคำถาม & คำตอบ
                                </button>
                              ) : (
                                <button 
                                  className="button" 
                                  type="button" 
                                  onClick={() => setEditingId(null)} 
                                  style={{ height: "18px", fontSize: "9px", padding: "0 6px", background: "transparent", border: "1px solid var(--muted)", color: "var(--muted)", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  ยกเลิก
                                </button>
                              )}
                            </div>

                            {/* กล่องแก้ไขคำถาม & คำตอบ สไลด์เปิดแบบฟอร์มครบชุด */}
                            {editingId === item.id && (
                              <div style={{ display: "grid", gap: "10px", marginTop: "10px", marginBottom: "10px", background: "rgba(255,225,0,0.03)", padding: "12px", borderRadius: "8px", border: "1px solid var(--hairline)", width: "100%", textAlign: "left" }}>
                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>แก้ไขข้อความคำถาม:</span>
                                  <input 
                                    type="text" 
                                    value={editQuestions[item.id] !== undefined ? editQuestions[item.id] : item.question} 
                                    onChange={(e) => setEditQuestions((current) => ({ ...current, [item.id]: e.target.value }))} 
                                    placeholder="กรอกข้อความคำถามใหม่..." 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>แก้ไขเวลาปิดทายผล (UTC+7):</span>
                                  <input 
                                    type="datetime-local" 
                                    value={editClosesAt[item.id] || ""} 
                                    onChange={(event) => setEditClosesAt((current) => ({ ...current, [item.id]: event.target.value }))} 
                                    style={{ height: "30px", fontSize: "11px", padding: "0 8px", width: "100%", background: "var(--card)" }} 
                                  />
                                </div>

                                <div style={{ display: "grid", gap: "6px" }}>
                                  <span className="meta" style={{ fontSize: "10px", color: "var(--yellow)" }}>แก้ไขข้อความคำตอบ (ทีมต่าง ๆ):</span>
                                  <div style={{ display: "grid", gap: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                                    {item.options.map((option) => {
                                      const currentVal = editOptionsInputs[item.id]?.[option.id] !== undefined 
                                        ? editOptionsInputs[item.id][option.id] 
                                        : option.label;
                                      return (
                                        <div key={option.id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", alignItems: "center", gap: "8px" }}>
                                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>#{option.sortOrder + 1}</span>
                                          <input 
                                            type="text" 
                                            value={currentVal} 
                                            onChange={(e) => setEditOptionsInputs((current) => ({
                                              ...current,
                                              [item.id]: {
                                                ...(current[item.id] || {}),
                                                [option.id]: e.target.value
                                              }
                                            }))} 
                                            style={{ height: "26px", fontSize: "11px", padding: "0 8px", background: "var(--card)", width: "100%" }} 
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
                                  💾 บันทึกการแก้ไขคำถาม & คำตอบ
                                </button>
                              </div>
                            )}
                          </div>
                          {renderPredictionControls(item)}
                        </div>
                      </div>
                    );
                    }
                  ) : <div className="question"><strong>ไม่มีคำถามในทัวร์นาเมนต์นี้</strong></div>
                )}
                </div>
                {runningTournamentFilter && runningTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={runningPage <= 1} onClick={() => setRunningPage(runningPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {runningPage} / {runningTotalPages}</span>
                    <button className="button" disabled={runningPage >= runningTotalPages} onClick={() => setRunningPage(runningPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>

              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>คำถามที่หมดเวลา รอคำตอบ</h3><span className="micro">{pendingPredictions.length} รายการ</span></div>
                <div className="leaderboard-body" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentPending.length ? currentPending.map((item) => (
                    <div key={item.id} className="question closed" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · ปิดเมื่อ {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                      </div>
                      {renderPredictionControls(item)}
                    </div>
                  )) : <div className="question"><strong>ไม่มีคำถามที่หมดเวลาและค้างรอคำตอบในขณะนี้</strong></div>}
                </div>
                {pendingTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={pendingPage <= 1} onClick={() => setPendingPage(pendingPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {pendingPage} / {pendingTotalPages}</span>
                    <button className="button" disabled={pendingPage >= pendingTotalPages} onClick={() => setPendingPage(pendingPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>

              {/* Section "คำถามทั้งหมดในระบบ" ซ่อนไว้ตามคำขอ — เก็บโค้ดไว้ใช้หลังบ้าน
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>คำถามทั้งหมดในระบบ</h3><span className="micro">{predictions.length} รายการ</span></div>
                <div className="leaderboard-body admin-list" style={{ gap: "10px", padding: "12px 0 0 0" }}>
                  {currentAll.length ? currentAll.map((item) => (
                    <div key={item.id} className="question active" style={{ padding: "12px" }}>
                      <div className="question-main">
                        <strong>{item.question}</strong>
                        <span className="meta">{item.tournamentName} · {statusLabel(item.status)} · ปิด {displayDate(item.closesAt)} UTC+7 · {item.options.length} คำตอบ</span>
                      </div>
                      {renderPredictionControls(item)}
                    </div>
                  )) : <div className="question"><strong>ไม่มีประวัติคำถาม</strong></div>}
                </div>
                {allTotalPages > 1 && (
                  <div className="history-footer" style={{ marginTop: "16px" }}>
                    <button className="button" disabled={allPage <= 1} onClick={() => setAllPage(allPage - 1)}>ก่อนหน้า</button>
                    <span className="micro">หน้า {allPage} / {allTotalPages}</span>
                    <button className="button" disabled={allPage >= allTotalPages} onClick={() => setAllPage(allPage + 1)}>ถัดไป</button>
                  </div>
                )}
              </section>
              */}
            </section>
          )}

          {activeTab === "settings" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>

              {/* ส่วนพิเศษ: ตั้งค่าข้อความประกาศวิ่งหน้าแรก (Standalone Announcement Ticker Card) */}
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>📢 ตั้งค่าข้อความประกาศวิ่งหน้าแรก (Announcement Ticker)</h2>
                </div>
                <form className="modal-body" onSubmit={saveAnnouncementSettings} style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *ตั้งค่าข้อความประกาศข่าวสารวิ่งเคลื่อนไหวช้า ๆ จากขวาไปซ้ายด้านล่างเมนูหลักหน้าแรก (แยกบันทึกและมีปุ่มเซฟเป็นอิสระ)
                  </span>
                  
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ข้อความประกาศหน้าแรก (ยาวแถวเดียวไหลช้า ๆ)</span>
                    <input 
                      value={settings.announcement || ""} 
                      onChange={(event) => setSettings((current) => ({ ...current, announcement: event.target.value }))} 
                      placeholder='เช่น ยินดีต้อนรับเข้าสู่ SUPERWIN HUB! ปล่อยตัวทายผลซีซั่น 2 แล้ววันนี้...' 
                      style={{ height: "34px" }} 
                    />
                  </div>

                  <button className="button primary" disabled={loading} type="submit" style={{ width: "100%", height: "34px", fontWeight: "bold" }}>📢 💾 บันทึกข้อความประกาศหน้าแรก</button>
                </form>
              </div>

              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>ข้อความ Info หน้าเว็บ (วิธีเล่น/รางวัล)</h2></div>
                <form className="modal-body" onSubmit={saveInfoSettings} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>How to Play (วิธีเล่น)</span>
                    <textarea rows={3} value={settings.info.howToPlay} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, howToPlay: event.target.value } }))} placeholder="How to Play" />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Reward (การแจกรางวัล)</span>
                    <textarea rows={3} value={settings.info.reward} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, reward: event.target.value } }))} placeholder="Reward" />
                  </div>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>Question Time (เวลากับการทาย)</span>
                    <textarea rows={3} value={settings.info.questionTime} onChange={(event) => setSettings((current) => ({ ...current, info: { ...current.info, questionTime: event.target.value } }))} placeholder="Question Time" />
                  </div>
                  <button className="button primary" disabled={loading} type="submit" style={{ marginTop: "12px", width: "100%" }}>บันทึกข้อความ Info ทั่วไป</button>
                </form>
              </div>
            </section>
          )}

          {activeTab === "tournaments" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h2>จัดการทัวร์นาเมนต์ (Tournament List)</h2></div>
                <div className="modal-body" style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ชื่อทัวร์นาเมนต์ (Tournament Name)</span>
                      <input value={newTournamentInput} onChange={(event) => setNewTournamentInput(event.target.value)} placeholder="เช่น PUBG Mobile Pro League" style={{ height: "34px", border: "1px solid var(--hairline)" }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTournament(); } }} />
                    </div>
                    
                    <div style={{ display: "grid", gap: "4px" }}>
                      <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>รูปโลโก้ทัวร์นาเมนต์ (Tournament Logo - รูปสี่เหลี่ยมจัตุรัสขนาดเล็ก)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <input type="file" accept="image/*" onChange={(event) => handleTournamentLogo(event.target.files?.[0])} style={{ flex: 1 }} />
                        {newTournamentLogoUrl && (
                          <img src={newTournamentLogoUrl} alt="Preview" style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "contain", background: "transparent" }} />
                        )}
                      </div>
                    </div>
                    
                    <button className="button gold" disabled={loading || !newTournamentInput.trim()} type="button" onClick={addTournament} style={{ height: "34px", marginTop: "4px" }}>เพิ่มทัวร์นาเมนต์ใหม่</button>
                  </div>
                  
                  <div className="admin-option-list">
                    {!(settings.tournaments && settings.tournaments.length > 0) ? (
                      <div className="reward-line"><span>ไม่มีรายชื่อทัวร์นาเมนต์ในขณะนี้</span></div>
                    ) : (
                      (settings.tournaments || []).map((t, idx) => {
                        const tName = typeof t === "string" ? t : t.name;
                        const tLogo = typeof t === "string" ? "" : t.logoUrl;
                        return (
                          <div key={tName} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "8px", alignItems: "center" }}>
                            {/* Move up/down buttons */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                              <button className="button" type="button" disabled={idx <= 0} onClick={() => {
                                const arr = [...(settings.tournaments || [])];
                                if (idx > 0) {
                                  [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                  setSettings(current => ({ ...current, tournaments: arr }));
                                }
                              }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▲</button>
                              <button className="button" type="button" disabled={idx >= (settings.tournaments || []).length - 1} onClick={() => {
                                const arr = [...(settings.tournaments || [])];
                                if (idx >= 0 && idx < arr.length - 1) {
                                  [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                  setSettings(current => ({ ...current, tournaments: arr }));
                                }
                              }} style={{ width: "20px", height: "18px", padding: 0, fontSize: "8px", background: "transparent" }}>▼</button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {tLogo ? (
                                <img src={tLogo} alt="" style={{ width: "20px", height: "20px", borderRadius: "4px", objectFit: "contain", background: "transparent" }} />
                              ) : (
                                <span style={{ fontSize: "12px" }}>🏆</span>
                              )}
                              <span>{tName}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <label style={{ cursor: "pointer" }}>
                                <span className="button gold" style={{ height: "24px", fontSize: "10px", padding: "0 8px", display: "inline-flex", alignItems: "center" }}>
                                  🖼️ {tLogo ? "เปลี่ยนโลโก้" : "อัปภาพโลโก้"}
                                </span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(event) => updateTournamentLogo(tName, event.target.files?.[0])} 
                                  style={{ display: "none" }} 
                                />
                              </label>
                              <button className="button" type="button" disabled={loading} onClick={() => removeTournament(tName)} style={{ height: "24px", fontSize: "10px", padding: "0 8px" }}>ลบ</button>
                            </div>
                          </div>
                        );
                      })
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
                            alert("บันทึกลำดับทัวร์นาเมนต์สำเร็จ");
                          }
                        } catch (e) {
                          alert("เกิดข้อผิดพลาด");
                        } finally {
                          setLoading(false);
                        }
                      }} style={{ height: "34px", fontSize: "12px", padding: "0 16px", marginTop: "12px", width: "100%" }}>
                        💾 บันทึกลำดับทัวร์นาเมนต์
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "shop" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <div className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}>
                  <h2>🛒 ตั้งค่าหน้า Shop</h2>
                </div>
                <div className="modal-body" style={{ padding: "12px 0 0 0", display: "grid", gap: "10px" }}>
                  <span className="meta" style={{ textTransform: "none", color: "var(--muted)", lineHeight: "1.4" }}>
                    *ระบบ Shop จะเปิดให้บริการเร็วๆ นี้ สามารถแก้ไขข้อความที่แสดงในหน้าเว็บได้ที่นี่
                  </span>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span className="meta" style={{ fontSize: "11px", color: "var(--yellow)" }}>ข้อความแสดงในหน้า Shop (หน้าบ้าน)</span>
                    <input value={settings.reward.name} onChange={(event) => setSettings((current) => ({ ...current, reward: { ...current.reward, name: event.target.value } }))} placeholder='เช่น บริการเร็วๆ นี้' style={{ height: "34px" }} />
                  </div>
                  <button className="button primary" disabled={loading} type="button" onClick={saveSettings} style={{ marginTop: "4px", width: "100%", height: "34px", fontWeight: "bold" }}>💾 บันทึกการตั้งค่า Shop</button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "admins" && (
            <section className="panel" style={{ width: "100%", maxWidth: "600px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)" }}><h3>รายชื่อแอดมินระบบ</h3><span className="micro">{admins.length} คน</span></div>
                <form className="modal-body" onSubmit={makeAdmin} style={{ padding: "12px 0 0 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "12px" }}>
                    <input value={adminEmailInput} onChange={(event) => setAdminEmailInput(event.target.value)} placeholder="ใส่อีเมลผู้ใช้ที่นี่" style={{ height: "34px", border: "1px solid var(--hairline)" }} />
                    <button className="button gold" disabled={loading} type="submit">เพิ่มแอดมินใหม่</button>
                  </div>
                  <div className="admin-option-list">
                    {admins.map((admin) => (
                      <div key={admin.id} className="reward-line" style={{ padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
                        <span>{admin.displayName || admin.email} ({admin.email})</span>
                        {admin.email.toLowerCase() === adminEmail.toLowerCase() ? (
                          <b className="accent-gold">คุณ (แอดมินหลัก)</b>
                        ) : (
                          <button className="button" type="button" disabled={loading} onClick={() => removeAdmin(admin.email)}>ถอดสิทธิ์แอดมิน</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="meta" style={{ display: "block", marginTop: "12px", lineHeight: "1.4" }}>หมายเหตุ: แอดมินใหม่ต้องเคยลงชื่อสมัครใช้บริการ (Sign Up / Sign In) ในหน้าหลักมาก่อนอย่างน้อย 1 ครั้ง เพื่อให้ข้อมูลสร้างขึ้นในฐานข้อมูล Supabase ถึงจะกดเพิ่มรายชื่อจากตรงนี้ได้สำเร็จ</span>
                </form>
              </section>
            </section>
          )}

          {activeTab === "users" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>จัดการผู้ใช้ ({users.length} คน)</h3>
                  <button className="button gold" onClick={loadUsers} disabled={usersLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    🔄 รีเฟรช
                  </button>
                </div>

                {usersLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>กำลังโหลดข้อมูลผู้ใช้...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "name", dir: s.key === "name" && s.dir === "asc" ? "desc" : "asc" })); }}>ชื่อผู้ใช้ ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "email", dir: s.key === "email" && s.dir === "asc" ? "desc" : "asc" })); }}>อีเมล ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", textAlign: "right", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "coinBalance", dir: s.key === "coinBalance" && s.dir === "asc" ? "desc" : "asc" })); }}>Coin Balance ⬍</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", textAlign: "right", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "profitScore", dir: s.key === "profitScore" && s.dir === "asc" ? "desc" : "asc" })); }}>Profit Score ⬍</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>Admin</th>
                          <th style={{ padding: "6px 8px", cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { setUserPage(1); setUserSort(s => ({ key: "createdAt", dir: s.key === "createdAt" && s.dir === "asc" ? "desc" : "asc" })); }}>สร้างเมื่อ ⬍</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>Claim ล่าสุด</th>
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
                            if (key === "profitScore") return dir * ((a.profitScore || 0) - (b.profitScore || 0));
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
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "var(--mono)", color: "var(--green)" }}>{Number(u.profitScore || 0).toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "center" }}>{u.isAdmin ? "✅" : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.createdAt ? new Date(u.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                              <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>{u.lastClaimAt ? new Date(u.lastClaimAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>

                    {users.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "8px", borderTop: "1px solid var(--hairline-soft)" }}>
                        <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                          แสดง {Math.min((userPage - 1) * 20 + 1, users.length)}–{Math.min(userPage * 20, users.length)} จาก {users.length} คน
                        </span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <button className="button" disabled={userPage <= 1} onClick={() => setUserPage(p => Math.max(1, p - 1))} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>◀ ก่อนหน้า</button>
                          <span style={{ color: "var(--text)", fontSize: "11px", fontWeight: 600, minWidth: "40px", textAlign: "center" }}>หน้า {userPage}</span>
                          <button className="button" disabled={userPage >= Math.max(1, Math.ceil(users.length / 20))} onClick={() => setUserPage(p => p + 1)} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>ถัดไป ▶</button>
                        </div>
                      </div>
                    )}

                    {users.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>ไม่มีผู้ใช้ในระบบ</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}

          {activeTab === "reports" && (
            <section className="panel" style={{ width: "100%", maxWidth: "900px", display: "grid", gap: "16px", margin: "0 auto" }}>
              <section className="panel" style={{ background: "var(--card)", border: "1px solid var(--hairline)", borderRadius: "12px", padding: "16px" }}>
                <div className="panel-head" style={{ padding: "0 0 12px 0", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>รายการแจ้งปัญหา ({reports.length} รายการ)</h3>
                  <button className="button gold" onClick={loadReports} disabled={reportsLoading} style={{ height: "26px", fontSize: "11px", padding: "0 10px" }}>
                    🔄 รีเฟรช
                  </button>
                </div>

                {reportsLoading ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--text-weak)" }}>กำลังโหลดข้อมูล...</div>
                ) : (
                  <div style={{ overflowX: "auto", marginTop: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr style={{ color: "var(--muted)", textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>อีเมล</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>ข้อความ</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>สถานะ</th>
                          <th style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>วันที่</th>
                          <th style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid var(--hairline-soft)", transition: "background 120ms" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "8px", color: "var(--text)", whiteSpace: "nowrap" }}>{r.email || "-"}</td>
                            <td style={{ padding: "8px", color: "var(--text-strong)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message || "-"}</td>
                            <td style={{ padding: "8px", textAlign: "center" }}>
                              {r.status === "pending" ? (
                                <span style={{ color: "var(--yellow)", fontWeight: 700, fontSize: "10px" }}>⏳ รอดำเนินการ</span>
                              ) : (
                                <span style={{ color: "var(--green)", fontWeight: 700, fontSize: "10px" }}>✅ เสร็จสิ้น</span>
                              )}
                            </td>
                            <td style={{ padding: "8px", color: "var(--muted)", fontSize: "10px", whiteSpace: "nowrap" }}>
                              {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                            </td>
                            <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                              {r.status === "pending" && (
                                <button className="button gold" style={{ height: "22px", fontSize: "10px", padding: "0 8px" }} onClick={() => handleUpdateReport(r.id, "resolved")}>
                                  ทำเครื่องหมายเสร็จสิ้น
                                </button>
                              )}
                              <button className="button" style={{ height: "22px", fontSize: "10px", padding: "0 8px", marginLeft: "4px", color: "#ff4d4f", borderColor: "#ff4d4f", background: "transparent" }} onClick={() => handleUpdateReport(r.id, r.status, true)}>
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reports.length === 0 && (
                      <div style={{ textAlign: "center", padding: "30px", color: "var(--text-weak)", border: "1px dashed var(--hairline)", borderRadius: "8px" }}>
                        <strong>ไม่มีรายการแจ้งปัญหา</strong>
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
