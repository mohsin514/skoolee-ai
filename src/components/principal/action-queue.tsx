"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlarmClock, CheckCheck, History, ListChecks, MoreHorizontal, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { IconButton } from "@/components/ui/icon-button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";

// SKO-417: the next useful action first. Every row says why it exists (trigger), who owns it, when it is
// due and the one step that resolves it in its own workspace. Assign / acknowledge / snooze never close
// an item — it leaves only when the source condition is resolved.

type QueueMessage = { key: string; values: (string | number)[] };
type Item = { titleMessage?: QueueMessage; triggerMessage?: QueueMessage; reasonMessage?: QueueMessage; key: string; type: string; title: string; trigger: string; nextAction: string; sourceOwner: { id: string; name: string } | null; dueAt: string | null; link: string; overdue: boolean; reason: string; assignee: { id: string; name: string } | null; acknowledgedAt: string | null; snoozedUntil: string | null; snoozeReason: string | null; snoozed: boolean };
type Queue = { viewerId: string; items: Item[]; resolved: { key: string; title: string | null; resolvedAt: string }[]; counts: { active: number; overdue: number; snoozed: number; unassigned: number }; failedSources: string[]; checkedAt: string; sortingRule: string };
type Staff = { id: string; fullName: string; role: string };
const TYPE_LABEL: Record<string, string> = { COMPLAINT: "Complaints", ATTENDANCE_MISSING: "Attendance", DELIVERY_FAILED: "Family messages", LEAVE_PENDING: "Leave", REPORT_APPROVAL: "Report approval", ADJUSTMENT_APPROVAL: "Fee adjustments", CORRECTION_APPROVAL: "Record corrections", SUPPORT_CHECKIN: "Learning actions", SYLLABUS_APPROVAL: "Syllabi", PAPER_DUE: "Papers due", PAPER_MODERATION: "Paper moderation", PAPER_SEAL: "Papers to seal", RESULT_RELEASE: "Results to publish" };

