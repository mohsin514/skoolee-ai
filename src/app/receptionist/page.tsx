"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, Camera, CheckCircle2, ClipboardList, DoorOpen, Inbox, LogIn, Mail, MessageSquareWarning, Phone, PhoneCall, Plus, ScanLine, ShieldAlert, ShieldCheck, Download, Award, UserCheck, type LucideIcon } from "lucide-react";
import { DeskPill, DeskRowIcon, deskRow } from "@/components/ui/desk";
import { cn } from "@/lib/utils";
import { callbackDueByToday } from "@/lib/front-desk/callback-day";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { getOperationsStaffDashboardData } from "@/app/actions/dashboard";
import { RoleShell } from "@/components/role-dashboard";
import { useConsoleView } from "@/components/nav/useConsoleView";
import { ConsoleError, ConsolePage, ConsoleSkeleton } from "@/components/operations/console-page";
import { ViewTabs } from "@/components/ui/view-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { VisitorRegister } from "@/components/operations/visitor-register";
import { ComplaintsDesk } from "@/components/operations/complaints-desk";
import { PhoneCallLog } from "@/components/operations/phone-call-log";
import { PostalRegister } from "@/components/operations/postal-register";
import { CertificatesDesk } from "@/components/operations/certificates-desk";
import { PickupGate } from "@/components/pickup/pickup";
import { AdmissionsDesk } from "@/components/admissions/admissions-desk";
import { AdmissionQueriesPanel } from "@/components/shared-admin/index";
import { MyLeavePanel } from "@/components/leave/my-leave";
import { FrontDeskOverview, type FrontDeskSummary } from "@/components/insights";
import type { PanelCommand } from "@/components/fees/fee-types";
import { SetupPrompt } from "@/components/ai-workflows/setup-prompt";

/**
 * Front desk (RECEPTIONIST) — role-ux §3 `receptionist`, §3.1, §4.4.
 *
 * Visitors, pickup at the gate, admissions intake, complaints, calls, post and documents. The receptionist moves
 * applications forward and issues documents from approved templates; offers, enrolment, form design and template
 * approval belong to the campus admin (G37, G38a), so those controls are not offered here. Navigation, the eyebrow,
 * mobile slots and My leave (account menu) come from the registry. A load failure stays in the console with a
 * retry (M88).
 */

import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { usePrivateDashboardData } from "@/lib/auth/use-private-dashboard-data";

type OpsData = Awaited<ReturnType<typeof getOperationsStaffDashboardData>>;

const ADMISSION_TABS = [
  { id: "enquiries", label: "Enquiries" },
  { id: "applications", label: "Applications" },
];

/** One-sentence descriptions for views whose registry leaf has no `summary` (EN UI keys). */
const DESCRIPTIONS: Record<string, string> = {
  visitors: "Sign visitors in and out; anyone still on site is listed first.",
  pickup: "Check the family's pickup code and the collector's identity before releasing a child; anything unclear goes to your campus admin.",
  complaints: "Record complaints as they are reported; confidential concerns go straight to your campus admin.",
  "phone-calls": "Log calls and the callbacks you owe until each has an outcome.",
  postal: "Track post and couriers until each item is handed over.",
  certificates: "Issue certificates and ID cards from templates your campus admin has approved.",
};

function campusLine(data: OpsData) {
  return `${data.campusName}${data.campusCity ? ` · ${data.campusCity}` : ""}`;
}

export default function ReceptionistPage() {
  const tr = useUiText();
  const { view, tab, setView, setTab, retiredNotice } = useConsoleView("receptionist");
  const { data, error: failed, refetch: load } = usePrivateDashboardData(getOperationsStaffDashboardData);

  return (
    <RoleShell
      console="receptionist"
      activeView={view}
      onSelectView={setView}
      userName={data?.userName || tr("Receptionist")}
      avatarSeed={data?.userEmail}
      logoUrl={data?.logoUrl}
      dashboardHref="/receptionist"
    >
      {failed && !data ? (
        <ConsoleError title="The front desk could not be loaded" onRetry={() => void load()} />
      ) : !data ? (
        <ConsoleSkeleton label="Loading the front desk" cards={3} />
      ) : (
        <ReceptionWorkspace data={data} view={view} tab={tab} setView={setView} setTab={setTab} retiredNotice={retiredNotice} />
      )}
    </RoleShell>
  );
}

