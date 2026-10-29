"use client";
import { useListField } from "@/hooks/use-list-field";

/**
 * Platform operations (APP_OWNER) — SPEC §3 `owner`, §4.4/§4.4b owner rows, M109–M111.
 *
 * - Navigation comes from the registry (`console="owner"`, `useConsoleView("owner")`): Schools · Tenant users ·
 *   Commercial (Subscription requests, Pricing, Payment gateways, Plans & revenue) · Trust & safety (Support
 *   access, Audit log, Sessions) · Insights (Pilot evidence, Capacity).
 * - The signed-in operator's own name and email come from the session (M110), never a hard-coded identity.
 * - Tenant tuition (families paying their school) is the school's money, not platform revenue (M109): no tile,
 *   chart or total of it appears here.
 * - Every view opens with one PageHeader and at most one primary action; destructive row actions sit behind a
 *   ConfirmAction; a failed load is an inline ErrorState with retry, never a toast (R4).
 */

import { loadOwnerPages } from "@/lib/owner/load-pages";
import { useConsoleView } from "@/components/nav/useConsoleView";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { Menu } from "@/components/ui/menu";
import { useLocale } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { COMMERCIAL_CONTRACT } from "@/config/commercial-contract";
import { roleLabel, type UserRole } from "@/lib/roles";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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

import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Monitor,
  MoreHorizontal,
  Pause,
  PieChart,
  Play,
  RefreshCw,
  Save,
  School,
  Search,
  ShieldCheck,
  Smartphone,
  User,
  UserPlus,
  WalletCards,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast, friendlyErrorMessage } from "@/components/ui/toast";
import { PlatformOverview } from "@/components/insights";
import { AddUserModal, ProvisionSchoolModal, type SchoolProvisionPrefill } from "@/components/owner/provisioning-modals";
import { SkeletonCards, SkeletonList } from "@/components/ui/skeleton";
import { formatPlanLimit, getPlanLimits } from "@/config/plans";
import {
  EmptyState,
  RoleShell,
  StatCard,
  useShellSession,
} from "@/components/role-dashboard";
import { Modal } from "@/components/ui/modal";
import { Input as SystemInput } from "@/components/ui/input";
import { Select as SystemSelect } from "@/components/ui/select";
import { useUiText } from "@/components/locale/LocaleProvider";
import { SubscriptionRequestReview } from "@/components/owner/SubscriptionRequestReview";
import { PilotEvidence } from "@/components/owner/PilotEvidence";
import { PilotReadinessConsole } from "@/components/owner/PilotReadinessConsole";
import { CapacityReport } from "@/components/owner/CapacityReport";

type Tr = ReturnType<typeof useUiText>;

function planLabel(plan: string) {
  return getPlanLimits(plan).name;
}

/** The plan's limits in words, read from the plan catalogue so they cannot drift from it. */
function planSummary(plan: string, t: Tr) {
  const limits = getPlanLimits(plan);
  if (limits.maxStudents < 0 && limits.maxTeachers < 0 && limits.maxCampuses < 0) {
    return t("Unlimited students, teachers and campuses");
  }
  return [
    t("{0} students", [formatPlanLimit(limits.maxStudents)]),
    t("{0} teachers", [formatPlanLimit(limits.maxTeachers)]),
    t("{0} campuses", [formatPlanLimit(limits.maxCampuses)]),
  ].join(" · ");
}

/** Dates and relative times in the operator's language (never a hard-coded `en-PK`, R7). */
function useOwnerDates() {
  const t = useUiText();
  const tag = localeTag(useLocale());
  return useMemo(() => {
    const when = (d: string | null) => d
      ? new Intl.DateTimeFormat(tag, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d))
      : t("Never");
    const month = (d: string) => new Intl.DateTimeFormat(tag, { month: "short", year: "numeric" }).format(new Date(d));
    const ago = (d: string) => {
      const minutes = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
      if (minutes < 1) return t("Just now");
      if (minutes < 60) return t("{0} min ago", [minutes]);
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("{0} h ago", [hours]);
      return when(d);
    };
    const number = (value: number) => new Intl.NumberFormat(tag).format(value);
    // Support access windows carry their time zone: the operator and the school may be in different ones.
    const instant = (d: string) => new Intl.DateTimeFormat(tag, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(d));
    return { when, month, ago, number, instant };
  }, [t, tag]);
}

/** Spreadsheet-safe CSV (cells a spreadsheet would execute are neutralised) downloaded in the browser. */
function downloadCsv(name: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const cell = (value: string | number | null | undefined) => {
    const raw = value == null ? "" : String(value);
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const body = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
  /** Set when an APP_OWNER switched AI Workflows live: AI may save this school's real records (practice.ts). */
  aiWorkflowsLiveAt: string | null;
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
  schoolsByStatus: Record<string, number>;
  schoolsByPlan: Record<string, number>;
  schools: { id: string; name: string }[];
  // Series added for the platform deck. Optional: an older cached response
  // must still render, it just draws empty states for the charts.
  usersByRole?: Record<string, number>;
  signupsByMonth?: { month: string; count: number }[];
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

/** "login_failed" → "Login failed" — only for machine values with no catalogue label. */
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
  const { language } = useLocale();
  return <Badge variant={ROLE_BADGES[role] ?? "neutral"} size="sm">{roleLabel(role as UserRole, language)}</Badge>;
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
  return <Badge variant={style.variant} size={size} className={style.className}><bdi>{planLabel(plan)}</bdi></Badge>;
}

const ACTION_META: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  login: { icon: LogIn, label: "Signed in", tone: "bg-status-success-surface text-status-success-text" },
  login_failed: { icon: AlertCircle, label: "Sign-in failed", tone: "bg-status-error-surface text-status-error-text" },
  logout: { icon: LogOut, label: "Signed out", tone: "bg-surface-subtle text-ink-muted" },
  password_change: { icon: KeyRound, label: "Password changed", tone: "bg-status-warning-surface text-status-warning-text" },
  school_suspended: { icon: Pause, label: "School suspended", tone: "bg-status-error-surface text-status-error-text" },
  school_activated: { icon: Play, label: "School activated", tone: "bg-status-success-surface text-status-success-text" },
  session_terminated: { icon: LogOut, label: "Session ended", tone: "bg-status-warning-surface text-status-warning-text" },
  ai_workflows_live_on: { icon: Zap, label: "AI Workflows turned live", tone: "bg-status-warning-surface text-status-warning-text" },
  ai_workflows_live_off: { icon: ShieldCheck, label: "AI Workflows back in practice mode", tone: "bg-surface-subtle text-ink-muted" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: Activity, label: sentenceCase(action), tone: "bg-surface-subtle text-ink-muted" };
}

function parseBrowser(ua: string | null) {
  if (!ua) return "Unknown";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "Browser";
}

function parseDevice(ua: string | null) {
  if (!ua) return { browser: "Unknown", os: "Unknown", icon: Monitor };
  const browser = parseBrowser(ua);
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Android") ? "Android" : ua.includes("iPhone") ? "iOS" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "Unknown";
  const icon = ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") ? Smartphone : Monitor;
  return { browser, os, icon };
}

const STATUS_BADGES: Record<string, BadgeVariant> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  TRIAL: "secondary",
};
const STATUS_LABELS: Record<string, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", TRIAL: "Trial", DELETED: "Deleted" };

function StatusPill({ status }: { status: string }) {
  const t = useUiText();
  const key = status.toUpperCase();
  return (
    <Badge variant={STATUS_BADGES[key] ?? "neutral"} size="sm" dot>
      {t(STATUS_LABELS[key] ?? sentenceCase(status))}
    </Badge>
  );
}

