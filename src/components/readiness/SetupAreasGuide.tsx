"use client";
import Link from "next/link";
import { CheckCircle2, Circle, Clock3, Info } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { setupAreaTaskKey, type SetupAreaId } from "@/lib/onboarding/setup-areas";
import { getSetupAreasCopy } from "./setup-areas-copy";

type Status = "OPEN" | "DONE" | "DEFERRED";
export type SetupArea = { id: SetupAreaId; href: string | null; delegated?: boolean };
type AreaTask = { id: string; key: string; status: Status };

/** An area without a task was finished during onboarding (only the logo: its task is seeded while it is missing). */
export function areaRows(areas: SetupArea[], tasks: AreaTask[]) {
  return areas.map(area => {
    const task = tasks.find(item => item.key === setupAreaTaskKey(area.id)) ?? null;
    return { ...area, task, status: (task?.status ?? "DONE") as Status };
  });
}

/**
 * The setup wizard after activation (SKAI-111): the remaining setup areas in order, each opening the screen that
 * owns it. "Later" defers an area and "Back to list" reopens it; both are readiness tasks, so progress resumes
 * wherever the lead signs in next. The first open area is the next step.
 */
export function SetupAreasGuide({ language, areas, tasks, busy, onStatus }: {
  language: string; areas: SetupArea[]; tasks: AreaTask[]; busy: boolean; onStatus(taskId: string, status: Status): void;
}) {
  const c = getSetupAreasCopy(language);
  const rows = areaRows(areas, tasks);
  const done = rows.filter(row => row.status === "DONE").length;
  const nextId = rows.find(row => row.status === "OPEN")?.id;
  return (
    <section id="setup-areas" aria-labelledby="setup-areas-heading" className="sk-panel space-y-3 p-4 sm:p-6" data-testid="setup-areas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-areas-heading" className="text-lg font-bold text-ink-strong">{c.title}</h2>
        <p className="text-sm font-semibold text-ink-muted" aria-live="polite"><bdi dir="ltr">{done}</bdi> / <bdi dir="ltr">{rows.length}</bdi> {c.doneSuffix}</p>
      </div>
      <p className="text-sm text-ink-muted">{c.intro}</p>
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const Icon = row.status === "DONE" ? CheckCircle2 : row.status === "DEFERRED" ? Clock3 : Circle;
          const isNext = row.id === nextId;
          return (
            <li key={row.id} className="sk-launch-task" data-status={row.status} data-area={row.id} aria-current={isNext ? "step" : undefined}>
              <div className="flex min-w-0 items-start gap-2">
                <Icon aria-hidden="true" className={row.status === "DONE" ? "mt-0.5 size-4 shrink-0 text-status-success-text" : "mt-0.5 size-4 shrink-0 text-ink-subtle"} />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-strong"><bdi dir="ltr">{index + 1}</bdi>. {c.areas[row.id].title}</p>
                  <p className="text-sm text-ink-muted">{c.areas[row.id].why}</p>
                  <span className="sk-choice-tag mt-1" data-tone={row.status === "DONE" ? undefined : row.status === "DEFERRED" ? "brand" : "info"}>{isNext ? c.next : c.statuses[row.status]}</span>
                  {row.delegated ? <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-status-info-text"><Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{c.delegated}</p> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.href && row.status !== "DONE" ? <Link href={row.href} className={buttonVariants({ variant: isNext ? "default" : "outline", size: "sm", className: "gap-2" })}>{c.open}<span className="sr-only">: {c.areas[row.id].title}</span> <ForwardArrow /></Link> : null}
                {row.task && row.status !== "DONE" ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onStatus(row.task!.id, "DONE")}>{c.markDone}</Button> : null}
                {row.task && row.status === "OPEN" ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onStatus(row.task!.id, "DEFERRED")}>{c.later}</Button> : null}
                {row.task && row.status !== "OPEN" ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onStatus(row.task!.id, "OPEN")}>{c.reopen}</Button> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
