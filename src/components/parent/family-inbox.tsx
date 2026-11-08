"use client";
import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { examBriefSentence } from "@/components/exams/exam-brief-text";
import { useParentData } from "@/app/parent/parent-data-context";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Bus, CalendarClock, CalendarOff, CalendarX2, CreditCard, FileText, Inbox as InboxIcon, MessageSquareText, StickyNote, Users, type LucideIcon } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskQuickFilter, DeskRowIcon, RelativeTime, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";

// SKO-419: the family inbox across siblings. Each card names the child and the school first, then the
// request and its due date in the school's time. Opening a card switches to that child and goes to the
// source page, where the action is actually done; nothing here marks it complete. "Waiting" means the
// family has answered and the school has not decided yet.

type Ui = ReturnType<typeof useUiText>;
type Item = { id: string; kind: string; state: "ACTION" | "WAITING" | "COMPLETED" | "EXPIRED" | "UPDATE"; childId: string; childName: string; schoolName: string; campusName: string; title: string; detail: string | null; dueAt: string | null; overdue: boolean; at: string; href: string; completedByOther: boolean; receipt: string | null };
type Inbox = { children: { id: string; name: string; schoolName: string }[]; unavailable: string[]; counts: { action: number; waiting: number; completed: number }; items: Item[]; refreshedAt: string };
type View = "ACTION" | "WAITING" | "UPDATE" | "COMPLETED";

const kindLabel = (ui: Ui, item: Item) => ({
  EXPLAIN_ABSENCE: item.title === "LATE" ? ui("Explain a late arrival") : item.state === "COMPLETED" ? ui("Absence explanation") : ui("Explain an absence"),
  CLARIFY_ABSENCE: ui("The school asked for more detail"),
  PAY_FEE: item.state === "COMPLETED" ? ui("Fee paid") : ui("Pay a fee"),
  FEEDBACK_RETURNED: ui("Feedback returned"),
  REPORT_PUBLISHED: ui("Report card published"),
  RESULT_NOTE: ui("Note from a teacher"),
  EXAM_CHANGED: ui("Exam date sheet changed"),
  TRIP_CONSENT: item.state === "UPDATE" ? ui("Trip notice (another guardian answers)") : item.detail?.includes("changed") ? ui("Trip details changed — answer again") : ui("Trip permission"),
  MEETING_RESCHEDULE: ui("A meeting needs a new time"),
  MEETING_ACTION: item.state === "COMPLETED" ? ui("Meeting action done") : ui("Meeting action"),
  LEAVE_REQUEST: item.state === "ACTION" ? ui("The school asked about a leave request") : item.title === "APPROVED" ? ui("Leave approved") : item.title === "DECLINED" ? ui("Leave declined") : ui("Leave requested"),
} as Record<string, string>)[item.kind] ?? item.kind;
/**
 * The fee balance an inbox item carries (`"<currency> <amount>"` from the inbox source), formatted in the document
 * language with the school's currency — never the raw string (R7).
 */
export function inboxAmount(money: (amount: number, currency?: string) => string, detail: string | null): string | null {
  const match = detail?.match(/^([A-Za-z]{3})\s+(-?\d+(?:\.\d+)?)$/);
  return match ? money(Number(match[2]), match[1].toUpperCase()) : null;
}

/**
 * Where an item is acted on. The inbox source still names the panels' old pages for trips and meetings
 * (`src/lib/parent/inbox.ts`, not this package's file); P7 moved those panels to Activities & trips (M90) and Meet
 * a teacher (M92), so the link is corrected here until the source follows (cross-package need, G1).
 */
const PANEL_PATH: Record<string, string> = { TRIP_CONSENT: "/parent/activities", MEETING_RESCHEDULE: "/parent/meetings", MEETING_ACTION: "/parent/meetings" };
export function inboxDestination(item: Pick<Item, "kind" | "href">): string {
  const target = PANEL_PATH[item.kind];
  if (!target) return item.href;
  const query = item.href.indexOf("?");
  return target + (query >= 0 ? item.href.slice(query) : "");
}