function ReceptionWorkspace({ data, view, tab, setView, setTab, retiredNotice }: {
  data: OpsData;
  view: string;
  tab: string | null;
  setView: (view: string, tab?: string | null) => void;
  setTab: (tab: string | null) => void;
  retiredNotice: string | null;
}) {
  const [command, setCommand] = useState<PanelCommand | null>(null);
  // Published admission forms (reported by AdmissionsDesk); "Enter an application" waits for one.
  const [publishedForms, setPublishedForms] = useState<number | null>(null);
  const [certificateReady, setCertificateReady] = useState(false);
  const run = (id: string, target?: string) => {
    if (target && target !== view) setView(target);
    setCommand({ id, nonce: Date.now() });
  };
  useEffect(() => { setCommand(null); }, [view]);

  switch (view) {
    case "visitors":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="visitors"
          icon={UserCheck}
          description={DESCRIPTIONS.visitors}
          captureDesk
          primaryAction={{ id: "check-in", label: "Check in visitor", icon: LogIn, onClick: () => run("check-in") }}
          secondaryActions={[
            { id: "refuse", label: "Record refused visitor", icon: ShieldAlert, onClick: () => run("refuse") },
            { id: "export", label: "Export", icon: Download, onClick: () => run("export") },
          ]}
        >
          <VisitorRegister hideHeader command={command} />
        </ConsolePage>
      );
    case "pickup":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="pickup"
          icon={ShieldCheck}
          description={DESCRIPTIONS.pickup}
          captureDesk
          primaryAction={{ id: "check-code", label: "Check code", icon: ScanLine, onClick: () => run("check-code") }}
          secondaryActions={[{ id: "scan-photo", label: "Scan photo", icon: Camera, onClick: () => run("scan-photo") }]}
        >
          <PickupGate mode="gate" hideHeader command={command} />
        </ConsolePage>
      );
    case "admissions": {
      // Intake only: enquiries without "Convert", applications without the form designer or decisions (M79, F29).
      // Each tab's create action is the one PageHeader primary (role-ux §4.4 Admissions); the panels render no
      // header of their own. Switching tab drops a pending command so the other tab never replays it.
      const section = tab === "applications" ? "applications" : "enquiries";
      return (
        <ConsolePage
          consoleId="receptionist"
          view="admissions"
          icon={ClipboardList}
          primaryAction={section === "enquiries"
            ? { id: "new-enquiry", label: "New enquiry", icon: Plus, onClick: () => run("new-enquiry") }
            : {
                id: "enter-application",
                label: "Enter an application",
                icon: Plus,
                onClick: () => run("enter-application"),
                disabled: publishedForms === 0,
                disabledReason: "Your campus admin publishes an admission form before applications can be entered.",
              }}
          secondaryActions={section === "enquiries" ? [{ id: "export", label: "Export", icon: Download, onClick: () => run("export") }] : []}
          tabs={<ViewTabs ariaLabel="Admissions sections" value={section} onChange={(id) => { setCommand(null); setTab(id); }} items={ADMISSION_TABS} />}
        >
          {section === "enquiries"
            ? <AdmissionQueriesPanel headerless command={command} />
            : <AdmissionsDesk section="applications" showForms={false} canDecide={false} entryInHeader command={command} onPublishedForms={setPublishedForms} />}
        </ConsolePage>
      );
    }
    case "complaints":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="complaints"
          icon={MessageSquareWarning}
          description={DESCRIPTIONS.complaints}
          primaryAction={{ id: "record-complaint", label: "Record complaint", icon: Plus, onClick: () => run("record-complaint") }}
        >
          <ComplaintsDesk hideHeader command={command} />
        </ConsolePage>
      );
    case "phone-calls":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="phone-calls"
          icon={PhoneCall}
          description={DESCRIPTIONS["phone-calls"]}
          primaryAction={{ id: "log-call", label: "Log call", icon: Phone, onClick: () => run("log-call") }}
        >
          <PhoneCallLog hideHeader command={command} />
        </ConsolePage>
      );
    case "postal":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="postal"
          icon={Mail}
          description={DESCRIPTIONS.postal}
          primaryAction={{ id: "record-item", label: "Record item", icon: Plus, onClick: () => run("record-item") }}
        >
          <PostalRegister hideHeader command={command} />
        </ConsolePage>
      );
    case "certificates":
      return (
        <ConsolePage
          consoleId="receptionist"
          view="certificates"
          icon={Award}
          description={DESCRIPTIONS.certificates}
          primaryAction={{ id: "issue-certificate", label: "Issue certificate", icon: Plus, disabled: !certificateReady, disabledReason: "No template is approved yet. Your campus admin approves certificate templates before documents can be issued.", onClick: () => run("issue-certificate") }}
        >
          <CertificatesDesk showTemplates={false} hideHeader command={command} onIssueAvailabilityChange={setCertificateReady} />
        </ConsolePage>
      );
    case "my-leave":
      return (
        <ConsolePage consoleId="receptionist" view="my-leave" icon={CalendarCheck}>
          <MyLeavePanel />
        </ConsolePage>
      );
    default:
      return (
        <ConsolePage
          consoleId="receptionist"
          view="dashboard"
          notice={retiredNotice}
          icon={DoorOpen}
          primaryAction={{ id: "check-in", label: "Check in visitor", icon: LogIn, onClick: () => run("check-in", "visitors") }}
          secondaryActions={[{ id: "log-call", label: "Log call", icon: Phone, onClick: () => run("log-call", "phone-calls") }]}
        >
          <SetupPrompt />
          {data.summary?.kind === "RECEPTIONIST" ? <ReceptionToday summary={data.summary} campusLabel={campusLine(data)} onNavigate={(next) => setView(next)} /> : null}
        </ConsolePage>
      );
  }
}

