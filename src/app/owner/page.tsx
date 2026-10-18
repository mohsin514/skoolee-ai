"use client";

import { useWorkspaceView } from "@/components/nav/useWorkspaceView";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { InfoTip } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { InputGroup, FieldAction } from "@/components/ui/input-group";

import { cn } from "@/lib/utils";

import { pageCardSurface } from "@/components/ui/page-card";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Banknote,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Gauge,
  Globe,
  KeyRound,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  Pause,
  PieChart,
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
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { PlatformOverview } from "@/components/insights";
import { CommandCentreSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { AddUserModal } from "@/components/owner/provisioning-modals";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { formatPlanLimit, getPlanLimits } from "@/config/plans";
import {
  EmptyState,
  RoleShell,
  StatCard,
  type RoleNavItem,
} from "@/components/role-dashboard";
import { Modal } from "@/components/ui/modal";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { useUiText } from "@/components/locale/LocaleProvider";
import { formatSupportInstant } from "@/lib/owner/support-ui";
import { SubscriptionRequestReview } from "@/components/owner/SubscriptionRequestReview";
import { PilotEvidence } from "@/components/owner/PilotEvidence";
import { CapacityReport } from "@/components/owner/CapacityReport";

type OwnerView = "schools" | "users" | "audit" | "sessions" | "billing" | "pricing" | "payments" | "support" | "subscription-requests" | "pilots" | "capacity";
const WORKSPACE_VIEWS: readonly OwnerView[] = ["schools", "users", "audit", "sessions", "billing", "pricing", "payments", "support", "subscription-requests", "pilots", "capacity"];

function planLabel(plan: string) {
  return getPlanLimits(plan).name;
}

/** The plan's limits in words, read from the plan catalogue so they cannot drift from it. */
function planSummary(plan: string) {
  const limits = getPlanLimits(plan);
  if (limits.maxStudents < 0 && limits.maxTeachers < 0 && limits.maxCampuses < 0) {
    return "Unlimited students, teachers and campuses";
  }
  const part = (count: number, one: string, many: string) => `${formatPlanLimit(count)} ${count === 1 ? one : many}`;
  return [
    part(limits.maxStudents, "student", "students"),
    part(limits.maxTeachers, "teacher", "teachers"),
    part(limits.maxCampuses, "campus", "campuses"),
  ].join(", ");
}

const PLAN_CHOICES = ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const;

/** Mirrors AI_CREDIT_POLICY in src/config/plans.ts. */
const AI_CREDITS_HELP = "Credits used this month against the plan's monthly allowance. Unused credits expire when usage resets at the start of each calendar month.";

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
  // Series added for the platform deck. Optional: an older cached response
  // must still render, it just draws empty states for the charts.
  usersByRole?: Record<string, number>;
  invoicesByStatus?: { status: string; count: number; amount: number }[];
  signupsByMonth?: { month: string; count: number }[];
  revenueByMonth?: { month: string; amount: number; count: number }[];
  loginsByDay?: { day: string; count: number }[];
  schoolBreakdown?: {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
    students: number;
    campuses: number;
  }[];
}

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/** "SUPER_ADMIN" → "Super admin", "login_failed" → "Login failed". */
function sentenceCase(value: string) {
  const words = value.replace(/_/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

const ROLE_BADGES: Record<string, BadgeVariant> = {
  APP_OWNER: "default",
  SUPER_ADMIN: "secondary",
  CAMPUS_ADMIN: "info",
  ADMIN: "info",
  PRINCIPAL: "success",
  TEACHER: "outline",
  PARENT: "warning",
  STUDENT: "neutral",
};

function RoleBadge({ role }: { role: string }) {
  return <Badge variant={ROLE_BADGES[role] ?? "neutral"} size="sm">{sentenceCase(role)}</Badge>;
}

const PLAN_BADGES: Record<string, { variant: BadgeVariant; className?: string }> = {
  FREE: { variant: "neutral" },
  STARTER: { variant: "info" },
  BASIC: { variant: "info" },
  PRO: { variant: "secondary" },
  ENTERPRISE: { variant: "outline", className: "border-ink-strong bg-ink-strong text-white" },
};

function PlanBadge({ plan, size = "sm" }: { plan: string; size?: "sm" | "default" }) {
  const style = PLAN_BADGES[plan] ?? { variant: "neutral" as const };
  return <Badge variant={style.variant} size={size} className={style.className}>{planLabel(plan)}</Badge>;
}

const ACTION_META: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  login: { icon: LogIn, label: "Login", tone: "bg-emerald-50 text-emerald-700" },
  login_failed: { icon: AlertCircle, label: "Login failed", tone: "bg-rose-50 text-rose-700" },
  logout: { icon: LogOut, label: "Logout", tone: "bg-surface-subtle text-ink-muted" },
  password_change: { icon: KeyRound, label: "Password changed", tone: "bg-amber-50 text-amber-700" },
  school_suspended: { icon: Pause, label: "School suspended", tone: "bg-rose-50 text-rose-700" },
  school_activated: { icon: Play, label: "School activated", tone: "bg-emerald-50 text-emerald-700" },
  session_terminated: { icon: LogOut, label: "Session terminated", tone: "bg-amber-50 text-amber-700" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: Activity, label: sentenceCase(action), tone: "bg-surface-subtle text-ink-muted" };
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

const STATUS_BADGES: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  TRIAL: "secondary",
};

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_BADGES[status.toUpperCase()] ?? "neutral"} size="sm" dot>
      {sentenceCase(status)}
    </Badge>
  );
}

/* Shared layout for every console view. */
const VIEW_BODY = "custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8";
const TOOLBAR = "mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center";
const SEARCH_GROUP = "w-full sm:min-w-56 sm:max-w-sm sm:flex-1";
const FILTER_SELECT = "sm:w-48";

function ViewHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="sk-eyebrow text-primary">Platform</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A section heading inside a panel, with its icon tile and one line of purpose. */
function PanelHeading({ icon: Icon, title, description, id }: { icon: LucideIcon; title: string; description?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <h3 id={id} className="text-base font-bold text-ink-strong">{title}</h3>
        {description ? <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [activeView, setActiveView] = useWorkspaceView(WORKSPACE_VIEWS, "schools");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/owner/stats");
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
        setStatsFailed(false);
      } else {
        setStatsFailed(true);
      }
    } catch {
      setStatsFailed(true);
      toast.error("Could not load platform statistics. Check your connection and try again.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Sign-out lives in RoleHeader, which this console renders via RoleShell.
  // An unreachable handleLogout() used to sit here (RoleShell takes no onLogout
  // prop, so nothing could call it); its router.push("/login") would also have
  // left this console renderable via Back after sign-out.
  const navItems: RoleNavItem[] = [
    { icon: LayoutGrid, label: "Schools", active: activeView === "schools", onClick: () => setActiveView("schools") },
    { icon: Users, label: "Users", active: activeView === "users", onClick: () => setActiveView("users") },
    { icon: DollarSign, label: "Billing", active: activeView === "billing", onClick: () => setActiveView("billing") },
    { icon: Tag, label: "Pricing", active: activeView === "pricing", onClick: () => setActiveView("pricing") },
    { icon: WalletCards, label: "Payments", active: activeView === "payments", onClick: () => setActiveView("payments") },
    { icon: CreditCard, label: "Subscription requests", active: activeView === "subscription-requests", onClick: () => setActiveView("subscription-requests") },
    { icon: FlaskConical, label: "Pilot evidence", active: activeView === "pilots", onClick: () => setActiveView("pilots") },
    { icon: Gauge, label: "Capacity", active: activeView === "capacity", onClick: () => setActiveView("capacity") },
    { icon: FileText, label: "Audit Log", active: activeView === "audit", onClick: () => setActiveView("audit") },
    { icon: Shield, label: "Sessions", active: activeView === "sessions", onClick: () => setActiveView("sessions") },
    { icon: ShieldCheck, label: "Support Access", active: activeView === "support", onClick: () => setActiveView("support") },
  ];
  const bottomItems: RoleNavItem[] = [];

  if (statsLoading && !stats) {
    return (
      <RoleShellSkeleton navRows={7} label="Loading the platform command centre">
        <CommandCentreSkeleton />
      </RoleShellSkeleton>
    );
  }

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
      <section className={cn(pageCardSurface, "p-0 sm:p-0", "flex-1 overflow-hidden flex flex-col")} >
        <SupportSessionBanner />
        {activeView === "schools" && (
          <SchoolsView
            stats={stats}
            statsFailed={statsFailed}
            onRefreshStats={loadStats}
            onOpenBilling={() => setActiveView("billing")}
            onOpenUsers={() => setActiveView("users")}
          />
        )}
        {activeView === "users" && <UsersView />}
        {activeView === "billing" && <BillingView stats={stats} onRetry={loadStats} />}
        {activeView === "pricing" && <PricingView stats={stats} />}
        {activeView === "payments" && <PaymentSettingsView />}
        {activeView === "audit" && <AuditLogView />}
        {activeView === "sessions" && <SessionsView />}
        {activeView === "support" && <SupportAccessView schools={stats?.schools || []} />}
        {activeView === "subscription-requests" && <SubscriptionRequestReview />}
        {activeView === "pilots" && <PilotEvidence />}
        {activeView === "capacity" && <CapacityReport />}
      </section>
    </RoleShell>
  );
}

type SupportGrantRow = {
  id: string; schoolId: string; purpose: string; scope: string[]; actions: string[]; status: string; expiresAt: string;
  emergencyReason: string | null; reviewDueAt: string | null; reviewedAt: string | null;
  school: { id: string; name: string }; incident: { id: string; reference: string; purpose: string; impact: string; status: string; updatedAt: string; ownerActorId: string; closureEvidence: string | null };
};

const GRANT_BADGES: Record<string, BadgeVariant> = {
  pending: "warning",
  approved: "info",
  active: "success",
  rejected: "danger",
  revoked: "neutral",
  expired: "neutral",
  closed: "neutral",
};

const SUPPORT_ACTION_BADGES: Record<string, BadgeVariant> = {
  queued: "warning",
  completed: "success",
  cancelled: "neutral",
  failed: "danger",
};

/** A checkbox choice drawn as a tile; the whole tile is the label. */
const CHOICE_TILE = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-border-subtle-hover hover:bg-surface-hover has-[:checked]:border-primary/40 has-[:checked]:bg-surface-selected";

function SupportSessionBanner() {
  const t = useUiText();
  const [session, setSession] = useState<{ id: string; purpose: string; scope: string[]; actions: string[]; expiresAt: string } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/owner/support/session", { cache: "no-store" });
        const json = await response.json();
        if (alive) setSession(response.ok && json.success ? json.data : null);
      } catch { if (alive) setSession(null); }
    };
    void refresh();
    const poll = window.setInterval(refresh, 15_000);
    window.addEventListener("skoolee:support-session-change", refresh);
    return () => { alive = false; window.clearInterval(poll); window.removeEventListener("skoolee:support-session-change", refresh); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [session]);
  if (!session) return null;
  const end = async () => {
    setEnding(true);
    try {
      const response = await fetch(`/api/owner/support/grants/${session.id}`, { method: "DELETE" });
      if (!response.ok) { toast.error(t("Could not end support access")); return; }
      setSession(null); toast.success(t("Support access ended"));
    } catch {
      toast.error(t("Could not end support access"));
    } finally {
      setEnding(false);
    }
  };
  const scoped = session.actions.some((action) => action === "write" || action === "export");
  return (
    <Alert
      tone="warning"
      live="polite"
      icon={ShieldCheck}
      compact
      className="rounded-none border-x-0 border-t-0 px-4 py-3 shadow-none sm:px-6"
      title={scoped ? t("Support access is active · scoped actions") : t("Support access is active · read only")}
      actions={<Button variant="outline" size="sm" type="button" loading={ending} onClick={end}>{t("End access now")}</Button>}
    >
      <span className="text-xs text-ink-muted">
        {t("Expires")} <bdi dir="ltr">{formatSupportInstant(session.expiresAt)}</bdi>
        {" · "}
        {/* The ticking countdown is visual only: a live region would announce it every second. */}
        <bdi dir="ltr" aria-hidden="true" className="font-semibold tabular-nums text-ink">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</bdi>
        {" · "}
        <bdi dir="ltr" className="break-all font-mono">{session.id}</bdi>
      </span>
    </Alert>
  );
}