export function ActionQueue({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [queue, setQueue] = useState<Queue | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false), [type, setType] = useState(""), [owner, setOwner] = useState(""), [showSnoozed, setShowSnoozed] = useState(false), [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()), [staff, setStaff] = useState<Staff[]>([]);
  const [snoozing, setSnoozing] = useState<Item[] | null>(null), [historyFor, setHistoryFor] = useState<Item | null>(null), [assignTo, setAssignTo] = useState("");
  const scope = campusId ? `campusId=${encodeURIComponent(campusId)}` : "";
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/principal/queue?${scope}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (id !== requestRef.current) return;
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("The action queue is for campus leaders.") : json.error || ui("The action queue could not be refreshed."));
      setQueue(json.data);
    } catch (failure) { if (id === requestRef.current) setError(failure instanceof Error ? ui(failure.message) : ui("The action queue could not be refreshed.")); }
    finally { if (id === requestRef.current) setLoading(false); }
  }, [scope, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  // Live mode re-checks every source every two minutes; snapshot mode only on request.
  useEffect(() => { if (!live) return; const timer = setInterval(() => void load(), 120_000); return () => clearInterval(timer); }, [live, load]);
  useEffect(() => { void fetch(`/api/principal/queue?${scope}&staff=1`, { cache: "no-store" }).then(r => r.json()).then(json => json.success && setStaff(json.data)).catch(() => undefined); }, [scope]);

  const send = async (body: Record<string, unknown>, message: string) => {
    const response = await fetch("/api/principal/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId, ...body }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { toast.error(ui(json.error || "The change was not saved.")); return false; }
    const outcomes: { outcome: string }[] = json.data;
    const resolved = outcomes.filter(o => o.outcome === "resolved").length;
    toast.success(resolved ? ui("{0} Already resolved at the source: {1}.", [ui(message), resolved]) : ui(message));
    setSelected(new Set()); void load(); return true;
  };

  const viewerId = queue?.viewerId;
  const visible = (queue?.items ?? []).filter(item => (!type || item.type === type) && (showSnoozed || !item.snoozed || item.overdue)
    && (owner === "" || (owner === "me" && (item.assignee?.id === viewerId || item.sourceOwner?.id === viewerId)) || (owner === "unassigned" && !item.assignee && !item.sourceOwner)));
  const toggle = (key: string) => setSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  // The Today queue (§8.2: "Today queue (seats)"); the spotlight tour points at it (work.today.queue).
  return <section className="sk-panel space-y-4 p-5" data-action-queue data-tour="work.today.queue" aria-labelledby="action-queue-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="action-queue-title" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><ListChecks className="size-5 text-primary" aria-hidden />{ui("Waiting on you")}</h2>
        <p className="text-xs text-ink-muted" aria-live="polite">{queue ? ui("Sources checked {0}", [dateTime(queue.checkedAt)]) : ui("Checking sources…")}{live ? ` · ${ui("Live: re-checks every 2 minutes")}` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={ui("Update mode")} className="flex rounded-xl bg-muted p-0.5 text-xs font-bold">
          <Button variant="ghost" type="button" aria-pressed={!live} onClick={() => setLive(false)} className={`rounded-lg px-3 py-1.5 ${!live ? "bg-card shadow-sm" : ""}`} data-mode="snapshot">{ui("Snapshot")}</Button>
          <Button variant="ghost" type="button" aria-pressed={live} onClick={() => setLive(true)} className={`rounded-lg px-3 py-1.5 ${live ? "bg-card shadow-sm" : ""}`} data-mode="live">{ui("Live")}</Button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />{ui("Re-check now")}</Button>
      </div>
    </div>

    {queue ? <p className="flex flex-wrap gap-3 text-sm font-semibold tabular-nums" data-queue-counts>
      <span data-active={queue.counts.active}>{ui("Open: {0}", [queue.counts.active])}</span>
      <span className={queue.counts.overdue ? "text-status-error-text" : ""} data-overdue={queue.counts.overdue}>{ui("Overdue: {0}", [queue.counts.overdue])}</span>
      <span className={queue.counts.unassigned ? "text-status-warning-text" : ""}>{ui("No owner: {0}", [queue.counts.unassigned])}</span>
      <span>{ui("Snoozed: {0}", [queue.counts.snoozed])}</span>
    </p> : null}
    {queue?.failedSources.length ? <div data-failed-sources><Alert tone="warning" compact>{ui("Some sources could not be checked ({0}). Totals are incomplete until they recover.", [queue.failedSources.map(s => ui(TYPE_LABEL[s] ?? s)).join(", ")])}</Alert></div> : null}
    {queue ? <details className="text-xs text-ink-muted"><summary className="cursor-pointer font-bold">{ui("How items are ordered")}</summary><p className="mt-1">{ui(queue.sortingRule)}</p></details> : null}

    <div className="grid gap-3 sm:grid-cols-3">
      <FormField name="queue-type" label={ui("Task type")}><Select value={type} onChange={event => setType(event.target.value)}><option value="">{ui("All types")}</option>{Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{ui(label)}</option>)}</Select></FormField>
      <FormField name="queue-owner" label={ui("Owner")}><Select value={owner} onChange={event => setOwner(event.target.value)}><option value="">{ui("Anyone")}</option><option value="me">{ui("Mine")}</option><option value="unassigned">{ui("No owner")}</option></Select></FormField>
      <label className="flex items-center gap-2 self-end text-xs font-bold"><Checkbox checked={showSnoozed} onChange={event => setShowSnoozed(event.target.checked)} />{ui("Show snoozed items")}</label>
    </div>

    {selected.size ? <div className="flex flex-wrap items-end gap-2 rounded-xl bg-primary/5 p-3" data-bulk-bar>
      <span className="text-xs font-bold">{ui("{0} selected", [selected.size])}</span>
      <FormField name="queue-bulk-assignee" label={ui("Assign to")}><Select value={assignTo} onChange={event => setAssignTo(event.target.value)}><option value="">{ui("Choose a person")}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
      <Button size="sm" disabled={!assignTo} onClick={() => void send({ action: "assign", keys: [...selected], assigneeId: assignTo }, "Owner assigned.")}><UserPlus className="size-3.5" aria-hidden />{ui("Assign")}</Button>
      <Button size="sm" variant="secondary" onClick={() => setSnoozing((queue?.items ?? []).filter(item => selected.has(item.key)))}><AlarmClock className="size-3.5" aria-hidden />{ui("Snooze")}</Button>
    </div> : null}

    {error ? <ErrorState description={error} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !queue ? <SkeletonList rows={3} label={ui("Checking sources…")} />
      : !visible.length ? <div data-queue-empty><EmptyState size="sm" icon={queue.items.length ? ListChecks : CheckCheck} title={queue.items.length ? ui("No items match these filters.") : ui("Nothing needs attention in this campus right now.")} secondaryAction={queue.items.length && (type || owner) ? <Button size="sm" variant="ghost" onClick={() => { setType(""); setOwner(""); }}>{ui("Clear filters")}</Button> : undefined} /></div>
      : <ol className="space-y-2" aria-label={ui("Waiting on you")}>{visible.map(item => <li key={item.key} className={`rounded-2xl border p-3 ${item.overdue ? "border-status-error-border bg-status-error-surface" : "border-border"}`} data-queue-item={item.key} data-queue-type={item.type} data-overdue={item.overdue} data-snoozed={item.snoozed}>
        <div className="flex items-start gap-3">
          <Checkbox className="mt-1" checked={selected.has(item.key)} onChange={() => toggle(item.key)} aria-label={ui("Select {0}", [ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)])} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-bold"><bdi>{ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)}</bdi></p>
            <p className="text-xs text-ink-muted"><bdi>{ui(item.triggerMessage?.key ?? item.trigger, item.triggerMessage?.values)}</bdi></p>
            <p className="flex flex-wrap gap-x-2 text-2xs font-semibold text-ink-subtle">
              <Badge size="sm" variant={item.overdue ? "danger" : "neutral"} data-reason>{ui(item.reasonMessage?.key ?? item.reason, item.reasonMessage?.values)}</Badge>
              <span>{ui(TYPE_LABEL[item.type])}</span>
              <span>{item.assignee ? ui("Assigned to {0}", [item.assignee.name]) : item.sourceOwner ? ui("Owner: {0}", [item.sourceOwner.name]) : ui("No owner yet")}</span>
              {item.acknowledgedAt ? <span>{ui("Acknowledged")}</span> : null}
              {item.snoozed ? <span className="text-status-warning-text">{ui("Snoozed until {0}: {1}", [dateTime(item.snoozedUntil!), item.snoozeReason ?? ""])}</span> : null}
            </p>
            {/* §4.5.2: one inline action per row (the next step); acknowledge, snooze and history sit in its overflow. */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Link href={item.link} className={buttonVariants({ size: "sm" })} aria-label={ui("{0}: {1}", [ui(item.nextAction), ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)])} data-next-action>{ui(item.nextAction)}</Link>
              <Menu
                label={ui("More actions for {0}", [ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)])}
                align="end"
                trigger={<IconButton label={ui("More actions for {0}", [ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)])} data-row-menu><MoreHorizontal aria-hidden="true" /></IconButton>}
                items={[
                  ...(item.acknowledgedAt ? [] : [{ id: "acknowledge", label: "Acknowledge", icon: CheckCheck, description: "It stays open until its source is resolved.", onSelect: () => void send({ action: "acknowledge", keys: [item.key] }, "Acknowledged. The item stays open until its source is resolved.") } satisfies MenuItem]),
                  item.snoozed
                    ? { id: "unsnooze", label: "Unsnooze", icon: AlarmClock, onSelect: () => void send({ action: "unsnooze", keys: [item.key] }, "Snooze removed.") }
                    : { id: "snooze", label: "Snooze", icon: AlarmClock, onSelect: () => setSnoozing([item]) },
                  { id: "history", label: "History", icon: History, onSelect: () => setHistoryFor(item) },
                ]}
              />
            </div>
          </div>
        </div>
      </li>)}</ol>}

    {queue?.resolved.length ? <div>
      <Button variant="ghost" type="button" className="text-xs font-bold text-primary" aria-expanded={showResolved} onClick={() => setShowResolved(v => !v)}>{ui("Resolved at the source in the last 14 days ({0})", [queue.resolved.length])}</Button>
      {showResolved ? <ul className="mt-2 space-y-1 text-xs text-ink-muted" data-resolved-list>{queue.resolved.map(row => <li key={row.key}><bdi>{row.title ? ui(row.title) : row.key}</bdi> · {dateTime(row.resolvedAt)}</li>)}</ul> : null}
    </div> : null}

    {snoozing ? <SnoozeDialog items={snoozing} onClose={() => setSnoozing(null)} onSave={async (until, reason) => { if (await send({ action: "snooze", keys: snoozing.map(i => i.key), until, reason }, "Snoozed. Overdue items stay visible.")) setSnoozing(null); }} /> : null}
    {historyFor ? <HistoryDialog item={historyFor} scope={scope} staff={staff} onClose={() => setHistoryFor(null)} /> : null}
  </section>;
}

