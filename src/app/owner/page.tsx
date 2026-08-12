"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  School,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  Tag,
  User,
  WalletCards,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AddUserModal } from "@/components/owner/provisioning-modals";
import {
  BrandButton,
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";

type OwnerView = "schools" | "users" | "audit" | "sessions" | "billing" | "pricing" | "payments";

interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  tagline: string | null;
  establishedYear: number | null;
  status: string;
  plan: string;
  aiCreditsUsed: number;
  aiCreditsLimit: number;
  createdAt: string;
  campusCount: number;
  totalStudents: number;
  totalStaff: number;
  totalClasses: number;
  campuses: { id: string; name: string; city: string | null; phone: string | null; email: string | null; website: string | null; principalName: string | null; board: string | null; students: number; staff: number; classes: number }[];
}

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  lastPasswordChange: string | null;
  createdAt: string;
  school: { id: string; name: string } | null;
  campus: { id: string; name: string } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetName: string | null;
  oldValues: any;
  newValues: any;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string; role: string };
}

interface SessionEntry {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  loginAt: string;
  expiresAt: string;
  isActive: boolean;
  logoutAt: string | null;
  user: { id: string; fullName: string; email: string; role: string; school: { id: string; name: string } | null };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Stats {
  schoolCount: number;
  campusCount: number;
  studentCount: number;
  teacherCount: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  recentLogins: number;
  recentAuditActions: number;
  totalRevenue: number;
  totalPaymentCount: number;
  pendingInvoices: number;
  schoolsByStatus: Record<string, number>;
  schoolsByPlan: Record<string, number>;
  schools: { id: string; name: string }[];
}

const ROLE_COLORS: Record<string, string> = {
  APP_OWNER: "bg-gradient-to-r from-[#1f1a23] to-[#2d2633] text-white",
  SUPER_ADMIN: "bg-gradient-to-r from-[#8127cf] to-[#6a1fb0] text-white",
  CAMPUS_ADMIN: "bg-indigo-100 text-indigo-700",
  ADMIN: "bg-indigo-100 text-indigo-700",
  PRINCIPAL: "bg-emerald-100 text-emerald-700",
  TEACHER: "bg-sky-100 text-sky-700",
  PARENT: "bg-amber-100 text-amber-700",
  STUDENT: "bg-[#fbf0fe] text-[#8127cf]",
};

const ACTION_META: Record<string, { icon: any; label: string; tone: string }> = {
  login: { icon: LogIn, label: "Login", tone: "bg-emerald-50 text-emerald-600" },
  login_failed: { icon: AlertCircle, label: "Login Failed", tone: "bg-rose-50 text-rose-600" },
  logout: { icon: LogOut, label: "Logout", tone: "bg-[#f3f4f9] text-[#4d4354]/60" },
  password_change: { icon: KeyRound, label: "Password Changed", tone: "bg-amber-50 text-amber-600" },
  school_suspended: { icon: Pause, label: "School Suspended", tone: "bg-rose-50 text-rose-600" },
  school_activated: { icon: Play, label: "School Activated", tone: "bg-emerald-50 text-emerald-600" },
  session_terminated: { icon: LogOut, label: "Session Terminated", tone: "bg-amber-50 text-amber-600" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: Activity, label: action.replace(/_/g, " "), tone: "bg-[#f3f4f9] text-[#4d4354]/60" };
}

function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(d);
}

function parseBrowser(ua: string | null) {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return "Browser";
}

function parseDevice(ua: string | null) {
  if (!ua) return { browser: "Unknown", os: "Unknown", icon: Monitor };
  const browser = parseBrowser(ua);
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : ua.includes("Android") ? "Android" : ua.includes("iPhone") ? "iOS" : "Unknown";
  const icon = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? Smartphone : Monitor;
  return { browser, os, icon };
}

function StatusPill({ status }: { status: string }) {
  const tone = ["ACTIVE", "Active"].includes(status)
    ? "bg-emerald-50 text-emerald-600"
    : ["SUSPENDED", "Suspended"].includes(status)
    ? "bg-rose-50 text-rose-600"
    : ["TRIAL", "Trial"].includes(status)
    ? "bg-[#fbf0fe] text-[#8127cf]"
    : "bg-[#f3f4f9] text-[#4d4354]/60";
  const dot = tone.includes("emerald") ? "bg-emerald-500" : tone.includes("rose") ? "bg-rose-500" : tone.includes("8127cf") ? "bg-[#8127cf]" : "bg-[#4d4354]/40";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<OwnerView>("schools");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/owner/stats");
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      toast.error("Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Schools", active: activeView === "schools", onClick: () => setActiveView("schools") },
    { icon: Users, label: "Users", active: activeView === "users", onClick: () => setActiveView("users") },
    { icon: DollarSign, label: "Billing", active: activeView === "billing", onClick: () => setActiveView("billing") },
    { icon: Tag, label: "Pricing", active: activeView === "pricing", onClick: () => setActiveView("pricing") },
    { icon: WalletCards, label: "Payments", active: activeView === "payments", onClick: () => setActiveView("payments") },
    { icon: FileText, label: "Audit Log", active: activeView === "audit", onClick: () => setActiveView("audit") },
    { icon: Shield, label: "Sessions", active: activeView === "sessions", onClick: () => setActiveView("sessions") },
  ];
  const bottomItems: RoleNavItem[] = [];

  if (statsLoading && !stats) return <OwnerSkeleton />;

  return (
    <RoleShell
      navItems={navItems}
      bottomItems={bottomItems}
      searchPlaceholder="Search schools, users..."
      userName="Mohsin (App Owner)"
      userRole="APP_OWNER"
      avatarSeed="mohsin@skooleeai.com"
      dashboardHref="/owner"
    >
      <section className="bg-white rounded-[40px] shadow-2xl flex-1 overflow-hidden flex flex-col">
        {activeView === "schools" && <SchoolsView stats={stats} onRefreshStats={loadStats} />}
        {activeView === "users" && <UsersView />}
        {activeView === "billing" && <BillingView stats={stats} />}
        {activeView === "pricing" && <PricingView stats={stats} />}
        {activeView === "payments" && <PaymentSettingsView />}
        {activeView === "audit" && <AuditLogView />}
        {activeView === "sessions" && <SessionsView />}
      </section>
    </RoleShell>
  );
}

