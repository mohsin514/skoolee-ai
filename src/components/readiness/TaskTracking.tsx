"use client";
import { BellRing, CalendarClock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DeskPill, RelativeTime, deskTimeline } from "@/components/ui/desk";
import { cn } from "@/lib/utils";
import { getTaskTrackingCopy } from "./task-tracking-copy";

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DEFERRED";
export type TrackedTask = {
  id: string; key: string; title: string; ownerId: string | null; status: TaskStatus; version: number;
  dueOn: string | null; remindedAt: string | null; history: Array<{ action: string; byName: string; at: string }>;
};
export type TaskAction = Record<string, unknown> & { action: string; taskId: string };
type Staff = Array<{ id: string; fullName: string }>;

export const isOverdue = (task: Pick<TrackedTask, "dueOn" | "status">, today = new Date().toISOString().slice(0, 10)) =>
  !!task.dueOn && task.dueOn < today && (task.status === "OPEN" || task.status === "IN_PROGRESS");

/**
 * Setup task tracking (SKAI-155), shared by the setup-area guide and the follow-ups list: owner, due date,
 * reminder and the latest changes. The lead plans; an owner who is not the lead sees their own task read-only here
 * and moves it with the status buttons. Every write carries the task version, so a stale tab gets a 409.
 */
export function TaskTracking({ task, language, lead, staff, busy, onAction }: {
  task: TrackedTask; language: string; lead: boolean; staff: Staff; busy: boolean; onAction(body: TaskAction): void;
}) {
  const c = getTaskTrackingCopy(language);
  const act = (body: Record<string, unknown> & { action: string }) => onAction({ ...body, taskId: task.id, expectedVersion: task.version });
  const day = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const when = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const ownerName = staff.find(person => person.id === task.ownerId)?.fullName ?? c.unassigned;
  const overdue = isOverdue(task);
  const open = task.status !== "DONE";
  return (
    <div className="grid gap-2" data-testid="task-tracking">
      {lead ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">{c.owner}
            <Select value={task.ownerId ?? ""} disabled={busy} onChange={event => act({ action: "assign", ownerId: event.target.value || null })}>
              <option value="">{c.unassigned}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">{c.due}
            <Input type="date" dir="ltr" value={task.dueOn ?? ""} disabled={busy} onChange={event => act({ action: "schedule", dueOn: event.target.value || null })} />
          </label>
        </div>
      ) : task.dueOn ? <p className="text-sm text-ink-muted">{c.due}: <bdi>{day(task.dueOn)}</bdi>{open ? <> · <RelativeTime iso={`${task.dueOn}T23:59:59`} full={day(task.dueOn)} className={cn("font-semibold", overdue ? "text-status-error-text" : "text-ink")} /></> : null}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {overdue ? <DeskPill tone="danger" className="gap-1"><CalendarClock aria-hidden="true" className="size-3.5" />{c.overdue}</DeskPill> : null}
        {lead && open && task.dueOn && !overdue ? <span className="text-xs font-semibold text-ink-muted">{c.due}: <RelativeTime iso={`${task.dueOn}T23:59:59`} full={day(task.dueOn)} /></span> : null}
        {task.status === "OPEN" ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "status", status: "IN_PROGRESS" })}>{c.start}</Button> : null}
        {lead && open && task.ownerId ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={busy} onClick={() => act({ action: "remind" })}>
            <BellRing aria-hidden="true" className="size-4" />{c.remind}<span className="sr-only">: {ownerName}</span>
          </Button>
        ) : null}
        {task.remindedAt ? <span className="text-xs text-ink-subtle">{c.reminded} <bdi>{when(task.remindedAt)}</bdi></span> : null}
      </div>
      {task.history.length ? (
        <details className="text-xs text-ink-muted">
          <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold"><History aria-hidden="true" className="size-3.5" />{c.history}</summary>
          <ol className={cn(deskTimeline, "mt-2 gap-1.5")}>
            {task.history.map(entry => <li key={`${entry.at}-${entry.action}`} data-tone={entry.action === "status:DONE" ? "success" : entry.action === "remind" ? "warning" : entry.action === "status:DEFERRED" ? "neutral" : "brand"}><span className="font-semibold text-ink">{c.actions[entry.action] ?? entry.action}</span> · {entry.byName} · <bdi>{when(entry.at)}</bdi></li>)}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