function SupportAccessView({ schools }: { schools: { id: string; name: string }[] }) {
  const t = useUiText();
  const [grants, setGrants] = useState<SupportGrantRow[]>([]);
  const [supportSession, setSupportSession] = useState<{ id: string; purpose: string; scope: string[]; actions: string[]; expiresAt: string; queuedActions: { id: string; domain: string; action: string; status: string }[] } | null>(null);
  const [preview, setPreview] = useState<{ id: string; domain: string; data: unknown } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [impact, setImpact] = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [scope, setScope] = useState<string[]>(["school_profile"]);
  const [actions, setActions] = useState<string[]>(["read"]);
  const [emergency, setEmergency] = useState(false);
  const [closureEvidence, setClosureEvidence] = useState<Record<string, string>>({});
  const [actionType, setActionType] = useState("read");
  const [writeField, setWriteField] = useState("phone");
  const [writeValue, setWriteValue] = useState("");
  const [busy, setBusy] = useState(false);
  // Which row action is in flight, so only that button shows progress.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const active = await fetch("/api/owner/support/session", { cache: "no-store" });
      const activeJson = await active.json();
      if (active.ok && activeJson.success) { setSupportSession(activeJson.data); setGrants([]); return; }
      setSupportSession(null); setPreview(null);
      const response = await fetch("/api/owner/support/grants", { cache: "no-store" }); const json = await response.json();
      if (!response.ok) throw new Error(json.error || t("Failed to load support grants"));
      setGrants(json.data || []);
    }
    catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supportSession) return;
    const poll = window.setInterval(() => {
      void fetch("/api/owner/support/session", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) { setSupportSession(null); setPreview(null); return; }
        const json = await response.json();
        if (!json.success || json.data.id !== supportSession.id) { setSupportSession(null); setPreview(null); }
      }).catch(() => { setSupportSession(null); setPreview(null); });
    }, 10_000);
    return () => window.clearInterval(poll);
  }, [supportSession]);

  const track = async (key: string, failure: string, task: () => Promise<void>) => {
    setPendingKey(key);
    try { await task(); }
    catch { toast.error(failure); }
    finally { setPendingKey(null); }
  };
  const isPending = (key: string) => pendingKey === key;

  const submit = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/owner/support/grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId, purpose, impact, scope, actions, durationMinutes, emergency, emergencyReason }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || t("Could not request support access"));
      toast.success(emergency ? t("Emergency support access started; school review is required") : t("Support request sent to the school approver"));
      setPurpose(""); setImpact(""); setEmergencyReason(""); setEmergency(false); await load();
      window.dispatchEvent(new Event("skoolee:support-session-change"));
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not request support access")); }
    finally { setBusy(false); }
  };

  const start = (grant: SupportGrantRow) => track(`start:${grant.id}`, t("Could not start support access"), async () => {
    const response = await fetch(`/api/owner/support/grants/${grant.id}/start`, { method: "POST" });
    const json = await response.json();
    if (!response.ok) { toast.error(json.error || t("Could not start support access")); return; }
    toast.success(t("Support access started")); await load(); window.dispatchEvent(new Event("skoolee:support-session-change"));
  });
  const stop = (grant: SupportGrantRow) => track(`stop:${grant.id}`, t("Could not revoke support access"), async () => {
    const response = await fetch(`/api/owner/support/grants/${grant.id}`, { method: "DELETE" });
    const json = await response.json();
    if (!response.ok) { toast.error(json.error || t("Could not revoke support access")); return; }
    toast.success(t("Support access revoked; queued actions were cancelled")); await load(); window.dispatchEvent(new Event("skoolee:support-session-change"));
  });
  const closeIncident = async (grant: SupportGrantRow) => {
    const evidence = (closureEvidence[grant.id] || "").trim();
    if (evidence.length < 12) return;
    await track(`close:${grant.id}`, t("Could not close support incident"), async () => {
      const response = await fetch(`/api/owner/support/grants/${grant.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed", closureEvidence: evidence }) });
      const json = await response.json();
      if (!response.ok) { toast.error(json.error || t("Could not close support incident")); return; }
      toast.success(t("Incident closed with evidence")); await load();
    });
  };
  const inspect = (grant: Pick<SupportGrantRow, "id">, domain: string) => track(`inspect:${grant.id}:${domain}`, t("Support access expired or was revoked"), async () => {
    const response = await fetch(`/api/owner/support/workspace?grantId=${encodeURIComponent(grant.id)}&domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) { toast.error(json.error || t("Support access expired or was revoked")); return; }
    setPreview({ id: grant.id, domain, data: json.data });
  });
  const queueAction = async () => {
    if (!supportSession) return;
    const chosenAction = supportSession.actions.includes(actionType) ? actionType : supportSession.actions.find((item) => item === "write" || item === "export") || "";
    if (!chosenAction) return;
    const payload = chosenAction === "write" ? { field: writeField, value: writeValue } : undefined;
    await track("queue", t("Could not queue support action"), async () => {
      const response = await fetch("/api/owner/support/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "school_profile", action: chosenAction, payload }) });
      const json = await response.json();
      if (!response.ok) { toast.error(json.error || t("Could not queue support action")); return; }
      toast.success(t("Action queued for scoped support")); setWriteValue(""); await load();
    });
  };
  const executeAction = (id: string, type: string) => track(`execute:${id}`, t("Could not complete support action"), async () => {
    const response = await fetch(`/api/owner/support/actions/${id}/execute`, { method: "POST" });
    if (!response.ok) { const json = await response.json().catch(() => ({})); toast.error(json.error || t("Could not complete support action")); return; }
    if (type === "export") {
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "school-profile.csv"; anchor.click(); URL.revokeObjectURL(url);
    }
    toast.success(type === "export" ? t("Scoped export completed") : t("Scoped change completed")); await load();
  });
  const toggle = (items: string[], setter: (value: string[]) => void, value: string) => setter(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  const domainLabels: Record<string, string> = { school_profile: "School profile", operations: "Operations", users: "Staff directory", finance: "Finance", learning: "Learning records" };
  const selectedAction = supportSession
    ? (supportSession.actions.includes(actionType) ? actionType : supportSession.actions.find((item) => item === "write" || item === "export"))
    : undefined;
  const canSubmit = Boolean(schoolId)
    && purpose.trim().length >= 12
    && impact.trim().length >= 8
    && scope.length > 0
    && actions.length > 0
    && !(emergency && emergencyReason.trim().length < 20);

  return <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" dir="auto">
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">{t("Audited support access")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{t("Create an incident, request least-privilege access from the school group administrator, and keep every support read and action linked to its grant.")}</p>
      </header>

      {supportSession ? (
        <section aria-labelledby="support-session-heading" className="sk-enter rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="support-session-heading" className="text-base font-bold text-ink-strong">{t("Scoped active session")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink">{supportSession.purpose}</p>
            </div>
            <Badge variant="warning" dot>{t("Active")}</Badge>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t("Expires")}: <bdi dir="ltr" className="whitespace-nowrap tabular-nums">{formatSupportInstant(supportSession.expiresAt)}</bdi></p>
          <p className="mt-0.5 text-xs text-ink-subtle"><span dir="ltr" className="break-all font-mono">{supportSession.id}</span></p>
          <div className="mt-4 flex flex-wrap gap-2">
            {supportSession.scope.map((domain) => {
              const key = `inspect:${supportSession.id}:${domain}`;
              return (
                <Button variant="outline" size="sm" key={domain} type="button" loading={isPending(key)} onClick={() => void inspect({ id: supportSession.id }, domain)}>
                  {isPending(key) ? null : <Eye aria-hidden="true" />}
                  {t("Open")}: {t(domainLabels[domain] || domain)}
                </Button>
              );
            })}
          </div>

          {(supportSession.actions.includes("write") || supportSession.actions.includes("export")) && supportSession.scope.includes("school_profile") && (
            <div className="mt-5 rounded-2xl border border-status-warning-border bg-white p-4 shadow-xs sm:p-5">
              <h3 className="text-sm font-bold text-ink-strong">{t("Approved school profile actions")}</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField name="support-action" label={t("Action")}>
                  <SystemSelect value={selectedAction} onChange={(event) => setActionType(event.target.value)} aria-label={t("Action")}>
                    {supportSession.actions.includes("write") && <option value="write">{t("Write")}</option>}
                    {supportSession.actions.includes("export") && <option value="export">{t("Export")}</option>}
                  </SystemSelect>
                </FormField>
                {selectedAction === "write" && <>
                  <FormField name="support-field" label={t("Field")}>
                    <SystemSelect value={writeField} onChange={(event) => setWriteField(event.target.value)} aria-label={t("Field")}>
                      <option value="phone">{t("Phone")}</option>
                      <option value="contactEmail">{t("Contact email")}</option>
                      <option value="website">{t("Website")}</option>
                    </SystemSelect>
                  </FormField>
                  <FormField name="support-value" label={t("New value")} hint={t("Nothing changes until you apply the queued action.")}>
                    <SystemInput value={writeValue} maxLength={180} onChange={(event) => setWriteValue(event.target.value)} aria-label={t("New value")} />
                  </FormField>
                </>}
              </div>
              <Button variant="default" type="button" loading={isPending("queue")} disabled={selectedAction === "write" && !writeValue.trim()} onClick={() => void queueAction()} className="mt-4">{t("Queue action")}</Button>
            </div>
          )}

          {supportSession.queuedActions.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label={t("Support action queue")}>
              {supportSession.queuedActions.map((action) => (
                <li key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-warning-border bg-white p-3 text-sm shadow-xs">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-strong">{t(action.action[0].toUpperCase() + action.action.slice(1))}</span>
                    <Badge variant={SUPPORT_ACTION_BADGES[action.status] ?? "neutral"} size="sm" dot>{t(action.status)}</Badge>
                    <bdi dir="ltr" className="break-all font-mono text-xs text-ink-subtle">{action.id}</bdi>
                  </span>
                  {action.status === "queued" && (
                    <Button variant="outline" size="sm" type="button" loading={isPending(`execute:${action.id}`)} onClick={() => void executeAction(action.id, action.action)}>
                      {t(action.action === "export" ? "Run export" : "Apply change")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : <>
        <section aria-labelledby="support-request-heading" className="sk-panel p-4 sm:p-6">
          <h2 id="support-request-heading" className="text-base font-bold text-ink-strong">{t("Request scoped access")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField name="support-school" label={t("School")} required>
              <SystemSelect value={schoolId} onChange={(event) => setSchoolId(event.target.value)} aria-label={t("School")}>
                <option value="">{t("Choose a school")}</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </SystemSelect>
            </FormField>
            <FormField
              name="support-duration"
              label={t("Duration (minutes)")}
              required
              hint={emergency ? t("Between 5 and 60 minutes for emergency access.") : t("Between 5 and 480 minutes (8 hours).")}
            >
              <SystemInput type="number" min={5} max={emergency ? 60 : 480} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="tabular-nums" />
            </FormField>
            <FormField name="support-purpose" label={t("Support purpose")} required showCount className="sm:col-span-2" hint={t("At least 12 characters. The school approver sees this.")}>
              <SystemInput value={purpose} onChange={(event) => setPurpose(event.target.value)} minLength={12} maxLength={500} aria-label={t("Support purpose")} />
            </FormField>
            <FormField name="support-impact" label={t("Impact")} required className="sm:col-span-2" description={t("What is affected, and for whom.")} hint={t("At least 8 characters.")}>
              <Textarea className="min-h-24 w-full" value={impact} onChange={(event) => setImpact(event.target.value)} minLength={8} maxLength={2000} aria-label={t("Impact")} />
            </FormField>
          </div>
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-ink-strong">{t("Allowed domains")}</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(domainLabels).map(([value, label]) => (
                <label key={value} className={CHOICE_TILE}>
                  <Checkbox checked={scope.includes(value)} onChange={() => toggle(scope, setScope, value)} />
                  <span className="min-w-0">{t(label)}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {t("Safeguarding, clinic, counselling, and custody records are always excluded.")}
            </p>
          </fieldset>
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-ink-strong">{t("Allowed actions")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["read", "write", "export"].map((value) => (
                <label key={value} className={CHOICE_TILE}>
                  <Checkbox checked={actions.includes(value)} onChange={() => toggle(actions, setActions, value)} />
                  <span>{t(value[0].toUpperCase() + value.slice(1))}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t("Read access is the default. Write access and exports require explicit approval.")}</p>
          </fieldset>
          <div className="mt-6 rounded-2xl border border-status-warning-border bg-status-warning-surface p-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-status-warning-text">
              <Checkbox checked={emergency} onChange={(event) => { setEmergency(event.target.checked); if (event.target.checked) setDurationMinutes(Math.min(durationMinutes, 60)); }} />
              {t("Emergency access (school review due before expiry)")}
            </label>
            <p className="ps-7.5 text-xs leading-relaxed text-ink-muted">{t("Access starts as soon as you submit, without waiting for approval, and lasts at most 60 minutes.")}</p>
            {emergency && (
              <FormField name="support-emergency-reason" label={t("Emergency justification")} required className="mt-4" hint={t("At least 20 characters.")}>
                <Textarea className="min-h-20 w-full" value={emergencyReason} onChange={(event) => setEmergencyReason(event.target.value)} minLength={20} aria-label={t("Emergency justification")} />
              </FormField>
            )}
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button variant="default" type="button" loading={busy} disabled={!canSubmit} onClick={submit} className="sm:shrink-0">
              {emergency ? t("Start emergency access") : t("Send school approval request")}
            </Button>
            {!canSubmit && !busy ? (
              <p className="text-xs leading-relaxed text-ink-subtle">{t("Choose a school, describe the purpose and impact, and pick at least one domain and one action.")}</p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="support-grants-heading" className="sk-panel p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="support-grants-heading" className="text-base font-bold text-ink-strong">{t("Incidents and grants")}</h2>
            <Button variant="outline" size="sm" type="button" loading={loading} onClick={() => void load()}>
              {loading ? null : <RefreshCw aria-hidden="true" />}
              {t("Refresh")}
            </Button>
          </div>
          {loading ? (
            <SkeletonList rows={3} label={t("Loading…")} className="mt-4" />
          ) : loadFailed ? (
            <ErrorState description={t("Support requests could not be loaded. Check your connection and try again.")} onRetry={() => void load()} />
          ) : grants.length === 0 ? (
            <EmptyState
              size="sm"
              icon={ShieldCheck}
              title={t("No support requests yet")}
              description={t("Requests you send appear here with their approval status, expiry and closure evidence.")}
            />
          ) : (
            <div className="mt-4 space-y-3">
              {grants.map((grant) => (
                <article key={grant.id} className="rounded-2xl border border-border-subtle bg-white p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-ink-strong">{grant.school.name} · <bdi dir="ltr">{grant.incident.reference}</bdi></p>
                        <Badge variant={GRANT_BADGES[grant.status] ?? "neutral"} size="sm" dot>{t(grant.status)}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{grant.purpose}</p>
                      <p className="mt-2 text-xs text-ink-subtle">{t("Incident owner")}: <bdi dir="ltr">{grant.incident.ownerActorId}</bdi> · {t("Incident status")}: {t(grant.incident.status)}</p>
                      <p className="mt-1 text-xs text-ink-subtle">{t("Expires")}: <bdi dir="ltr" className="tabular-nums">{formatSupportInstant(grant.expiresAt)}</bdi></p>
                      <p className="mt-1 text-xs text-ink-subtle">{t("Domains")}: {grant.scope.map((item) => t(domainLabels[item] || item)).join(", ")} · {t("Actions")}: {grant.actions.map((item) => t(item[0].toUpperCase() + item.slice(1))).join(", ")}</p>
                      {grant.incident.closureEvidence && (
                        <Alert tone="success" live="off" compact className="mt-3" title={t("Closure evidence")}>{grant.incident.closureEvidence}</Alert>
                      )}
                      {grant.emergencyReason && (
                        <Alert tone="warning" live="off" compact className="mt-3" title={t("Emergency")}>
                          {grant.emergencyReason}{grant.reviewedAt ? ` · ${t("Reviewed")}` : <> · {t("Review due")}: <bdi dir="ltr">{formatSupportInstant(grant.reviewDueAt || grant.expiresAt)}</bdi></>}
                        </Alert>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      {grant.status === "approved" && (
                        <Button variant="default" size="sm" type="button" loading={isPending(`start:${grant.id}`)} onClick={() => void start(grant)}>{t("Start access")}</Button>
                      )}
                      {grant.status === "active" && (
                        <Button variant="outline" size="sm" type="button" loading={isPending(`stop:${grant.id}`)} onClick={() => void stop(grant)}>{t("Revoke now")}</Button>
                      )}
                      {grant.status === "active" && grant.scope.map((domain) => {
                        const key = `inspect:${grant.id}:${domain}`;
                        return (
                          <Button variant="outline" size="sm" key={domain} type="button" loading={isPending(key)} onClick={() => void inspect(grant, domain)}>
                            {isPending(key) ? null : <Eye aria-hidden="true" />}
                            {t("Open")}: {t(domainLabels[domain] || domain)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  {grant.incident.status !== "closed" && ["revoked", "expired", "rejected", "active", "approved"].includes(grant.status) && (
                    <div className="mt-4 border-t border-border-subtle pt-4">
                      <FormField name={`closure-${grant.id}`} label={t("Closure evidence")} hint={t("At least 12 characters: what was done and how it was confirmed.")}>
                        <Textarea className="min-h-20 w-full" value={closureEvidence[grant.id] || ""} onChange={(event) => setClosureEvidence((current) => ({ ...current, [grant.id]: event.target.value }))} aria-label={t("Closure evidence")} />
                      </FormField>
                      <Button variant="outline" size="sm" type="button" loading={isPending(`close:${grant.id}`)} disabled={(closureEvidence[grant.id] || "").trim().length < 12} onClick={() => void closeIncident(grant)} className="mt-3">{t("Close incident with evidence")}</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </>}

      {preview && (
        <section aria-labelledby="support-preview-heading" className="sk-enter rounded-2xl border border-border-subtle bg-surface-subtle p-4 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="support-preview-heading" className="min-w-0 text-base font-bold text-ink-strong">{t("Audited support workspace")}: {t(domainLabels[preview.domain] || preview.domain)}</h2>
            <Button variant="outline" size="sm" type="button" onClick={() => setPreview(null)}><X aria-hidden="true" />{t("Close")}</Button>
          </div>
          <pre className="custom-scrollbar mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border-subtle bg-white p-4 font-mono text-xs leading-relaxed text-ink" dir="auto">{JSON.stringify(preview.data, null, 2)}</pre>
        </section>
      )}
      <p className="text-xs leading-relaxed text-ink-subtle">{t("The school approver uses the existing school console. Vendor platform administration remains an APP_OWNER capability; support grants do not change school roles.")}</p>
    </div>
  </div>;
}

function SchoolsView({ stats, statsFailed = false, onRefreshStats, onOpenBilling, onOpenUsers }: {
  stats: Stats | null;
  /** The platform totals failed to load; the school list can still be used. */
  statsFailed?: boolean;
  onRefreshStats: () => void;
  onOpenBilling: () => void;
  onOpenUsers: () => void;
}) {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSchool, setDetailSchool] = useState<SchoolRow | null>(null);

  const loadSchools = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadFailed(false);
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
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter]);

  useEffect(() => { loadSchools(); }, [loadSchools]);

  const hasFilters = Boolean(search || statusFilter || planFilter);
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setPlanFilter(""); };

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
    <div className={VIEW_BODY}>
      {stats ? (
        <div className="mb-6">
          <PlatformOverview
            stats={stats}
            onOpenBilling={onOpenBilling}
            onOpenUsers={onOpenUsers}
          />
        </div>
      ) : statsFailed ? (
        <Alert
          tone="warning"
          className="mb-6"
          title="Platform totals are unavailable"
          actions={<Button variant="outline" size="sm" type="button" onClick={onRefreshStats}><RefreshCw aria-hidden="true" />Try again</Button>}
        >
          The school list below still works. Totals and charts appear once the statistics load.
        </Alert>
      ) : null}

      <section aria-labelledby="owner-schools-heading" className="sk-panel p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="owner-schools-heading" className="text-lg font-bold text-ink-strong">Schools</h2>
          {!loading && !loadFailed ? (
            <p className="text-xs tabular-nums text-ink-subtle">{pagination.total} {pagination.total === 1 ? "school" : "schools"}</p>
          ) : null}
        </div>
        <div className={TOOLBAR}>
          <InputGroup surfaceClassName="bg-muted" className={SEARCH_GROUP}>
            <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
            <SystemInput
              type="text"
              placeholder="Search schools by name, email, slug..."
              aria-label="Search schools"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={"w-full"}
            />
          </InputGroup>
          <SystemSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className={FILTER_SELECT}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TRIAL">Trial</option>
          </SystemSelect>
          <SystemSelect
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label="Filter by plan"
            className={FILTER_SELECT}
          >
            <option value="">All plans</option>
            {PLAN_CHOICES.map((plan) => <option key={plan} value={plan}>{planLabel(plan)}</option>)}
          </SystemSelect>
          {hasFilters ? (
            <Button variant="ghost" size="sm" type="button" onClick={clearFilters} className="self-start sm:self-auto">
              <X aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>

        {loading ? (
          <SkeletonList rows={4} label="Loading schools" />
        ) : loadFailed ? (
          <ErrorState
            title="Schools did not load"
            description="We couldn't load the school list. Check your connection and try again."
            onRetry={() => loadSchools(pagination.page)}
          />
        ) : schools.length === 0 ? (
          <EmptyState
            icon={School}
            title="No schools found"
            description={hasFilters ? "No schools match these filters. Try a different search or clear the filters." : "Schools appear here as soon as they register."}
            action={hasFilters ? <Button variant="outline" type="button" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            <div className="space-y-3">
              {schools.map((school) => {
                const isExpanded = expandedId === school.id;
                return (
                  <div
                    key={school.id}
                    className="group sk-panel overflow-hidden"
                  >
                    <Button variant="ghost"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : school.id)}
                      className="block w-full rounded-none p-4 text-start font-normal actionable-hover:bg-surface-hover actionable-hover:text-ink sm:p-5"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="sk-icon-tile flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
                          {school.logoUrl ? (
                            <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-cover" />
                          ) : (
                            <School aria-hidden="true" className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-base font-bold text-ink-strong">{school.name}</h3>
                            <PlanBadge plan={school.plan} />
                            {school.status !== "ACTIVE" ? <StatusPill status={school.status} /> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                            <span className="min-w-0 max-w-full truncate"><bdi dir="ltr">{school.contactEmail || "—"}</bdi></span>
                            <span>{school.city || "—"}</span>
                            <span>Since {new Date(school.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="hidden gap-2 md:flex">
                            <MiniStat label="Campuses" value={school.campusCount} />
                            <MiniStat label="Students" value={school.totalStudents} />
                            <MiniStat label="Staff" value={school.totalStaff} />
                            <MiniStat label="Classes" value={school.totalClasses} />
                          </div>
                          <ChevronRight aria-hidden="true" className={cn("size-4 text-ink-subtle transition-transform duration-200", isExpanded ? "rotate-90" : "rtl:rotate-180")} />
                        </div>
                      </div>
                    </Button>

                    {isExpanded && (
                      <div className="sk-fade-in border-t border-border-subtle bg-surface-subtle/60 p-4 sm:p-5">
                        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:hidden">
                          <MiniStat label="Campuses" value={school.campusCount} />
                          <MiniStat label="Students" value={school.totalStudents} />
                          <MiniStat label="Staff" value={school.totalStaff} />
                          <MiniStat label="Classes" value={school.totalClasses} />
                        </div>

                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="sk-eyebrow text-primary">
                            Campus breakdown
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <Zap aria-hidden="true" className="size-3.5 text-amber-500" />
                              AI credits:{" "}
                              <span className="font-semibold tabular-nums text-ink-strong">
                                {school.aiCreditsUsed} / {school.aiCreditsLimit < 0 ? "Unlimited" : school.aiCreditsLimit}
                              </span>
                              <InfoTip content={AI_CREDITS_HELP} label="About AI credits" />
                            </span>
                            <Button variant="outline" size="sm"
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDetailSchool(school); }}
                            >
                              <Eye aria-hidden="true" />
                              Details
                            </Button>
                          </div>
                        </div>

                        {school.campuses.length > 0 ? (
                          <div className="sk-stagger grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {school.campuses.map((campus) => <CampusCard key={campus.id} campus={campus} />)}
                          </div>
                        ) : (
                          <EmptyState size="sm" icon={Building2} title="No campuses yet" description="This school has not added a campus." />
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
      </section>

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

type Campus = SchoolRow["campuses"][number];

function CampusCard({ campus }: { campus: Campus }) {
  const contact = [campus.phone, campus.email].filter(Boolean).join(" · ");
  return (
    <div className="sk-panel min-w-0 p-4">
      <p className="truncate text-sm font-bold text-ink-strong">{campus.name}</p>
      <p className="mt-0.5 text-xs text-ink-subtle">{campus.city || "—"}{campus.board ? ` · ${campus.board}` : ""}</p>
      {campus.principalName ? <p className="mt-0.5 text-xs text-ink-subtle">Principal: {campus.principalName}</p> : null}
      {contact ? <p className="mt-0.5 truncate text-xs text-ink-subtle"><bdi dir="ltr">{contact}</bdi></p> : null}
      {campus.website ? <p className="mt-0.5 truncate text-xs text-ink-subtle"><bdi dir="ltr">{campus.website}</bdi></p> : null}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
        <span>{campus.students} students</span>
        <span>{campus.staff} staff</span>
        <span>{campus.classes} classes</span>
      </div>
    </div>
  );
}

function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
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
      toast.error("Could not load the school list for the new user. Close the form and try again.");
    }
  }, [schoolOptions.length]);

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadFailed(false);
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
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const hasFilters = Boolean(search || roleFilter || statusFilter);
  const clearFilters = () => { setSearch(""); setRoleFilter(""); setStatusFilter(""); };
  const openAddUser = () => { loadSchoolOptions(); setShowAddUser(true); };

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="All users"
        description={<><span className="tabular-nums">{pagination.total}</span> users across all schools</>}
        actions={
          <Button variant="default" type="button" onClick={openAddUser}>
            <Plus aria-hidden="true" />
            Add user
          </Button>
        }
      />

      {showAddUser && (
        <AddUserModal
          schools={schoolOptions}
          onClose={() => setShowAddUser(false)}
          onCreated={() => loadUsers(pagination.page)}
        />
      )}

      <section className="sk-panel p-4 sm:p-6">
        <div className={TOOLBAR}>
          <InputGroup surfaceClassName="bg-muted" className={SEARCH_GROUP}>
            <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
            <SystemInput
              type="text"
              placeholder="Search by name, email, phone..."
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={"w-full"}
            />
          </InputGroup>
          <SystemSelect
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className={FILTER_SELECT}
          >
            <option value="">All roles</option>
            <option value="SUPER_ADMIN">Super admin</option>
            <option value="CAMPUS_ADMIN">Campus admin</option>
            <option value="PRINCIPAL">Principal</option>
            <option value="TEACHER">Teacher</option>
            <option value="PARENT">Parent</option>
            <option value="STUDENT">Student</option>
          </SystemSelect>
          <SystemSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className={FILTER_SELECT}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SystemSelect>
          {hasFilters ? (
            <Button variant="ghost" size="sm" type="button" onClick={clearFilters} className="self-start sm:self-auto">
              <X aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>

        {loading ? (
          <SkeletonList rows={5} label="Loading users" />
        ) : loadFailed ? (
          <ErrorState
            title="Users did not load"
            description="We couldn't load the user list. Check your connection and try again."
            onRetry={() => loadUsers(pagination.page)}
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            description={hasFilters ? "No users match these filters. Try a different search or clear the filters." : "Add the first user to a school to get started."}
            action={hasFilters
              ? <Button variant="outline" type="button" onClick={clearFilters}>Clear filters</Button>
              : <Button variant="default" type="button" onClick={openAddUser}><Plus aria-hidden="true" />Add user</Button>}
          />
        ) : (
          <>
              <Table containerClassName="overflow-x-auto custom-scrollbar" className="w-full min-w-[880px] text-start">
                <TableHeader>
                  <TableRow className="text-ink-subtle">
                    <TableHead className="px-4 py-3">User</TableHead>
                    <TableHead className="px-4 py-3">Role</TableHead>
                    <TableHead className="px-4 py-3">School</TableHead>
                    <TableHead className="px-4 py-3">Campus</TableHead>
                    <TableHead className="px-4 py-3">Status</TableHead>
                    <TableHead className="px-4 py-3">Last login</TableHead>
                    <TableHead className="px-4 py-3 text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border-subtle">
                  {users.map((u) => (
                    <TableRow key={u.id} className="text-sm duration-200">
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
                            <User className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-strong">{u.fullName}</p>
                            <p className="truncate text-xs text-ink-subtle"><bdi dir="ltr">{u.email}</bdi></p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-xs text-ink">
                        {u.school?.name || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-xs text-ink">
                        {u.campus?.name || "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <Badge variant={u.isActive ? "success" : "neutral"} size="sm" dot>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-ink-muted">
                        {formatDate(u.lastLogin)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-end">
                        <Button variant="outline" size="sm"
                          type="button"
                          onClick={() => { setSelectedUser(u); setShowPasswordModal(true); }}
                        >
                          <KeyRound aria-hidden="true" />
                          Reset password
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

            {pagination.pages > 1 && (
              <PaginationBar pagination={pagination} label="users" onPage={(p) => loadUsers(p)} />
            )}
          </>
        )}
      </section>

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("30");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async (p = 1) => {
    setLoading(true);
    setLoadFailed(false);
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
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, daysFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Audit log"
        description={<><span className="tabular-nums">{total}</span> actions recorded in the selected period</>}
        actions={
          <Button variant="outline"
            type="button"
            loading={loading}
            onClick={() => loadLogs(1)}
          >
            {loading ? null : <RefreshCw aria-hidden="true" />}
            Refresh
          </Button>
        }
      />

      <section className="sk-panel p-4 sm:p-6">
        <div className={TOOLBAR}>
          <SystemSelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter by action"
            className={FILTER_SELECT}
          >
            <option value="">All actions</option>
            <option value="login">Login</option>
            <option value="login_failed">Login failed</option>
            <option value="logout">Logout</option>
            <option value="password_change">Password changed</option>
            <option value="school_suspended">School suspended</option>
            <option value="school_activated">School activated</option>
            <option value="session_terminated">Session terminated</option>
          </SystemSelect>
          <SystemSelect
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            aria-label="Time period"
            className={FILTER_SELECT}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </SystemSelect>
        </div>

        {loading ? (
          <SkeletonList rows={5} label="Loading audit log" />
        ) : loadFailed ? (
          <ErrorState
            title="The audit log did not load"
            description="We couldn't load these entries. Check your connection and try again."
            onRetry={() => loadLogs(page)}
          />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No audit entries"
            description={actionFilter ? "No entries match this action in the selected period." : "Nothing was recorded in the selected period."}
            action={daysFilter !== "365" ? <Button variant="outline" type="button" onClick={() => setDaysFilter("365")}>Show the last year</Button> : undefined}
            secondaryAction={actionFilter ? <Button variant="ghost" type="button" onClick={() => setActionFilter("")}>Show all actions</Button> : undefined}
          />
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const meta = getActionMeta(log.action);
              const Icon = meta.icon;
              const isExpanded = expandedId === log.id;

              return (
                <Button variant="ghost"
                  key={log.id}
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="group block w-full rounded-2xl border border-border-subtle bg-white p-4 text-start font-normal shadow-xs actionable-hover:border-border-subtle-hover actionable-hover:bg-surface-hover actionable-hover:text-ink sm:p-5"
                >
                  <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                    <div aria-hidden="true" className={cn("sk-icon-tile flex size-10 shrink-0 items-center justify-center rounded-xl", meta.tone)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-ink-strong">{meta.label}</p>
                        {log.status === "failed" && (
                          <Badge variant="danger" size="sm">
                            <AlertCircle aria-hidden="true" /> Failed
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          <User aria-hidden="true" className="size-3" /> {log.user?.fullName || "System"}
                        </span>
                        {log.user?.role && (
                          <span>{sentenceCase(log.user.role)}</span>
                        )}
                        {log.targetName && (
                          <span className="text-ink-muted">Target: {log.targetName}</span>
                        )}
                        {log.ipAddress && (
                          <span className="inline-flex items-center gap-1">
                            <Globe aria-hidden="true" className="size-3" /> <bdi dir="ltr" className="tabular-nums">{log.ipAddress}</bdi>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink-subtle">
                        <Clock aria-hidden="true" className="size-3" /> {relativeTime(log.createdAt)}
                      </p>
                      {log.userAgent && (
                        <p className="mt-0.5 text-xs text-ink-subtle">{parseBrowser(log.userAgent)}</p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="sk-fade-in mt-4 space-y-3 border-t border-border-subtle pt-4">
                      {log.errorMessage && (
                        <Alert tone="danger" live="off" compact title="Error">
                          {log.errorMessage}
                        </Alert>
                      )}
                      {log.oldValues && (
                        <div className="rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
                          <p className="sk-eyebrow mb-1">Before</p>
                          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-ink">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newValues && (
                        <div className="rounded-xl border border-status-success-border bg-status-success-surface px-4 py-3">
                          <p className="sk-eyebrow mb-1 text-status-success-text">After</p>
                          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-emerald-900">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
                          <p className="sk-eyebrow mb-1">User agent</p>
                          <p className="break-all font-mono text-xs text-ink-muted" dir="ltr">{log.userAgent}</p>
                        </div>
                      )}
                    </div>
                  )}
                </Button>
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
      </section>
    </div>
  );
}

function SessionsView() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [confirmSession, setConfirmSession] = useState<SessionEntry | null>(null);

  const loadSessions = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "50" });
      if (showActiveOnly) qp.set("active", "true");

      const res = await fetch(`/api/owner/sessions?${qp}`);
      const json = await res.json();
      if (json.success) {
        setSessions(json.data);
        setPagination(json.pagination);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
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
      toast.success("Session ended. The user has been signed out of it.");
      loadSessions(pagination.page);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTerminatingId(null);
    }
  };

  const confirmDevice = confirmSession ? parseDevice(confirmSession.userAgent) : null;

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Active sessions"
        description={<><span className="tabular-nums">{pagination.total}</span> sessions across all schools</>}
        actions={
          <Button variant="outline"
            type="button"
            loading={loading}
            onClick={() => loadSessions(1)}
          >
            {loading ? null : <RefreshCw aria-hidden="true" />}
            Refresh
          </Button>
        }
      />

      <section className="sk-panel p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
              <Wifi className="size-5" />
            </span>
            <h3 className="text-lg font-bold text-ink-strong">Login sessions</h3>
          </div>
          <div role="group" aria-label="Which sessions to show" className="flex flex-wrap gap-2">
            <Button aria-pressed={showActiveOnly} variant="choice" size="sm" type="button"
              onClick={() => setShowActiveOnly(true)}
            >
              Active only
            </Button>
            <Button aria-pressed={!showActiveOnly} variant="choice" size="sm" type="button"
              onClick={() => setShowActiveOnly(false)}
            >
              All sessions
            </Button>
          </div>
        </div>

        {loading ? (
          <SkeletonList rows={4} label="Loading sessions" />
        ) : loadFailed ? (
          <ErrorState
            title="Sessions did not load"
            description="We couldn't load the session list. Check your connection and try again."
            onRetry={() => loadSessions(pagination.page)}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No sessions"
            description={showActiveOnly ? "Nobody is signed in right now." : "No sign-ins have been recorded yet."}
            action={showActiveOnly ? <Button variant="outline" type="button" onClick={() => setShowActiveOnly(false)}>Show all sessions</Button> : undefined}
          />
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
                  className={cn(
                    "rounded-2xl border p-4 transition-shadow",
                    isLive
                      ? "border-status-success-border bg-gradient-to-r from-status-success-surface to-white shadow-xs hover:shadow-sm rtl:bg-gradient-to-l"
                      : "border-border-subtle bg-surface-subtle",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
                      <div aria-hidden="true" className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        isLive ? "bg-emerald-100 text-emerald-700" : "bg-white text-ink-subtle",
                      )}>
                        <DeviceIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink-strong">{session.user.fullName}</p>
                          <Badge variant={isLive ? "success" : "neutral"} size="sm" dot>
                            {isLive ? "Active" : "Ended"}
                          </Badge>
                          <RoleBadge role={session.user.role} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                          <span className="min-w-0 max-w-full truncate"><bdi dir="ltr">{session.user.email}</bdi></span>
                          {session.user.school && (
                            <span className="text-primary">{session.user.school.name}</span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Globe aria-hidden="true" className="size-3" /> <bdi dir="ltr" className="tabular-nums">{session.ipAddress || "—"}</bdi>
                          </span>
                          <span>
                            {device.browser} / {device.os}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
                      <p className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-ink-subtle">
                        <Clock aria-hidden="true" className="size-3" /> {formatDate(session.loginAt)}
                      </p>
                      {isLive && (
                        <Button variant="outline" size="sm"
                          type="button"
                          onClick={() => setConfirmSession(session)}
                          loading={terminatingId === session.id}
                        >
                          {terminatingId === session.id ? null : <LogOut aria-hidden="true" />}
                          End session
                        </Button>
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
      </section>

      <ConfirmAction
        open={Boolean(confirmSession)}
        tone="warning"
        title="End this session?"
        description={confirmSession && confirmDevice
          ? `${confirmSession.user.fullName} is signed out of ${confirmDevice.browser} on ${confirmDevice.os} and will need to sign in again there.`
          : ""}
        confirmLabel="End session"
        busy={Boolean(confirmSession && terminatingId === confirmSession.id)}
        onCancel={() => setConfirmSession(null)}
        onConfirm={async () => {
          if (!confirmSession) return;
          await terminateSession(confirmSession.id);
          setConfirmSession(null);
        }}
      />
    </div>
  );
}

const PLAN_PROGRESS: Record<string, ProgressTone> = { FREE: "neutral", STARTER: "brand", BASIC: "brand", PRO: "brand", ENTERPRISE: "brand" };
const STATUS_PROGRESS: Record<string, ProgressTone> = { ACTIVE: "success", TRIAL: "brand", SUSPENDED: "danger" };

/** A count per key with its share of all schools, drawn as labelled bars. */
function DistributionPanel({ title, counts, total, renderBadge, label, tone, emptyTitle }: {
  title: string;
  counts: Record<string, number>;
  total: number;
  renderBadge: (key: string) => ReactNode;
  label: (key: string) => string;
  tone: (key: string) => ProgressTone;
  emptyTitle: string;
}) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return (
    <section className="sk-panel p-5 sm:p-6">
      <h3 className="text-base font-bold text-ink-strong">{title}</h3>
      {entries.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {entries.map(([key, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <li key={key}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  {renderBadge(key)}
                  <span className="text-sm font-bold tabular-nums text-ink-strong">{count}</span>
                </div>
                <Progress value={pct} label={`${label(key)}: ${pct}% of schools`} tone={tone(key)} size="sm" />
                <p className="mt-1 text-xs tabular-nums text-ink-subtle">{pct}% of schools</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" icon={PieChart} title={emptyTitle} description="This fills in once schools are registered." />
      )}
    </section>
  );
}

function BillingView({ stats, onRetry }: { stats: Stats | null; onRetry?: () => void }) {
  return (
    <div className={VIEW_BODY}>
      <ViewHeader title="Billing & plans" description="Revenue overview and plan distribution" />

      {stats ? (
        <>
          <div className="sk-stagger mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={Banknote}
              label="Total revenue"
              value={`PKR ${((stats.totalRevenue || 0) / 100).toLocaleString("en-PK")}`}
              sub={`${stats.totalPaymentCount} successful payments`}
              tone="dark"
            />
            <StatCard
              icon={Clock}
              label="Pending invoices"
              value={stats.pendingInvoices}
              sub="Awaiting payment"
              tone="rose"
            />
            <StatCard
              icon={CreditCard}
              label="Active schools"
              value={stats.schoolsByStatus?.ACTIVE || 0}
              sub={`Out of ${stats.schoolCount} total`}
              tone="green"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DistributionPanel
              title="Schools by plan"
              counts={stats.schoolsByPlan}
              total={stats.schoolCount}
              renderBadge={(plan) => <PlanBadge plan={plan} size="default" />}
              label={planLabel}
              tone={(plan) => PLAN_PROGRESS[plan] ?? "neutral"}
              emptyTitle="No plan data yet"
            />
            <DistributionPanel
              title="Schools by status"
              counts={stats.schoolsByStatus}
              total={stats.schoolCount}
              renderBadge={(status) => <StatusPill status={status} />}
              label={sentenceCase}
              tone={(status) => STATUS_PROGRESS[status] ?? "neutral"}
              emptyTitle="No status data yet"
            />
          </div>
        </>
      ) : (
        <div className="sk-panel">
          <ErrorState
            title="Billing figures did not load"
            description="We couldn't load the platform statistics. Check your connection and try again."
            onRetry={onRetry}
          />
        </div>
      )}
    </div>
  );
}

/** One plan's monthly price in PKR. Blank keeps the meaning the section describes. */
function PlanPriceField({ scope, plan, value, placeholder, onChange }: {
  scope: string;
  plan: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField name={`${scope}-${plan}`} label={planLabel(plan)} className="min-w-0">
      <InputGroup surfaceClassName="bg-white" className="w-full">
        <span data-field-affix="start" className="text-xs font-semibold text-ink-subtle">PKR</span>
        <SystemInput
          type="number"
          min="0"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={"w-full tabular-nums"}
        />
      </InputGroup>
    </FormField>
  );
}

function PricingView({ stats }: { stats: Stats | null }) {
  const [pricingSchoolId, setPricingSchoolId] = useState("");
  const [pricingValues, setPricingValues] = useState<Record<string, { price: string }>>({
    FREE: { price: "0" },
    BASIC: { price: "4000" },
    PRO: { price: "7000" },
    ENTERPRISE: { price: "" },
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMessage, setPricingMessage] = useState("");
  const [loadingPricing, setLoadingPricing] = useState(false);

  const [defaultPricing, setDefaultPricing] = useState<Record<string, { price: string }>>({
    FREE: { price: "0" },
    BASIC: { price: "4000" },
    PRO: { price: "7000" },
    ENTERPRISE: { price: "" },
  });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsFailed, setDefaultsFailed] = useState(false);

  const loadDefaultPricing = async () => {
    setDefaultsFailed(false);
    try {
      const res = await fetch("/api/owner/platform-config");
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data as Record<string, { price?: number | null }>;
        setDefaultPricing({
          FREE: { price: String(d.FREE?.price ?? 0) },
          BASIC: { price: String(d.BASIC?.price ?? 4000) },
          PRO: { price: String(d.PRO?.price ?? 7000) },
          ENTERPRISE: { price: d.ENTERPRISE?.price != null ? String(d.ENTERPRISE.price) : "" },
        });
      } else {
        setDefaultsFailed(true);
      }
    } catch {
      // The form keeps its built-in values; the notice below says so.
      setDefaultsFailed(true);
    }
  };

  const saveDefaultPricing = async () => {
    setSavingDefaults(true);
    try {
      const pricing: Record<string, { price?: number | null }> = {};
      for (const [plan, vals] of Object.entries(defaultPricing)) {
        const num = vals.price === "" ? null : Number(vals.price);
        if (num !== null && (isNaN(num) || num < 0)) {
          toast.error(`Enter a price of 0 or more for ${planLabel(plan)}.`);
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
      setDefaultsFailed(false);
    } catch (err: any) {
      console.error("[pricing] save error", err);
      toast.error(err?.message || String(err));
    } finally {
      setSavingDefaults(false);
    }
  };

  useEffect(() => { loadDefaultPricing(); }, []);

  const loadPricing = async (schoolId: string) => {
    setLoadingPricing(true);
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`);
      const json = await res.json();
      if (json.data?.planPricing) {
        const p = json.data.planPricing as Record<string, { price?: number }>;
        setPricingValues({
          FREE: { price: String(p.FREE?.price ?? 0) },
          BASIC: { price: String(p.BASIC?.price ?? 4000) },
          PRO: { price: String(p.PRO?.price ?? 7000) },
          ENTERPRISE: { price: p.ENTERPRISE?.price != null ? String(p.ENTERPRISE.price) : "" },
        });
      } else {
        setPricingValues({
          FREE: { price: "0" },
          BASIC: { price: "4000" },
          PRO: { price: "7000" },
          ENTERPRISE: { price: "" },
        });
      }
      setPricingMessage("");
    } catch {
      toast.error("Could not load this school's prices. Choose the school again to retry.");
    } finally {
      setLoadingPricing(false);
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
          toast.error(`Enter a price of 0 or more for ${planLabel(plan)}.`);
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
    <div className={VIEW_BODY}>
      <ViewHeader title="Plan pricing" description="Set global defaults and per-school overrides. All prices are monthly, in PKR." />

      <section aria-labelledby="pricing-defaults-heading" className="sk-panel mb-6 p-4 sm:mb-8 sm:p-6">
        <PanelHeading
          id="pricing-defaults-heading"
          icon={Globe}
          title="Default plan prices"
          description="Set global default prices for all plans. These apply to every school unless overridden per school below. Existing schools will see a notice about new rates from their next billing cycle."
        />
        {defaultsFailed ? (
          <Alert
            tone="warning"
            className="mb-5"
            title="The saved default prices did not load"
            actions={<Button variant="outline" size="sm" type="button" onClick={() => loadDefaultPricing()}><RefreshCw aria-hidden="true" />Try again</Button>}
          >
            The fields show the built-in prices, not what is saved. Check them before you save.
          </Alert>
        ) : null}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(defaultPricing).map(([plan, vals]) => (
            <PlanPriceField
              key={plan}
              scope="default-price"
              plan={plan}
              value={vals.price}
              placeholder="Not set"
              onChange={(value) => setDefaultPricing(prev => ({ ...prev, [plan]: { price: value } }))}
            />
          ))}
        </div>
        <Button variant="dark"
          type="button"
          onClick={saveDefaultPricing}
          loading={savingDefaults}
        >
          {savingDefaults ? null : <Save aria-hidden="true" />}
          Save default prices
        </Button>
      </section>

      <section aria-labelledby="pricing-override-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="pricing-override-heading"
          icon={DollarSign}
          title="Plan pricing override"
          description="Set custom plan prices per school. Leave blank to use defaults."
        />
        <FormField
          name="pricing-school"
          label="School"
          className="mb-5 max-w-md"
          hint={stats ? "Choose a school to see and change its prices." : "The school list is unavailable until the platform statistics load."}
        >
          <SystemSelect
            value={pricingSchoolId}
            onChange={(e) => {
              setPricingSchoolId(e.target.value);
              if (e.target.value) loadPricing(e.target.value);
              setPricingMessage("");
            }}
            className={"w-full"}
          >
            <option value="">Select a school...</option>
            {stats?.schools?.map((s: { id: string; name: string }) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SystemSelect>
        </FormField>
        {pricingSchoolId && (
          loadingPricing ? (
            <SkeletonList rows={2} label="Loading this school's prices" />
          ) : (
            <div className="sk-fade-in space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(pricingValues).map(([plan, vals]) => (
                  <PlanPriceField
                    key={plan}
                    scope="school-price"
                    plan={plan}
                    value={vals.price}
                    placeholder="Use default"
                    onChange={(value) => setPricingValues(prev => ({ ...prev, [plan]: { price: value } }))}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button variant="default"
                  type="button"
                  onClick={savePricing}
                  loading={savingPricing}
                  className="sm:shrink-0"
                >
                  {savingPricing ? null : <Save aria-hidden="true" />}
                  Save pricing
                </Button>
                {pricingMessage && (
                  <Alert tone="success" compact className="sm:w-auto sm:flex-1">{pricingMessage}</Alert>
                )}
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function PaymentSettingsView() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
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
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const retryLoad = () => { setLoading(true); setLoadFailed(false); loadSettings(); };

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
      <div className={VIEW_BODY}>
        <SkeletonCards count={4} label="Loading billing" />
      </div>
    );
  }

  if (loadFailed && !settings) {
    return (
      <div className={VIEW_BODY}>
        <ViewHeader title="Payment settings" description="Configure how you receive subscription payments from schools" />
        <div className="sk-panel">
          <ErrorState
            title="Payment settings did not load"
            description="We couldn't load your payout settings. Check your connection and try again."
            onRetry={retryLoad}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={VIEW_BODY}>
      <ViewHeader title="Payment settings" description="Configure how you receive subscription payments from schools" />

      <section aria-labelledby="payments-stripe-heading" className="sk-panel mb-6 p-4 sm:mb-8 sm:p-6">
        <PanelHeading
          id="payments-stripe-heading"
          icon={WalletCards}
          title="Stripe Connect"
          description="Connect your Stripe account to receive subscription payments directly. When a school upgrades, funds are transferred to your connected account automatically."
        />

        {settings?.connectedAccountId ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={settings.onboardingComplete ? "success" : "warning"} dot>
                {settings.onboardingComplete ? "Active" : "Incomplete"}
              </Badge>
              <span className="min-w-0 text-xs text-ink-subtle">
                Account: <bdi dir="ltr" className="break-all font-mono">{settings.connectedAccountId}</bdi>
              </span>
            </div>
            {!settings.onboardingComplete && (
              <Button variant="default"
                type="button"
                onClick={startConnectOnboarding}
                loading={connectLoading}
              >
                {connectLoading ? null : <ExternalLink aria-hidden="true" />}
                Complete onboarding
              </Button>
            )}
            {settings.onboardingComplete && (
              <Alert tone="success" live="off" title="Stripe account connected">
                Subscription payments will be transferred to your Stripe account automatically.
              </Alert>
            )}
          </div>
        ) : (
          <Button variant="default"
            type="button"
            onClick={startConnectOnboarding}
            loading={connectLoading}
          >
            {connectLoading ? null : <ExternalLink aria-hidden="true" />}
            Connect Stripe account
          </Button>
        )}
      </section>

      <section aria-labelledby="payments-bank-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="payments-bank-heading"
          icon={Building2}
          title="Bank account (fallback)"
          description="Optional: Provide bank account details as a fallback payment method. Schools will see these for manual transfers."
        />
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField name="bank-name" label="Bank name">
            <SystemInput
              value={bankForm.bankName}
              onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))}
              placeholder="e.g. HBL, Meezan Bank"
              className={"w-full"}
            />
          </FormField>
          <FormField name="bank-account-title" label="Account title" hint="The name on the account, as schools will see it when they transfer.">
            <SystemInput
              value={bankForm.accountTitle}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountTitle: e.target.value }))}
              placeholder="Full name or business name"
              className={"w-full"}
            />
          </FormField>
          <FormField name="bank-account-number" label="Account number">
            <SystemInput
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              placeholder="IBAN or account number"
              className={"w-full tabular-nums"}
              dir="ltr"
            />
          </FormField>
          <FormField name="bank-iban" label="IBAN" optional>
            <SystemInput
              value={bankForm.iban}
              onChange={(e) => setBankForm(prev => ({ ...prev, iban: e.target.value }))}
              placeholder="PK...XXXX"
              className={"w-full tabular-nums"}
              dir="ltr"
            />
          </FormField>
        </div>
        <Button variant="dark"
          type="button"
          onClick={saveBankDetails}
          loading={saving}
        >
          {saving ? null : <Save aria-hidden="true" />}
          Save bank details
        </Button>
      </section>
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
  const [tab, setTab] = useState<"overview" | "campuses" | "subscription">("overview");
  // A plan change rewrites the school's limits and AI allowance, so it is confirmed first.
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);

  const confirmPlanChange = async () => {
    if (!pendingPlan) return;
    setChangingPlan(true);
    try {
      await onPlanChange(school.id, pendingPlan);
    } finally {
      setChangingPlan(false);
      setPendingPlan(null);
    }
  };

  const creditRatio = school.aiCreditsLimit > 0 ? school.aiCreditsUsed / school.aiCreditsLimit : 0;
  const creditTone: ProgressTone = creditRatio > 0.8 ? "danger" : creditRatio > 0.5 ? "warning" : "success";

  return (
    <Modal
      title={school.name}
      eyebrow="School"
      subtitle={
        <>
          <bdi dir="ltr">{school.contactEmail || "—"}</bdi> · {school.city || "—"}
          {school.phone ? <> · <bdi dir="ltr">{school.phone}</bdi></> : ""}
          {school.website ? <span className="block"><bdi dir="ltr">{school.website}</bdi></span> : null}
          {school.establishedYear ? <span className="block">Est. {school.establishedYear}</span> : null}
        </>
      }
      chips={
        <>
          <StatusPill status={school.status} />
          {school.tagline ? (
            <span className="text-xs italic text-ink-muted">&ldquo;{school.tagline}&rdquo;</span>
          ) : null}
        </>
      }
      avatar={
        school.logoUrl ? (
          <img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
            <School aria-hidden="true" className="h-5 w-5" />
          </span>
        )
      }
      size="md"
      onClose={onClose}
      bodyClassName="px-0 py-0 sm:px-0"
    >
        <div className="flex flex-wrap gap-2 border-b border-border-subtle px-5 py-3 sm:px-7">
          <Button aria-pressed={tab === "overview"} variant="choice" size="sm" type="button" onClick={() => setTab("overview")}>Overview</Button>
          <Button aria-pressed={tab === "campuses"} variant="choice" size="sm" type="button" onClick={() => setTab("campuses")}>Campuses</Button>
          <Button aria-pressed={tab === "subscription"} variant="choice" size="sm" type="button" onClick={() => setTab("subscription")}>Subscription</Button>
        </div>

        <div className="p-5 sm:p-7">
          {tab === "overview" && (
            <div className="sk-fade-in space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniStat label="Campuses" value={school.campusCount} />
                <MiniStat label="Students" value={school.totalStudents} />
                <MiniStat label="Staff" value={school.totalStaff} />
                <MiniStat label="Classes" value={school.totalClasses} />
              </div>
              <div className="rounded-2xl border border-border-subtle bg-gradient-to-br from-brand-50/60 to-white p-5 rtl:bg-gradient-to-bl">
                <div className="mb-3 flex items-center gap-1">
                  <p className="sk-eyebrow text-primary">AI credits</p>
                  <InfoTip content={AI_CREDITS_HELP} label="About AI credits" />
                </div>
                <div className="flex items-center gap-4">
                  <Zap aria-hidden="true" className="size-8 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold tabular-nums text-ink-strong">{school.aiCreditsUsed} / {school.aiCreditsLimit < 0 ? "Unlimited" : school.aiCreditsLimit}</span>
                      <span className={cn("text-xs font-semibold tabular-nums", school.aiCreditsLimit > 0 && creditRatio > 0.8 ? "text-rose-700" : "text-emerald-700")}>
                        {school.aiCreditsLimit > 0 ? `${Math.round(creditRatio * 100)}% used` : "—"}
                      </span>
                    </div>
                    {school.aiCreditsLimit > 0 && (
                      <Progress value={school.aiCreditsUsed} max={school.aiCreditsLimit} label="AI credits used" tone={creditTone} size="sm" />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <div>
                  <p className="text-xs font-medium text-ink-subtle">Plan</p>
                  <p className="mt-0.5 text-sm font-bold text-ink-strong">{planLabel(school.plan)}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs font-medium text-ink-subtle">Since</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-ink-strong">{new Date(school.createdAt).toLocaleDateString("en-PK", { month: "short", year: "numeric" })}</p>
                </div>
              </div>
              <Alert
                tone="info"
                live="off"
                icon={CreditCard}
                title="Manage plan"
                actions={<Button variant="outline" size="sm" type="button" onClick={() => setTab("subscription")}>Open subscription</Button>}
              >
                Use the Subscription tab to move this school to another plan.
              </Alert>
            </div>
          )}

          {tab === "campuses" && (
            <div className="sk-fade-in">
              {school.campuses.length > 0 ? (
                <div className="sk-stagger space-y-3">
                  {school.campuses.map((campus) => <CampusCard key={campus.id} campus={campus} />)}
                </div>
              ) : (
                <EmptyState size="sm" icon={Building2} title="No campuses yet" description="This school has not added a campus." />
              )}
            </div>
          )}

          {tab === "subscription" && (
            <div className="sk-fade-in space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink-strong">Choose a plan for {school.name}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">You confirm the change before it is applied.</p>
              </div>
              <div className="grid gap-3">
                {PLAN_CHOICES.map((plan) => {
                  const isCurrent = school.plan === plan;
                  const dotStyles: Record<string, string> = {
                    FREE: "bg-ink-faint",
                    BASIC: "bg-sky-500",
                    PRO: "bg-primary",
                    ENTERPRISE: "bg-ink-strong",
                  };
                  return (
                    <Button aria-pressed={isCurrent} variant="choice"
                      key={plan}
                      type="button"
                      onClick={() => setPendingPlan(plan)}
                      disabled={isCurrent}
                      className="relative h-auto justify-between gap-3 p-4 text-start font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", dotStyles[plan], isCurrent && "ring-2 ring-primary/30 ring-offset-2")} />
                        <span className="min-w-0">
                          <span className={cn("block text-sm font-bold", isCurrent ? "text-primary" : "text-ink-strong")}>{planLabel(plan)}</span>
                          <span className="mt-0.5 block text-xs text-ink-muted">{planSummary(plan)}</span>
                        </span>
                      </span>
                      {isCurrent && (
                        <Badge variant="secondary" size="sm">Current</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <ConfirmAction
          open={Boolean(pendingPlan)}
          tone="warning"
          title={pendingPlan ? `Move ${school.name} to ${planLabel(pendingPlan)}?` : ""}
          description="The plan, its limits and the monthly AI credit allowance change straight away. The change is recorded in the audit log."
          detail={pendingPlan ? <><span className="font-semibold">{planLabel(school.plan)}</span> <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span> <span className="font-semibold">{planLabel(pendingPlan)}</span>: {planSummary(pendingPlan)}</> : null}
          confirmLabel="Change plan"
          busy={changingPlan}
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => void confirmPlanChange()}
        />
    </Modal>
  );
}

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
  const mismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;

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
      setError(friendlyErrorMessage(err, "Could not change the password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Change password"
      eyebrow="Security action"
      icon={KeyRound}
      tone="amber"
      size="xs"
      onClose={onClose}
      dirty={Boolean(newPassword) && !loading}
      dirtyMessage="The new password has not been set yet. Leave without applying it?"
      footer={
        <div className="flex gap-3">
          <Button variant="outline"
            type="button"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button variant="dark"
            type="button"
            onClick={handleSubmit}
            loading={loading}
            disabled={!newPassword || newPassword !== confirmPassword}
            className="flex-[2]"
          >
            {loading ? null : <KeyRound aria-hidden="true" />}
            Change password
          </Button>
        </div>
      }
    >

        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
          <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-xs">
            <User className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-strong">{user.fullName}</p>
            <p className="truncate text-xs text-ink-subtle"><bdi dir="ltr">{user.email}</bdi></p>
            {user.school && <p className="mt-0.5 truncate text-xs text-primary">{user.school.name}</p>}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div>
            <FormField
              name="owner-new-password"
              id="owner-new-password"
              label="New password"
              required
              hint="At least 8 characters. Length, a mix of upper and lower case, numbers and symbols make it stronger."
            >
              <InputGroup surfaceClassName="bg-brand-50/50" className="relative">
                <SystemInput id="owner-new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className={"w-full"}
                />
                <FieldAction data-field-affix="end"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="w-4 h-4" /> : <Eye aria-hidden="true" className="w-4 h-4" />}
                </FieldAction>
              </InputGroup>
            </FormField>
            {newPassword && (
              <Progress
                className="mt-3"
                size="sm"
                value={strength.level}
                max={4}
                label="Password strength"
                valueText={strength.label}
                showValue
                tone={strength.level <= 1 ? "danger" : strength.level <= 2 ? "warning" : "success"}
              />
            )}
          </div>
          <FormField
            name="owner-confirm-password"
            id="owner-confirm-password"
            label="Confirm password"
            required
            error={mismatch ? "Passwords do not match" : undefined}
          >
            <SystemInput id="owner-confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter the new password"
              autoComplete="new-password"
              className={"w-full"}
            />
          </FormField>
        </div>

        <Alert tone="warning" live="off" className="mb-6" title="Security notice">
          This action is logged. The user will need the new password on their next login.
        </Alert>

        {error && (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        )}

    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2 text-center">
      <p className="truncate text-2xs font-medium text-ink-subtle">{label}</p>
      <p className="text-sm font-bold tabular-nums text-ink-strong">{value}</p>
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
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
      <p className="text-xs tabular-nums text-ink-subtle">
        Page {pagination.page} of {pagination.pages} · {pagination.total} {label}
      </p>
      <div className="flex gap-2">
        <IconButton
          label="Previous page"
          variant="outline"
          onClick={() => onPage(pagination.page - 1)}
          disabled={pagination.page <= 1}
        >
          <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
        </IconButton>
        <IconButton
          label="Next page"
          variant="outline"
          onClick={() => onPage(pagination.page + 1)}
          disabled={pagination.page >= pagination.pages}
        >
          <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
        </IconButton>
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