function SnoozeDialog({ items, onClose, onSave }: { items: Item[]; onClose: () => void; onSave: (until: string, reason: string) => Promise<void> }) {
  const ui = useUiText();
  const [until, setUntil] = useState(() => { const tomorrow = new Date(Date.now() + 86_400_000); tomorrow.setHours(8, 0, 0, 0); return new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => {
    if (reason.trim().length < 5) { setError(ui("Say why you are snoozing (5–300 characters).")); return; }
    setError(""); setBusy(true);
    try { await onSave(new Date(until).toISOString(), reason.trim()); } finally { setBusy(false); }
  };
  return <Modal
    title={items.length === 1 ? ui("Snooze this item") : ui("Snooze {0} items", [items.length])}
    eyebrow={ui("Waiting on you")}
    subtitle={ui("Snoozing hides an item until the return time. It does not resolve it, and overdue items stay visible.")}
    onClose={onClose}
    dirty={Boolean(reason)}
    size="sm"
    footer={<ModalActions busy={busy} busyLabel={ui("Saving…")} actionLabel={ui("Snooze")} onCancel={onClose} onAction={() => void save()} />}
  >
    <form className="space-y-3" data-snooze-dialog onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {error ? <Alert tone="danger" compact>{error}</Alert> : null}
      <FormField name="snooze-until" label={ui("Return on")}><Input type="datetime-local" value={until} onChange={event => setUntil(event.target.value)} /></FormField>
      <FormField name="snooze-reason" label={ui("Reason")}><Input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} /></FormField>
    </form>
  </Modal>;
}

function HistoryDialog({ item, scope, staff, onClose }: { item: Item; scope: string; staff: Staff[]; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [events, setEvents] = useState<{ id: string; kind: string; note: string | null; assigneeId: string | null; snoozedUntil: string | null; actorId: string | null; createdAt: string }[] | null>(null);
  // R4: a history that did not load says so (with Retry) instead of looking empty.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void fetch(`/api/principal/queue?${scope}&history=${encodeURIComponent(item.key)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (!live) return; if (json.success) { setEvents(json.data); setFailed(false); } else setFailed(true); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [item.key, scope, attempt]);
  const name = (id: string | null) => staff.find(person => person.id === id)?.fullName ?? "";
  const KIND: Record<string, string> = { ASSIGNED: "Assigned", ACKNOWLEDGED: "Acknowledged", SNOOZED: "Snoozed", UNSNOOZED: "Snooze removed", RESOLVED: "Resolved at the source" };
  return <Modal title={ui(item.titleMessage?.key ?? item.title, item.titleMessage?.values)} eyebrow={ui("Waiting on you")} subtitle={ui(item.triggerMessage?.key ?? item.trigger, item.triggerMessage?.values)} onClose={onClose}>
    {failed ? <ErrorState title={ui("The history did not load")} onRetry={() => { setFailed(false); setEvents(null); setAttempt(n => n + 1); }} retryLabel={ui("Try again")} />
      : !events ? <SkeletonList rows={3} label={ui("Loading history…")} /> : !events.length ? <EmptyState size="sm" icon={History} title={ui("No changes recorded yet.")} />
      : <ol className="space-y-1.5 text-xs" data-queue-history>{events.map(event => <li key={event.id} className="rounded-lg bg-muted/60 px-3 py-2"><p className="font-bold">{ui(KIND[event.kind] ?? event.kind)} · {dateTime(event.createdAt)}{event.actorId ? <> · <bdi>{name(event.actorId)}</bdi></> : null}</p>{event.assigneeId ? <p>{ui("Assigned to {0}", [name(event.assigneeId)])}</p> : null}{event.note ? <p><bdi>{event.note}</bdi></p> : null}</li>)}</ol>}
  </Modal>;
}