/** The family's one next step, phrased as the button that does it ("Pay Rs 4,500", "Explain 12 Oct's absence"). */
export function inboxActionLabel(ui: Ui, formatDate: (value: string) => string, item: Pick<Item, "kind" | "title" | "detail" | "state">, money?: (amount: number, currency?: string) => string) {
  if (item.kind === "PAY_FEE") {
    const amount = money ? inboxAmount(money, item.detail) : null;
    return amount ? ui("Pay {0}", [amount]) : ui("Pay a fee");
  }
  if (item.kind === "EXPLAIN_ABSENCE" || item.kind === "CLARIFY_ABSENCE") {
    const day = item.detail && /^\d{4}-\d{2}-\d{2}$/.test(item.detail) ? formatDate(item.detail) : null;
    if (item.title === "LATE") return day ? ui("Explain the late arrival on {0}", [day]) : ui("Explain a late arrival");
    return day ? ui("Explain the absence on {0}", [day]) : ui("Explain an absence");
  }
  if (item.kind === "EXAM_CHANGED") return ui("Acknowledge the date-sheet change");
  if (item.kind === "TRIP_CONSENT") return ui("Answer the trip request");
  if (item.kind === "MEETING_RESCHEDULE") return ui("Choose a new meeting time");
  return kindLabel(ui, item as Item);
}
export type InboxTopAction = { label: string; href: string; childId: string } | null;

const KIND_ICON: Record<string, LucideIcon> = { EXPLAIN_ABSENCE: CalendarX2, CLARIFY_ABSENCE: CalendarX2, PAY_FEE: CreditCard, FEEDBACK_RETURNED: MessageSquareText, REPORT_PUBLISHED: FileText, RESULT_NOTE: StickyNote, EXAM_CHANGED: CalendarClock, TRIP_CONSENT: Bus, MEETING_RESCHEDULE: Users, MEETING_ACTION: Users, LEAVE_REQUEST: CalendarOff };
/** A row's tone and pill: overdue is red, a request for the family brand with an amber pill, the school's turn blue, done green. */
const itemTone = (item: Item): DeskTone => item.state === "ACTION" ? (item.overdue ? "danger" : "brand") : item.state === "WAITING" ? "info" : item.state === "COMPLETED" ? "success" : item.state === "EXPIRED" ? "neutral" : "brand";
const statePill = (ui: Ui, item: Item): [DeskTone, string] | null => item.state === "ACTION" ? (item.overdue ? ["danger", ui("Overdue")] : ["warning", ui("Needs action")]) : item.state === "WAITING" ? ["info", ui("Waiting for the school")] : item.state === "COMPLETED" ? ["success", ui("Completed")] : null;

const outcome = (ui: Ui, item: Item) => item.kind === "EXPLAIN_ABSENCE" && item.state === "COMPLETED" ? (item.title === "ACCEPTED" ? ui("Accepted by the school") : ui("Not accepted by the school")) : null;

/**
 * `onTopAction` reports the first request that needs the family, so Home can make it the screen's one
 * primary action (§4.4); it reports null when there is nothing to do.
 */