function SchoolsView({ stats, onRefreshStats }: { stats: Stats | null; onRefreshStats: () => void }) {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSchool, setDetailSchool] = useState<SchoolRow | null>(null);

  const loadSchools = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) qp.set("search", search);
      if (statusFilter) qp.set("status", statusFilter);
      if (planFilter) qp.set("plan", planFilter);

      const res = await fetch(`/api/owner/schools?${qp}`);
      const json = await res.json();
      if (json.success) {
        setSchools(json.data);
        setPagination(json.pagination);
      }
    } catch {
      toast.error("Failed to load schools");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter]);

  useEffect(() => { loadSchools(); }, [loadSchools]);

  const changeSchoolPlan = async (schoolId: string, newPlan: string) => {
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.message);
      loadSchools(pagination.page);
      onRefreshStats();
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    }
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform owner</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">SkooleeAI Platform</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            All registered schools and campuses across the platform
          </p>
        </div>
      </div>

      <div className="sk-rise relative overflow-hidden bg-gradient-to-br from-[#fbf0fe] via-white to-[#f3eeff] rounded-[32px] border border-[#cfc2d6]/10 p-7 mb-8 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#8127cf]/6 to-transparent rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] flex items-center justify-center shadow-lg shadow-[#8127cf]/20">
            <LayoutGrid className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#4d4354]/40">
              {stats ? `${stats.schoolCount} school${stats.schoolCount !== 1 ? "s" : ""} registered` : "Network overview"}
            </p>
            <p className="text-lg font-black text-[#1f1a23] tracking-normal">Platform Health</p>
            <p className="text-[10px] font-semibold text-[#4d4354]/50">Live metrics across schools, campuses, and users</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <StatCard icon={School} label="Schools" value={stats.schoolCount} entranceDelay={80} />
          <StatCard icon={Building2} label="Campuses" value={stats.campusCount} tone="purple" entranceDelay={160} />
          <StatCard icon={GraduationCap} label="Students" value={stats.studentCount} tone="green" entranceDelay={240} />
          <StatCard icon={Users} label="Teachers" value={stats.teacherCount} entranceDelay={320} />
          <StatCard icon={User} label="Total Users" value={stats.totalUsers} tone="rose" entranceDelay={400} />
          <StatCard icon={Activity} label="Logins (7d)" value={stats.recentLogins} tone="dark" entranceDelay={480} />
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="sk-rise rounded-[24px] bg-gradient-to-br from-[#1f1a23] to-[#2d2633] p-5 text-white shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]" style={{ animationDelay: "560ms" }}>
            <p className="text-[9px] font-black uppercase tracking-normal text-white/40">Revenue</p>
            <p className="text-2xl font-black mt-2">PKR {((stats.totalRevenue || 0) / 100).toLocaleString("en-PK")}</p>
            <p className="text-xs font-bold text-white/50 mt-1">{stats.totalPaymentCount} payments</p>
          </div>
          <div className="sk-rise rounded-[24px] bg-gradient-to-br from-[#fbf0fe] to-white border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]" style={{ animationDelay: "640ms" }}>
            <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]/60">Schools by Status</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(stats.schoolsByStatus).map(([s, count]) => (
                <span key={s} className="text-xs font-black text-[#1f1a23]">{s}: {count}</span>
              ))}
              {Object.keys(stats.schoolsByStatus).length === 0 && (
                <span className="text-xs font-semibold text-[#4d4354]/40">No data</span>
              )}
            </div>
          </div>
          <div className="sk-rise rounded-[24px] bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-100/50 p-5" style={{ animationDelay: "720ms" }}>
            <p className="text-[9px] font-black uppercase tracking-normal text-amber-600/60">Schools by Plan</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(stats.schoolsByPlan).map(([p, count]) => (
                <span key={p} className="text-xs font-black text-amber-800">{p}: {count}</span>
              ))}
              {Object.keys(stats.schoolsByPlan).length === 0 && (
                <span className="text-xs font-semibold text-[#4d4354]/40">No data</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[200px] max-w-sm relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40" />
            <input
              type="text"
              placeholder="Search schools by name, email, slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none placeholder:text-[#4d4354]/35 focus:ring-2 focus:ring-[#8127cf]/20"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TRIAL">Trial</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Plans</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : schools.length === 0 ? (
          <EmptyState
            icon={School}
            title="No Schools Found"
            description="No registered schools match your filters."
          />
        ) : (
          <>
            <div className="space-y-3">
              {schools.map((school) => {
                const isExpanded = expandedId === school.id;
                return (
                  <div
                    key={school.id}
                    className="rounded-2xl border-[#cfc2d6]/25 hover:border-[#8127cf]/25 transition-all overflow-hidden shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : school.id)}
                      className="w-full text-left p-5 cursor-pointer hover:bg-[#fbf0fe]/20 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-[18px] bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] flex items-center justify-center text-[#8127cf] shrink-0 overflow-hidden">
                          {school.logoUrl ? (
                            <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-cover" />
                          ) : (
                            <School className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-base font-black text-[#1f1a23]">{school.name}</h3>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${
                              school.plan === "ENTERPRISE" ? "bg-gradient-to-r from-[#1f1a23] to-[#2d2633] text-white" :
                              school.plan === "PRO" ? "bg-[#fbf0fe] text-[#8127cf]" :
                              school.plan === "BASIC" ? "bg-sky-50 text-sky-700" :
                              "bg-[#f3f4f9] text-[#4d4354]/60"
                            }`}>
                              {school.plan}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 mt-1.5">
                            <span className="text-[10px] font-bold text-[#4d4354]/40">{school.contactEmail || "—"}</span>
                            <span className="text-[10px] font-bold text-[#4d4354]/40">{school.city || "—"}</span>
                            <span className="text-[10px] font-bold text-[#4d4354]/40">Since {new Date(school.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden md:flex gap-3">
                            <MiniStat label="Campuses" value={school.campusCount} />
                            <MiniStat label="Students" value={school.totalStudents} />
                            <MiniStat label="Staff" value={school.totalStaff} />
                            <MiniStat label="Classes" value={school.totalClasses} />
                          </div>
                          <ChevronRight className={`w-4 h-4 text-[#4d4354]/30 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[#f3f4f9] bg-[#fbf0fe]/10 p-5">
                        <div className="flex flex-wrap gap-3 mb-4 md:hidden">
                          <MiniStat label="Campuses" value={school.campusCount} />
                          <MiniStat label="Students" value={school.totalStudents} />
                          <MiniStat label="Staff" value={school.totalStaff} />
                          <MiniStat label="Classes" value={school.totalClasses} />
                        </div>

                        <div className="flex items-center justify-between gap-4 mb-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">
                            Campus Breakdown
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#4d4354]/40">
                              AI Credits: {school.aiCreditsUsed} / {school.aiCreditsLimit < 0 ? "Unlimited" : school.aiCreditsLimit}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailSchool(school); }}
                              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf] bg-[#fbf0fe] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Details
                            </button>
                            <span className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-normal ${
                              school.plan === "ENTERPRISE" ? "bg-gradient-to-r from-[#1f1a23] to-[#2d2633] text-white" :
                              school.plan === "PRO" ? "bg-[#fbf0fe] text-[#8127cf]" :
                              school.plan === "BASIC" ? "bg-sky-50 text-sky-700" :
                              "bg-[#f3f4f9] text-[#4d4354]/60"
                            }`}>
                              {school.plan}
                            </span>
                          </div>
                        </div>

                        {school.campuses.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {school.campuses.map((campus) => (
                              <div key={campus.id} className="rounded-xl bg-white border-[#cfc2d6]/25 p-4 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
                                <p className="text-sm font-black text-[#1f1a23]">{campus.name}</p>
                                <p className="text-[10px] font-bold text-[#4d4354]/40 mt-0.5">{campus.city || "—"} {campus.board ? `· ${campus.board}` : ""}</p>
                                {campus.principalName ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">Principal: {campus.principalName}</p> : null}
                                {campus.phone ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">{campus.phone}{campus.email ? ` · ${campus.email}` : ""}</p> : null}
                                {campus.website ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">{campus.website}</p> : null}
                                <div className="flex gap-3 mt-3">
                                  <span className="text-[9px] font-bold text-[#4d4354]/50">{campus.students} students</span>
                                  <span className="text-[9px] font-bold text-[#4d4354]/50">{campus.staff} staff</span>
                                  <span className="text-[9px] font-bold text-[#4d4354]/50">{campus.classes} classes</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-[#4d4354]/40">No campuses registered.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {pagination.pages > 1 && (
              <PaginationBar
                pagination={pagination}
                label="schools"
                onPage={(p) => loadSchools(p)}
              />
            )}
          </>
        )}
      </div>

      {detailSchool && (
        <SchoolDetailModal
          school={detailSchool}
          onClose={() => setDetailSchool(null)}
          onPlanChange={async (schoolId, newPlan) => {
            const ok = await changeSchoolPlan(schoolId, newPlan);
            if (ok) setDetailSchool(null);
          }}
        />
      )}
    </div>
  );
}

function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [schoolOptions, setSchoolOptions] = useState<
    { id: string; name: string; plan?: string; campuses?: { id: string; name: string }[] }[]
  >([]);

  // The Add User modal needs every school with its campuses. Fetched once
  // on demand rather than with the paginated user list.
  const loadSchoolOptions = useCallback(async () => {
    if (schoolOptions.length) return;
    try {
      const res = await fetch("/api/owner/schools?limit=100");
      const json = await res.json();
      if (json.success) {
        setSchoolOptions(
          json.data.map((s: any) => ({
            id: s.id,
            name: s.name,
            plan: s.plan,
            campuses: s.campuses?.map((c: any) => ({ id: c.id, name: c.name })) ?? [],
          }))
        );
      }
    } catch {
      toast.error("Could not load schools");
    }
  }, [schoolOptions.length]);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) qp.set("search", search);
      if (roleFilter) qp.set("role", roleFilter);
      if (statusFilter) qp.set("status", statusFilter);

      const res = await fetch(`/api/owner/users?${qp}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
        setPagination(json.pagination);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">All Users</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            {pagination.total} users across all schools
          </p>
        </div>
        <button
          onClick={() => { loadSchoolOptions(); setShowAddUser(true); }}
          className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-[#8127cf] to-[#9c48ea] px-5 text-[13px] font-black text-white shadow-lg shadow-[#8127cf]/25 transition-all hover:shadow-xl active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {showAddUser && (
        <AddUserModal
          schools={schoolOptions}
          onClose={() => setShowAddUser(false)}
          onCreated={() => loadUsers(pagination.page)}
        />
      )}

      <div className="rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[200px] max-w-sm relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4d4354]/40" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none placeholder:text-[#4d4354]/35 focus:ring-2 focus:ring-[#8127cf]/20"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="CAMPUS_ADMIN">Campus Admin</option>
            <option value="PRINCIPAL">Principal</option>
            <option value="TEACHER">Teacher</option>
            <option value="PARENT">Parent</option>
            <option value="STUDENT">Student</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No Users Found" description="Try adjusting your filters." />
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[1000px] text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 bg-gradient-to-r from-[#fbf0fe]/30 to-transparent">
                    <th className="px-4 py-3 rounded-tl-2xl">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">School</th>
                    <th className="px-4 py-3">Campus</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3 text-right rounded-tr-2xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f9]">
                  {users.map((u) => (
                    <tr key={u.id} className="text-sm transition-all duration-200 hover:bg-[#fbf0fe]/20">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] flex items-center justify-center text-[#8127cf] shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-[#1f1a23] truncate">{u.fullName}</p>
                            <p className="text-[10px] font-bold text-[#4d4354]/40 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${ROLE_COLORS[u.role] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                          {u.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/70 font-bold text-xs">
                        {u.school?.name || "—"}
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/70 font-bold text-xs">
                        {u.campus?.name || "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-normal ${u.isActive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[#4d4354]/60 text-xs font-semibold">
                        {formatDate(u.lastLogin)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => { setSelectedUser(u); setShowPasswordModal(true); }}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf] bg-[#fbf0fe] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          Reset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <PaginationBar pagination={pagination} label="users" onPage={(p) => loadUsers(p)} />
            )}
          </>
        )}
      </div>

      {showPasswordModal && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          apiBase="/api/owner"
          onClose={() => { setShowPasswordModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowPasswordModal(false); setSelectedUser(null); loadUsers(pagination.page); }}
        />
      )}
    </div>
  );
}

function AuditLogView() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("30");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(p), limit: "30", days: daysFilter });
      if (actionFilter) qp.set("action", actionFilter);

      const res = await fetch(`/api/owner/audit-logs?${qp}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setTotalPages(json.pagination.pages);
        setTotal(json.pagination.total);
        setPage(p);
      }
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, daysFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Audit Log</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">{total} actions recorded</p>
        </div>
        <button
          onClick={() => loadLogs(1)}
          className="flex items-center gap-2 h-11 px-5 rounded-xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="login_failed">Login Failed</option>
            <option value="logout">Logout</option>
            <option value="password_change">Password Change</option>
            <option value="school_suspended">School Suspended</option>
            <option value="school_activated">School Activated</option>
            <option value="session_terminated">Session Terminated</option>
          </select>
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            className="h-11 px-4 rounded-xl bg-[#f3f4f9] border-none text-sm font-bold outline-none cursor-pointer"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={FileText} title="No Audit Entries" description="No actions recorded in this time period." />
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const meta = getActionMeta(log.action);
              const Icon = meta.icon;
              const isExpanded = expandedId === log.id;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full text-left rounded-2xl border border-transparent hover:border-[#cfc2d6]/15 p-4 transition-all hover:bg-[#fbf0fe]/20 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-[#1f1a23]">{meta.label}</p>
                        {log.status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase bg-rose-50 text-rose-600">
                            <AlertCircle className="w-2 h-2" /> Failed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold text-[#4d4354]/50 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> {log.user?.fullName || "System"}
                        </span>
                        {log.user?.role && (
                          <span className="text-[10px] font-bold text-[#4d4354]/40">{log.user.role.replace("_", " ")}</span>
                        )}
                        {log.targetName && (
                          <span className="text-[10px] font-bold text-[#4d4354]/50">Target: {log.targetName}</span>
                        )}
                        {log.ipAddress && (
                          <span className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5" /> {log.ipAddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-[#4d4354]/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {relativeTime(log.createdAt)}
                      </p>
                      {log.userAgent && (
                        <p className="text-[9px] font-bold text-[#4d4354]/30 mt-0.5">{parseBrowser(log.userAgent)}</p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#f3f4f9] space-y-3">
                      {log.errorMessage && (
                        <div className="rounded-xl bg-rose-50 px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-rose-500 mb-1">Error</p>
                          <p className="text-xs font-bold text-rose-700">{log.errorMessage}</p>
                        </div>
                      )}
                      {log.oldValues && (
                        <div className="rounded-xl bg-[#f3f4f9] px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-[#4d4354]/40 mb-1">Before</p>
                          <pre className="text-xs font-mono text-[#4d4354]/70 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newValues && (
                        <div className="rounded-xl bg-emerald-50/50 px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-emerald-600/60 mb-1">After</p>
                          <pre className="text-xs font-mono text-emerald-700/70 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="rounded-xl bg-[#f3f4f9] px-4 py-3">
                          <p className="text-[9px] font-black uppercase text-[#4d4354]/40 mb-1">User Agent</p>
                          <p className="text-xs font-mono text-[#4d4354]/50 break-all">{log.userAgent}</p>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <PaginationBar
            pagination={{ page, limit: 30, total, pages: totalPages }}
            label="entries"
            onPage={(p) => loadLogs(p)}
          />
        )}
      </div>
    </div>
  );
}

function SessionsView() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  const loadSessions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "50" });
      if (showActiveOnly) qp.set("active", "true");

      const res = await fetch(`/api/owner/sessions?${qp}`);
      const json = await res.json();
      if (json.success) {
        setSessions(json.data);
        setPagination(json.pagination);
      }
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [showActiveOnly]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const terminateSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      const res = await fetch("/api/owner/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Session terminated");
      loadSessions(pagination.page);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTerminatingId(null);
    }
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Active Sessions</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            {pagination.total} sessions across all schools
          </p>
        </div>
        <button
          onClick={() => loadSessions(1)}
          className="flex items-center gap-2 h-11 px-5 rounded-xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#8127cf] hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-[32px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] text-[#8127cf] flex items-center justify-center">
              <Wifi className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-black text-[#1f1a23]">Login Sessions</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowActiveOnly(true)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${showActiveOnly ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]"}`}
            >
              Active Only
            </button>
            <button
              onClick={() => setShowActiveOnly(false)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${!showActiveOnly ? "bg-[#8127cf] text-white" : "bg-[#f3f4f9] text-[#4d4354]"}`}
            >
              All Sessions
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon={Lock} title="No Sessions" description="No sessions found with the current filter." />
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const device = parseDevice(session.userAgent);
              const DeviceIcon = device.icon;
              const isExpired = new Date(session.expiresAt) < new Date();
              const isLive = session.isActive && !isExpired;

              return (
                <div
                  key={session.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isLive
                      ? "border-emerald-100/50 bg-gradient-to-r from-emerald-50/30 to-white"
                      : "border-[#f3f4f9] bg-[#f3f4f9]/30"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isLive ? "bg-emerald-100 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/40"
                    }`}>
                      <DeviceIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-[#1f1a23]">{session.user.fullName}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase ${
                          isLive ? "bg-emerald-50 text-emerald-600" : "bg-[#f3f4f9] text-[#4d4354]/40"
                        }`}>
                          <span className={`h-1 w-1 rounded-full ${isLive ? "bg-emerald-500" : "bg-[#4d4354]/30"}`} />
                          {isLive ? "Active" : "Ended"}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[7px] font-black uppercase ${ROLE_COLORS[session.user.role] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                          {session.user.role.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-[10px] font-bold text-[#4d4354]/40">{session.user.email}</span>
                        {session.user.school && (
                          <span className="text-[10px] font-bold text-[#8127cf]/60">{session.user.school.name}</span>
                        )}
                        <span className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" /> {session.ipAddress || "—"}
                        </span>
                        <span className="text-[10px] font-bold text-[#4d4354]/40">
                          {device.browser} / {device.os}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <p className="text-[10px] font-bold text-[#4d4354]/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(session.loginAt)}
                      </p>
                      {isLive && (
                        <button
                          onClick={() => terminateSession(session.id)}
                          disabled={terminatingId === session.id}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer disabled:opacity-40"
                        >
                          {terminatingId === session.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <LogOut className="w-3 h-3" />
                          )}
                          Terminate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pagination.pages > 1 && (
          <PaginationBar pagination={pagination} label="sessions" onPage={(p) => loadSessions(p)} />
        )}
      </div>
    </div>
  );
}

function BillingView({ stats }: { stats: Stats | null }) {
  const planColors: Record<string, string> = {
    FREE: "bg-[#f3f4f9] text-[#4d4354]/60 border border-[#cfc2d6]/10",
    STARTER: "bg-sky-50 text-sky-700 border border-sky-100",
    PRO: "bg-[#fbf0fe] text-[#8127cf] border border-[#8127cf]/10",
    ENTERPRISE: "bg-gradient-to-br from-[#1f1a23] to-[#2d2633] text-white border-0",
  };


  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Billing & Plans</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">Revenue overview and plan distribution</p>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-[24px] bg-gradient-to-br from-[#1f1a23] to-[#2d2633] p-6 text-white">
              <p className="text-[9px] font-black uppercase tracking-normal text-white/40 flex items-center gap-2">
                <Banknote className="w-3 h-3" /> Total Revenue
              </p>
              <p className="text-3xl font-black mt-2">
                PKR {((stats.totalRevenue || 0) / 100).toLocaleString("en-PK")}
              </p>
              <p className="text-xs font-bold text-white/50 mt-1">{stats.totalPaymentCount} successful payments</p>
            </div>
            <div className="rounded-[24px] bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-100/50 p-6">
              <p className="text-[9px] font-black uppercase tracking-normal text-amber-600/60 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Pending Invoices
              </p>
              <p className="text-3xl font-black text-amber-800 mt-2">{stats.pendingInvoices}</p>
              <p className="text-xs font-bold text-amber-600/60 mt-1">Awaiting payment</p>
            </div>
            <div className="rounded-[24px] bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-100/50 p-6">
              <p className="text-[9px] font-black uppercase tracking-normal text-emerald-600/60 flex items-center gap-2">
                <CreditCard className="w-3 h-3" /> Active Schools
              </p>
              <p className="text-3xl font-black text-emerald-800 mt-2">{stats.schoolsByStatus?.ACTIVE || 0}</p>
              <p className="text-xs font-bold text-emerald-600/60 mt-1">Out of {stats.schoolCount} total</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4">Schools by Plan</p>
              {Object.keys(stats.schoolsByPlan).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.schoolsByPlan)
                    .sort(([, a], [, b]) => b - a)
                    .map(([plan, count]) => {
                      const pct = stats.schoolCount > 0 ? Math.round((count / stats.schoolCount) * 100) : 0;
                      return (
                        <div key={plan}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-normal ${planColors[plan] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                              {plan}
                            </span>
                            <span className="text-sm font-black text-[#1f1a23]">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#f3f4f9] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                plan === "ENTERPRISE" ? "bg-[#1f1a23]" :
                                plan === "PRO" ? "bg-[#8127cf]" :
                                plan === "STARTER" ? "bg-sky-500" : "bg-[#cfc2d6]/40"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[9px] font-bold text-[#4d4354]/40 mt-0.5">{pct}% of schools</p>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#4d4354]/40">No plan data available</p>
              )}
            </div>

            <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
              <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4">Schools by Status</p>
              {Object.keys(stats.schoolsByStatus).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(stats.schoolsByStatus)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const pct = stats.schoolCount > 0 ? Math.round((count / stats.schoolCount) * 100) : 0;
                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between mb-1">
                            <StatusPill status={status} />
                            <span className="text-sm font-black text-[#1f1a23]">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#f3f4f9] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                status === "ACTIVE" ? "bg-emerald-500" :
                                status === "TRIAL" ? "bg-[#8127cf]" :
                                status === "SUSPENDED" ? "bg-rose-500" : "bg-[#cfc2d6]/40"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[9px] font-bold text-[#4d4354]/40 mt-0.5">{pct}% of schools</p>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#4d4354]/40">No status data available</p>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function PricingView({ stats }: { stats: Stats | null }) {
  const planColors: Record<string, string> = {
    FREE: "bg-[#f3f4f9] text-[#4d4354]/60 border border-[#cfc2d6]/10",
    STARTER: "bg-sky-50 text-sky-700 border border-sky-100",
    PRO: "bg-[#fbf0fe] text-[#8127cf] border border-[#8127cf]/10",
    ENTERPRISE: "bg-gradient-to-br from-[#1f1a23] to-[#2d2633] text-white border-0",
  };
  const [pricingSchoolId, setPricingSchoolId] = useState("");
  const [pricingValues, setPricingValues] = useState<Record<string, { price: string }>>({
    FREE: { price: "0" },
    BASIC: { price: "29" },
    PRO: { price: "79" },
    ENTERPRISE: { price: "" },
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");

  const [defaultPricing, setDefaultPricing] = useState<Record<string, { price: string }>>({
    FREE: { price: "0" },
    BASIC: { price: "29" },
    PRO: { price: "79" },
    ENTERPRISE: { price: "" },
  });
  const [savingDefaults, setSavingDefaults] = useState(false);

  const loadDefaultPricing = async () => {
    try {
      const res = await fetch("/api/owner/platform-config");
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data as Record<string, { price?: number | null }>;
        setDefaultPricing({
          FREE: { price: String(d.FREE?.price ?? 0) },
          BASIC: { price: String(d.BASIC?.price ?? 29) },
          PRO: { price: String(d.PRO?.price ?? 79) },
          ENTERPRISE: { price: d.ENTERPRISE?.price != null ? String(d.ENTERPRISE.price) : "" },
        });
      }
    } catch {
      // ignore
    }
  };

  const saveDefaultPricing = async () => {
    setSavingDefaults(true);
    try {
      const pricing: Record<string, { price?: number | null }> = {};
      for (const [plan, vals] of Object.entries(defaultPricing)) {
        const num = vals.price === "" ? null : Number(vals.price);
        if (num !== null && (isNaN(num) || num < 0)) {
          toast.error(`Invalid price for ${plan}`);
          setSavingDefaults(false);
          return;
        }
        pricing[plan] = num !== null ? { price: num } : { price: null };
      }
      const res = await fetch("/api/owner/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || JSON.stringify(json));
      toast.success(json.message);
    } catch (err: any) {
      console.error("[pricing] save error", err);
      toast.error(err?.message || String(err));
    } finally {
      setSavingDefaults(false);
    }
  };

  useEffect(() => { loadDefaultPricing(); }, []);

  const loadPricing = async (schoolId: string) => {
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`);
      const json = await res.json();
      if (json.data?.planPricing) {
        const p = json.data.planPricing as Record<string, { price?: number }>;
        setPricingValues({
          FREE: { price: String(p.FREE?.price ?? 0) },
          BASIC: { price: String(p.BASIC?.price ?? 29) },
          PRO: { price: String(p.PRO?.price ?? 79) },
          ENTERPRISE: { price: p.ENTERPRISE?.price != null ? String(p.ENTERPRISE.price) : "" },
        });
      } else {
        setPricingValues({
          FREE: { price: "0" },
          BASIC: { price: "29" },
          PRO: { price: "79" },
          ENTERPRISE: { price: "" },
        });
      }
      setPricingMessage("");
    } catch {
      toast.error("Failed to load pricing");
    }
  };

  const savePricing = async () => {
    if (!pricingSchoolId) return;
    setSavingPricing(true);
    setPricingMessage("");
    try {
      const pricing: Record<string, { price?: number }> = {};
      for (const [plan, vals] of Object.entries(pricingValues)) {
        const num = vals.price === "" ? undefined : Number(vals.price);
        if (num !== undefined && (isNaN(num) || num < 0)) {
          toast.error(`Invalid price for ${plan}`);
          setSavingPricing(false);
          return;
        }
        pricing[plan] = num !== undefined ? { price: num } : { price: undefined };
      }
      const res = await fetch(`/api/owner/schools/${pricingSchoolId}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.message);
      setPricingMessage("Pricing saved — Super Admins will see updated prices immediately.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPricing(false);
    }
  };

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Plan Pricing</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">Set global defaults and per-school overrides</p>
        </div>
      </div>

      <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] mb-8">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4 flex items-center gap-2">
          <Globe className="w-3 h-3" /> Default Plan Prices
        </p>
        <p className="text-xs font-semibold text-[#4d4354]/40 mb-4">
          Set global default prices for all plans. These apply to every school unless overridden per school below. Existing schools will see a notice about new rates from their next billing cycle.
        </p>
        <div className="space-y-3 mb-4">
          {Object.entries(defaultPricing).map(([plan, vals]) => (
            <div key={plan} className="flex items-center gap-4">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-normal w-28 ${planColors[plan] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                {plan}
              </span>
              <div className="relative flex-1 max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4d4354]/40">PKR</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Default"
                  value={vals.price}
                  onChange={(e) => setDefaultPricing(prev => ({ ...prev, [plan]: { price: e.target.value } }))}
                  className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-12 pr-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={saveDefaultPricing}
          disabled={savingDefaults}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1f1a23] px-5 py-[10px] text-sm font-black text-white hover:bg-[#2d2633] transition-colors disabled:opacity-50"
        >
          {savingDefaults ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {savingDefaults ? "Saving..." : "Save Defaults"}
        </button>
      </div>

      <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] mb-8">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4 flex items-center gap-2">
          <DollarSign className="w-3 h-3" /> Plan Pricing Override
        </p>
        <p className="text-xs font-semibold text-[#4d4354]/40 mb-4">
          Set custom plan prices per school. Leave blank to use defaults.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">School</label>
            <select
              value={pricingSchoolId}
              onChange={(e) => {
                setPricingSchoolId(e.target.value);
                if (e.target.value) loadPricing(e.target.value);
                setPricingMessage("");
              }}
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
            >
              <option value="">Select a school...</option>
              {stats?.schools?.map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        {pricingSchoolId && (
          <div className="space-y-3">
            {Object.entries(pricingValues).map(([plan, vals]) => (
              <div key={plan} className="flex items-center gap-4">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-normal w-28 ${planColors[plan] || "bg-[#f3f4f9] text-[#4d4354]"}`}>
                  {plan}
                </span>
                <div className="relative flex-1 max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4d4354]/40">PKR</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Default"
                    value={vals.price}
                    onChange={(e) => setPricingValues(prev => ({ ...prev, [plan]: { price: e.target.value } }))}
                    className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white pl-12 pr-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={savePricing}
                disabled={savingPricing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8127cf] px-5 py-[10px] text-sm font-black text-white hover:bg-[#6a1fb3] transition-colors disabled:opacity-50"
              >
                {savingPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingPricing ? "Saving..." : "Save Pricing"}
              </button>
              {pricingMessage && (
                <span className="text-xs font-semibold text-emerald-600">{pricingMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentSettingsView() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", accountTitle: "", accountNumber: "", iban: "" });

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/owner/payment-settings");
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
        setBankForm({
          bankName: json.data.bankName || "",
          accountTitle: json.data.accountTitle || "",
          accountNumber: json.data.accountNumber || "",
          iban: json.data.iban || "",
        });
      }
    } catch {
      toast.error("Failed to load payment settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const startConnectOnboarding = async () => {
    setConnectLoading(true);
    try {
      const res = await fetch("/api/owner/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-connect-onboarding" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConnectLoading(false);
    }
  };

  const saveBankDetails = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/owner/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-bank", ...bankForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(json.message);
      loadSettings();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 overflow-y-auto custom-scrollbar flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8127cf]" />
      </div>
    );
  }

  return (
    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]">Platform</p>
          <h2 className="text-3xl font-black text-[#1f1a23] tracking-normal mt-1">Payment Settings</h2>
          <p className="text-sm font-semibold text-[#4d4354]/50 mt-1">
            Configure how you receive subscription payments from schools
          </p>
        </div>
      </div>

      <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] mb-8">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4 flex items-center gap-2">
          <WalletCards className="w-3 h-3" /> Stripe Connect
        </p>
        <p className="text-xs font-semibold text-[#4d4354]/40 mb-4">
          Connect your Stripe account to receive subscription payments directly. When a school upgrades, funds are transferred to your connected account automatically.
        </p>

        {settings?.connectedAccountId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-normal ${settings.onboardingComplete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {settings.onboardingComplete ? "Active" : "Incomplete"}
              </span>
              <span className="text-xs font-semibold text-[#4d4354]/40">
                Account: {settings.connectedAccountId}
              </span>
            </div>
            {!settings.onboardingComplete && (
              <button
                type="button"
                onClick={startConnectOnboarding}
                disabled={connectLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8127cf] px-5 py-[10px] text-sm font-black text-white hover:bg-[#6a1fb3] transition-colors disabled:opacity-50"
              >
                {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Complete onboarding
              </button>
            )}
            {settings.onboardingComplete && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Stripe account connected
                </p>
                <p className="text-xs font-semibold text-emerald-600/70 mt-1">
                  Subscription payments will be transferred to your Stripe account automatically.
                </p>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={startConnectOnboarding}
            disabled={connectLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#8127cf] px-5 py-[10px] text-sm font-black text-white hover:bg-[#6a1fb3] transition-colors disabled:opacity-50"
          >
            {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Connect Stripe account
          </button>
        )}
      </div>

      <div className="rounded-[24px] border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] mb-8">
        <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 mb-4 flex items-center gap-2">
          <Building2 className="w-3 h-3" /> Bank Account (Fallback)
        </p>
        <p className="text-xs font-semibold text-[#4d4354]/40 mb-4">
          Optional: Provide bank account details as a fallback payment method. Schools will see these for manual transfers.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Bank Name</label>
            <input
              value={bankForm.bankName}
              onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))}
              placeholder="e.g. HBL, Meezan Bank"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Account Title</label>
            <input
              value={bankForm.accountTitle}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountTitle: e.target.value }))}
              placeholder="Full name or business name"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">Account Number</label>
            <input
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              placeholder="IBAN or account number"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40 block mb-1">IBAN (optional)</label>
            <input
              value={bankForm.iban}
              onChange={(e) => setBankForm(prev => ({ ...prev, iban: e.target.value }))}
              placeholder="PK...XXXX"
              className="w-full rounded-xl border border-[#cfc2d6]/20 bg-white px-4 py-[10px] text-sm font-semibold text-[#1f1a23] focus:outline-none focus:ring-2 focus:ring-[#8127cf]/30"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={saveBankDetails}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1f1a23] px-5 py-[10px] text-sm font-black text-white hover:bg-[#2d2633] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Bank Details"}
        </button>
      </div>
    </div>
  );
}

