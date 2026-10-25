"use client";

/**
 * The group console (SUPER_ADMIN of a school group) — governance only (SPEC §3 `super`, §4.4, M1–M18, M117).
 *
 * Eight registry entries: Overview · Campuses · Approvals · People & access · Group standards · Billing & plan ·
 * Messages · Settings. Operations (fees, guardians, staff structure, AI review) live with the campus that runs
 * them; this console decides, appoints and oversees.
 *
 * - View and tab live in the URL (`useConsoleView("super")`); old ids alias (`schools`, `fees`,
 *   `curriculum-templates`, `support`). A campus drill-in is `?view=campuses&campus=<id>`, so it survives
 *   refresh and Back and never shows another campus's numbers (M16, F6).
 * - Billing & plan renders without waiting for the dashboard loader, so a suspended school's payer can still
 *   pay (F3); a failed load is an inline ErrorState with retry, never a toast or a sign-out (R4).
 * - Every screen opens with one PageHeader and at most one primary action (§4.4).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CirclePause,
  ClipboardList,
  CreditCard,
  Download,
  GraduationCap,
  History,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { useConsoleView, WORKSPACE_VIEW_CHANGE } from "@/components/nav/useConsoleView";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { subscribeWorkspaceNavigation } from "@/components/nav/useWorkspaceView";
import { RoleShell, ManagementCard, AiActionPanel, useShellSession } from "@/components/role-dashboard";
import { CommandCentreSkeleton, PageSkeleton, PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { FlagshipCard } from "@/components/ui/flagship";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { Menu } from "@/components/ui/menu";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { SkeletonCards } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/tooltip";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { BoardSelect } from "@/components/ui/board-select";
import { NetworkOverview } from "@/components/insights";
import { SubscriptionWorkspace } from "@/components/billing/SubscriptionWorkspace";
import { SupportApprovalsPanel } from "@/components/institution/support-approvals";
import { MembershipsPanel } from "@/components/memberships/memberships-panel";
import { AuditHistoryPanel } from "@/components/audit/audit-history-panel";
import { AuditHistoryModal } from "@/components/audit/audit-history-modal";
import { InstitutionSettingsPanel } from "@/components/settings/InstitutionSettingsPanel";
import { LocaleSettingsPanel } from "@/components/settings/LocaleSettingsPanel";
import { DataLifecyclePanel } from "@/components/settings/DataLifecyclePanel";
import { GroupPolicy } from "@/components/group-policy/group-policy";
import { IdentityAdmin } from "@/components/identity/identity-admin";
import { Integrations } from "@/components/integrations/integrations";
import { RolePermissionsPanel } from "@/components/shared-admin/role-permissions-panel";
import { AcademicModelPanel } from "@/components/academic/AcademicModelPanel";
import { StickySaveBar } from "@/components/teacher/sticky-save-bar";
import { TaxPackages } from "@/components/tax/tax-packages";
import { ReadinessHome } from "@/components/readiness/ReadinessHome";
import { FeeOverviewTab } from "@/components/fees/FeeOverviewTab";
import { addCampus } from "@/app/actions/addCampus";
import { getSchoolCountry } from "@/app/actions/school-boards";
import { cancelInvitation, inviteStaff, removeStaff, resendInvitation } from "@/app/actions/invite";
import { getPlanLimits } from "@/config/plans";
import { cn } from "@/lib/utils";
import { useSuperAdminData } from "./super-data-context";

type Tr = ReturnType<typeof useUiText>;
type Campus = any;
type LeaderRole = "CAMPUS_ADMIN" | "PRINCIPAL";

const APPROVAL_TABS = ["support", "tax", "policy"] as const;
const ACCESS_TABS = ["leadership", "members", "permissions"] as const;
const STANDARD_TABS = ["templates", "policies"] as const;
const SETTINGS_TABS = ["profile", "locale", "identity", "integrations", "data", "activity", "setup"] as const;

const searchSnapshot = () => window.location.search;
const serverSearchSnapshot = () => "";

/** A seat counts as held only once someone has accepted it; a pending invitation is still a vacancy. */
const seated = (slot: any) => Boolean(slot && slot.id && !slot.inviteId);
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const generateRegId = (prefix = "BR") => `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
const pickTab = <T extends readonly string[]>(tabs: T, tab: string | null, allowed: (id: T[number]) => boolean = () => true): T[number] =>
  (tab && (tabs as readonly string[]).includes(tab) && allowed(tab as T[number]) ? tab : tabs.find(allowed) ?? tabs[0]) as T[number];

/** Numbers in the viewer's language and numbering system (never the browser default). */
function useFormatNumber() {
  const tag = localeTag(useLocale());
  return useMemo(() => { const format = new Intl.NumberFormat(tag); return (value: number) => format.format(value); }, [tag]);
}

export default function SuperAdminDashboard() {
  const t = useUiText();
  const { data, loading, error: loadError, suspended, refetch } = useSuperAdminData();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("super");
  const search = useSyncExternalStore(subscribeWorkspaceNavigation, searchSnapshot, serverSearchSnapshot);
  const campusParam = view === "campuses" ? new URLSearchParams(search).get("campus") : null;
  // One shared session read for the whole shell (scope chip, header, Help); the panels here need only the id.
  const session = useShellSession();

  // Modals and confirmations that several views open.
  const [addCampusOpen, setAddCampusOpen] = useState(false);
  const [appoint, setAppoint] = useState<{ campusId: string | null; role: LeaderRole } | null>(null);
  const [activity, setActivity] = useState<{ campusId: string } | null>(null);
  const [promote, setPromote] = useState<{ campus: Campus } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  /** `?view=campuses&campus=<id>`: pushed like any view change, so Back returns to the list. */
  const openCampus = useCallback((campus: Campus) => {
    const params = new URLSearchParams({ view: "campuses", campus: String(campus.id) });
    window.history.pushState(null, "", `/super?${params.toString()}`);
    window.dispatchEvent(new Event(WORKSPACE_VIEW_CHANGE));
  }, []);

  const runConfirmed = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try { await confirm.run(); setConfirm(null); }
    catch (error) { toast.error(friendlyErrorMessage(error, t("That change could not be saved. Please try again."))); }
    finally { setConfirmBusy(false); }
  };
  const revokeLeader = (userId: string, role: LeaderRole, campusName: string) => setConfirm({
    title: role === "CAMPUS_ADMIN" ? t("Revoke campus admin access?") : t("Revoke principal access?"),
    description: t("They lose access to {0} straight away and are signed out. The seat becomes vacant until you appoint someone.", [campusName]),
    confirmLabel: t("Revoke access"),
    run: async () => { await removeStaff(userId); toast.success(t("Access revoked")); await refetch(); },
  });
  const cancelInvite = (inviteId: string) => setConfirm({
    title: t("Cancel invitation?"),
    description: t("The invited person will no longer be able to use this invitation link."),
    confirmLabel: t("Cancel invitation"),
    run: async () => { await cancelInvitation(inviteId); toast.success(t("Invitation cancelled")); await refetch(); },
  });
  const resendInvite = async (inviteId: string) => {
    try { await resendInvitation(inviteId); toast.success(t("Invitation sent again.")); await refetch(); }
    catch (error) { toast.error(friendlyErrorMessage(error, t("The invitation could not be resent. Please try again."))); }
  };

  const campuses: Campus[] = data?.campuses ?? [];
  const selectedCampus = campusParam ? campuses.find((campus) => campus.id === campusParam) ?? null : null;
  const needsData = view !== "billing" && view !== "approvals" && view !== "standards" && !(view === "settings" && tab !== "profile");

  /** Views that need the dashboard data: the layout-shaped skeleton while it loads, inline retry when it fails. */
  const dataGate = (render: () => ReactNode, skeleton: ReactNode = <SkeletonCards count={4} label={t("Loading the group console")} />) => {
    if (data) return render();
    if (loading) return skeleton;
    return <DataError message={loadError} onRetry={() => refetch()} />;
  };

  const leaderActions = { onAppoint: (campusId: string | null, role: LeaderRole) => setAppoint({ campusId, role }), onPromote: (campus: Campus) => setPromote({ campus }), onResend: resendInvite };

  let content: ReactNode;
  if (view === "billing") {
    content = <SubscriptionWorkspace />;
  } else if (suspended) {
    // F3 minimal shell: while the plan is paused only Billing & plan works; every other view says so.
    content = <SuspendedNotice onOpenBilling={() => setView("billing")} />;
  } else if (view === "campuses" && campusParam) {
    content = dataGate(() => selectedCampus
      ? <CampusDetail
          key={selectedCampus.id}
          campus={selectedCampus}
          onBack={() => setView("campuses")}
          onActivity={() => setActivity({ campusId: selectedCampus.id })}
          onRevoke={revokeLeader}
          onCancelInvite={cancelInvite}
          onSaved={refetch}
          {...leaderActions}
        />
      : <div className="sk-panel"><EmptyState icon={Building2} title={t("This campus is not available")} description={t("It may have been archived, or it belongs to another school.")} action={<Button type="button" onClick={() => setView("campuses")}>{t("Back to all campuses")}</Button>} /></div>,
      <PageSkeleton />);
  } else if (view === "campuses") {
    content = dataGate(() => <CampusesView campuses={campuses} onOpen={openCampus} onAdd={() => setAddCampusOpen(true)} onActivity={() => setView("settings", "activity")} onSaved={refetch} {...leaderActions} />, <PageSkeleton />);
  } else if (view === "approvals") {
    content = <ApprovalsView tab={pickTab(APPROVAL_TABS, tab)} onTab={setTab} />;
  } else if (view === "access") {
    const accessTab = pickTab(ACCESS_TABS, tab);
    content = <AccessView tab={accessTab} onTab={setTab} campuses={campuses} dataReady={Boolean(data)} dataGate={dataGate}
      onRevoke={revokeLeader} onCancelInvite={cancelInvite} {...leaderActions} />;
  } else if (view === "standards") {
    content = <StandardsView tab={pickTab(STANDARD_TABS, tab)} onTab={setTab} />;
  } else if (view === "settings") {
    content = <SettingsView tab={tab} onTab={setTab} userId={session?.id ?? null} onSaved={refetch} />;
  } else {
    content = dataGate(() => <OverviewView data={data} onOpenCampus={openCampus} onNavigate={setView} retiredNotice={retiredNotice} onRefresh={refetch} {...leaderActions} />, <CommandCentreSkeleton tiles={4} />);
  }

  return (
    <RoleShell
      console="super"
      activeView={view}
      onSelectView={setView}
      userName={data?.user?.fullName ?? session?.fullName}
      avatarSeed={data?.user?.email ?? session?.fullName}
      dashboardHref="/super"
      // F3 / §3.2: a paused school never opens the chat stream — decided from the school's state (server-read for
      // the page load, re-checked when a reload fails), not from whether the dashboard happened to load.
      chatDock={!suspended}
    >
      {/* The shell draws the one page card (addendum 2026-10-22); this is its scrolling body. */}
      <div className={cn("custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY)} data-super-view={view} data-needs-data={needsData || undefined}>
        {content}
      </div>

      {addCampusOpen ? <AddCampusModal onClose={() => setAddCampusOpen(false)} onCreated={refetch} /> : null}
      {appoint ? <AppointLeaderModal campuses={campuses} initial={appoint} onClose={() => setAppoint(null)} onSent={refetch} /> : null}
      {activity ? <AuditHistoryModal initialCampusId={activity.campusId} lockCampus onClose={() => setActivity(null)} /> : null}
      {promote ? <PromotePrincipalConfirm campus={promote.campus} onClose={() => setPromote(null)} onDone={refetch} /> : null}
      <ConfirmAction
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        description={confirm?.description || ""}
        confirmLabel={confirm?.confirmLabel || t("Confirm")}
        cancelLabel={t("Keep editing")}
        tone="danger"
        busy={confirmBusy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
      />
    </RoleShell>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** A failed dashboard load (not a paused plan): inline, with retry (R4). */
function DataError({ message, onRetry }: { message: string | null; onRetry: () => Promise<void> }) {
  const t = useUiText();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="sk-panel">
      <ErrorState
        offline={offline}
        title={offline ? undefined : t("The group console could not be loaded")}
        description={offline ? undefined : message ? t(message) : t("Your campuses and decisions did not load. Check your connection and try again.")}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * The paused plan (§2.1 note 2, §6.3): a payer gets the way back to Billing & plan; anyone else is told who can
 * renew it, by name, with no button (or the no-payer copy, §1.5). Never an email address.
 */
function SuspendedNotice({ onOpenBilling }: { onOpenBilling: () => void }) {
  const t = useUiText();
  const access = useConsoleAccess();
  const session = useShellSession();
  const payer = session?.institution?.subscriptionOwnerName ?? null;
  if (access.has("billing")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your plan is paused" description="Renew the subscription to reopen the group console for every campus. Your records are safe." icon={CreditCard}
          primaryAction={{ id: "open-billing", label: "Open Billing & plan", icon: CreditCard, onClick: onOpenBilling }} />
        <Alert tone="warning" live="off">{t("While the plan is paused, campuses cannot sign in to their consoles. Billing & plan stays open to you.")}</Alert>
      </div>
    );
  }
  const [before, after = ""] = t("Your plan is paused. {0} can renew it.").split("{0}");
  return (
    <section data-access-notice="" aria-live="polite" className="flex min-h-0 flex-1 flex-col items-center justify-center py-8 sm:py-12">
      <EmptyState icon={CirclePause} title={t("Your plan is paused")}
        description={payer ? <>{before}<bdi>{payer}</bdi>{after}</> : t("Contact SkooleeAI support to restore billing access.")} />
    </section>
  );
}

function Stat({ label, value, tip }: { label: string; value: number; tip?: string }) {
  const formatNumber = useFormatNumber();
  return (
    <div className="sk-panel p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-1">
        <p className="text-xs font-semibold text-ink-muted">{label}</p>
        {tip ? <InfoTip content={tip} /> : null}
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums text-ink-strong"><bdi>{formatNumber(value ?? 0)}</bdi></p>
    </div>
  );
}

/** Leadership chip for a campus card: held, invited or vacant — in words, never colour alone. */
function SeatChip({ label, slot }: { label: string; slot: any }) {
  const t = useUiText();
  const state = seated(slot) ? "held" : slot?.inviteId ? "invited" : "vacant";
  const Icon = state === "held" ? CheckCircle2 : AlertCircle;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-surface-subtle px-3 py-2.5">
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <Badge size="sm" variant={state === "held" ? "success" : state === "invited" ? "warning" : "danger"} className="min-w-0 gap-1">
        <Icon aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{state === "held" ? <bdi>{slot.fullName || slot.email}</bdi> : state === "invited" ? (slot?.fullName || slot?.email ? <>{t("Invited")}: <bdi>{slot.fullName || slot.email}</bdi></> : t("Invited")) : t("Vacant")}</span>
      </Badge>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

type AttentionItem = {
  id: string;
  tone: "warning" | "danger" | "info";
  icon: LucideIcon;
  title: string;
  body: string;
  /** Counts shown as chips under the body (e.g. what waits at a campus without an admin). */
  meta?: string[];
  primary?: { label: string; onClick: () => void };
  overflow?: { label: string; onClick: () => void }[];
};

/**
 * What waits at a campus for its campus admin (§2.6, M117): fee adjustments requested, applications awaiting a
 * decision and non-teaching leave pending. Read from the dashboard loader's optional `campus.waiting`; until the
 * loader serves it the item keeps its plain explanation (cross-package need recorded for P1).
 */
type CampusWaiting = { adjustments?: number; applications?: number; leave?: number };

function OverviewView({ data, onOpenCampus, onNavigate, onAppoint, onPromote, onResend, retiredNotice, onRefresh }: {
  data: any;
  onOpenCampus: (campus: Campus) => void;
  onNavigate: (view: string, tab?: string | null) => void;
  onAppoint: (campusId: string | null, role: LeaderRole) => void;
  onPromote: (campus: Campus) => void;
  onResend: (inviteId: string) => Promise<void>;
  retiredNotice: string | null;
  onRefresh: () => Promise<void>;
}) {
  const t = useUiText();
  const access = useConsoleAccess();
  const formatNumber = useFormatNumber();
  const [counts, setCounts] = useState<{ approvals: number; support: number; overrides: number } | null>(null);
  const [countsFailed, setCountsFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    setCounts(null); setCountsFailed(false);
    const json = (url: string) => fetch(url, { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
    void Promise.all([json("/api/navigation/counts"), json("/api/super/support-grants"), json("/api/group-policy?view=library")]).then(([countBody, grants, library]) => {
      if (!alive) return;
      if (!countBody || !grants || !library) { setCountsFailed(true); return; }
      // Same rule as GET /api/navigation/counts: a pending request, or emergency access still awaiting its review.
      const support = Array.isArray(grants?.data) ? grants.data.filter((grant: any) => grant.status === "pending" || (grant.status === "active" && grant.emergencyReason && !grant.reviewedAt)).length : 0;
      const overrides = Array.isArray(library?.data?.pending) ? library.data.pending.length : 0;
      setCounts({ approvals: Number(countBody?.counts?.approvals ?? support + overrides), support, overrides });
    });
    return () => { alive = false; };
  }, [data]);

  const campuses: Campus[] = data.campuses ?? [];
  const items: AttentionItem[] = [];
  if (counts?.support) items.push({ id: "support", tone: "warning", icon: ShieldCheck, title: t("Support access requests ({0})", [formatNumber(counts.support)]), body: t("SkooleeAI support asked to access one of your campuses. Nothing happens until you approve."), primary: { label: t("Review"), onClick: () => onNavigate("approvals", "support") } });
  const tax = counts ? Math.max(0, counts.approvals - counts.support - counts.overrides) : 0;
  if (tax) items.push({ id: "tax", tone: "warning", icon: ClipboardList, title: t("Tax packages awaiting your sign-off ({0})", [formatNumber(tax)]), body: t("Your finance team prepared them. Invoices use them only after you sign off."), primary: { label: t("Review"), onClick: () => onNavigate("approvals", "tax") } });
  if (counts?.overrides) items.push({ id: "policy", tone: "info", icon: Shield, title: t("Policy override requests ({0})", [formatNumber(counts.overrides)]), body: t("Campuses asked for an exception to a group rule."), primary: { label: t("Review"), onClick: () => onNavigate("approvals", "policy") } });
  for (const campus of campuses) {
    const principal = seated(campus.principal) ? campus.principal : null;
    if (!seated(campus.admin)) {
      if (campus.admin?.inviteId) {
        items.push({ id: `admin-invited-${campus.id}`, tone: "info", icon: Mail, title: t("Campus admin invited at {0}", [campus.name]), body: t("Waiting for {0} to accept. Fee approvals, applications and campus setup wait until then.", [campus.admin.email]), primary: { label: t("Resend invitation"), onClick: () => void onResend(campus.admin.inviteId) } });
      } else {
        const waiting: CampusWaiting | undefined = campus.waiting;
        const total = waiting ? (waiting.adjustments ?? 0) + (waiting.applications ?? 0) + (waiting.leave ?? 0) : 0;
        items.push({
          id: `admin-${campus.id}`, tone: "danger", icon: AlertCircle,
          title: t("No campus admin at {0}", [campus.name]),
          body: !waiting
            ? t("Fee approvals, applications and campus setup wait until one is appointed.")
            : total > 0
              ? t("{0} items wait here for a campus admin.", [formatNumber(total)])
              : t("Nothing is waiting there yet; fee approvals, applications and campus setup start once one is appointed."),
          meta: waiting && total > 0 ? [
            t("Fee adjustments requested: {0}", [formatNumber(waiting.adjustments ?? 0)]),
            t("Applications awaiting a decision: {0}", [formatNumber(waiting.applications ?? 0)]),
            t("Leave requests pending: {0}", [formatNumber(waiting.leave ?? 0)]),
          ] : undefined,
          primary: { label: t("Appoint campus admin"), onClick: () => onAppoint(campus.id, "CAMPUS_ADMIN") },
          overflow: principal ? [{ label: t("Make {0} the campus admin", [principal.fullName || principal.email]), onClick: () => onPromote(campus) }] : undefined,
        });
      }
    }
    if (!seated(campus.principal) && !campus.principal?.inviteId) {
      items.push({ id: `principal-${campus.id}`, tone: "warning", icon: GraduationCap, title: t("No principal at {0}", [campus.name]), body: t("The campus admin runs timetable, exams and report cards until a principal is appointed."), primary: { label: t("Appoint principal"), onClick: () => onAppoint(campus.id, "PRINCIPAL") } });
    }
  }

  const plan = getPlanLimits(data.billing?.plan || "FREE").name;
  const creditsUsed = Number(data.billing?.aiCreditsUsed || 0);
  const creditsLimit = Number(data.billing?.aiCreditsLimit || 0);
  const groupFeatures = [
    { feature: "campus_comparison", label: t("Campus comparison"), placeholder: t("Optional academic year or term") },
    { feature: "weak_campuses", label: t("Campuses needing support"), placeholder: t("Support focus or threshold") },
    { feature: "ai_usage_by_campus", label: t("AI usage"), placeholder: t("Optional governance focus") },
    { feature: "fee_recovery_insights", label: t("Fee recovery"), placeholder: t("Optional date or campus focus") },
    { feature: "academic_trend_summary", label: t("Academic trends"), placeholder: t("Optional exam or term focus") },
  ];

  // Group setup is governance/readiness; campus administrators own classroom setup.
  // Keep one readiness entry so it does not compete with a second setup questionnaire.
  const { language } = useLocale();
  const groupCopy = language === "ar" ? { title: "إدارة جاهزية الفروع", body: "عيّن مسؤولي الفروع وراجع الجاهزية والسياسات المشتركة. يتولى كل مسؤول فرع إعداد الصفوف والطلاب والعمليات المحلية.", action: "مراجعة جاهزية الفروع" } : language === "ur" ? { title: "کیمپس کی تیاری کا انتظام", body: "کیمپس منتظم مقرر کریں اور تیاری اور مشترکہ پالیسیوں کا جائزہ لیں۔ ہر کیمپس کا منتظم اپنی کلاسیں، طلبہ اور مقامی امور ترتیب دیتا ہے۔", action: "کیمپس کی تیاری دیکھیں" } : { title: "Manage campus readiness", body: "Appoint campus administrators and review readiness and shared policies. Each campus administrator sets up their classes, students and local operations.", action: "Review campus readiness" };
  const aiWorkflows = access.has("ai") && access.has("schoolAi");
  const review = counts && counts.approvals > 0
    ? { id: "review-approvals", label: t("Review approvals ({0})", [formatNumber(counts.approvals)]), icon: ShieldCheck, onClick: () => onNavigate("approvals") }
    : undefined;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Decisions waiting on you and how every campus is doing."
        primaryAction={review}
        secondaryActions={[
          { id: "refresh-group", label: "Refresh", icon: RefreshCw, loading: refreshing, onClick: async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } } },
        ]}
        status={retiredNotice ? <Alert tone="info" compact live="off">{t(retiredNotice)}</Alert> : undefined}
      />

      {aiWorkflows && <FlagshipCard kind="ai-workflows" title={groupCopy.title} description={groupCopy.body} action={{ label: groupCopy.action, href: "/setup/readiness" }} tourAnchor="super.today.flagship-ai" />}

      <section data-tour="super.overview.attention" aria-labelledby="attention-title" className="sk-panel p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="attention-title" className="text-lg font-bold text-ink-strong">{t("Needs your attention")}</h2>
          {access.has("billing") ? (
            <Button variant="outline" size="sm" type="button" onClick={() => onNavigate("billing")} data-plan-chip>
              <CreditCard aria-hidden="true" />
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge size="sm" variant="neutral"><bdi>{plan}</bdi></Badge>
                <Badge size="sm" variant={data.billing?.status === "SUSPENDED" ? "danger" : data.billing?.status === "TRIAL" ? "warning" : "success"}>{t(data.billing?.status === "SUSPENDED" ? "Paused" : data.billing?.status === "TRIAL" ? "Trial" : "Active")}</Badge>
                {creditsLimit > 0 ? <Badge size="sm" variant="neutral" className="whitespace-nowrap">{t("AI credits: {0} of {1}", [formatNumber(creditsUsed), formatNumber(creditsLimit)])}</Badge> : null}
              </span>
              <span className="sr-only">{t("Manage plan")}</span>
            </Button>
          ) : null}
        </div>
        {countsFailed && <Alert tone="warning" compact>{t("Approval counts could not be loaded. Refresh to check pending decisions.")}</Alert>}
        {items.length === 0 && counts === null && !countsFailed ? <p role="status" className="text-sm text-ink-muted">{t("Checking pending decisions…")}</p> : items.length === 0 && !countsFailed ? (
          <EmptyState size="sm" icon={CheckCircle2} title={t("Nothing needs you right now")} description={t("Every campus has its leaders in post and no decisions are waiting.")} />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4" data-attention={item.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className={item.tone === "danger" ? "mt-0.5 text-status-error-text" : item.tone === "warning" ? "mt-0.5 text-status-warning-text" : "mt-0.5 text-primary"}>
                    <item.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-strong">{item.title}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{item.body}</p>
                    {item.meta?.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("Waiting at this campus")}>
                        {item.meta.map((entry) => <li key={entry}><Badge size="sm" variant="neutral">{entry}</Badge></li>)}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.primary ? <Button size="sm" type="button" onClick={item.primary.onClick}>{item.primary.label}</Button> : null}
                  {item.overflow?.length ? (
                    <Menu label="More actions" align="end"
                      trigger={<IconButton label={t("More actions")} variant="outline"><MoreHorizontal aria-hidden="true" /></IconButton>}
                      items={item.overflow.map((entry, index) => ({ id: `${item.id}-${index}`, label: entry.label, onSelect: entry.onClick }))} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NetworkOverview data={data} onSelectCampus={onOpenCampus} />

      <section id="network-insights" aria-labelledby="network-insights-title" className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-5 text-primary" />
          <h2 id="network-insights-title" className="text-lg font-bold text-ink-strong">{t("Network insights")}</h2>
        </div>
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="sk-panel p-4 sm:p-5"><AiActionPanel title={t("Ask about the network")} options={groupFeatures} compact onComplete={() => void onRefresh()} /></div>
          {data.aiInsights?.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {data.aiInsights.slice(0, 4).map((insight: any) => (
                <li key={insight.id} className="sk-panel min-w-0 p-4">
                  <p className="text-xs font-semibold text-primary">{t(String(insight.feature).replaceAll("_", " "))}</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-ink-strong" dir="auto">{insight.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sk-panel"><EmptyState size="sm" icon={Sparkles} title={t("No AI insights yet")} description={t("Campus comparisons, fee recovery and academic trend drafts appear here after you run one.")} /></div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── Campuses ────────────────────────────────────────────────────────────────

function CampusesView({ campuses, onOpen, onAdd, onActivity, onAppoint, onPromote, onSaved }: {
  campuses: Campus[];
  onOpen: (campus: Campus) => void;
  onAdd: () => void;
  onActivity: () => void;
  onAppoint: (campusId: string | null, role: LeaderRole) => void;
  onPromote: (campus: Campus) => void;
  onSaved: () => Promise<void>;
}) {
  const t = useUiText();
  const formatNumber = useFormatNumber();
  const [search, setSearch] = useState("");
  const [leadership, setLeadership] = useState("all");
  const filtered = campuses.filter(campus => {
    const matches = `${campus.name} ${campus.city ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matches && (leadership === "all" || leadership === "admin" && !seated(campus.admin) || leadership === "principal" && !seated(campus.principal));
  });
  return (
    <>
      <PageHeader
        title="Campuses"
        description="Open a campus to see its numbers and the people who run it."
        primaryAction={{ id: "add-campus", label: "Add campus", icon: Plus, onClick: onAdd }}
      />
      {campuses.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="campus-search" label={t("Search campuses")}><Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Campus name or city")} /></FormField>
        <FormField name="campus-leadership" label={t("Leadership coverage")}><Select value={leadership} onChange={event => setLeadership(event.target.value)}>
          <option value="all">{t("All campuses")}</option><option value="admin">{t("Needs a campus admin")}</option><option value="principal">{t("Needs a principal")}</option>
        </Select></FormField>
        <p className="text-sm text-ink-muted sm:col-span-2" role="status">{t("Showing {0} of {1} campuses", [formatNumber(filtered.length), formatNumber(campuses.length)])}</p>
      </div>}
      {campuses.length === 0 ? (
        <div className="sk-panel">
          <EmptyState icon={Building2} title={t("No campuses yet")} description={t("Add the first campus, then appoint its campus admin and principal.")}
            action={<Button type="button" onClick={onAdd}><Plus aria-hidden="true" />{t("Add campus")}</Button>} />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((campus) => {
            const vacant = !seated(campus.admin) && !campus.admin?.inviteId;
            const principal = seated(campus.principal) ? campus.principal : null;
            return (
              <li key={campus.id} className="sk-panel flex min-w-0 flex-col p-5" data-campus-card={campus.id}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-ink-strong"><bdi>{campus.name}</bdi></h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-subtle"><MapPin aria-hidden="true" className="size-3.5 shrink-0" /><bdi className="truncate">{campus.city || "—"}</bdi></p>
                  </div>
                  <Building2 aria-hidden="true" className="size-6 shrink-0 text-primary" />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[["Students", campus.studentCount], ["Classes", campus.classCount], ["Teachers", campus.teacherCount]].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-surface-subtle px-2 py-2.5">
                      <dt className="truncate text-2xs font-semibold text-ink-subtle">{t(label)}</dt>
                      <dd className="mt-0.5 text-base font-bold tabular-nums text-ink-strong"><bdi>{formatNumber(Number(value ?? 0))}</bdi></dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 space-y-2">
                  <SeatChip label={t("Campus admin")} slot={campus.admin} />
                  <SeatChip label={t("Principal")} slot={campus.principal} />
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                  {vacant ? (
                    <span className="flex items-center gap-2">
                      <Button size="sm" type="button" onClick={() => onAppoint(campus.id, "CAMPUS_ADMIN")}><UserPlus aria-hidden="true" />{t("Appoint campus admin")}</Button>
                      {principal ? (
                        <Menu label="More actions" align="start"
                          trigger={<IconButton label={t("More actions")} variant="outline"><MoreHorizontal aria-hidden="true" /></IconButton>}
                          items={[{ id: "promote", label: t("Make {0} the campus admin", [principal.fullName || principal.email]), onSelect: () => onPromote(campus) }]} />
                      ) : null}
                    </span>
                  ) : <span />}
                  <Button variant="outline" size="sm" type="button" onClick={() => onOpen(campus)} aria-label={t("Open {0}", [campus.name])}>
                    {t("Open")}<ArrowRight aria-hidden="true" className="rtl:rotate-180" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {campuses.length > 0 && filtered.length === 0 && <EmptyState title={t("No matching campuses")} description={t("Try another name, city or leadership filter.")} action={<Button variant="outline" onClick={() => { setSearch(""); setLeadership("all"); }}>{t("Clear filters")}</Button>} />}
      {campuses.length > 0 ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" type="button" onClick={onActivity}><History aria-hidden="true" />{t("Activity log")}</Button>
        </div>
      ) : null}
      {/* M17: an archived campus is restored from here (its record keeps everything it held). */}
      <InstitutionSettingsPanel section="archived" onSaved={() => void onSaved()} />
    </>
  );
}

function CampusDetail({ campus, onBack, onActivity, onAppoint, onPromote, onResend, onRevoke, onCancelInvite, onSaved }: {
  campus: Campus;
  onBack: () => void;
  onActivity: () => void;
  onAppoint: (campusId: string | null, role: LeaderRole) => void;
  onPromote: (campus: Campus) => void;
  onResend: (inviteId: string) => Promise<void>;
  onRevoke: (userId: string, role: LeaderRole, campusName: string) => void;
  onCancelInvite: (inviteId: string) => void;
  onSaved: () => Promise<void>;
}) {
  const t = useUiText();
  const access = useConsoleAccess();
  const [editRequest, setEditRequest] = useState(0);
  const [archiveRequest, setArchiveRequest] = useState(0);
  const vacant = !seated(campus.admin) && !campus.admin?.inviteId;
  const principal = seated(campus.principal) ? campus.principal : null;
  const edit = { id: "edit-campus", label: "Edit campus", icon: Pencil, onClick: () => setEditRequest((n) => n + 1) };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" className="rtl:rotate-180" />{t("Back to all campuses")}</Button>
      <PageHeader
        eyebrow="Campus"
        // The campus name is data, never a UI key (R7): rendered as given, isolated for RTL.
        title={<bdi>{campus.name}</bdi>}
        description={t("{0} · its record, its leaders and its numbers. Day-to-day work happens in the campus console.", [campus.city || "—"])}
        primaryAction={vacant ? { id: "appoint-admin", label: "Appoint campus admin", icon: UserPlus, onClick: () => onAppoint(campus.id, "CAMPUS_ADMIN") } : edit}
        // Activity log is reference, not work: it sits last so it falls into the overflow menu when the header is busy.
        secondaryActions={[
          ...(vacant ? [edit] : []),
          ...(vacant && principal ? [{ id: "promote", label: t("Make {0} the campus admin", [principal.fullName || principal.email]), onClick: () => onPromote(campus) }] : []),
          { id: "activity", label: "Activity log", icon: History, onClick: onActivity },
        ]}
        status={vacant ? <Alert tone="warning" compact live="off">{t("No campus admin is appointed. Fee approvals, applications and campus setup wait until one is.")}</Alert> : undefined}
      />

      <section data-tour="super.campus.leadership" aria-labelledby="campus-leadership-title" className="space-y-3">
        <h2 id="campus-leadership-title" className="text-lg font-bold text-ink-strong">{t("Who runs this campus")}</h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ManagementCard
            title="Campus admin"
            icon={Shield}
            description="Runs campus operations: students, staff, fees approvals and campus setup."
            user={campus.admin}
            emptyLabel="Appoint campus admin"
            onAdd={() => onAppoint(campus.id, "CAMPUS_ADMIN")}
            onRemove={(id) => onRevoke(id, "CAMPUS_ADMIN", campus.name)}
            onResendInvite={(id) => void onResend(id)}
            onCancelInvite={onCancelInvite}
          />
          <ManagementCard
            title="Principal"
            icon={GraduationCap}
            description="Leads academics: timetable, exams, results and report cards."
            user={campus.principal}
            emptyLabel="Appoint principal"
            onAdd={() => onAppoint(campus.id, "PRINCIPAL")}
            onRemove={(id) => onRevoke(id, "PRINCIPAL", campus.name)}
            onResendInvite={(id) => void onResend(id)}
            onCancelInvite={onCancelInvite}
          />
        </div>
      </section>

      <section aria-label={t("Campus numbers")} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("Students")} value={campus.studentCount} />
        <Stat label={t("Classes")} value={campus.classCount} />
        <Stat label={t("Teachers")} value={campus.teacherCount} />
        <Stat label={t("Pending invitations")} value={campus.pendingInvitations?.length ?? 0} tip={t("Staff invitations for this campus that have not been accepted yet. The campus admin manages staff invitations.")} />
      </section>

      <section aria-labelledby="campus-record-title" className="space-y-3">
        <h2 id="campus-record-title" className="text-lg font-bold text-ink-strong">{t("Campus record")}</h2>
        <InstitutionSettingsPanel section="campus" campusId={campus.id} readOnly requestEdit={editRequest} requestArchive={archiveRequest} onSaved={() => void onSaved()} />
      </section>

      <section aria-labelledby="campus-fees-title" className="space-y-3">
        <div>
          <h2 id="campus-fees-title" className="text-lg font-bold text-ink-strong">{t("Fees at this campus")}</h2>
          <p className="text-sm text-ink-muted">{t("Read only. The campus collects, adjusts and approves its own fees.")}</p>
        </div>
        <FeeOverviewTab key={campus.id} campusId={campus.id} />
      </section>

      {/* §4.5.3: the destructive action is the detail's footer, start side, never a coloured primary; it opens a
          confirmation that previews what the campus still holds (SKO-389). Only the group console archives (G13). */}
      {access.has("groupConsole") ? (
        <footer aria-labelledby="campus-archive-title" className="flex flex-col items-start gap-3 border-t border-border-subtle pt-6">
          <div className="min-w-0">
            <h2 id="campus-archive-title" className="text-base font-bold text-ink-strong">{t("Archive this campus")}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">{t("It leaves the console and its people lose access. Its records stay in reports, and you can restore it from Campuses.")}</p>
          </div>
          <Button variant="outline" type="button" className="text-destructive" onClick={() => setArchiveRequest((n) => n + 1)}>
            <Archive aria-hidden="true" />{t("Archive campus")}
          </Button>
        </footer>
      ) : null}
    </>
  );
}

// ─── Approvals · People & access · Group standards · Settings ───────────────

function ApprovalsView({ tab, onTab }: { tab: (typeof APPROVAL_TABS)[number]; onTab: (tab: string | null) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Support access, tax sign-off and policy reviews waiting for you."
        secondaryActions={[{ id: "refresh", label: "Refresh", icon: RefreshCw, onClick: () => setRefreshKey((n) => n + 1) }]}
        tabs={<ViewTabs ariaLabel="Approvals" value={tab} onChange={onTab} items={[{ id: "support", label: "Support access" }, { id: "tax", label: "Tax sign-off" }, { id: "policy", label: "Policy reviews" }]} />}
      />
      <div key={`${tab}-${refreshKey}`} role="tabpanel">
        {tab === "support" ? <SupportApprovalsPanel /> : tab === "tax" ? <TaxPackages mode="approve" hideHeader /> : <GroupPolicy focus="reviews" />}
      </div>
    </>
  );
}

function AccessView({ tab, onTab, campuses, dataReady, dataGate, onAppoint, onPromote, onResend, onRevoke, onCancelInvite }: {
  tab: (typeof ACCESS_TABS)[number];
  onTab: (tab: string | null) => void;
  campuses: Campus[];
  dataReady: boolean;
  dataGate: (render: () => ReactNode, skeleton?: ReactNode) => ReactNode;
  onAppoint: (campusId: string | null, role: LeaderRole) => void;
  onPromote: (campus: Campus) => void;
  onResend: (inviteId: string) => Promise<void>;
  onRevoke: (userId: string, role: LeaderRole, campusName: string) => void;
  onCancelInvite: (inviteId: string) => void;
}) {
  const t = useUiText();
  // §4.4: the PageHeader owns "Export members"; the panel exports when this counter changes.
  const [exportRequest, setExportRequest] = useState(0);
  return (
    <>
      <PageHeader
        title="People & access"
        description="Campus leaders, who may manage members, and role permissions."
        primaryAction={tab === "leadership" && dataReady ? { id: "invite-leader", label: "Invite campus leader", icon: UserPlus, onClick: () => onAppoint(null, "CAMPUS_ADMIN") } : undefined}
        secondaryActions={tab === "members" ? [{ id: "export-members", label: "Export members", icon: Download, onClick: () => setExportRequest((n) => n + 1) }] : undefined}
        // §8.2: the staff concept is never "Members"; the tab lists everyone with an account (tab id stays `members`, §3.1).
        tabs={<ViewTabs ariaLabel="People & access" value={tab} onChange={onTab} items={[{ id: "leadership", label: "Campus leaders" }, { id: "members", label: "Everyone" }, { id: "permissions", label: "Role permissions" }]} />}
      />
      <div role="tabpanel">
        {tab === "members" ? <MembershipsPanel exportRequest={exportRequest} /> : tab === "permissions" ? <RolePermissionsPanel /> : dataGate(() => (
          campuses.length === 0 ? (
            <div className="sk-panel"><EmptyState icon={Users} title={t("No campuses yet")} description={t("Add a campus first; then appoint who runs it.")} /></div>
          ) : (
            <ul className="space-y-6">
              {campuses.map((campus) => (
                <li key={campus.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-ink-strong"><bdi>{campus.name}</bdi></h2>
                    {!seated(campus.admin) && !campus.admin?.inviteId && seated(campus.principal) ? (
                      <Button variant="outline" size="sm" type="button" onClick={() => onPromote(campus)}>{t("Make {0} the campus admin", [campus.principal.fullName || campus.principal.email])}</Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ManagementCard title="Campus admin" icon={Shield} description="Runs campus operations: students, staff, fees approvals and campus setup." user={campus.admin} emptyLabel="Appoint campus admin"
                      onAdd={() => onAppoint(campus.id, "CAMPUS_ADMIN")} onRemove={(id) => onRevoke(id, "CAMPUS_ADMIN", campus.name)} onResendInvite={(id) => void onResend(id)} onCancelInvite={onCancelInvite} />
                    <ManagementCard title="Principal" icon={GraduationCap} description="Leads academics: timetable, exams, results and report cards." user={campus.principal} emptyLabel="Appoint principal"
                      onAdd={() => onAppoint(campus.id, "PRINCIPAL")} onRemove={(id) => onRevoke(id, "PRINCIPAL", campus.name)} onResendInvite={(id) => void onResend(id)} onCancelInvite={onCancelInvite} />
                  </div>
                </li>
              ))}
            </ul>
          )
        ))}
      </div>
    </>
  );
}

function StandardsView({ tab, onTab }: { tab: (typeof STANDARD_TABS)[number]; onTab: (tab: string | null) => void }) {
  // §4.4: "New template version" is the templates tab's primary; each press starts a new draft in the panel, which
  // drops its own hero under this one PageHeader (§4.3, `hideHeading`).
  const [createRequest, setCreateRequest] = useState(0);
  return (
    <>
      <PageHeader
        title="Group standards"
        description="Curriculum templates and group policy every campus follows."
        primaryAction={tab === "templates" ? { id: "new-template-version", label: "New template version", icon: Plus, onClick: () => setCreateRequest((n) => n + 1) } : undefined}
        tabs={<ViewTabs ariaLabel="Group standards" value={tab} onChange={onTab} items={[{ id: "templates", label: "Curriculum templates" }, { id: "policies", label: "Group policy" }]} />}
      />
      <div role="tabpanel">{tab === "templates" ? <AcademicModelPanel templatesOnly hideHeading requestCreate={createRequest} /> : <GroupPolicy focus="library" />}</div>
    </>
  );
}

function SettingsView({ tab, onTab, userId, onSaved }: { tab: string | null; onTab: (tab: string | null) => void; userId: string | null; onSaved: () => Promise<void> }) {
  const t = useUiText();
  // The setup checklist is offered until the school's readiness is approved (§3.1).
  const [setupOpen, setSetupOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/readiness", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).then((body) => {
      if (alive && body?.lead && body.readiness?.status === "READY") setSetupOpen(false);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const active = pickTab(SETTINGS_TABS, tab, (id) => id !== "setup" || setupOpen);
  const items = useMemo(() => [
    { id: "profile", label: "School profile" },
    { id: "locale", label: "Language and region" },
    { id: "identity", label: "Sign-in and roster" },
    { id: "integrations", label: "Integrations" },
    { id: "data", label: "Data and privacy" },
    { id: "activity", label: "Activity log" },
    { id: "setup", label: "Setup checklist", hidden: !setupOpen },
  ], [setupOpen]);

  // §4.4b: Settings › Activity log exports from the PageHeader; the panel exports when this counter changes.
  const [exportRequest, setExportRequest] = useState(0);

  // §4.4b: the form tabs (Language and region, Data and privacy) save through one sticky Save that appears once the
  // tab has unsaved changes; the panel reports them (`onDirtyChange`) and runs each new Save once (`command`). A
  // command belongs to the tab that sent it, so another tab never runs it. Profile edits save in their reviewed
  // dialog, Integrations creates connections from its own form, Sign-in has no form-level save.
  const saveable = active === "locale" || active === "data";
  const [saveCommand, setSaveCommand] = useState<{ tab: string; id: "save"; nonce: number } | null>(null);
  const [saveState, setSaveState] = useState({ dirty: false, saving: false });
  const reportSave = useCallback((dirty: boolean, saving: boolean) => {
    setSaveState((current) => (current.dirty === dirty && current.saving === saving ? current : { dirty, saving }));
  }, []);
  const command = saveCommand?.tab === active ? saveCommand : null;

  let panel: ReactNode;
  if (active === "locale") panel = <LocaleSettingsPanel scope="school" hideSave command={command} onDirtyChange={reportSave} />;
  else if (active === "identity") panel = <IdentityAdmin />;
  else if (active === "integrations") panel = <Integrations />;
  else if (active === "data") panel = userId ? <DataLifecyclePanel userId={userId} hideSave command={command} onDirtyChange={reportSave} /> : <SkeletonCards count={2} label={t("Loading")} />;
  else if (active === "activity") panel = <AuditHistoryPanel exportRequest={exportRequest} />;
  else if (active === "setup") panel = <ReadinessHome />;
  else panel = <InstitutionSettingsPanel section="school" onSaved={() => void onSaved()} />;

  return (
    <>
      <PageHeader
        title="Settings"
        description="School profile, language, sign-in, integrations, data and activity."
        secondaryActions={active === "activity" ? [{ id: "export-activity", label: "Export CSV", icon: Download, onClick: () => setExportRequest((n) => n + 1) }] : undefined}
        tabs={<ViewTabs ariaLabel="Settings" value={active} onChange={onTab} items={items} />}
      />
      <div role="tabpanel">{panel}</div>
      {saveable ? (
        <StickySaveBar
          dirtyCount={saveState.dirty ? 1 : 0}
          saving={saveState.saving}
          onSave={() => setSaveCommand({ tab: active, id: "save", nonce: Date.now() })}
          saveLabel={t("Save")}
          label={t("You have unsaved changes.")}
          hint={active === "locale" ? t("Save shows the preview first, then applies it.") : undefined}
        />
      ) : null}
    </>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

/** M18: appointing a campus admin can hand them member rights in the same step (default on, needs MFA). */
function AppointLeaderModal({ campuses, initial, onClose, onSent }: {
  campuses: Campus[];
  initial: { campusId: string | null; role: LeaderRole };
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const t = useUiText();
  const access = useConsoleAccess();
  const mfa = !access.ready || access.has("mfaVerified");
  const [campusId, setCampusId] = useState(initial.campusId ?? campuses[0]?.id ?? "");
  const [role, setRole] = useState<LeaderRole>(initial.role);
  const [email, setEmail] = useState("");
  const [manage, setManage] = useState(mfa);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const campus = campuses.find((item) => item.id === campusId);

  const submit = async () => {
    if (!isValidEmail(email.trim())) { setError(t("Enter a valid email address, like name@school.edu.")); return; }
    if (!campusId) return;
    setBusy(true); setError(null);
    try {
      const result = await inviteStaff({ email: email.trim(), role, campusId, canManageMemberships: role === "CAMPUS_ADMIN" && manage && mfa }, { returnDeliveryStatus: true });
      toast.success(t("Invitation saved"));
      setLink(result.inviteLink || "");
      setDeliveryFailed(result.deliveryStatus === "failed");
      await onSent();
      if (!result.inviteLink) onClose();
    } catch (failure) {
      setError(friendlyErrorMessage(failure, t("The invitation could not be sent. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  if (link) {
    return (
      <Modal title={t("Invitation saved")} icon={Mail} size="sm" onClose={onClose}
        footer={<div className="flex justify-end"><Button variant="outline" type="button" onClick={onClose}>{t("Close")}</Button></div>}>
        <div className="space-y-4">
          {deliveryFailed && <Alert tone="warning">{t("Invitation saved, but email was not delivered. Share the link or resend the invitation from the campus.")}</Alert>}
          <p className="text-sm text-ink">{t("The invited person sets their own password when they accept. Share this link if the email does not arrive; it expires in 48 hours.")}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-xl border border-border-subtle bg-surface-subtle p-3 font-mono text-xs text-ink">{link}</div>
            <Button variant="outline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopyFailed(false); toast.success(t("Link copied to clipboard")); } catch { setCopyFailed(true); } }}>{t("Copy")}</Button>
          </div>
          {copyFailed && <Alert tone="warning">{t("The link could not be copied. Select it and copy it manually.")}</Alert>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={role === "CAMPUS_ADMIN" ? t("Appoint campus admin") : t("Appoint principal")}
      subtitle={campus ? <bdi>{campus.name}</bdi> : undefined}
      icon={UserPlus}
      size="sm"
      dirty={Boolean(email.trim()) && !busy}
      onClose={() => { if (!busy) onClose(); }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" disabled={busy} onClick={onClose}>{t("Cancel")}</Button>
          <Button type="button" loading={busy} disabled={busy || !campusId} onClick={() => void submit()}>{t("Send invitation")}</Button>
        </div>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {initial.campusId ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="appoint-campus" label={t("Campus")} required>
              <Select value={campusId} onChange={(event) => setCampusId(event.target.value)}>
                {campuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </FormField>
            <FormField name="appoint-role" label={t("Role")}>
              <Select value={role} onChange={(event) => setRole(event.target.value as LeaderRole)}>
                <option value="CAMPUS_ADMIN">{t("Campus admin")}</option>
                <option value="PRINCIPAL">{t("Principal")}</option>
              </Select>
            </FormField>
          </div>
        )}
        <FormField name="appoint-email" label={t("Work email")} required hint={t("Use the address this person signs in with.")} error={error ?? undefined}>
          <InputGroup surfaceClassName="bg-surface-subtle">
            <Mail aria-hidden="true" data-field-affix="start" className="size-4 text-ink-subtle" />
            <Input type="email" dir="ltr" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} className="w-full" />
          </InputGroup>
        </FormField>
        {role === "CAMPUS_ADMIN" ? (
          <div className="space-y-1">
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-ink">
              <span>{t("Can invite and remove staff on this campus")}</span>
              <Switch checked={manage && mfa} disabled={!mfa} onChange={(event) => setManage(event.target.checked)} />
            </label>
            <p className="text-xs text-ink-muted">{mfa ? t("You can change this later in People & access.") : t("Turn on two-step sign-in on your account to hand over member rights. You can do it later in People & access.")}</p>
          </div>
        ) : null}
        <Alert tone="info" live="off" compact>{t("An invitation email is sent. They set their own password when they accept.")}</Alert>
      </form>
    </Modal>
  );
}

/** §2.6 / M117: a campus without a campus admin, whose principal takes the seat (one PUT /api/memberships). */
function PromotePrincipalConfirm({ campus, onClose, onDone }: { campus: Campus; onClose: () => void; onDone: () => Promise<void> }) {
  const t = useUiText();
  const access = useConsoleAccess();
  const [busy, setBusy] = useState(false);
  const principal = campus.principal;
  const name = principal?.fullName || principal?.email || "";
  const confirm = async (reason?: string) => {
    setBusy(true);
    try {
      const list = await fetch("/api/memberships", { cache: "no-store" }).then((response) => response.json());
      const member = (list.members ?? []).find((item: any) => item.id === principal.id);
      if (!member) throw new Error(t("This person's membership could not be found. Refresh and try again."));
      const response = await fetch("/api/memberships", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.id, role: "CAMPUS_ADMIN", campusId: campus.id, isActive: true,
          canPurchaseSubscription: false,
          // Member rights need two-step sign-in on the server (G7); without it the seat is filled without them.
          canManageMemberships: access.has("mfaVerified"),
          expectedVersion: member.accessVersion, reviewed: true, reason,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error);
      toast.success(t("{0} is now the campus admin at {1}.", [name, campus.name]));
      onClose();
      await onDone();
    } catch (failure) {
      toast.error(friendlyErrorMessage(failure, t("That change could not be saved. Please try again.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmAction
      open
      tone="warning"
      title={t("Make {0} the campus admin?", [name])}
      description={t("{0} moves from principal to campus admin at {1}. They keep running academics until you appoint a principal, and are signed out to pick up the new access.", [name, campus.name])}
      confirmLabel={t("Make campus admin")}
      cancelLabel={t("Keep editing")}
      requireReason={{ label: t("Why this change?"), minLength: 10 }}
      busy={busy}
      onCancel={onClose}
      onConfirm={(reason?: string) => void confirm(reason)}
    />
  );
}

const EMPTY_CAMPUS = { name: "", city: "", address: "", phone: "", email: "", website: "", principalName: "", board: "", adminEmail: "" };

function AddCampusModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const t = useUiText();
  const [form, setForm] = useState({ ...EMPTY_CAMPUS, regId: generateRegId(), autoId: true });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY_CAMPUS, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<Awaited<ReturnType<typeof addCampus>> | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  // The school's country picks the boards a new campus is offered.
  const [country, setCountry] = useState("");
  useEffect(() => { void getSchoolCountry().then(setCountry).catch(() => undefined); }, []);
  const set = (key: keyof typeof form, value: string | boolean) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const dirty = Object.keys(EMPTY_CAMPUS).some((key) => String(form[key as keyof typeof EMPTY_CAMPUS]).trim());

  const validate = (tr: Tr) => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = tr("Enter the campus name.");
    if (!form.city.trim()) next.city = tr("Enter the city.");
    if (form.email.trim() && !isValidEmail(form.email.trim())) next.email = tr("Enter a valid campus email, like office@school.edu.");
    const digits = form.phone.replace(/\D/g, "");
    if (form.phone.trim() && digits.length < 7) next.phone = tr("The phone number is too short. Enter at least 7 digits.");
    if (form.phone.trim() && digits.length > 15) next.phone = tr("The phone number is too long. Enter no more than 15 digits.");
    if (form.adminEmail.trim() && !isValidEmail(form.adminEmail.trim())) next.adminEmail = tr("Enter a valid email for the campus admin, like name@school.edu.");
    return next;
  };

  const submit = async () => {
    const found = validate(t);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setSaveError(null);
    try {
      const result = await addCampus({
        name: form.name, city: form.city, address: form.address, phone: form.phone, email: form.email, website: form.website,
        principalName: form.principalName, board: form.board, adminEmail: form.adminEmail,
        regId: form.autoId ? form.regId || undefined : form.regId,
      });
      setCreated(result);
      await onCreated();
    } catch (failure) {
      setSaveError(friendlyErrorMessage(failure, t("The campus could not be created. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof EMPTY_CAMPUS, label: string, options: { required?: boolean; type?: "text" | "email" | "tel"; hint?: string; placeholder?: string; span?: boolean } = {}) => (
    <FormField name={`campus-${key}`} label={label} required={options.required} hint={options.hint} error={errors[key]} className={options.span ? "md:col-span-2" : undefined}>
      <Input type={options.type ?? "text"} dir={options.type && options.type !== "text" ? "ltr" : "auto"} value={String(form[key])} placeholder={options.placeholder} onChange={(event) => set(key, event.target.value)} className="w-full" />
    </FormField>
  );

  if (created) return <Modal title={t("Campus created")} icon={CheckCircle2} size="sm" onClose={onClose} footer={<Button onClick={onClose}>{t("Done")}</Button>}>
    <div className="space-y-4">
      <p><bdi>{created.campus.name}</bdi></p>
      {created.invitation?.needsAttention ? <Alert tone="warning">{t("The campus was created, but its admin invitation needs attention. Open the campus to appoint the admin or resend the saved invitation.")}</Alert> : <Alert tone="success">{t("The campus is ready. Appoint its leaders and review campus readiness next.")}</Alert>}
      {created.invitation?.link && <>
        <p className="text-sm">{t("Share this invitation link with the campus admin if the email does not arrive.")}</p>
        <Input aria-label={t("Invitation link")} readOnly dir="ltr" value={created.invitation.link} />
        <Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(created.invitation!.link); setCopyFailed(false); toast.success(t("Link copied to clipboard")); } catch { setCopyFailed(true); } }}>{t("Copy")}</Button>
        {copyFailed && <Alert tone="warning">{t("The link could not be copied. Select it and copy it manually.")}</Alert>}
      </>}
    </div>
  </Modal>;

  return (
    <Modal
      title={t("Add campus")}
      subtitle={t("Only the campus name and city are required.")}
      icon={Building2}
      size="md"
      dirty={dirty && !busy}
      onClose={() => { if (!busy) onClose(); }}
      footer={
        <div className="space-y-3">
          {saveError && <Alert tone="danger">{saveError}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" disabled={busy} onClick={onClose}>{t("Cancel")}</Button>
          <Button type="button" loading={busy} disabled={busy} onClick={() => void submit()}>{t("Add campus")}</Button>
        </div>
        </div>
      }
    >
      <form className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {field("name", t("Campus name"), { required: true, placeholder: t("e.g. South Campus") })}
        {field("city", t("City"), { required: true, placeholder: t("e.g. Islamabad") })}
        {field("address", t("Address"), { span: true, placeholder: t("Full street address") })}
        {field("phone", t("Phone"), { type: "tel", hint: t("Include the country code. 7 to 15 digits."), placeholder: "+92 300 0000000" })}
        {field("email", t("Campus email"), { type: "email", placeholder: "campus@school.edu.pk" })}
        {field("website", t("Website"), { placeholder: t("Website (optional)") })}
        {field("principalName", t("Head of campus"), { placeholder: t("Principal / director name") })}
        <FormField name="campus-board" id="campus-board" label={t("Board")}>
          <BoardSelect id="campus-board" country={country} value={form.board} onChange={(board) => set("board", board)} nameLabel={t("Board name")} namePlaceholder={t("Type your board or curriculum")} surfaceClassName="bg-muted" />
        </FormField>
        {field("adminEmail", t("Campus admin email"), { type: "email", hint: t("Optional. An invitation is sent; they set their own password."), placeholder: "name@school.edu.pk" })}
        <div className="rounded-3xl border border-border-subtle bg-surface-subtle p-4 sm:p-5 md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Label htmlFor="campus-key">{t("Campus key")}</Label>
              <InfoTip content={t("A short code that identifies this campus. Auto creates one for you; Manual lets you type your own.")} />
            </div>
            <Button aria-pressed={form.autoId} variant="choice" size="sm" type="button" onClick={() => setForm((current) => ({ ...current, autoId: !current.autoId, regId: current.autoId ? "" : generateRegId() }))}>
              {form.autoId ? t("Auto") : t("Manual")}
            </Button>
          </div>
          <Input id="campus-key" type="text" dir="ltr" readOnly={form.autoId} aria-describedby="campus-key-note" className="w-full text-center tabular-nums" value={form.regId}
            placeholder={form.autoId ? "KEY-AUTO" : "BR-XXXX"} onChange={(event) => setForm((current) => ({ ...current, regId: event.target.value.toUpperCase() }))} />
          <p id="campus-key-note" className="mt-3 text-xs leading-relaxed text-ink-muted">{t("The new campus inherits the group's current academic session and working week. Its campus admin can adjust either in Campus setup.")}</p>
        </div>
      </form>
    </Modal>
  );
}