export function FamilyInbox({ onTopAction }: { onTopAction?: (action: InboxTopAction) => void } = {}) {
  const ui = useUiText();
  const { language } = useLocale();
  const router = useRouter();
  const { date, dateTime, money } = useLocaleFormat();
  const { selectChild } = useParentData();
  const [data, setData] = useState<Inbox | null>(null), [error, setError] = useState<RequestFailure | null>(null);
  const [view, setView] = useState<View>("ACTION"), [child, setChild] = useState<string>("all"), [query, setQuery] = useState("");
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null); setData(null);
    try {
      const json = await checkedJson(await readRequest("/api/parent/inbox"));
      if (version !== requestVersion.current) return;
      if (!Array.isArray(json.data?.items) || !Array.isArray(json.data?.children) || !Array.isArray(json.data?.unavailable)) throw new RequestFailure("server");
      setData(json.data);
    } catch (failure) {
      if (version !== requestVersion.current) return;
      setData(null);
      setError(requestFailure(failure));
    }
  }, []);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);
  useEffect(() => () => onTopAction?.(null), [onTopAction]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(); }; document.addEventListener("visibilitychange", refresh); return () => document.removeEventListener("visibilitychange", refresh); }, [load]);

  useEffect(() => {
    if (!onTopAction) return;
    const top = (data?.items ?? []).find(item => item.state === "ACTION");
    onTopAction(top ? { label: inboxActionLabel(ui, date, top, money), href: inboxDestination(top), childId: top.childId } : null);
  }, [data, onTopAction, ui, date, money]);

  const inView = useMemo(() => (data?.items ?? []).filter(item => (child === "all" || item.childId === child) && (view === "COMPLETED" ? item.state === "COMPLETED" || item.state === "EXPIRED" : item.state === view)), [data, child, view]);
  // Overdue requests first, then the rest in the source's order; the quick filter narrows by child, school or request.
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matched = needle ? inView.filter(item => [item.childName, item.schoolName, item.campusName, item.title, kindLabel(ui, item)].some(text => text?.toLocaleLowerCase().includes(needle))) : inView;
    return urgencyFirst(matched, item => item.state === "ACTION" && item.overdue ? 0 : item.state === "ACTION" ? 1 : 2);
  }, [inView, query, ui]);
  const loadingFirst = !data && !error;
  // SKO-505: "<kind>|<date>|<further changes>" from the inbox source, phrased in the reader's language.
  const examChange = (item: Item) => {
    const [kind, day, more] = (item.detail ?? "").split("|");
    const sentence = examBriefSentence(ui, language, { kind, subject: item.title, date: day || null });
    return Number(more) > 0 ? `${sentence} · ${ui("{0} more changes", [String(more)])}` : sentence;
  };
  const open = (item: Item) => { selectChild(item.childId); router.push(inboxDestination(item)); };
  const views: { key: View; label: string; count?: number }[] = [
    { key: "ACTION", label: ui("Needs action"), count: data?.counts.action }, { key: "WAITING", label: ui("Waiting for the school"), count: data?.counts.waiting },
    { key: "UPDATE", label: ui("Updates") }, { key: "COMPLETED", label: ui("Completed") },
  ];
  // One root in every state, loading included, so the tour anchor never waits for data (§9.4, G15).
  return <section className="sk-panel space-y-3 p-5" aria-labelledby={loadingFirst ? undefined : "family-inbox-heading"} aria-busy={loadingFirst || undefined} data-family-inbox data-tour="parent.home.inbox" data-action-count={data?.counts.action ?? 0}>
    {loadingFirst ? <><p className="sr-only">{ui("Loading family requests…")}</p><SkeletonList rows={3} /></> : <>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="family-inbox-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><InboxIcon aria-hidden="true" className="size-5 text-primary" />{ui("Family requests")}</h2>
      {data ? <p className="text-xs text-ink-muted" role="status">{data.counts.action ? ui("Requests that need your attention: {0}", [String(data.counts.action)]) : ui("You are up to date.")}</p> : null}
    </header>
    {error ? <ErrorState error={error} onRetry={load} /> : null}
    {data ? <>
      {data.unavailable.length ? <div data-inbox-partial><Alert tone="warning" compact live="off">{ui("Some requests could not be refreshed; the others are shown.")}</Alert></div> : null}
      <div className="flex flex-wrap gap-1" role="group" aria-label={ui("Request status")}>{views.map(v => <Button key={v.key} size="sm" variant="choice" aria-pressed={view === v.key} onClick={() => setView(v.key)} data-inbox-view={v.key}>{v.label}{v.count !== undefined ? <> · <bdi>{v.count}</bdi></> : null}</Button>)}</div>
      {data.children.length > 1 ? <div className="flex flex-wrap gap-1" role="group" aria-label={ui("Child")}>
        <Button size="sm" variant="choice" aria-pressed={child === "all"} onClick={() => setChild("all")} data-inbox-child="all">{ui("All children")}</Button>
        {data.children.map(c => <Button key={c.id} size="sm" variant="choice" aria-pressed={child === c.id} onClick={() => setChild(c.id)} data-inbox-child={c.id}><bdi>{c.name}</bdi></Button>)}
      </div> : null}
      {inView.length > 8 ? <DeskQuickFilter value={query} onChange={setQuery} label={ui("Filter this list")} /> : null}
      <DeskFilterStatus shown={shown.length} total={inView.length} onClear={() => setQuery("")} />
      {shown.length === 0 ? <div data-inbox-empty><EmptyState size="sm" icon={InboxIcon} title={view === "ACTION" ? ui("You are up to date") : ui("Nothing here.")} description={view === "ACTION" ? ui("New school requests will appear here.") : ui("Requests in this view will appear here when there are any.")} /></div> : <ul className="space-y-2">
        {shown.map(item => { const pill = statePill(ui, item); return <li key={item.id} data-tone={itemTone(item)} className={cn(deskRow, "flex flex-wrap items-start gap-x-3 gap-y-2 sm:flex-nowrap")} data-inbox-item={item.id} data-inbox-state={item.state} data-inbox-child-id={item.childId}>
          <DeskRowIcon icon={KIND_ICON[item.kind] ?? InboxIcon} />
          <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-semibold text-ink-subtle [overflow-wrap:anywhere]"><bdi>{item.childName}</bdi> · <bdi>{item.schoolName}</bdi> · <bdi>{item.campusName}</bdi></p>
          <p className="text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{kindLabel(ui, item)}{item.kind === "PAY_FEE" && item.title ? <> · <bdi>{item.title}</bdi></> : item.kind === "FEEDBACK_RETURNED" || item.kind === "REPORT_PUBLISHED" || item.kind === "RESULT_NOTE" || item.kind === "TRIP_CONSENT" || item.kind === "MEETING_ACTION" ? <> · <bdi>{item.title}</bdi></> : null}</p>
          <p className="text-xs text-ink-muted">
            {item.kind === "EXPLAIN_ABSENCE" || item.kind === "CLARIFY_ABSENCE" ? <><bdi>{item.detail && /^\d{4}-\d{2}-\d{2}$/.test(item.detail) ? date(item.detail) : item.detail}</bdi></> : item.kind === "PAY_FEE" && item.detail ? <bdi>{inboxAmount(money, item.detail) ?? item.detail}</bdi> : null}
            {item.kind === "LEAVE_REQUEST" || item.kind === "TRIP_CONSENT" ? <bdi>{item.detail}</bdi> : null}
            {item.kind === "EXAM_CHANGED" ? <span className="font-semibold text-ink" data-exam-change>{examChange(item)}</span> : null}
            {item.dueAt && item.state === "ACTION" ? <> · {item.kind === "PAY_FEE" || item.kind === "MEETING_ACTION" ? ui("Due") : item.kind === "TRIP_CONSENT" ? ui("Answer by") : item.kind === "MEETING_RESCHEDULE" ? ui("Booked for") : ui("Explain by")} <bdi>{item.kind === "TRIP_CONSENT" || item.kind === "MEETING_RESCHEDULE" ? dateTime(item.dueAt) : item.kind === "MEETING_ACTION" && item.detail ? date(item.detail) : date(item.dueAt)}</bdi></> : null}
            {item.state === "EXPIRED" ? <> · <span className="font-bold">{ui("The time to respond has passed")}</span></> : null}
            {item.state === "UPDATE" ? <> · <bdi>{dateTime(item.at)}</bdi></> : null}
          </p>
          {outcome(ui, item) ? <p className="text-xs font-semibold text-ink" data-inbox-outcome>{outcome(ui, item)}</p> : null}
          {item.completedByOther && item.state !== "ACTION" ? <p className="text-xs text-ink-muted" data-inbox-other-guardian>{ui("Answered by another authorized guardian.")}</p> : null}
          {/* Outline on every row: Home's one primary is the PageHeader's (the top request itself, §4.4). */}
          {item.state !== "EXPIRED" ? <Button size="sm" variant="outline" className="mt-2" onClick={() => open(item)} data-inbox-open>{item.state === "ACTION" ? ui("Open request") : ui("View")}</Button> : null}
          </div>
          {pill || (item.dueAt && item.state === "ACTION") ? <div className="order-last flex basis-full flex-wrap items-center gap-2 ps-12 sm:order-none sm:basis-auto sm:flex-col sm:items-end sm:ps-0">
            {pill ? <DeskPill tone={pill[0]}>{pill[1]}</DeskPill> : null}
            {item.dueAt && item.state === "ACTION" ? <RelativeTime iso={item.dueAt} full={dateTime(item.dueAt)} className="text-xs font-medium text-ink-muted" /> : null}
          </div> : null}
        </li>; })}
      </ul>}
      <p className="text-2xs text-ink-subtle">{ui("Updated")} <bdi>{dateTime(data.refreshedAt)}</bdi></p>
    </> : null}
    </>}
  </section>;
}