/* Shared layout for every console view: the scrolling body of the shell's one page card (addendum 2026-10-22). */
const VIEW_BODY = cn("custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY);
const TOOLBAR = "mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center";
const SEARCH_GROUP = "w-full sm:min-w-56 sm:max-w-sm sm:flex-1";
const FILTER_SELECT = "sm:w-48";

/**
 * The owner console's view header: the shared PageHeader (§4.3) — one h1 (the registry label), one sentence,
 * at most one primary action, secondaries that collapse into "More actions". Kept as a thin wrapper so every
 * owner view reads the same.
 */
function ViewHeader({ title, description, primaryAction, secondaryActions, status }: {
  title: string;
  description?: string;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  status?: ReactNode;
}) {
  return <PageHeader title={title} description={description} primaryAction={primaryAction} secondaryActions={secondaryActions} status={status} />;
}

/** A section heading inside a panel, with its icon tile and one line of purpose. */
function PanelHeading({ icon: Icon, title, description, id }: { icon: LucideIcon; title: string; description?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-ink-strong">{title}</h2>
        {description ? <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
    </div>
  );
}

/** Subscription requests waiting for review: the Schools primary action and the sidebar badge (§1.4 counts). */
function usePendingRequests() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/navigation/counts", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (alive) setCount(Number(body?.counts?.approvals ?? 0)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return count;
}

export default function OwnerDashboard() {
  const { view, setView } = useConsoleView("owner");
  // M110: the operator is whoever is signed in — name and avatar come from the session, never a fixed identity.
  const session = useShellSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsFailed, setStatsFailed] = useState(false);

  // A failed load is shown inline by the view that needs the figures (R4) — never a toast.
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/owner/stats", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setStats(json.data);
        setStatsFailed(false);
      } else {
        setStatsFailed(true);
      }
    } catch {
      setStatsFailed(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  return (
    <RoleShell
      console="owner"
      activeView={view}
      onSelectView={setView}
      userName={session?.fullName}
      avatarSeed={session?.fullName}
      dashboardHref="/owner"
      // The platform operator belongs to no school conversation: every /api/chat call would be refused.
      chatDock={false}
    >
      {/* The shell draws the one page card; each view below is its scrolling body (no card-in-card). */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden" data-owner-view={view}>
        <SupportSessionBanner />
        {view === "schools" && (
          <SchoolsView
            stats={stats}
            statsLoading={statsLoading}
            statsFailed={statsFailed}
            onRefreshStats={loadStats}
            onOpenRequests={() => setView("subscription-requests")}
            onOpenUsers={() => setView("users")}
          />
        )}
        {view === "users" && <UsersView />}
        {view === "billing" && <BillingView stats={stats} loading={statsLoading} onRetry={loadStats} />}
        {view === "pricing" && <PricingView stats={stats} />}
        {view === "payments" && <PaymentSettingsView />}
        {view === "audit" && <AuditLogView />}
        {view === "sessions" && <SessionsView />}
        {view === "support" && <SupportAccessView schools={stats?.schools || []} />}
        {view === "subscription-requests" && <SubscriptionRequestReview />}
        {view === "pilots" && <PilotEvidence />}
        {view === "pilot-readiness" && <PilotReadinessConsole />}
        {view === "capacity" && <CapacityReport />}
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
const CHOICE_TILE = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-border-subtle-hover hover:bg-surface-hover has-[:checked]:border-primary/40 has-[:checked]:bg-surface-selected";

function SupportSessionBanner() {
  const t = useUiText();
  const dates = useOwnerDates();
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
      window.dispatchEvent(new Event("skoolee:support-session-change"));
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
        {t("Expires")} <bdi>{dates.instant(session.expiresAt)}</bdi>
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
  const dates = useOwnerDates();
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
  const [actionType, setActionType] = useState("write");
  const [writeField, setWriteField] = useState("phone");
  const [writeValue, setWriteValue] = useState("");
  const [busy, setBusy] = useState(false);
  // Which row action is in flight, so only that button shows progress.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<SupportGrantRow | null>(null);
  const requestFormRef = useRef<HTMLElement>(null);

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
    const refresh = () => { void load(); };
    window.addEventListener("skoolee:support-session-change", refresh);
    return () => window.removeEventListener("skoolee:support-session-change", refresh);
  }, [load]);
  useEffect(() => {
    if (!supportSession) return;
    const poll = window.setInterval(() => {
      void fetch("/api/owner/support/session", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) { void load(); return; }
        const json = await response.json();
        if (!json.success || json.data.id !== supportSession.id) { setSupportSession(null); setPreview(null); }
      }).catch(() => { setSupportSession(null); setPreview(null); });
    }, 10_000);
    return () => window.clearInterval(poll);
  }, [supportSession, load]);

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
    } catch { toast.error(t("Could not request support access")); }
    finally { setBusy(false); }
  };

  const start = (grant: SupportGrantRow) => track(`start:${grant.id}`, t("Could not start support access"), async () => {
    const response = await fetch(`/api/owner/support/grants/${grant.id}/start`, { method: "POST" });
    const json = await response.json();
    if (!response.ok) { toast.error(t("Could not start support access")); return; }
    toast.success(t("Support access started")); await load(); window.dispatchEvent(new Event("skoolee:support-session-change"));
  });
  const stop = (grant: SupportGrantRow) => track(`stop:${grant.id}`, t("Could not revoke support access"), async () => {
    const response = await fetch(`/api/owner/support/grants/${grant.id}`, { method: "DELETE" });
    const json = await response.json();
    if (!response.ok) { toast.error(t("Could not revoke support access")); return; }
    toast.success(t("Support access revoked; queued actions were cancelled")); await load(); window.dispatchEvent(new Event("skoolee:support-session-change"));
  });
  const closeIncident = async (grant: SupportGrantRow) => {
    const evidence = (closureEvidence[grant.id] || "").trim();
    if (evidence.length < 12) return;
    await track(`close:${grant.id}`, t("Could not close support incident"), async () => {
      const response = await fetch(`/api/owner/support/grants/${grant.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed", closureEvidence: evidence }) });
      const json = await response.json();
      if (!response.ok) { toast.error(t("Could not close support incident")); return; }
      toast.success(t("Incident closed with evidence")); await load();
    });
  };
  const inspect = (grant: Pick<SupportGrantRow, "id">, domain: string) => track(`inspect:${grant.id}:${domain}`, t("Support access expired or was revoked"), async () => {
    const response = await fetch(`/api/owner/support/workspace?grantId=${encodeURIComponent(grant.id)}&domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) { toast.error(t("Support access expired or was revoked")); return; }
    setPreview({ id: grant.id, domain, data: json.data });
  });
  const queueAction = async () => {
    if (!supportSession) return;
    const chosenAction = selectedAction;
    if (!chosenAction) return;
    const payload = chosenAction === "write" ? { field: writeField, value: writeValue } : undefined;
    await track("queue", t("Could not queue support action"), async () => {
      const response = await fetch("/api/owner/support/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "school_profile", action: chosenAction, payload }) });
      const json = await response.json();
      if (!response.ok) { toast.error(t("Could not queue support action")); return; }
      toast.success(t("Action queued for scoped support")); setWriteValue(""); await load();
    });
  };
  const executeAction = (id: string, type: string) => track(`execute:${id}`, t("Could not complete support action"), async () => {
    const response = await fetch(`/api/owner/support/actions/${id}/execute`, { method: "POST" });
    if (!response.ok) { toast.error(t("Could not complete support action")); return; }
    if (type === "export") {
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "school-profile.csv"; anchor.click(); URL.revokeObjectURL(url);
    }
    toast.success(type === "export" ? t("Scoped export completed") : t("Scoped change completed")); await load();
  });
  const toggle = (items: string[], setter: (value: string[]) => void, value: string) => setter(items.includes(value) ? items.filter((item) => item !== value) : [...items, value]);
  const domainLabels: Record<string, string> = { school_profile: "School profile", operations: "Operations", users: "Staff directory", finance: "Finance", learning: "Learning records" };
  const selectedAction = supportSession
    ? ((actionType === "write" || actionType === "export") && supportSession.actions.includes(actionType) ? actionType : supportSession.actions.find((item) => item === "write" || item === "export"))
    : undefined;
  const canSubmit = Boolean(schoolId)
    && purpose.trim().length >= 12
    && impact.trim().length >= 8
    && scope.length > 0
    && actions.length > 0
    && Number.isInteger(durationMinutes) && durationMinutes >= 5 && durationMinutes <= (emergency ? 60 : 480)
    && !(emergency && emergencyReason.trim().length < 20);

  // §4.4b: "Request access" is the screen's one primary action; it brings the request form into view.
  const requestAccess = () => {
    requestFormRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    requestFormRef.current?.querySelector<HTMLElement>("select, input, textarea")?.focus({ preventScroll: true });
  };

  return <div className={VIEW_BODY}>
    <div className="space-y-6">
      <ViewHeader
        title="Support access"
        description="Ask a school's admin for temporary access. Everything you view or change is logged."
        secondaryActions={supportSession ? undefined : [{ id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => void load(), loading }]}
      />

      {supportSession ? (
        <section aria-labelledby="support-session-heading" className="sk-enter rounded-2xl border border-status-warning-border bg-status-warning-surface p-4 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="support-session-heading" className="text-base font-bold text-ink-strong">{t("Scoped active session")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink">{supportSession.purpose}</p>
            </div>
            <Badge variant="warning" dot>{t("Active")}</Badge>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t("Expires")}: <bdi className="whitespace-nowrap tabular-nums">{dates.instant(supportSession.expiresAt)}</bdi></p>
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
            <div className="mt-5 rounded-2xl border border-status-warning-border bg-card p-4 shadow-xs sm:p-5">
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
                <li key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-warning-border bg-card p-3 text-sm shadow-xs">
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
        <section ref={requestFormRef} aria-labelledby="support-request-heading" className="sk-panel scroll-mt-4 p-4 sm:p-6">
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
            <legend className="text-sm font-semibold text-ink-strong">{t("What you can see")}</legend>
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
          <h2 id="support-grants-heading" className="text-base font-bold text-ink-strong">{t("Incidents and grants")}</h2>
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
                <article key={grant.id} className="rounded-2xl border border-border-subtle bg-card p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-ink-strong">{grant.school.name} · <bdi dir="ltr">{grant.incident.reference}</bdi></p>
                        <Badge variant={GRANT_BADGES[grant.status] ?? "neutral"} size="sm" dot>{t(grant.status)}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{grant.purpose}</p>
                      <p className="mt-2 text-xs text-ink-subtle">{t("Incident owner")}: <bdi dir="ltr">{grant.incident.ownerActorId}</bdi> · {t("Incident status")}: {t(grant.incident.status)}</p>
                      <p className="mt-1 text-xs text-ink-subtle">{t("Expires")}: <bdi className="tabular-nums">{dates.instant(grant.expiresAt)}</bdi></p>
                      <p className="mt-1 text-xs text-ink-subtle">{t("Domains")}: {grant.scope.map((item) => t(domainLabels[item] || item)).join(", ")} · {t("Actions")}: {grant.actions.map((item) => t(item[0].toUpperCase() + item.slice(1))).join(", ")}</p>
                      {grant.incident.closureEvidence && (
                        <Alert tone="success" live="off" compact className="mt-3" title={t("Closure evidence")}>{grant.incident.closureEvidence}</Alert>
                      )}
                      {grant.emergencyReason && (
                        <Alert tone="warning" live="off" compact className="mt-3" title={t("Emergency")}>
                          {grant.emergencyReason}{grant.reviewedAt ? ` · ${t("Reviewed")}` : <> · {t("Review due")}: <bdi>{dates.instant(grant.reviewDueAt || grant.expiresAt)}</bdi></>}
                        </Alert>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      {grant.status === "approved" && (
                        <Button variant="default" size="sm" type="button" loading={isPending(`start:${grant.id}`)} onClick={() => void start(grant)}>{t("Start access")}</Button>
                      )}
                      {grant.status === "active" && (
                        <Button variant="outline" size="sm" type="button" loading={isPending(`stop:${grant.id}`)} onClick={() => setRevoking(grant)}>{t("Revoke now")}</Button>
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
          <pre className="custom-scrollbar mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border-subtle bg-card p-4 font-mono text-xs leading-relaxed text-ink" dir="ltr">{JSON.stringify(preview.data, null, 2)}</pre>
        </section>
      )}
      <p className="text-xs leading-relaxed text-ink-subtle">{t("The school's administrator approves requests in their own console. Support grants never change anyone's role in the school.")}</p>
    </div>
    <ConfirmAction
      open={Boolean(revoking)}
      tone="danger"
      title={t("Revoke support access?")}
      description={t("Support loses access to {0} straight away, and any support actions still queued are cancelled.", [revoking?.school.name ?? ""])}
      confirmLabel={t("Revoke now")}
      cancelLabel={t("Keep editing")}
      busy={Boolean(revoking) && isPending(`stop:${revoking?.id}`)}
      onCancel={() => setRevoking(null)}
      onConfirm={() => { const target = revoking; if (!target) return; void stop(target).finally(() => setRevoking(null)); }}
    />
  </div>;
}

function SchoolsView({ stats, statsLoading, statsFailed = false, onRefreshStats, onOpenRequests, onOpenUsers }: {
  stats: Stats | null;
  statsLoading: boolean;
  /** The platform totals failed to load; the school list can still be used. */
  statsFailed?: boolean;
  onRefreshStats: () => void;
  onOpenRequests: () => void;
  onOpenUsers: () => void;
}) {
  const t = useUiText();
  const dates = useOwnerDates();
  const pendingRequests = usePendingRequests();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useListField<string>("schools.search", "", "schools.page");
  const [statusFilter, setStatusFilter] = useListField<string>("schools.status", "", "schools.page");
  const [planFilter, setPlanFilter] = useListField<string>("schools.plan", "", "schools.page");
  const [showProvisionSchool, setShowProvisionSchool] = useState(false);
  const [preparedSchool, setPreparedSchool] = useState<{ id: string; prefill: SchoolProvisionPrefill } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    const id = params.get("workflowHandoffId");
    if (!id) { setShowProvisionSchool(true); return; }
    let active = true;
    void fetch(`/api/ai-workflows/handoffs/${encodeURIComponent(id)}`, { method: "POST" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.handoff?.targetRoute !== `/owner?view=schools&new=1&workflowHandoffId=${id}`) throw new Error("Prepared request is unavailable");
        if (active) { setPreparedSchool({ id, prefill: body.handoff.prefill }); setShowProvisionSchool(true); }
      }).catch(() => { if (active) toast.error(t("Could not open the prepared school request. Open it again from AI Workflows.")); });
    return () => { active = false; };
  }, [t]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSchool, setDetailSchool] = useState<SchoolRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const [requestedPage, setPage] = useListField<number>("schools.page", 1, "schools.page");
  const loadSchoolsVersion = useRef(0);
  const loadSchools = useCallback(async (page = requestedPage) => {
    const version = ++loadSchoolsVersion.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "25" });
      if (search) qp.set("search", search);
      if (statusFilter) qp.set("status", statusFilter);
      if (planFilter) qp.set("plan", planFilter);

      const res = await fetch(`/api/owner/schools?${qp}`, { cache: "no-store" });
      const json = await res.json();
      if (version !== loadSchoolsVersion.current) return;
      if (json.success) {
        setSchools(json.data);
        setPagination(json.pagination);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (version === loadSchoolsVersion.current) setLoadFailed(true);
    } finally {
      if (version === loadSchoolsVersion.current) setLoading(false);
    }
  }, [search, statusFilter, planFilter, requestedPage]);

  useEffect(() => { void loadSchools(); }, [loadSchools]);

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
      toast.success(t("Plan changed to {0}.", [planLabel(newPlan)]));
      void loadSchools(pagination.page);
      onRefreshStats();
      return true;
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("The plan could not be changed. Please try again.")));
      return false;
    }
  };

  /** Every school matching the current filters, one page of 100 at a time. */
  const exportSchools = async () => {
    setExporting(true);
    try {
      const qp = new URLSearchParams();
      if (search) qp.set("search", search);
      if (statusFilter) qp.set("status", statusFilter);
      if (planFilter) qp.set("plan", planFilter);
      const rows = await loadOwnerPages<SchoolRow>("/api/owner/schools", qp);
      downloadCsv("schools", ["name", "slug", "plan", "status", "city", "contact_email", "campuses", "students", "staff", "classes", "ai_credits_used", "ai_credits_limit", "created"],
        rows.map((row) => [row.name, row.slug, row.plan, row.status, row.city, row.contactEmail, row.campusCount, row.totalStudents, row.totalStaff, row.totalClasses, row.aiCreditsUsed, row.aiCreditsLimit, row.createdAt.slice(0, 10)]));
      toast.success(t("Export downloaded."));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The export could not be prepared. Try again.")));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Schools"
        description="Every school on the platform, with its plan, status and size."
        primaryAction={{ id: "provision", label: "Provision a school", icon: Building2, onClick: () => { setPreparedSchool(null); setShowProvisionSchool(true); } }}
        secondaryActions={[...(pendingRequests > 0 ? [{ id: "review-requests", label: t("Review requests ({0})", [dates.number(pendingRequests)]), icon: CreditCard, onClick: onOpenRequests }] : []), { id: "export", label: "Export", icon: Download, onClick: () => void exportSchools(), loading: exporting, disabled: loading || pagination.total === 0 }]}
      />

      {stats ? (
        <PlatformOverview stats={stats} onOpenUsers={onOpenUsers} />
      ) : statsLoading ? (
        <SkeletonCards count={4} label={t("Loading platform totals")} />
      ) : statsFailed ? (
        <Alert
          tone="warning"
          title={t("Platform totals are unavailable")}
          actions={<Button variant="outline" size="sm" type="button" onClick={onRefreshStats}><RefreshCw aria-hidden="true" />{t("Try again")}</Button>}
        >
          {t("The school list below still works. Totals and charts appear once the statistics load.")}
        </Alert>
      ) : null}

      <section aria-labelledby="owner-schools-heading" className="sk-panel p-4 sm:p-6" data-tour="owner.schools.table">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="owner-schools-heading" className="text-lg font-bold text-ink-strong">{t("All schools")}</h2>
          {!loading && !loadFailed ? (
            <p className="text-xs tabular-nums text-ink-subtle">{t(pagination.total === 1 ? "{0} school" : "{0} schools", [dates.number(pagination.total)])}</p>
          ) : null}
        </div>
        <div className={TOOLBAR}>
          <InputGroup surfaceClassName="bg-muted" className={SEARCH_GROUP}>
            <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
            <SystemInput
              type="text"
              placeholder={t("Search schools by name, email or address")}
              aria-label={t("Search schools")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={"w-full"}
            />
          </InputGroup>
          <SystemSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t("Filter by status")}
            className={FILTER_SELECT}
          >
            <option value="">{t("All statuses")}</option>
            <option value="ACTIVE">{t("Active")}</option>
            <option value="SUSPENDED">{t("Suspended")}</option>
            <option value="TRIAL">{t("Trial")}</option>
          </SystemSelect>
          <SystemSelect
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label={t("Filter by plan")}
            className={FILTER_SELECT}
          >
            <option value="">{t("All plans")}</option>
            {PLAN_CHOICES.map((plan) => <option key={plan} value={plan}>{planLabel(plan)}</option>)}
          </SystemSelect>
          {hasFilters ? (
            <Button variant="ghost" size="sm" type="button" onClick={clearFilters} className="self-start sm:self-auto">
              <X aria-hidden="true" />
              {t("Clear filters")}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <SkeletonList rows={4} label={t("Loading schools")} />
        ) : loadFailed ? (
          <ErrorState
            title={t("Schools did not load")}
            description={t("We couldn't load the school list. Check your connection and try again.")}
            onRetry={() => void loadSchools(pagination.page)}
          />
        ) : schools.length === 0 ? (
          <EmptyState
            icon={School}
            title={t("No schools found")}
            description={hasFilters ? t("No schools match these filters. Try a different search or clear the filters.") : t("Schools appear here as soon as they register.")}
            action={hasFilters ? <Button variant="outline" type="button" onClick={clearFilters}>{t("Clear filters")}</Button> : undefined}
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
                            <img src={school.logoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <School aria-hidden="true" className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-base font-bold text-ink-strong"><bdi>{school.name}</bdi></h3>
                            <PlanBadge plan={school.plan} />
                            {school.status !== "ACTIVE" ? <StatusPill status={school.status} /> : null}
                            {school.aiWorkflowsLiveAt ? <Badge variant="warning" size="sm"><Zap aria-hidden="true" className="size-3" />{t("AI live")}</Badge> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                            <span className="min-w-0 max-w-full truncate"><bdi dir="ltr">{school.contactEmail || "—"}</bdi></span>
                            <span><bdi>{school.city || "—"}</bdi></span>
                            <span>{t("Since {0}", [dates.month(school.createdAt)])}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-4">
                          <div className="hidden gap-2 md:flex">
                            <MiniStat label={t("Campuses")} value={school.campusCount} />
                            <MiniStat label={t("Students")} value={school.totalStudents} />
                            <MiniStat label={t("Staff")} value={school.totalStaff} />
                            <MiniStat label={t("Classes")} value={school.totalClasses} />
                          </div>
                          <ChevronRight aria-hidden="true" className={cn("size-4 text-ink-subtle transition-transform duration-200", isExpanded ? "rotate-90" : "rtl:rotate-180")} />
                        </div>
                      </div>
                    </Button>

                    {isExpanded && (
                      <div className="sk-fade-in border-t border-border-subtle bg-surface-subtle/60 p-4 sm:p-5">
                        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:hidden">
                          <MiniStat label={t("Campuses")} value={school.campusCount} />
                          <MiniStat label={t("Students")} value={school.totalStudents} />
                          <MiniStat label={t("Staff")} value={school.totalStaff} />
                          <MiniStat label={t("Classes")} value={school.totalClasses} />
                        </div>

                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="sk-eyebrow text-primary">{t("Campus breakdown")}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <Zap aria-hidden="true" className="size-3.5 text-status-warning-text" />
                              {t("AI credits")}:{" "}
                              <span className="font-semibold tabular-nums text-ink-strong">
                                <bdi>{dates.number(school.aiCreditsUsed)} / {school.aiCreditsLimit < 0 ? t("Unlimited") : dates.number(school.aiCreditsLimit)}</bdi>
                              </span>
                              <InfoTip content={t(AI_CREDITS_HELP)} label={t("About AI credits")} />
                            </span>
                            <Button variant="outline" size="sm"
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDetailSchool(school); }}
                            >
                              <Eye aria-hidden="true" />
                              {t("Details")}
                            </Button>
                          </div>
                        </div>

                        {school.campuses.length > 0 ? (
                          <div className="sk-stagger grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {school.campuses.map((campus) => <CampusCard key={campus.id} campus={campus} />)}
                          </div>
                        ) : (
                          <EmptyState size="sm" icon={Building2} title={t("No campuses yet")} description={t("This school has not added a campus.")} />
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
                onPage={setPage}
              />
            )}
          </>
        )}
      </section>

      {showProvisionSchool && <ProvisionSchoolModal prefill={preparedSchool?.prefill} workflowHandoffId={preparedSchool?.id} onClose={() => setShowProvisionSchool(false)} onCreated={() => { void loadSchools(); onRefreshStats(); }} />}

      {detailSchool && (
        <SchoolDetailModal
          school={detailSchool}
          onStatusChange={() => { setDetailSchool(null); void loadSchools(pagination.page); onRefreshStats(); }}
          onClose={() => setDetailSchool(null)}
          onPlanChange={async (schoolId, newPlan) => {
            const ok = await changeSchoolPlan(schoolId, newPlan);
            if (ok) setDetailSchool(null);
          }}
          onAiWorkflowsLiveChange={(schoolId, aiWorkflowsLiveAt) => {
            setSchools((rows) => rows.map((row) => row.id === schoolId ? { ...row, aiWorkflowsLiveAt } : row));
            setDetailSchool((row) => row && row.id === schoolId ? { ...row, aiWorkflowsLiveAt } : row);
          }}
        />
      )}
    </div>
  );
}

type Campus = SchoolRow["campuses"][number];

function CampusCard({ campus }: { campus: Campus }) {
  const t = useUiText();
  const contact = [campus.phone, campus.email].filter(Boolean).join(" · ");
  return (
    <div className="sk-panel min-w-0 p-4">
      <p className="truncate text-sm font-bold text-ink-strong"><bdi>{campus.name}</bdi></p>
      <p className="mt-0.5 text-xs text-ink-subtle"><bdi>{campus.city || "—"}</bdi>{campus.board ? <> · <bdi>{campus.board}</bdi></> : null}</p>
      {campus.principalName ? <p className="mt-0.5 text-xs text-ink-subtle">{t("Principal")}: <bdi>{campus.principalName}</bdi></p> : null}
      {contact ? <p className="mt-0.5 truncate text-xs text-ink-subtle"><bdi dir="ltr">{contact}</bdi></p> : null}
      {campus.website ? <p className="mt-0.5 truncate text-xs text-ink-subtle"><bdi dir="ltr">{campus.website}</bdi></p> : null}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
        <span>{t("{0} students", [campus.students])}</span>
        <span>{t("{0} staff", [campus.staff])}</span>
        <span>{t("{0} classes", [campus.classes])}</span>
      </div>
    </div>
  );
}

function UsersView() {
  const t = useUiText();
  const { language } = useLocale();
  const dates = useOwnerDates();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useListField<string>("users.search", "", "users.page");
  const [schoolFilter, setSchoolFilter] = useListField<string>("users.school", "", "users.page");
  const [roleFilter, setRoleFilter] = useListField<string>("users.role", "", "users.page");
  const [statusFilter, setStatusFilter] = useListField<string>("users.status", "", "users.page");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [schoolOptions, setSchoolOptions] = useState<
    { id: string; name: string; plan?: string; campuses?: { id: string; name: string }[] }[]
  >([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsFailed, setSchoolsFailed] = useState(false);

  // The Add User modal needs every school with its campuses. Fetched once
  // on demand rather than with the paginated user list.
  const loadSchoolOptions = useCallback(async () => {
    if (schoolOptions.length) return;
    setSchoolsLoading(true);
    setSchoolsFailed(false);
    try {
      const schools = await loadOwnerPages<SchoolRow>("/api/owner/schools");
      setSchoolOptions(schools.map((school) => ({
        id: school.id, name: school.name, plan: school.plan,
        campuses: school.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
      })));
    } catch {
      setSchoolsFailed(true);
    } finally {
      setSchoolsLoading(false);
    }
  }, [schoolOptions.length, t]);

  useEffect(() => { void loadSchoolOptions(); }, [loadSchoolOptions]);

  const filters = useCallback((qp: URLSearchParams) => {
    if (search) qp.set("search", search);
    if (schoolFilter) qp.set("schoolId", schoolFilter);
    if (roleFilter) qp.set("role", roleFilter);
    if (statusFilter) qp.set("status", statusFilter);
    return qp;
  }, [search, roleFilter, statusFilter, schoolFilter]);

  const [requestedPage, setPage] = useListField<number>("users.page", 1, "users.page");
  const loadUsersVersion = useRef(0);
  const loadUsers = useCallback(async (page = requestedPage) => {
    const version = ++loadUsersVersion.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const qp = filters(new URLSearchParams({ page: String(page), limit: "25" }));
      const res = await fetch(`/api/owner/users?${qp}`, { cache: "no-store" });
      const json = await res.json();
      if (version !== loadUsersVersion.current) return;
      if (json.success) {
        setUsers(json.data);
        setPagination(json.pagination);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (version === loadUsersVersion.current) setLoadFailed(true);
    } finally {
      if (version === loadUsersVersion.current) setLoading(false);
    }
  }, [filters, requestedPage]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const hasFilters = Boolean(search || roleFilter || statusFilter || schoolFilter);
  const clearFilters = () => { setSchoolFilter(""); setSearch(""); setRoleFilter(""); setStatusFilter(""); };
  const openAddUser = () => { void loadSchoolOptions(); setShowAddUser(true); };

  const exportUsers = async () => {
    setExporting(true);
    try {
      const rows = await loadOwnerPages<UserRow>("/api/owner/users", filters(new URLSearchParams()));
      downloadCsv("tenant-users", ["name", "email", "role", "school", "campus", "status", "last_sign_in", "created"],
        rows.map((row) => [row.fullName, row.email, row.role, row.school?.name, row.campus?.name, row.isActive ? "active" : "inactive", row.lastLogin?.slice(0, 10) ?? "", row.createdAt.slice(0, 10)]));
      toast.success(t("Export downloaded."));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The export could not be prepared. Try again.")));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Tenant users"
        description={t("{0} accounts across every school. Changing a school's people is the school's own job; use these tools only for support.", [dates.number(pagination.total)])}
        secondaryActions={[
          { id: "export", label: "Export", icon: Download, onClick: () => void exportUsers(), loading: exporting, disabled: loading || pagination.total === 0 },
          { id: "add-user", label: "Add user", icon: UserPlus, onClick: openAddUser, disabled: schoolsLoading || schoolsFailed || !schoolOptions.length },
        ]}
      />

      {schoolsFailed ? <Alert tone="warning" title={t("The school list did not load")} actions={<Button variant="outline" onClick={() => void loadSchoolOptions()}>{t("Try again")}</Button>}>{t("Retry to filter by school or add a user. The account list is still available.")}</Alert> : null}
      {showAddUser && (
        <AddUserModal
          schools={schoolOptions}
          initialSchoolId={schoolFilter}
          onClose={() => setShowAddUser(false)}
          onCreated={() => void loadUsers(pagination.page)}
        />
      )}

      <section className="sk-panel p-4 sm:p-6">
        <div className={TOOLBAR}>
          <InputGroup surfaceClassName="bg-muted" className={SEARCH_GROUP}>
            <Search data-field-affix="start" aria-hidden="true" className="size-4 text-ink-subtle" />
            <SystemInput
              type="text"
              placeholder={t("Search by name, email or phone")}
              aria-label={t("Search users")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={"w-full"}
            />
          </InputGroup>
          <SystemSelect value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} aria-label={t("Filter by school")} className={FILTER_SELECT}>
            <option value="">{t("All schools")}</option>
            {schoolOptions.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
          </SystemSelect>
          <SystemSelect
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label={t("Filter by role")}
            className={FILTER_SELECT}
          >
            <option value="">{t("All roles")}</option>
            {(["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN", "PARENT", "STUDENT"] as const).map((role) => (
              <option key={role} value={role}>{roleLabel(role, language)}</option>
            ))}
          </SystemSelect>
          <SystemSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t("Filter by status")}
            className={FILTER_SELECT}
          >
            <option value="">{t("All statuses")}</option>
            <option value="active">{t("Active")}</option>
            <option value="inactive">{t("Inactive")}</option>
          </SystemSelect>
          {hasFilters ? (
            <Button variant="ghost" size="sm" type="button" onClick={clearFilters} className="self-start sm:self-auto">
              <X aria-hidden="true" />
              {t("Clear filters")}
            </Button>
          ) : null}
        </div>

        {loading ? (
          <SkeletonList rows={5} label={t("Loading users")} />
        ) : loadFailed ? (
          <ErrorState
            title={t("Users did not load")}
            description={t("We couldn't load the user list. Check your connection and try again.")}
            onRetry={() => void loadUsers(pagination.page)}
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("No users found")}
            description={hasFilters ? t("No users match these filters. Try a different search or clear the filters.") : t("Accounts appear here as schools invite their people.")}
            action={hasFilters ? <Button variant="outline" type="button" onClick={clearFilters}>{t("Clear filters")}</Button> : undefined}
          />
        ) : (
          <>
              <div className="grid gap-3 sm:grid-cols-2 xl:hidden" data-owner-user-cards>
                {users.map((u) => <article key={u.id} className="rounded-2xl border border-border-subtle bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-ink-strong"><bdi>{u.fullName}</bdi></p>
                      <p className="mt-1 break-all text-xs text-ink-muted"><bdi dir="ltr">{u.email}</bdi></p>
                    </div>
                    <Menu label="More actions" align="end"
                      trigger={<IconButton label={t("More actions for {0}", [u.fullName])} variant="outline"><MoreHorizontal aria-hidden="true" /></IconButton>}
                      items={[{ id: "reset-password", label: t("Reset password"), icon: KeyRound, onSelect: () => { setSelectedUser(u); setShowPasswordModal(true); } }]} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><RoleBadge role={u.role} /><Badge size="sm" variant={u.isActive ? "success" : "neutral"} dot>{t(u.isActive ? "Active" : "Inactive")}</Badge></div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div><dt className="text-ink-subtle">{t("School")}</dt><dd className="mt-0.5 break-words text-ink"><bdi>{u.school?.name || "—"}</bdi></dd></div>
                    <div><dt className="text-ink-subtle">{t("Campus")}</dt><dd className="mt-0.5 break-words text-ink"><bdi>{u.campus?.name || "—"}</bdi></dd></div>
                    <div><dt className="text-ink-subtle">{t("Last sign-in")}</dt><dd className="mt-0.5 text-ink"><bdi>{dates.when(u.lastLogin)}</bdi></dd></div>
                  </dl>
                </article>)}
              </div>
              <Table containerClassName="hidden xl:block overflow-x-auto custom-scrollbar" className="w-full min-w-[880px] text-start">
                <TableHeader>
                  <TableRow className="text-ink-subtle">
                    <TableHead className="px-4 py-3">{t("User")}</TableHead>
                    <TableHead className="px-4 py-3">{t("Role")}</TableHead>
                    <TableHead className="px-4 py-3">{t("School")}</TableHead>
                    <TableHead className="px-4 py-3">{t("Campus")}</TableHead>
                    <TableHead className="px-4 py-3">{t("Status")}</TableHead>
                    <TableHead className="px-4 py-3">{t("Last sign-in")}</TableHead>
                    <TableHead className="px-4 py-3 text-end"><span className="sr-only">{t("Actions")}</span></TableHead>
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
                            <p className="truncate font-semibold text-ink-strong"><bdi>{u.fullName}</bdi></p>
                            <p className="truncate text-xs text-ink-subtle"><bdi dir="ltr">{u.email}</bdi></p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-xs text-ink">
                        <bdi>{u.school?.name || "—"}</bdi>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-xs text-ink">
                        <bdi>{u.campus?.name || "—"}</bdi>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <Badge variant={u.isActive ? "success" : "neutral"} size="sm" dot>
                          {u.isActive ? t("Active") : t("Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-3.5 text-xs tabular-nums text-ink-muted">
                        <bdi>{dates.when(u.lastLogin)}</bdi>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-end">
                        {/* §4.4b: password reset is a support tool, kept in the row overflow (D10). */}
                        <Menu
                          label="More actions"
                          align="end"
                          trigger={<IconButton label={t("More actions for {0}", [u.fullName])} variant="outline"><MoreHorizontal aria-hidden="true" /></IconButton>}
                          items={[{ id: "reset-password", label: t("Reset password"), icon: KeyRound, description: t("Only when the school's own administrator cannot."), onSelect: () => { setSelectedUser(u); setShowPasswordModal(true); } }]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

            {pagination.pages > 1 && (
              <PaginationBar pagination={pagination} label="users" onPage={setPage} />
            )}
          </>
        )}
      </section>

      {showPasswordModal && selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          apiBase="/api/owner"
          onClose={() => { setShowPasswordModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowPasswordModal(false); setSelectedUser(null); void loadUsers(pagination.page); }}
        />
      )}
    </div>
  );
}

const AUDIT_ACTIONS = ["login", "login_failed", "logout", "password_change", "school_suspended", "school_activated", "session_terminated", "school_provisioned", "user_provisioned", "plan_changed", "plan_pricing_updated", "default_plan_pricing_updated", "payment_bank_details_updated", "delete_school", "ai_workflows_live_on", "ai_workflows_live_off"] as const;

function AuditLogView() {
  const t = useUiText();
  const { language } = useLocale();
  const dates = useOwnerDates();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useListField<number>("audit.page", 1, "audit.page");
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useListField<string>("audit.action", "", "audit.page");
  const [daysFilter, setDaysFilter] = useListField<string>("audit.days", "30", "audit.page");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadLogsVersion = useRef(0);
  const loadLogs = useCallback(async () => {
    const version = ++loadLogsVersion.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "30", days: daysFilter });
      if (actionFilter) qp.set("action", actionFilter);

      const res = await fetch(`/api/owner/audit-logs?${qp}`, { cache: "no-store" });
      const json = await res.json();
      if (version !== loadLogsVersion.current) return;
      if (json.success) {
        setLogs(json.data);
        setTotalPages(json.pagination.pages);
        setTotal(json.pagination.total);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (version === loadLogsVersion.current) setLoadFailed(true);
    } finally {
      if (version === loadLogsVersion.current) setLoading(false);
    }
  }, [actionFilter, daysFilter, page]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const exportLogs = async () => {
    setExporting(true);
    try {
      const qp = new URLSearchParams({ days: daysFilter });
      if (actionFilter) qp.set("action", actionFilter);
      const rows = await loadOwnerPages<AuditEntry>("/api/owner/audit-logs", qp);
      downloadCsv("platform-audit-log", ["time", "action", "status", "actor", "actor_role", "target_type", "target", "ip_address"],
        rows.map((row) => [row.createdAt, row.action, row.status, row.user?.fullName ?? "", row.user?.role ?? "", row.targetType ?? "", row.targetName ?? "", row.ipAddress ?? ""]));
      toast.success(t("Export downloaded."));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The export could not be prepared. Try again.")));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Audit log"
        description={t("{0} platform actions recorded in the selected period: who did what, and when.", [dates.number(total)])}
        secondaryActions={[
          { id: "export", label: "Export", icon: Download, onClick: () => void exportLogs(), loading: exporting, disabled: loading || total === 0 },
          { id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => void loadLogs(), loading },
        ]}
      />

      <section className="sk-panel p-4 sm:p-6">
        <div className={TOOLBAR}>
          <SystemSelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label={t("Filter by action")}
            className={FILTER_SELECT}
          >
            <option value="">{t("All actions")}</option>
            {AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{t(getActionMeta(action).label)}</option>)}
          </SystemSelect>
          <SystemSelect
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            aria-label={t("Time period")}
            className={FILTER_SELECT}
          >
            <option value="7">{t("Last 7 days")}</option>
            <option value="30">{t("Last 30 days")}</option>
            <option value="90">{t("Last 90 days")}</option>
            <option value="365">{t("Last year")}</option>
          </SystemSelect>
        </div>

        {loading ? (
          <SkeletonList rows={5} label={t("Loading audit log")} />
        ) : loadFailed ? (
          <ErrorState
            title={t("The audit log did not load")}
            description={t("We couldn't load these entries. Check your connection and try again.")}
            onRetry={() => void loadLogs()}
          />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("No audit entries")}
            description={actionFilter ? t("No entries match this action in the selected period.") : t("Nothing was recorded in the selected period.")}
            action={daysFilter !== "365" ? <Button variant="outline" type="button" onClick={() => setDaysFilter("365")}>{t("Show the last year")}</Button> : undefined}
            secondaryAction={actionFilter ? <Button variant="ghost" type="button" onClick={() => setActionFilter("")}>{t("Show all actions")}</Button> : undefined}
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
                  className="group block w-full rounded-2xl border border-border-subtle bg-card p-4 text-start font-normal shadow-xs actionable-hover:border-border-subtle-hover actionable-hover:bg-surface-hover actionable-hover:text-ink sm:p-5"
                >
                  <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                    <div aria-hidden="true" className={cn("sk-icon-tile flex size-10 shrink-0 items-center justify-center rounded-xl", meta.tone)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-ink-strong">{t(meta.label)}</p>
                        {log.status === "failed" && (
                          <Badge variant="danger" size="sm">
                            <AlertCircle aria-hidden="true" /> {t("Failed")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          <User aria-hidden="true" className="size-3" /> <bdi>{log.user?.fullName || t("System")}</bdi>
                        </span>
                        {log.user?.role && (
                          <span>{roleLabel(log.user.role as UserRole, language)}</span>
                        )}
                        {log.targetName && (
                          <span className="text-ink-muted">{t("Target")}: <bdi>{log.targetName}</bdi></span>
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
                        <Clock aria-hidden="true" className="size-3" /> <bdi>{dates.ago(log.createdAt)}</bdi>
                      </p>
                      {log.userAgent && (
                        <p className="mt-0.5 text-xs text-ink-subtle"><bdi dir="ltr">{parseBrowser(log.userAgent)}</bdi></p>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="sk-fade-in mt-4 space-y-3 border-t border-border-subtle pt-4">
                      {log.errorMessage && (
                        <Alert tone="danger" live="off" compact title={t("Action failed")}>
                          <span dir="auto">{log.errorMessage}</span>
                        </Alert>
                      )}
                      {log.oldValues && (
                        <div className="rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
                          <p className="sk-eyebrow mb-1">{t("Before")}</p>
                          <pre dir="ltr" className="whitespace-pre-wrap break-all font-mono text-xs text-ink">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newValues && (
                        <div className="rounded-xl border border-status-success-border bg-status-success-surface px-4 py-3">
                          <p className="sk-eyebrow mb-1 text-status-success-text">{t("After")}</p>
                          <pre dir="ltr" className="whitespace-pre-wrap break-all font-mono text-xs text-status-success-text">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
                          <p className="sk-eyebrow mb-1">{t("Browser details")}</p>
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
            onPage={setPage}
          />
        )}
      </section>
    </div>
  );
}

function SessionsView() {
  const t = useUiText();
  const dates = useOwnerDates();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useListField<boolean>("sessions.active", true, "sessions.page");
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [confirmSession, setConfirmSession] = useState<SessionEntry | null>(null);

  const [requestedPage, setPage] = useListField<number>("sessions.page", 1, "sessions.page");
  const loadSessionsVersion = useRef(0);
  const loadSessions = useCallback(async (page = requestedPage) => {
    const version = ++loadSessionsVersion.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: "50" });
      if (showActiveOnly) qp.set("active", "true");

      const res = await fetch(`/api/owner/sessions?${qp}`, { cache: "no-store" });
      const json = await res.json();
      if (version !== loadSessionsVersion.current) return;
      if (json.success) {
        setSessions(json.data);
        setPagination(json.pagination);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (version === loadSessionsVersion.current) setLoadFailed(true);
    } finally {
      if (version === loadSessionsVersion.current) setLoading(false);
    }
  }, [showActiveOnly, requestedPage]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const terminateSession = async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      const res = await fetch("/api/owner/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      toast.success(t("Session ended. The user has been signed out of it."));
      void loadSessions(pagination.page);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("The session could not be ended. Please try again.")));
    } finally {
      setTerminatingId(null);
    }
  };

  const confirmDevice = confirmSession ? parseDevice(confirmSession.userAgent) : null;

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Sessions"
        description={t("{0} sign-in sessions across every school. End one when a device is lost or shared.", [dates.number(pagination.total)])}
        secondaryActions={[{ id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => void loadSessions(1), loading }]}
      />

      <section className="sk-panel p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary">
              <Wifi className="size-5" />
            </span>
            <h2 className="text-lg font-bold text-ink-strong">{t("Sign-in sessions")}</h2>
          </div>
          <div role="group" aria-label={t("Which sessions to show")} className="flex flex-wrap gap-2">
            <Button aria-pressed={showActiveOnly} variant="choice" size="sm" type="button"
              onClick={() => setShowActiveOnly(true)}
            >
              {t("Active only")}
            </Button>
            <Button aria-pressed={!showActiveOnly} variant="choice" size="sm" type="button"
              onClick={() => setShowActiveOnly(false)}
            >
              {t("All sessions")}
            </Button>
          </div>
        </div>

        {loading ? (
          <SkeletonList rows={4} label={t("Loading sessions")} />
        ) : loadFailed ? (
          <ErrorState
            title={t("Sessions did not load")}
            description={t("We couldn't load the session list. Check your connection and try again.")}
            onRetry={() => void loadSessions(pagination.page)}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Lock}
            title={t("No sessions")}
            description={showActiveOnly ? t("Nobody is signed in right now.") : t("No sign-ins have been recorded yet.")}
            action={showActiveOnly ? <Button variant="outline" type="button" onClick={() => setShowActiveOnly(false)}>{t("Show all sessions")}</Button> : undefined}
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
                      ? "border-status-success-border bg-status-success-surface shadow-xs hover:shadow-sm"
                      : "border-border-subtle bg-surface-subtle",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
                      <div aria-hidden="true" className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        isLive ? "bg-card text-status-success-text" : "bg-card text-ink-subtle",
                      )}>
                        <DeviceIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-ink-strong"><bdi>{session.user.fullName}</bdi></p>
                          <Badge variant={isLive ? "success" : "neutral"} size="sm" dot>
                            {isLive ? t("Active") : t("Ended")}
                          </Badge>
                          <RoleBadge role={session.user.role} />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                          <span className="min-w-0 max-w-full truncate"><bdi dir="ltr">{session.user.email}</bdi></span>
                          {session.user.school && (
                            <span className="text-primary"><bdi>{session.user.school.name}</bdi></span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Globe aria-hidden="true" className="size-3" /> <bdi dir="ltr" className="tabular-nums">{session.ipAddress || "—"}</bdi>
                          </span>
                          <span>
                            <bdi dir="ltr">{device.browser} / {device.os}</bdi>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
                      <p className="inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-ink-subtle">
                        <Clock aria-hidden="true" className="size-3" /> <bdi>{dates.when(session.loginAt)}</bdi>
                      </p>
                      {isLive && (
                        <Button variant="outline" size="sm"
                          type="button"
                          onClick={() => setConfirmSession(session)}
                          loading={terminatingId === session.id}
                        >
                          {terminatingId === session.id ? null : <LogOut aria-hidden="true" />}
                          {t("End session")}
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
          <PaginationBar pagination={pagination} label="sessions" onPage={setPage} />
        )}
      </section>

      <ConfirmAction
        open={Boolean(confirmSession)}
        tone="warning"
        title={t("End this session?")}
        description={confirmSession && confirmDevice
          ? t("{0} is signed out of {1} on {2} and will need to sign in again there.", [confirmSession.user.fullName, confirmDevice.browser, confirmDevice.os])
          : ""}
        confirmLabel={t("End session")}
        cancelLabel={t("Keep editing")}
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
  const t = useUiText();
  const dates = useOwnerDates();
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return (
    <section className="sk-panel p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-strong">{t(title)}</h2>
      {entries.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {entries.map(([key, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <li key={key}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  {renderBadge(key)}
                  <span className="text-sm font-bold tabular-nums text-ink-strong"><bdi>{dates.number(count)}</bdi></span>
                </div>
                <Progress value={pct} label={t("{0}: {1}% of schools", [label(key), pct])} tone={tone(key)} size="sm" />
                <p className="mt-1 text-xs tabular-nums text-ink-subtle">{t("{0}% of schools", [pct])}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" icon={PieChart} title={t(emptyTitle)} description={t("This fills in once schools are registered.")} />
      )}
    </section>
  );
}

/**
 * Plans & revenue — the platform's own commercial picture: who is on which plan, who is paying, trialling or
 * paused. Tenant tuition (families paying their school) is never shown here (M109): it is the school's money.
 */
function BillingView({ stats, loading, onRetry }: { stats: Stats | null; loading: boolean; onRetry?: () => void }) {
  const t = useUiText();
  const dates = useOwnerDates();
  const paid = stats ? Object.entries(stats.schoolsByPlan ?? {}).filter(([plan]) => plan !== "FREE").reduce((sum, [, count]) => sum + count, 0) : 0;
  const exportPlans = () => {
    if (!stats) return;
    downloadCsv("plans-and-status",
      ["group", "key", "schools", "share_percent"],
      [
        ...Object.entries(stats.schoolsByPlan ?? {}).map(([plan, count]) => ["plan", plan, count, stats.schoolCount ? Math.round((count / stats.schoolCount) * 100) : 0]),
        ...Object.entries(stats.schoolsByStatus ?? {}).map(([status, count]) => ["status", status, count, stats.schoolCount ? Math.round((count / stats.schoolCount) * 100) : 0]),
      ]);
    toast.success(t("Export downloaded."));
  };
  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Plans & revenue"
        description="Which plan each school is on and where every subscription stands. Family fees belong to each school and are not shown here."
        secondaryActions={[{ id: "export", label: "Export", icon: Download, onClick: exportPlans, disabled: !stats }]}
      />

      {stats ? (
        <>
          <div className="sk-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={School} label={t("Schools")} value={dates.number(stats.schoolCount)} sub={t("{0} campuses", [dates.number(stats.campusCount)])} />
            <StatCard icon={CreditCard} label={t("On a paid plan")} value={dates.number(paid)} sub={t("Out of {0} schools", [dates.number(stats.schoolCount)])} tone="green" />
            <StatCard icon={Clock} label={t("In trial")} value={dates.number(stats.schoolsByStatus?.TRIAL || 0)} sub={t("Choosing a plan")} />
            <StatCard icon={Pause} label={t("Paused")} value={dates.number(stats.schoolsByStatus?.SUSPENDED || 0)} sub={t("Waiting for renewal")} tone="rose" />
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
              label={(status) => t(STATUS_LABELS[status] ?? sentenceCase(status))}
              tone={(status) => STATUS_PROGRESS[status] ?? "neutral"}
              emptyTitle="No status data yet"
            />
          </div>
        </>
      ) : loading ? (
        <SkeletonCards count={4} label={t("Loading plans")} />
      ) : (
        <div className="sk-panel">
          <ErrorState
            title={t("Plan figures did not load")}
            description={t("We couldn't load the platform statistics. Check your connection and try again.")}
            onRetry={onRetry}
          />
        </div>
      )}
    </div>
  );
}

/** One plan's monthly catalogue price, in the platform catalogue currency. Blank keeps the meaning the section describes. */
function PlanPriceField({ scope, plan, value, placeholder, disabled, onChange }: {
  scope: string;
  plan: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField name={`${scope}-${plan}`} label={planLabel(plan)} className="min-w-0">
      <InputGroup surfaceClassName="bg-card" className="w-full">
        <span data-field-affix="start" className="text-xs font-semibold text-ink-subtle"><bdi dir="ltr">{COMMERCIAL_CONTRACT.currency}</bdi></span>
        <SystemInput
          type="number"
          min="0"
          step="any"
          disabled={disabled}
          dir="ltr"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={"w-full tabular-nums"}
        />
      </InputGroup>
    </FormField>
  );
}

const DEFAULT_PRICE_FIELDS = { FREE: { price: "0" }, BASIC: { price: "4000" }, PRO: { price: "7000" }, ENTERPRISE: { price: "" } };
const EMPTY_PRICE_FIELDS = { FREE: { price: "" }, BASIC: { price: "" }, PRO: { price: "" }, ENTERPRISE: { price: "" } };
type SavedPrices = Record<string, { price?: number | null }>;
const priceFields = (prices: SavedPrices | null | undefined) => Object.fromEntries(
  PLAN_CHOICES.map(plan => [plan, { price: prices?.[plan]?.price == null ? "" : String(prices[plan].price) }]),
);

function PricingView({ stats }: { stats: Stats | null }) {
  const t = useUiText();
  const [pricingSchoolId, setPricingSchoolId] = useState("");
  const [pricingValues, setPricingValues] = useState<Record<string, { price: string }>>(EMPTY_PRICE_FIELDS);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingLoadFailed, setPricingLoadFailed] = useState(false);

  const [defaultPricing, setDefaultPricing] = useState<Record<string, { price: string }>>(DEFAULT_PRICE_FIELDS);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsFailed, setDefaultsFailed] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [savedDefaults, setSavedDefaults] = useState<SavedPrices | null>(null);
  const pricingVersion = useRef(0);

  const loadDefaultPricing = async () => {
    setLoadingDefaults(true);
    setDefaultsFailed(false);
    try {
      const res = await fetch("/api/owner/platform-config", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setSavedDefaults(json.data);
        setDefaultPricing(priceFields(json.data));
      } else {
        setDefaultsFailed(true);
      }
    } catch {
      setDefaultsFailed(true);
    } finally {
      setLoadingDefaults(false);
    }
  };

  const saveDefaultPricing = async () => {
    if (loadingDefaults || defaultsFailed || !savedDefaults || savingDefaults) return;
    const pricing: Record<string, { price?: number | null }> = {};
    for (const [plan, vals] of Object.entries(defaultPricing)) {
      const num = vals.price === "" ? null : Number(vals.price);
      if (num !== null && (!Number.isFinite(num) || num < 0)) {
        toast.error(t("Enter a price of 0 or more for {0}.", [planLabel(plan)]));
        return;
      }
      pricing[plan] = num !== null ? { price: num } : { price: null };
    }
    setSavingDefaults(true);
    try {
      const res = await fetch("/api/owner/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing, expected: savedDefaults }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setSavedDefaults(json.data);
      toast.success(t("Default prices saved. Schools see the new catalogue prices from their next renewal."));
      setDefaultsFailed(false);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("The prices could not be saved. Please try again.")));
    } finally {
      setSavingDefaults(false);
    }
  };

  useEffect(() => { void loadDefaultPricing(); }, []);

  const loadPricing = async (schoolId: string) => {
    const version = ++pricingVersion.current;
    setLoadingPricing(true);
    setPricingLoadFailed(false);
    try {
      const res = await fetch(`/api/owner/schools/${schoolId}`, { cache: "no-store" });
      const json = await res.json();
      if (version !== pricingVersion.current) return;
      if (!res.ok) throw new Error(json.error);
      setPricingValues(priceFields(json.data?.planPricing));
      setPricingSaved(false);
    } catch {
      // R4: shown inline under the school picker, with a retry.
      if (version === pricingVersion.current) setPricingLoadFailed(true);
    } finally {
      if (version === pricingVersion.current) setLoadingPricing(false);
    }
  };

  const savePricing = async () => {
    if (!pricingSchoolId || loadingPricing || pricingLoadFailed || savingPricing) return;
    const pricing: Record<string, { price?: number }> = {};
    for (const [plan, vals] of Object.entries(pricingValues)) {
      const num = vals.price === "" ? undefined : Number(vals.price);
      if (num !== undefined && (!Number.isFinite(num) || num < 0)) {
        toast.error(t("Enter a price of 0 or more for {0}.", [planLabel(plan)]));
        return;
      }
      pricing[plan] = num !== undefined ? { price: num } : { price: undefined };
    }
    setSavingPricing(true);
    setPricingSaved(false);
    try {
      const res = await fetch(`/api/owner/schools/${pricingSchoolId}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      toast.success(t("This school's prices are saved."));
      setPricingSaved(true);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("The prices could not be saved. Please try again.")));
    } finally {
      setSavingPricing(false);
    }
  };

  return (
    <div className={VIEW_BODY}>
      <ViewHeader
        title="Pricing"
        description={t("Default monthly catalogue prices for every school, and per-school overrides. Prices are in {0}.", [COMMERCIAL_CONTRACT.currency])}
        primaryAction={{ id: "save-prices", label: "Save prices", icon: Save, onClick: () => void saveDefaultPricing(), loading: savingDefaults, disabled: loadingDefaults || defaultsFailed || !savedDefaults }}
      />

      <section aria-labelledby="pricing-defaults-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="pricing-defaults-heading"
          icon={Globe}
          title={t("Default plan prices")}
          description={t("These apply to every school unless overridden below. Schools already on a plan see a notice and keep their approved terms until their next renewal.")}
        />
        {defaultsFailed ? (
          <Alert
            tone="warning"
            className="mb-5"
            title={t("The saved default prices did not load")}
            actions={<Button variant="outline" size="sm" type="button" onClick={() => void loadDefaultPricing()}><RefreshCw aria-hidden="true" />{t("Try again")}</Button>}
          >
            {t("Load the saved prices before making changes.")}
          </Alert>
        ) : null}
        <Button variant="ghost" size="sm" type="button" disabled={loadingDefaults || savingDefaults} onClick={() => void loadDefaultPricing()} className="mb-3"><RefreshCw aria-hidden="true" />{t("Reload saved prices")}</Button>
        {loadingDefaults ? <SkeletonList rows={2} label={t("Loading saved prices")} /> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(defaultPricing).map(([plan, vals]) => (
            <PlanPriceField
              key={plan}
              scope="default-price"
              plan={plan}
              value={vals.price}
              placeholder={t("Not set")}
              disabled={defaultsFailed || savingDefaults}
              onChange={(value) => setDefaultPricing(prev => ({ ...prev, [plan]: { price: value } }))}
            />
          ))}
        </div>}
      </section>

      <section aria-labelledby="pricing-override-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="pricing-override-heading"
          icon={DollarSign}
          title={t("Price for one school")}
          description={t("Set custom plan prices for one school. Leave a field blank to use the default.")}
        />
        <FormField
          name="pricing-school"
          label={t("School")}
          className="mb-5 max-w-md"
          hint={stats ? t("Choose a school to see and change its prices.") : t("The school list is unavailable until the platform statistics load.")}
        >
          <SystemSelect
            value={pricingSchoolId}
            disabled={savingPricing}
            onChange={(e) => {
              ++pricingVersion.current;
              setPricingSchoolId(e.target.value);
              setPricingValues(EMPTY_PRICE_FIELDS);
              if (e.target.value) void loadPricing(e.target.value);
              setPricingSaved(false);
            }}
            className={"w-full"}
          >
            <option value="">{t("Choose a school")}</option>
            {stats?.schools?.map((s: { id: string; name: string }) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SystemSelect>
        </FormField>
        {pricingSchoolId && (
          loadingPricing ? (
            <SkeletonList rows={2} label={t("Loading this school's prices")} />
          ) : pricingLoadFailed ? (
            <ErrorState title={t("This school's prices did not load")} description={t("Check your connection and try again.")} onRetry={() => void loadPricing(pricingSchoolId)} />
          ) : (
            <div className="sk-fade-in space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(pricingValues).map(([plan, vals]) => (
                  <PlanPriceField
                    key={plan}
                    scope="school-price"
                    plan={plan}
                    value={vals.price}
                    placeholder={t("Use default")}
                    disabled={savingPricing}
                    onChange={(value) => { setPricingSaved(false); setPricingValues(prev => ({ ...prev, [plan]: { price: value } })); }}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button variant="outline"
                  type="button"
                  onClick={() => void savePricing()}
                  loading={savingPricing}
                  className="sm:shrink-0"
                >
                  {savingPricing ? null : <Save aria-hidden="true" />}
                  {t("Save this school's prices")}
                </Button>
                {pricingSaved && (
                  <Alert tone="success" compact live="polite" className="sm:w-auto sm:flex-1">{t("Saved. The school's administrator sees the new prices in Billing & plan straight away.")}</Alert>
                )}
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}

const CONNECT_RETURN: Record<string, { tone: "success" | "warning"; message: string }> = {
  success: { tone: "success", message: "Stripe finished onboarding. Payouts start once Stripe confirms the account." },
  refresh: { tone: "warning", message: "The Stripe onboarding link expired before it was finished. Continue onboarding to pick up where you left off." },
};

function PaymentSettingsView() {
  const t = useUiText();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [bankForm, setBankForm] = useState({ bankName: "", accountTitle: "", accountNumber: "", iban: "" });
  const [connectOutcome, setConnectOutcome] = useState<(typeof CONNECT_RETURN)[string] | null>(null);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/owner/payment-settings", { cache: "no-store" });
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

  useEffect(() => { void loadSettings(); }, []);

  // M111: Stripe Connect returns to `?view=payments&connect=success|refresh`. One toast and one status Alert,
  // then the parameter is stripped so a refresh does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = CONNECT_RETURN[params.get("connect") ?? ""];
    if (!params.has("connect")) return;
    if (outcome) {
      setConnectOutcome(outcome);
      if (outcome.tone === "success") toast.success(t(outcome.message)); else toast.warning(t(outcome.message));
    }
    params.delete("connect");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // Runs once per mount: the parameter is gone after this.
  }, []);

  const retryLoad = () => { setLoading(true); setLoadFailed(false); void loadSettings(); };

  const startConnectOnboarding = async () => {
    setConnectLoading(true);
    try {
      const res = await fetch("/api/owner/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-connect-onboarding" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      window.location.href = json.url;
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("Stripe onboarding could not be started. Please try again.")));
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      toast.success(t("Bank details saved. Schools paying by transfer see them straight away."));
      void loadSettings();
    } catch (err) {
      toast.error(friendlyErrorMessage(err, t("The bank details could not be saved. Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const connected = Boolean(settings?.connectedAccountId);
  const onboarded = Boolean(settings?.onboardingComplete);
  const header = (
    <ViewHeader
      title="Payment gateways"
      description="How schools pay for their SkooleeAI subscription: Stripe, and a bank account for manual transfers."
      primaryAction={settings && !onboarded ? { id: "connect-stripe", label: connected ? "Continue Stripe onboarding" : "Connect Stripe", icon: ExternalLink, onClick: () => void startConnectOnboarding(), loading: connectLoading } : undefined}
      status={connectOutcome ? <Alert tone={connectOutcome.tone} compact live="off" onDismiss={() => setConnectOutcome(null)}>{t(connectOutcome.message)}</Alert> : undefined}
    />
  );

  if (loading) {
    return (
      <div className={VIEW_BODY}>
        {header}
        <SkeletonCards count={2} label={t("Loading payment gateways")} />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={VIEW_BODY}>
        {header}
        <div className="sk-panel">
          <ErrorState
            title={t("Payment gateways did not load")}
            description={t("We couldn't load your payout settings. Check your connection and try again.")}
            onRetry={retryLoad}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={VIEW_BODY}>
      {header}

      <section aria-labelledby="payments-stripe-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="payments-stripe-heading"
          icon={WalletCards}
          title={t("Stripe Connect")}
          description={t("Connect your Stripe account to receive subscription payments directly. When a school upgrades, funds are transferred to your connected account automatically.")}
        />

        {connected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={onboarded ? "success" : "warning"} dot>
                {onboarded ? t("Active") : t("Onboarding not finished")}
              </Badge>
              <span className="min-w-0 text-xs text-ink-subtle">
                {t("Account")}: <bdi dir="ltr" className="break-all font-mono">{settings.connectedAccountId}</bdi>
              </span>
            </div>
            {onboarded ? (
              <Alert tone="success" live="off" title={t("Stripe account connected")}>
                {t("Subscription payments are transferred to your Stripe account automatically.")}
              </Alert>
            ) : (
              <p className="text-sm text-ink-muted">{t("Finish onboarding with Stripe before payouts can start.")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t("No Stripe account is connected yet.")}</p>
        )}
      </section>

      <section aria-labelledby="payments-bank-heading" className="sk-panel p-4 sm:p-6">
        <PanelHeading
          id="payments-bank-heading"
          icon={Building2}
          title={t("Bank account (fallback)")}
          description={t("Optional. Schools that pay by transfer see these details.")}
        />
        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField name="bank-name" label={t("Bank name")}>
            <SystemInput
              value={bankForm.bankName}
              onChange={(e) => setBankForm(prev => ({ ...prev, bankName: e.target.value }))}
              dir="auto"
              className={"w-full"}
            />
          </FormField>
          <FormField name="bank-account-title" label={t("Account title")} hint={t("The name on the account, as schools will see it when they transfer.")}>
            <SystemInput
              value={bankForm.accountTitle}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountTitle: e.target.value }))}
              dir="auto"
              className={"w-full"}
            />
          </FormField>
          <FormField name="bank-account-number" label={t("Account number")}>
            <SystemInput
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              className={"w-full tabular-nums"}
              dir="ltr"
            />
          </FormField>
          <FormField name="bank-iban" label="IBAN" optional>
            <SystemInput
              value={bankForm.iban}
              onChange={(e) => setBankForm(prev => ({ ...prev, iban: e.target.value }))}
              className={"w-full tabular-nums"}
              dir="ltr"
            />
          </FormField>
        </div>
        <Button variant="outline"
          type="button"
          onClick={() => void saveBankDetails()}
          loading={saving}
        >
          {saving ? null : <Save aria-hidden="true" />}
          {t("Save bank details")}
        </Button>
      </section>
    </div>
  );
}

/**
 * APP_OWNER-only switch that takes one school out of AI Workflows practice mode before the release evaluation
 * (src/lib/ai-workflows/practice.ts). Turning it on is confirmed in a dialog that says AI may then change the
 * school's real records; turning it off is immediate, because practice mode is the safe state. The server
 * re-checks the role and audits both directions.
 */
function AiWorkflowsLivePanel({ school, onChange }: { school: SchoolRow; onChange: (schoolId: string, aiWorkflowsLiveAt: string | null) => void }) {
  const t = useUiText();
  const dates = useOwnerDates();
  const { language } = useLocale();
  const lang = language === "ar" || language === "ur" ? language : "en";
  // Local copy for the lines this panel adds (the shared UI catalogue lives in src/lib, which this pass leaves alone).
  const words = {
    saving: { en: "Saving…", ar: "جارٍ الحفظ…", ur: "محفوظ ہو رہا ہے…" },
    changes: { en: "What changes", ar: "ما الذي يتغيّر", ur: "کیا بدلے گا" },
    changesBody: { en: "When staff confirm an AI step, it saves to this school's real records.", ar: "عندما يؤكد الموظفون خطوة من الذكاء الاصطناعي، تُحفظ في سجلات المدرسة الحقيقية.", ur: "جب عملہ اے آئی کے کسی قدم کی تصدیق کرے گا تو وہ اس اسکول کے اصل ریکارڈ میں محفوظ ہو گا۔" },
    stays: { en: "What stays the same", ar: "ما الذي يبقى كما هو", ur: "کیا ویسا ہی رہے گا" },
    staysBody: { en: "Nothing is saved without a person confirming it, and other schools stay in practice mode.", ar: "لا يُحفظ شيء دون تأكيد شخص، وتبقى المدارس الأخرى في وضع التدريب.", ur: "کسی شخص کی تصدیق کے بغیر کچھ محفوظ نہیں ہوتا، اور دوسرے اسکول مشق کے موڈ میں رہتے ہیں۔" },
    back: { en: "Switching back", ar: "العودة", ur: "واپس جانا" },
    backBody: { en: "Stops new saves; records already saved stay saved.", ar: "يوقف الحفظ الجديد؛ وتبقى السجلات المحفوظة محفوظة.", ur: "نئے اندراج رک جاتے ہیں؛ جو ریکارڈ محفوظ ہو چکے وہ محفوظ رہتے ہیں۔" },
  } as const;
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const live = Boolean(school.aiWorkflowsLiveAt);

  const save = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/schools/${school.id}/ai-workflows-live`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next ? { live: true, acknowledgeRealRecords: true } : { live: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error);
      onChange(school.id, json.data.aiWorkflowsLiveAt ?? null);
      toast.success(next ? t("AI Workflows are live for {0}.", [school.name]) : t("{0} is back in practice mode.", [school.name]));
      // Close only once the server has saved: a failed save leaves the dialog open to retry.
      setConfirming(false);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The AI Workflows setting could not be changed. Please try again.")));
    } finally {
      setSaving(false);
    }
  };

  const MarkIcon = live ? Zap : ShieldCheck;
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-5" data-ai-live-state={live ? "live" : "practice"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="sk-eyebrow text-primary">{t("AI Workflows")}</p>
        {live ? <Badge variant="warning" size="sm"><Zap aria-hidden="true" />{t("Live · saves real records")}</Badge> : <Badge variant="neutral" size="sm"><ShieldCheck aria-hidden="true" />{t("Practice mode")}</Badge>}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-4" aria-busy={saving || undefined}>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors duration-(--duration-control)",
            live ? "border-status-warning-border bg-status-warning-surface/50 text-status-warning-text" : "border-border-subtle bg-surface-subtle text-primary",
          )}
        >
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-brand-500 text-primary-foreground">
            <MarkIcon className="size-4" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-strong">{t("Let AI save real records")}</span>
          <span id={`ai-live-${school.id}`} className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            {live && school.aiWorkflowsLiveAt
              ? <>
                  <span className="block">{t("Live since")} <bdi className="tabular-nums">{dates.instant(school.aiWorkflowsLiveAt)}</bdi></span>
                  <span className="block">{t("Staff-confirmed AI steps change this school's records.")}</span>
                </>
              : t("AI shows what it would do and saves nothing until the release evaluation is recorded.")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {saving ? <span role="status" className="text-xs text-ink-muted">{words.saving[lang]}</span> : null}
          <Switch
            checked={live}
            disabled={saving}
            aria-describedby={`ai-live-${school.id}`}
            onChange={(event) => { if (event.target.checked) setConfirming(true); else void save(false); }}
          />
        </span>
      </label>
      <ConfirmAction
        open={confirming}
        tone="warning"
        title={t("Turn AI Workflows live for {0}?", [school.name])}
        description={t("AI Workflows can then change {0}'s real records, such as students, attendance and fees, whenever its staff confirm a step. Practice mode ends for this school only. You can switch it back at any time.", [school.name])}
        detail={
          <dl className="space-y-2 text-xs">
            <div><dt className="font-semibold text-ink-strong">{words.changes[lang]}</dt><dd className="text-ink-muted">{words.changesBody[lang]}</dd></div>
            <div><dt className="font-semibold text-ink-strong">{words.stays[lang]}</dt><dd className="text-ink-muted">{words.staysBody[lang]}</dd></div>
            <div><dt className="font-semibold text-ink-strong">{words.back[lang]}</dt><dd className="text-ink-muted">{words.backBody[lang]}</dd></div>
          </dl>
        }
        confirmLabel={t("Turn live")}
        cancelLabel={t("Keep practice mode")}
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={() => save(true)}
      />
    </div>
  );
}

function SchoolDetailModal({
  school,
  onClose,
  onPlanChange,
  onAiWorkflowsLiveChange,
  onStatusChange,
}: {
  school: SchoolRow;
  onStatusChange: () => void;
  onClose: () => void;
  onPlanChange: (schoolId: string, newPlan: string) => Promise<void>;
  onAiWorkflowsLiveChange: (schoolId: string, aiWorkflowsLiveAt: string | null) => void;
}) {
  const t = useUiText();
  const dates = useOwnerDates();
  const [tab, setTab] = useState<"overview" | "campuses" | "subscription">("overview");
  // A plan change rewrites the school's limits and AI allowance, so it is confirmed first.
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const [statusAction, setStatusAction] = useState<"ACTIVE" | "SUSPENDED" | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const changeStatus = async () => {
    if (!statusAction) return;
    setChangingStatus(true);
    try {
      const response = await fetch(`/api/owner/schools/${school.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: statusAction }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      toast.success(t("School status updated."));
      onStatusChange();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The school could not be updated. Try again.")));
    } finally { setChangingStatus(false); setStatusAction(null); }
  };

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
      eyebrow={t("School")}
      subtitle={
        <>
          <bdi dir="ltr">{school.contactEmail || "—"}</bdi> · <bdi>{school.city || "—"}</bdi>
          {school.phone ? <> · <bdi dir="ltr">{school.phone}</bdi></> : ""}
          {school.website ? <span className="block"><bdi dir="ltr">{school.website}</bdi></span> : null}
          {school.establishedYear ? <span className="block">{t("Established {0}", [school.establishedYear])}</span> : null}
        </>
      }
      chips={
        <>
          <StatusPill status={school.status} />
          {school.tagline ? (
            <span className="text-xs italic text-ink-muted"><bdi>“{school.tagline}”</bdi></span>
          ) : null}
        </>
      }
      avatar={
        school.logoUrl ? (
          <img src={school.logoUrl} alt="" className="h-full w-full object-cover" />
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
        <div role="group" aria-label={t("School details")} className="flex flex-wrap gap-2 border-b border-border-subtle px-5 py-3 sm:px-7">
          <Button aria-pressed={tab === "overview"} variant="choice" size="sm" type="button" onClick={() => setTab("overview")}>{t("Overview")}</Button>
          <Button aria-pressed={tab === "campuses"} variant="choice" size="sm" type="button" onClick={() => setTab("campuses")}>{t("Campuses")}</Button>
          <Button aria-pressed={tab === "subscription"} variant="choice" size="sm" type="button" onClick={() => setTab("subscription")}>{t("Subscription")}</Button>
        </div>

        <div className="p-5 sm:p-7">
          {tab === "overview" && (
            <div className="sk-fade-in space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniStat label={t("Campuses")} value={school.campusCount} />
                <MiniStat label={t("Students")} value={school.totalStudents} />
                <MiniStat label={t("Staff")} value={school.totalStaff} />
                <MiniStat label={t("Classes")} value={school.totalClasses} />
              </div>
              <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-5">
                <div className="mb-3 flex items-center gap-1">
                  <p className="sk-eyebrow text-primary">{t("AI credits")}</p>
                  <InfoTip content={t(AI_CREDITS_HELP)} label={t("About AI credits")} />
                </div>
                <div className="flex items-center gap-4">
                  <Zap aria-hidden="true" className="size-8 shrink-0 text-status-warning-text" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold tabular-nums text-ink-strong"><bdi>{dates.number(school.aiCreditsUsed)} / {school.aiCreditsLimit < 0 ? t("Unlimited") : dates.number(school.aiCreditsLimit)}</bdi></span>
                      <span className={cn("text-xs font-semibold tabular-nums", school.aiCreditsLimit > 0 && creditRatio > 0.8 ? "text-status-error-text" : "text-status-success-text")}>
                        {school.aiCreditsLimit > 0 ? t("{0}% used", [Math.round(creditRatio * 100)]) : "—"}
                      </span>
                    </div>
                    {school.aiCreditsLimit > 0 && (
                      <Progress value={school.aiCreditsUsed} max={school.aiCreditsLimit} label={t("AI credits used")} tone={creditTone} size="sm" />
                    )}
                  </div>
                </div>
              </div>
              <AiWorkflowsLivePanel school={school} onChange={onAiWorkflowsLiveChange} />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <div>
                  <p className="text-xs font-medium text-ink-subtle">{t("Plan")}</p>
                  <p className="mt-0.5 text-sm font-bold text-ink-strong"><bdi>{planLabel(school.plan)}</bdi></p>
                </div>
                <div className="text-end">
                  <p className="text-xs font-medium text-ink-subtle">{t("Since")}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-ink-strong"><bdi>{dates.month(school.createdAt)}</bdi></p>
                </div>
              </div>
              <Alert
                tone="info"
                live="off"
                icon={CreditCard}
                title={t("Manage plan")}
                actions={<Button variant="outline" size="sm" type="button" onClick={() => setTab("subscription")}>{t("Open subscription")}</Button>}
              >
                {t("Use the Subscription tab to move this school to another plan.")}
              </Alert>
              <Alert tone={school.status === "ACTIVE" || school.status === "TRIAL" ? "warning" : "info"} title={t("School access")} live="off"
                actions={<Button type="button" variant="outline" size="sm" onClick={() => setStatusAction(school.status === "ACTIVE" || school.status === "TRIAL" ? "SUSPENDED" : "ACTIVE")}>
                  {t(school.status === "ACTIVE" || school.status === "TRIAL" ? "Suspend school" : "Restore school")}
                </Button>}>
                {t("Suspension pauses school access while retaining its records. Restoring access clears the suspension and expired payment grace period.")}
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
                <EmptyState size="sm" icon={Building2} title={t("No campuses yet")} description={t("This school has not added a campus.")} />
              )}
            </div>
          )}

          {tab === "subscription" && (
            <div className="sk-fade-in space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink-strong">{t("Choose a plan for {0}", [school.name])}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{t("You confirm the change before it is applied.")}</p>
              </div>
              <div className="grid gap-3">
                {PLAN_CHOICES.map((plan) => {
                  const isCurrent = school.plan === plan;
                  const dotStyles: Record<string, string> = {
                    FREE: "bg-ink-faint",
                    BASIC: "bg-brand-300",
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
                          <span className={cn("block text-sm font-bold", isCurrent ? "text-primary" : "text-ink-strong")}><bdi>{planLabel(plan)}</bdi></span>
                          <span className="mt-0.5 block text-xs text-ink-muted">{planSummary(plan, t)}</span>
                        </span>
                      </span>
                      {isCurrent && (
                        <Badge variant="secondary" size="sm">{t("Current")}</Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <ConfirmAction open={Boolean(statusAction)} title={t(statusAction === "SUSPENDED" ? "Suspend school" : "Restore school")}
          description={t(statusAction === "SUSPENDED" ? "Pause access for this school? Its records will be retained." : "Restore access for this school and clear its expired payment grace period?")}
          detail={<bdi>{school.name}</bdi>} busy={changingStatus} tone={statusAction === "SUSPENDED" ? "warning" : "success"}
          onConfirm={changeStatus} onCancel={() => setStatusAction(null)} />
        <ConfirmAction
          open={Boolean(pendingPlan)}
          tone="warning"
          title={pendingPlan ? t("Move {0} to {1}?", [school.name, planLabel(pendingPlan)]) : ""}
          description={t("The plan, its limits and the monthly AI credit allowance change straight away. The change is recorded in the audit log.")}
          detail={pendingPlan ? <><bdi className="font-semibold">{planLabel(school.plan)}</bdi> <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span> <bdi className="font-semibold">{planLabel(pendingPlan)}</bdi>: {planSummary(pendingPlan, t)}</> : null}
          confirmLabel={t("Change plan")}
          cancelLabel={t("Keep editing")}
          busy={changingPlan}
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => confirmPlanChange()}
        />
    </Modal>
  );
}

/**
 * A support tool (D10): resetting a school member's password from the platform. The school's own administrator
 * normally does this; the warning says so before anything is changed.
 */
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
  const t = useUiText();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = getPasswordStrength(newPassword);
  const mismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;

  const handleSubmit = async () => {
    setError("");
    if (!newPassword) return setError(t("Enter a new password."));
    if (newPassword.length < 8) return setError(t("Use at least 8 characters."));
    if (newPassword !== confirmPassword) return setError(t("The two passwords do not match."));

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/users/${user.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      toast.success(t("Password changed for {0}.", [user.fullName]));
      onSuccess();
    } catch (err) {
      setError(friendlyErrorMessage(err, t("Could not change the password. Please try again.")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t("Reset password")}
      eyebrow={t("Support tool")}
      icon={KeyRound}
      tone="amber"
      size="xs"
      onClose={onClose}
      dirty={Boolean(newPassword) && !loading}
      dirtyMessage={t("The new password has not been set yet. Leave without applying it?")}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={onClose}>
            {t("Keep editing")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            loading={loading}
            disabled={!newPassword || newPassword !== confirmPassword}
          >
            {loading ? null : <KeyRound aria-hidden="true" />}
            {t("Reset password")}
          </Button>
        </div>
      }
    >
        <Alert tone="warning" live="off" className="mb-6" title={t("Use this only for support")}>
          {t("This change is logged and signs the person out on every device. Share the temporary password securely; they must replace it at their next sign-in.")}
        </Alert>

        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
          <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs">
            <User className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-strong"><bdi>{user.fullName}</bdi></p>
            <p className="truncate text-xs text-ink-subtle"><bdi dir="ltr">{user.email}</bdi></p>
            {user.school && <p className="mt-0.5 truncate text-xs text-primary"><bdi>{user.school.name}</bdi></p>}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div>
            <FormField
              name="owner-new-password"
              id="owner-new-password"
              label={t("New password")}
              required
              hint={t("At least 8 characters. Length, a mix of upper and lower case, numbers and symbols make it stronger.")}
            >
              <InputGroup surfaceClassName="bg-brand-50/50" className="relative">
                <SystemInput id="owner-new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  dir="ltr"
                  autoComplete="new-password"
                  className={"w-full"}
                />
                <FieldAction data-field-affix="end"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t("Hide password") : t("Show password")}
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
                label={t("Password strength")}
                valueText={t(strength.label)}
                showValue
                tone={strength.level <= 1 ? "danger" : strength.level <= 2 ? "warning" : "success"}
              />
            )}
          </div>
          <FormField
            name="owner-confirm-password"
            id="owner-confirm-password"
            label={t("Confirm password")}
            required
            error={mismatch ? t("The two passwords do not match.") : undefined}
          >
            <SystemInput id="owner-confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              dir="ltr"
              autoComplete="new-password"
              className={"w-full"}
            />
          </FormField>
        </div>

        {error && (
          <Alert tone="danger" className="mb-4">
            {error}
          </Alert>
        )}

    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  const dates = useOwnerDates();
  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2 text-center">
      <p className="truncate text-2xs font-medium text-ink-subtle">{label}</p>
      <p className="text-sm font-bold tabular-nums text-ink-strong"><bdi>{dates.number(value)}</bdi></p>
    </div>
  );
}

const PAGINATION_LABELS: Record<string, string> = { schools: "Page {0} of {1} · {2} schools", users: "Page {0} of {1} · {2} accounts", entries: "Page {0} of {1} · {2} entries", sessions: "Page {0} of {1} · {2} sessions" };

function PaginationBar({
  pagination,
  label,
  onPage,
}: {
  pagination: Pagination;
  label: keyof typeof PAGINATION_LABELS;
  onPage: (page: number) => void;
}) {
  const t = useUiText();
  const dates = useOwnerDates();
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
      <p className="text-xs tabular-nums text-ink-subtle">
        {t(PAGINATION_LABELS[label], [dates.number(pagination.page), dates.number(pagination.pages), dates.number(pagination.total)])}
      </p>
      <div className="flex gap-2">
        <IconButton
          label={t("Previous page")}
          variant="outline"
          onClick={() => onPage(pagination.page - 1)}
          disabled={pagination.page <= 1}
        >
          <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
        </IconButton>
        <IconButton
          label={t("Next page")}
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