/** Today: the KPI tiles and the one queue (§4.5.8) — pickups at the gate, callbacks due, visitors still signed in. */
function ReceptionToday({ summary, campusLabel, onNavigate }: { summary: FrontDeskSummary; campusLabel: string; onNavigate: (view: string) => void }) {
  const queue = useFrontDeskQueue();
  return (
    <FrontDeskOverview
      summary={summary}
      campusLabel={campusLabel}
      onNavigate={onNavigate}
      pickupsWaiting={queue.pickupsWaiting}
      queue={<FrontDeskQueue state={queue} onNavigate={onNavigate} />}
    />
  );
}

/* ─── The front desk's one queue (role-ux §4.5.8, P8-18) ─────────────────────────────────────────────────── */

type QueueItem = { id: string; view: "pickup" | "phone-calls" | "visitors"; title: string; detail: string; tone: "warning" | "danger" | "info"; rank: number; at: number };
type FrontDeskQueueState = { status: "loading" | "error" | "ready"; items: QueueItem[]; pickupsWaiting: number | null; error: RequestFailure | null; reload: () => void };

type GateCheck = { checkId: string; status: string; exceptionStatus: string | null; student: { name: string }; createdAt?: string };
type CallRow = { id: string; name: string; callbacks: { id: string; status: string; dueAt: string; overdue: boolean }[] };
type VisitorRow = { id: string; name: string; inTime: string; overdue: boolean };

async function readJson(url: string) {
  return checkedJson(await readRequest(url));
}

/**
 * What is waiting on the front desk right now: pickups at the gate (identity not yet checked, or with the pickup
 * lead), callbacks due today or overdue, and visitors still signed in past the usual stay. Each source is the desk's
 * own list; a failed load is an error with a retry, never an empty queue (R4).
 */
function useFrontDeskQueue(): FrontDeskQueueState {
  const tr = useUiText();
  const { timezone } = useLocale();
  const { dateTime } = useLocaleFormat();
  type Sources = { checks: GateCheck[]; calls: CallRow[]; visitors: VisitorRow[] };
  const [state, setState] = useState<{ status: FrontDeskQueueState["status"]; sources: Sources | null; error: RequestFailure | null }>({ status: "loading", sources: null, error: null });
  const sequence = useRef(0);
  // The loader only fetches: wording and dates are applied at render, so a language change never refetches.
  const load = useCallback(async () => {
    const version = ++sequence.current;
    setState({ status: "loading", sources: null, error: null });
    try {
      const [gate, calls, visitors] = await Promise.all([
        readJson("/api/pickup/gate"),
        readJson("/api/front-desk/phone-calls?view=open"),
        readJson("/api/front-desk/visitors?status=ON_SITE"),
      ]);
      if (version !== sequence.current) return;
      if (!Array.isArray(gate.data?.checks) || !Array.isArray(calls.data) || !Array.isArray(visitors.data)) throw new RequestFailure("server");
      setState({ status: "ready", error: null, sources: {
        checks: ((gate.data?.checks ?? []) as GateCheck[]).filter((check) => check.status === "OPEN" || check.status === "ESCALATED"),
        calls: (calls.data ?? []) as CallRow[],
        visitors: ((visitors.data ?? []) as VisitorRow[]).filter((row) => row.overdue),
      } });
    } catch (error) {
      if (version === sequence.current) setState({ status: "error", sources: null, error: requestFailure(error) });
    }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); sequence.current++; }; }, [load]);
  const items = useMemo(() => {
    if (!state.sources) return [];
    const list: QueueItem[] = [];
    for (const check of state.sources.checks) {
      const escalated = check.status === "ESCALATED";
      list.push({ id: `pickup-${check.checkId}`, view: "pickup", title: tr("Pickup for {0}", [check.student.name]), detail: tr(escalated ? "With the pickup lead · keep the student supervised" : "Identity not yet checked"), tone: escalated ? "danger" : "warning", rank: escalated ? 0 : 1, at: check.createdAt ? Date.parse(check.createdAt) : 0 });
    }
    const now = new Date();
    for (const call of state.sources.calls) {
      for (const callback of call.callbacks.filter((row) => row.status === "OPEN" && (row.overdue || callbackDueByToday(row.dueAt, now, timezone)))) {
        list.push({ id: `callback-${callback.id}`, view: "phone-calls", title: tr("Call back {0}", [call.name]), detail: tr(callback.overdue ? "Overdue since {0}" : "Due {0}", [dateTime(callback.dueAt)]), tone: callback.overdue ? "danger" : "info", rank: callback.overdue ? 2 : 3, at: Date.parse(callback.dueAt) });
      }
    }
    for (const visitor of state.sources.visitors) {
      list.push({ id: `visitor-${visitor.id}`, view: "visitors", title: tr("{0} is still signed in", [visitor.name]), detail: tr("Arrived {0}", [dateTime(visitor.inTime)]), tone: "warning", rank: 4, at: Date.parse(visitor.inTime) });
    }
    return list.sort((a, b) => a.rank - b.rank || a.at - b.at);
  }, [state.sources, tr, dateTime, timezone]);
  return { status: state.status, error: state.error, items, pickupsWaiting: state.sources ? state.sources.checks.length : null, reload: () => void load() };
}

