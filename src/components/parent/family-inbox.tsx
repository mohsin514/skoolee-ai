"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useParentData } from "@/app/parent/parent-data-context";
import { cn } from "@/lib/utils";

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
  TRIP_CONSENT: item.state === "UPDATE" ? ui("Trip notice (another guardian answers)") : item.detail?.includes("changed") ? ui("Trip details changed — answer again") : ui("Trip permission"),
  MEETING_RESCHEDULE: ui("A meeting needs a new time"),
  MEETING_ACTION: item.state === "COMPLETED" ? ui("Meeting action done") : ui("Meeting action"),
  LEAVE_REQUEST: item.state === "ACTION" ? ui("The school asked about a leave request") : item.title === "APPROVED" ? ui("Leave approved") : item.title === "DECLINED" ? ui("Leave declined") : ui("Leave requested"),
} as Record<string, string>)[item.kind] ?? item.kind;
const outcome = (ui: Ui, item: Item) => item.kind === "EXPLAIN_ABSENCE" && item.state === "COMPLETED" ? (item.title === "ACCEPTED" ? ui("Accepted by the school") : ui("Not accepted by the school")) : null;

export function FamilyInbox() {
  const ui = useUiText();
  const router = useRouter();
  const { date, dateTime } = useLocaleFormat();
  const { token, selectChild } = useParentData();
  const [data, setData] = useState<Inbox | null>(null), [error, setError] = useState("");
  const [view, setView] = useState<View>("ACTION"), [child, setChild] = useState<string>("all");
  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/parent/inbox${token ? `?token=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { setError(ui(json.error || "Family requests could not be loaded.")); return; }
    setData(json.data);
  }, [token, ui]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(); }; document.addEventListener("visibilitychange", refresh); return () => document.removeEventListener("visibilitychange", refresh); }, [load]);

  const shown = useMemo(() => (data?.items ?? []).filter(item => (child === "all" || item.childId === child) && (view === "COMPLETED" ? item.state === "COMPLETED" || item.state === "EXPIRED" : item.state === view)), [data, child, view]);
  if (!data && !error) return <section className="sk-panel p-5" aria-busy="true" data-family-inbox><p className="text-sm text-ink-muted">{ui("Loading family requests…")}</p></section>;
  const open = (item: Item) => { if (!token) selectChild(item.childId); router.push(item.href); };
  const views: { key: View; label: string; count?: number }[] = [
    { key: "ACTION", label: ui("Needs action"), count: data?.counts.action }, { key: "WAITING", label: ui("Waiting for the school"), count: data?.counts.waiting },
    { key: "UPDATE", label: ui("Updates") }, { key: "COMPLETED", label: ui("Completed") },
  ];
  return <section className="sk-panel space-y-3 p-5" aria-labelledby="family-inbox-heading" data-family-inbox data-action-count={data?.counts.action ?? 0}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="family-inbox-heading" className="text-lg font-black">{ui("Family requests")}</h2>
      {data ? <p className="text-xs text-ink-muted" role="status">{data.counts.action ? ui("Requests that need your attention: {0}", [String(data.counts.action)]) : ui("You are up to date.")}</p> : null}
    </header>
    {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error} <Button variant="ghost" type="button" className="font-semibold underline" onClick={() => void load()}>{ui("Try again")}</Button></p> : null}
    {data ? <>
      {data.unavailable.length ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" data-inbox-partial>{ui("Some requests could not be refreshed; the others are shown.")}</p> : null}
      <div className="flex flex-wrap gap-1" role="group" aria-label={ui("Request status")}>{views.map(v => <Button key={v.key} size="sm" variant="choice" aria-pressed={view === v.key} onClick={() => setView(v.key)} data-inbox-view={v.key}>{v.label}{v.count !== undefined ? <> · <bdi>{v.count}</bdi></> : null}</Button>)}</div>
      {data.children.length > 1 ? <div className="flex flex-wrap gap-1" aria-label={ui("Child")}>
        <Button size="sm" variant="outline" aria-pressed={child === "all"} onClick={() => setChild("all")} className={cn(child === "all" && "border-[#8127cf] text-[#8127cf]")} data-inbox-child="all">{ui("All children")}</Button>
        {data.children.map(c => <Button key={c.id} size="sm" variant="outline" aria-pressed={child === c.id} onClick={() => setChild(c.id)} className={cn(child === c.id && "border-[#8127cf] text-[#8127cf]")} data-inbox-child={c.id}><bdi>{c.name}</bdi></Button>)}
      </div> : null}
      {shown.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-ink-muted" data-inbox-empty>{view === "ACTION" ? ui("You are up to date. New school requests will appear here.") : ui("Nothing here.")}</p> : <ul className="space-y-2">
        {shown.map(item => <li key={item.id} className={cn("rounded-2xl border p-3", item.state === "ACTION" && item.overdue ? "border-rose-200 bg-rose-50/40" : "border-[#cfc2d6]/30 bg-white")} data-inbox-item={item.id} data-inbox-state={item.state} data-inbox-child-id={item.childId}>
          <p className="text-xs font-bold text-ink-muted"><bdi>{item.childName}</bdi> · <bdi>{item.schoolName}</bdi> · <bdi>{item.campusName}</bdi></p>
          <p className="mt-1 text-sm font-black">{kindLabel(ui, item)}{item.kind === "PAY_FEE" && item.title ? <> · <bdi>{item.title}</bdi></> : item.kind === "FEEDBACK_RETURNED" || item.kind === "REPORT_PUBLISHED" || item.kind === "TRIP_CONSENT" || item.kind === "MEETING_ACTION" ? <> · <bdi>{item.title}</bdi></> : null}</p>
          <p className="text-xs text-ink-muted">
            {item.kind === "EXPLAIN_ABSENCE" || item.kind === "CLARIFY_ABSENCE" ? <><bdi>{item.detail && /^\d{4}-\d{2}-\d{2}$/.test(item.detail) ? date(item.detail) : item.detail}</bdi></> : item.kind === "PAY_FEE" && item.detail ? <bdi>{item.detail}</bdi> : null}
            {item.kind === "LEAVE_REQUEST" || item.kind === "TRIP_CONSENT" ? <bdi>{item.detail}</bdi> : null}
            {item.dueAt && item.state === "ACTION" ? <> · {item.kind === "PAY_FEE" || item.kind === "MEETING_ACTION" ? ui("Due") : item.kind === "TRIP_CONSENT" ? ui("Answer by") : item.kind === "MEETING_RESCHEDULE" ? ui("Booked for") : ui("Explain by")} <bdi>{item.kind === "TRIP_CONSENT" || item.kind === "MEETING_RESCHEDULE" ? dateTime(item.dueAt) : item.kind === "MEETING_ACTION" && item.detail ? date(item.detail) : date(item.dueAt)}</bdi></> : null}
            {item.state === "ACTION" && item.overdue ? <> · <span className="font-black text-rose-700">{ui("Overdue")}</span></> : null}
            {item.state === "EXPIRED" ? <> · <span className="font-black">{ui("The time to respond has passed")}</span></> : null}
            {item.state === "UPDATE" ? <> · <bdi>{dateTime(item.at)}</bdi></> : null}
          </p>
          {outcome(ui, item) ? <p className="text-xs font-bold" data-inbox-outcome>{outcome(ui, item)}</p> : null}
          {item.completedByOther && item.state !== "ACTION" ? <p className="text-xs text-ink-muted" data-inbox-other-guardian>{ui("Answered by another authorized guardian.")}</p> : null}
          {item.state !== "EXPIRED" ? <Button size="sm" variant={item.state === "ACTION" ? "default" : "outline"} className="mt-2" onClick={() => open(item)} data-inbox-open>{item.state === "ACTION" ? ui("Open request") : ui("View")}</Button> : null}
        </li>)}
      </ul>}
      <p className="text-[10px] text-ink-muted">{ui("Updated")} <bdi>{dateTime(data.refreshedAt)}</bdi></p>
    </> : null}
  </section>;
}