function SchoolDetailModal({
  school,
  onClose,
  onPlanChange,
}: {
  school: SchoolRow;
  onClose: () => void;
  onPlanChange: (schoolId: string, newPlan: string) => Promise<void>;
}) {
  const activeTabClass = "text-sm font-black text-[#8127cf] border-b-2 border-[#8127cf] pb-2";
  const inactiveTabClass = "text-sm font-bold text-[#4d4354]/40 pb-2 cursor-pointer hover:text-[#4d4354]/70 transition-colors";
  const [tab, setTab] = useState<"overview" | "campuses" | "subscription">("overview");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="animate-backdrop-enter fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-sm p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="animate-modal-enter bg-white w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[34px] shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#cfc2d6]/10 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-[18px] bg-gradient-to-br from-[#fbf0fe] to-[#f3eeff] flex items-center justify-center text-[#8127cf] shrink-0 overflow-hidden">
              {school.logoUrl ? (
                <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <School className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#1f1a23] tracking-tight">{school.name}</h2>
                <StatusPill status={school.status} />
              </div>
              {school.tagline ? <p className="text-[10px] font-bold text-[#8127cf]/50 italic mt-0.5">"{school.tagline}"</p> : null}
              <p className="text-xs font-semibold text-[#4d4354]/60 mt-0.5">{school.contactEmail || "—"} · {school.city || "—"} {school.phone ? `· ${school.phone}` : ""}</p>
              {school.website ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">{school.website}</p> : null}
              {school.establishedYear ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">Est. {school.establishedYear}</p> : null}
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[#4d4354]/45 transition-all hover:bg-rose-50 hover:text-rose-500 active:scale-90">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-7 pt-5 flex gap-6 border-b border-[#f3f4f9]">
          <button className={tab === "overview" ? activeTabClass : inactiveTabClass} onClick={() => setTab("overview")}>Overview</button>
          <button className={tab === "campuses" ? activeTabClass : inactiveTabClass} onClick={() => setTab("campuses")}>Campuses</button>
          <button className={tab === "subscription" ? activeTabClass : inactiveTabClass} onClick={() => setTab("subscription")}>Subscription</button>
        </div>

        <div className="p-7">
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="Campuses" value={school.campusCount} />
                <MiniStat label="Students" value={school.totalStudents} />
                <MiniStat label="Staff" value={school.totalStaff} />
                <MiniStat label="Classes" value={school.totalClasses} />
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#fbf0fe]/50 to-white border border-[#cfc2d6]/10 p-5">
                <p className="text-[9px] font-black uppercase tracking-normal text-[#8127cf]/60 mb-3">AI Credits</p>
                <div className="flex items-center gap-4">
                  <Zap className="w-8 h-8 text-amber-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-black text-[#1f1a23]">{school.aiCreditsUsed} / {school.aiCreditsLimit < 0 ? "Unlimited" : school.aiCreditsLimit}</span>
                      <span className={`text-[10px] font-black ${school.aiCreditsLimit > 0 && (school.aiCreditsUsed / school.aiCreditsLimit) > 0.8 ? "text-rose-600" : "text-emerald-600"}`}>
                        {school.aiCreditsLimit > 0 ? `${Math.round((school.aiCreditsUsed / school.aiCreditsLimit) * 100)}% used` : "—"}
                      </span>
                    </div>
                    {school.aiCreditsLimit > 0 && (
                      <div className="h-2 rounded-full bg-[#f3f4f9] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${(school.aiCreditsUsed / school.aiCreditsLimit) > 0.8 ? "bg-rose-500" : (school.aiCreditsUsed / school.aiCreditsLimit) > 0.5 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min((school.aiCreditsUsed / school.aiCreditsLimit) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#f3f4f9]/50 p-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Plan</p>
                  <p className="text-sm font-black text-[#1f1a23] mt-0.5">{school.plan}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">Since</p>
                  <p className="text-sm font-black text-[#1f1a23] mt-0.5">{new Date(school.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50/50 border border-amber-100/50 p-4 flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-black text-amber-800">Manage Plan</p>
                  <p className="text-[10px] font-semibold text-amber-700/60">Go to the Subscription tab to change the plan for this school.</p>
                </div>
              </div>
            </div>
          )}

          {tab === "campuses" && (
            <div>
              {school.campuses.length > 0 ? (
                <div className="space-y-3">
                  {school.campuses.map((campus) => (
                    <div key={campus.id} className="rounded-2xl border border-[#cfc2d6]/10 p-5 hover:border-[#8127cf]/10 transition-all">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black text-[#1f1a23]">{campus.name}</p>
                          <p className="text-[10px] font-bold text-[#4d4354]/40 mt-0.5">{campus.city || "—"} {campus.board ? `· ${campus.board}` : ""}</p>
                          {campus.principalName ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">Principal: {campus.principalName}</p> : null}
                          {campus.phone ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">{campus.phone}{campus.email ? ` · ${campus.email}` : ""}</p> : null}
                          {campus.website ? <p className="text-[9px] font-bold text-[#4d4354]/35 mt-0.5">{campus.website}</p> : null}
                        </div>
                        <div className="flex gap-4">
                          <span className="text-[10px] font-bold text-[#4d4354]/50">{campus.students} students</span>
                          <span className="text-[10px] font-bold text-[#4d4354]/50">{campus.staff} staff</span>
                          <span className="text-[10px] font-bold text-[#4d4354]/50">{campus.classes} classes</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-[#f3f4f9]/50 p-8 text-center">
                  <p className="text-sm font-bold text-[#4d4354]/40">No campuses registered.</p>
                </div>
              )}
            </div>
          )}

          {tab === "subscription" && (
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#8127cf]/60">Select Plan for {school.name}</p>
              <div className="grid gap-3">
                {(["FREE", "BASIC", "PRO", "ENTERPRISE"] as const).map((plan) => {
                  const isCurrent = school.plan === plan;
                  const planStyles: Record<string, string> = {
                    FREE: "border-[#cfc2d6]/20 bg-white",
                    BASIC: "border-sky-200 bg-sky-50/30",
                    PRO: "border-[#8127cf]/20 bg-[#fbf0fe]/30",
                    ENTERPRISE: "border-[#1f1a23]/20 bg-gradient-to-br from-[#f3f4f9] to-white",
                  };
                  const dotStyles: Record<string, string> = {
                    FREE: "bg-[#cfc2d6]/40",
                    BASIC: "bg-sky-500",
                    PRO: "bg-[#8127cf]",
                    ENTERPRISE: "bg-[#1f1a23]",
                  };
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => onPlanChange(school.id, plan)}
                      disabled={isCurrent}
                      className={`relative flex items-center justify-between rounded-2xl border-2 p-4 text-left transition-all cursor-pointer disabled:cursor-default ${
                        isCurrent
                          ? "border-[#8127cf] bg-[#fbf0fe]/50 shadow-md"
                          : `${planStyles[plan]} hover:border-[#8127cf]/30 hover:shadow-sm`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${dotStyles[plan]} ${isCurrent ? "ring-2 ring-[#8127cf]/30 ring-offset-2" : ""}`} />
                        <div>
                          <p className={`text-sm font-black ${isCurrent ? "text-[#8127cf]" : "text-[#1f1a23]"}`}>{plan}</p>
                          <p className="text-[10px] font-bold text-[#4d4354]/50 mt-0.5">
                            {plan === "FREE" ? "50 students, 2 teachers, 1 campus" :
                             plan === "BASIC" ? "500 students, 10 teachers, 1 campus" :
                             plan === "PRO" ? "2,500 students, 50 teachers, 5 campuses" :
                             "Unlimited students, teachers & campuses"}
                          </p>
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="text-[9px] font-black text-[#8127cf] bg-white rounded-full px-3 py-1 border border-[#8127cf]/10">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const planColors: Record<string, string> = {
  FREE: "bg-[#f3f4f9] text-[#4d4354]/60 border border-[#cfc2d6]/10",
  STARTER: "bg-sky-50 text-sky-700 border border-sky-100",
  PRO: "bg-[#fbf0fe] text-[#8127cf] border border-[#8127cf]/10",
  ENTERPRISE: "bg-gradient-to-br from-[#1f1a23] to-[#2d2633] text-white border-0",
};

function ChangePasswordModal({
  user,
  apiBase,
  onClose,
  onSuccess,
}: {
  user: UserRow;
  apiBase: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async () => {
    setError("");
    if (!newPassword) return setError("Password is required");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change password");
      toast.success(`Password changed for ${user.fullName}`);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-backdrop-enter fixed inset-0 z-[120] flex items-center justify-center bg-[#1f1a23]/45 backdrop-blur-md p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="animate-modal-enter bg-white w-full max-w-md max-h-[88vh] overflow-y-auto rounded-[34px] p-7 shadow-[0_34px_90px_rgba(31,26,35,0.22)] border border-[#cfc2d6]/20 custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-5 mb-6">
          <div>
            <p className="text-[10px] font-black uppercase text-[#8127cf]">Security action</p>
            <h3 className="mt-1 text-2xl font-black text-[#1f1a23] tracking-normal">Change Password</h3>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#fbf0fe]/50 border border-[#cfc2d6]/10 p-4 mb-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-[#8127cf]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-black text-sm text-[#1f1a23]">{user.fullName}</p>
              <p className="text-[10px] font-bold text-[#4d4354]/40">{user.email}</p>
              {user.school && <p className="text-[10px] font-bold text-[#8127cf]/60 mt-0.5">{user.school.name}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password..."
                className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 pr-12 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4d4354]/40 hover:text-[#8127cf] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex gap-1 flex-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        level <= strength.level
                          ? strength.level <= 1 ? "bg-rose-500" : strength.level <= 2 ? "bg-amber-500" : strength.level <= 3 ? "bg-emerald-400" : "bg-emerald-600"
                          : "bg-[#f3f4f9]"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-normal ${
                  strength.level <= 1 ? "text-rose-500" : strength.level <= 2 ? "text-amber-500" : "text-emerald-600"
                }`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="mb-2 block pl-2 text-[9px] font-black uppercase tracking-normal text-[#4d4354]/40">
              Confirm Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password..."
              className="h-14 w-full rounded-2xl border border-[#cfc2d6]/20 bg-[#fbf0fe]/50 px-4 text-sm font-bold outline-none transition-all placeholder:text-[#4d4354]/35 focus:border-[#8127cf]/35 focus:bg-white"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-2 text-xs font-bold text-rose-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Passwords do not match
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-amber-50/60 border border-amber-200/40 p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-800">Security Notice</p>
              <p className="text-[10px] font-semibold text-amber-700/70 mt-0.5">
                This action is logged. The user will need the new password on their next login.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200/40 p-4 mb-4">
            <p className="text-xs font-bold text-rose-700">{error}</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 h-14 rounded-2xl bg-[#f3f4f9] text-sm font-black text-[#4d4354] hover:bg-[#e8e0ec] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !newPassword || newPassword !== confirmPassword}
            className="flex-[2] h-14 rounded-2xl bg-gradient-to-r from-[#1f1a23] to-[#2d2633] text-sm font-black text-white hover:from-black hover:to-[#1f1a23] disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {loading ? "Updating..." : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#f3f4f9] px-3 py-2 text-center">
      <p className="text-[7px] font-black uppercase tracking-normal text-[#4d4354]/40">{label}</p>
      <p className="text-sm font-black text-[#1f1a23]">{value}</p>
    </div>
  );
}

function PaginationBar({
  pagination,
  label,
  onPage,
}: {
  pagination: Pagination;
  label: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#f3f4f9]">
      <p className="text-xs font-bold text-[#4d4354]/40">
        Page {pagination.page} of {pagination.pages} ({pagination.total} {label})
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(pagination.page - 1)}
          disabled={pagination.page <= 1}
          className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 disabled:hover:bg-[#f3f4f9] disabled:hover:text-[#4d4354] transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPage(pagination.page + 1)}
          disabled={pagination.page >= pagination.pages}
          className="h-9 w-9 rounded-xl bg-[#f3f4f9] flex items-center justify-center text-[#4d4354] hover:bg-[#8127cf] hover:text-white disabled:opacity-30 disabled:hover:bg-[#f3f4f9] disabled:hover:text-[#4d4354] transition-all cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function getPasswordStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { level: 1, label: "Weak" };
  if (score <= 2) return { level: 2, label: "Fair" };
  if (score <= 3) return { level: 3, label: "Good" };
  return { level: 4, label: "Strong" };
}

function OwnerSkeleton() {
  return (
    <div className="min-h-screen bg-[#f3f4f9] flex font-sans">
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-[#cfc2d6]/10 p-5 gap-6">
        <div className="animate-pulse bg-[#e8e0ec] rounded-lg h-8 w-32" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-[#e8e0ec] rounded-2xl h-11" />
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <div className="animate-pulse bg-[#e8e0ec] rounded-2xl h-11" />
          <div className="animate-pulse bg-[#e8e0ec] rounded-2xl h-11" />
        </div>
      </div>
      <main className="flex-1 p-4 md:p-8 flex flex-col h-screen">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <div className="animate-pulse bg-[#e8e0ec] rounded-lg h-5 w-48" />
            <div className="animate-pulse bg-[#e8e0ec] rounded-lg h-4 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse bg-[#e8e0ec] rounded-[20px] h-24" />
          ))}
        </div>
        <div className="animate-pulse bg-[#e8e0ec] rounded-[32px] h-48 mb-8" />
        <div className="animate-pulse bg-[#e8e0ec] rounded-[32px] flex-1" />
      </main>
    </div>
  );
}