const QUEUE_LIMIT = 6;
const VIEW_ACTION: Record<QueueItem["view"], string> = { pickup: "Open pickup", "phone-calls": "Open calls", visitors: "Open visitors" };
const VIEW_ICON: Record<QueueItem["view"], LucideIcon> = { pickup: ShieldAlert, "phone-calls": PhoneCall, visitors: UserCheck };
const TONE_LABEL: Record<QueueItem["tone"], string> = { danger: "Urgent", warning: "Needs attention", info: "Due today" };

/** The queue panel for the receptionist's Today: one row per item, one inline action (open the desk it belongs to). */
function FrontDeskQueue({ state, onNavigate }: { state: FrontDeskQueueState; onNavigate: (view: string) => void }) {
  const tr = useUiText();
  const heading = <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Inbox className="size-4 text-primary" aria-hidden="true" />{tr("Waiting on you")}</h3>;
  if (state.status === "error") return <section className="sk-panel space-y-3 p-5" data-front-desk-queue data-queue-state="error">{heading}<ErrorState error={state.error} title={tr("The queue could not be loaded")} description={tr("Check your connection and try again.")} onRetry={state.reload} retryLabel={tr("Try again")} className="py-6" /></section>;
  if (state.status === "loading") return <section className="sk-panel space-y-3 p-5" data-front-desk-queue aria-busy="true">{heading}<SkeletonList rows={3} label={tr("Loading the queue…")} /></section>;
  if (!state.items.length) return <section className="sk-panel space-y-3 p-5" data-front-desk-queue data-queue-state="empty">{heading}<EmptyState size="sm" icon={CheckCircle2} title={tr("Nothing is waiting on you.")} description={tr("Pickups at the gate, callbacks due today and visitors still signed in appear here.")} /></section>;
  const shown = state.items.slice(0, QUEUE_LIMIT);
  const more = state.items.length - shown.length;
  return (
    <section className="sk-panel space-y-3 p-5" data-front-desk-queue data-tour="reception.today.queue">
      <div className="flex flex-wrap items-center justify-between gap-2">{heading}<Badge variant="warning" size="sm"><bdi>{state.items.length}</bdi></Badge></div>
      <ul className="space-y-2">
        {shown.map((item) => (
          <li key={item.id} data-tone={item.tone} className={cn(deskRow, "flex flex-wrap items-center gap-3")} data-queue-item={item.view}>
            <DeskRowIcon icon={VIEW_ICON[item.view]} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{item.title}</p>
              <p className={item.tone === "danger" ? "text-xs font-medium text-status-error-text" : "text-xs text-ink-muted"}>{item.detail}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 ps-12 sm:ps-0">
              <DeskPill tone={item.tone}>{tr(TONE_LABEL[item.tone])}</DeskPill>
              <Button size="sm" variant="outline" onClick={() => onNavigate(item.view)}>{tr(VIEW_ACTION[item.view])}</Button>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="text-xs text-ink-muted">{tr("{0} more waiting; open the desk to see them all.", [more])}</p> : null}
    </section>
  );
}
