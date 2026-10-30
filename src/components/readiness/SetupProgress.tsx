"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { progressFreshness, type SetupProgress as Progress_, type Tally } from "@/lib/readiness/progress";
import { getSetupProgressCopy } from "./setup-progress-copy";

const fill = (template: string, ...values: (string | number)[]) => template.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ""));
const BUCKETS = ["done", "inProgress", "open", "deferred"] as const;

/**
 * Setup progress (SKAI-160): overall and per-campus totals over the readiness records, each count linking to the
 * records behind it, with when they were read and whether that reading is stale or partial. The definitions are
 * shown, not implied, so a lead can recount any number by hand. Leads see the whole school; other staff see only
 * the follow-ups they own (the server decides which, the screen only renders what it was given).
 */
export function SetupProgress({ progress, language, lead, busy, onRefresh }: { progress: Progress_; language: string; lead: boolean; busy: boolean; onRefresh: () => void }) {
  const c = getSetupProgressCopy(language);
  const [now, setNow] = useState(() => Date.now());
  // Re-check freshness each minute so an open tab turns stale on its own.
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, [progress.generatedAt]);
  const freshness = progressFreshness(progress, now);
  const when = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(progress.generatedAt));
  const n = (value: number) => <bdi dir="ltr" className="tabular-nums">{value}</bdi>;

  const tallyCard = (id: string, title: string, t: Tally, href: string) => (
    <li className="sk-panel space-y-2 p-3" data-progress-metric={id}>
      <a href={href} className="flex items-baseline justify-between gap-2 rounded-md">
        <span className="text-sm font-semibold text-ink-strong">{title}</span>
        <span className="text-sm font-bold text-ink-strong" data-progress-value>{fill(c.ofTotal, t.done, t.total)}</span>
      </a>
      <Progress value={t.done} max={t.total || 1} label={title} size="sm" tone={t.total && t.done === t.total ? "success" : "brand"} />
      <ul className="flex flex-wrap gap-1.5" aria-label={title}>
        {BUCKETS.map(bucket => <li key={bucket} className="sk-choice-tag" data-bucket={bucket} data-count={t[bucket]}>{c.buckets[bucket]} {n(t[bucket])}</li>)}
      </ul>
    </li>
  );

  return (
    <section id="progress" aria-labelledby="progress-heading" className="sk-panel space-y-4 p-4 sm:p-6" data-freshness={freshness}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="progress-heading" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><BarChart3 aria-hidden="true" className="size-5 text-primary" />{lead ? c.title : c.mine}</h2>
          <p className="text-sm text-ink-muted">{c.help}</p>
          <p className="text-xs font-semibold text-ink-muted" data-progress-refreshed><time dateTime={progress.generatedAt}>{fill(c.refreshed, when)}</time></p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefresh} className="shrink-0 gap-2">
          <RefreshCw aria-hidden="true" className="size-4" />{busy ? c.refreshing : c.refresh}
        </Button>
      </div>

      {freshness === "stale" ? <Alert tone="warning" title={c.stale}>{c.staleBody}</Alert> : null}
      {progress.partial.length ? <Alert tone="info" title={c.partial}>{fill(c.partialBody, progress.partial.map(source => c.partialSources[source] ?? source).join("; "))}</Alert> : null}
      {lead && !progress.reconciliation.campuses ? <Alert tone="warning" title={c.mismatch}>{c.mismatchBody}</Alert> : null}

      {lead ? <Progress value={progress.percent} label={fill(c.overall, progress.percent)} showValue valueText={`${progress.percent}%`} tone={progress.percent === 100 ? "success" : "brand"} /> : null}

      {progress.followUps.total === 0 && !lead ? <p className="text-sm text-ink-muted">{c.empty}</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {lead ? tallyCard("areas", c.areas, progress.areaTally, "#setup-areas") : null}
          {tallyCard("followUps", c.followUps, progress.followUps, lead ? "#tasks" : "#my-tasks")}
          {lead ? (
            <li className="sk-panel space-y-2 p-3" data-progress-metric="checks">
              <a href="#checks" className="flex items-baseline justify-between gap-2 rounded-md">
                <span className="text-sm font-semibold text-ink-strong">{c.checks}</span>
                <span className="text-sm font-bold text-ink-strong" data-progress-value>{fill(c.ofTotal, progress.checks.passed, progress.checks.total)}</span>
              </a>
              <Progress value={progress.checks.passed} max={progress.checks.total || 1} label={c.checks} size="sm" />
            </li>
          ) : null}
          {lead && progress.campusTotals.total ? (
            <li className="sk-panel space-y-2 p-3" data-progress-metric="campuses">
              <a href="#campus-progress" className="flex items-baseline justify-between gap-2 rounded-md">
                <span className="text-sm font-semibold text-ink-strong">{c.campuses}</span>
                <span className="text-sm font-bold text-ink-strong" data-progress-value>{fill(c.ofTotal, progress.campusTotals.ready, progress.campusTotals.total)}</span>
              </a>
              <Progress value={progress.campusTotals.ready} max={progress.campusTotals.total} label={c.campuses} size="sm" />
            </li>
          ) : null}
        </ul>
      )}

      {lead && progress.campuses.length ? (
        <div id="campus-progress" className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead><tr className="text-start text-xs text-ink-muted">
              <th scope="col" className="py-1.5 text-start font-semibold">{c.campuses}</th>
              <th scope="col" className="py-1.5 text-end font-semibold">{c.classes}</th>
              <th scope="col" className="py-1.5 text-end font-semibold">{c.pupils}</th>
            </tr></thead>
            <tbody>
              {progress.campuses.map(campus => (
                <tr key={campus.id} className="border-t border-border-subtle" data-campus-row={campus.id}>
                  <th scope="row" className="py-2 text-start font-semibold text-ink-strong">
                    <span className="me-2">{campus.name}</span>
                    {campus.ready ? <span className="sk-choice-tag">{c.campusReady}</span> : null}
                  </th>
                  <td className="py-2 text-end">{campus.classesHref ? <Link href={campus.classesHref} aria-label={`${c.openRecords}: ${campus.name} ${c.classes}`} className="font-semibold text-primary underline-offset-2 hover:underline">{n(campus.classes)}</Link> : n(campus.classes)}</td>
                  <td className="py-2 text-end">{campus.pupilsHref ? <Link href={campus.pupilsHref} aria-label={`${c.openRecords}: ${campus.name} ${c.pupils}`} className="font-semibold text-primary underline-offset-2 hover:underline">{n(campus.students)}</Link> : n(campus.students)}</td>
                </tr>
              ))}
              {progress.school ? (
                <tr className="border-t border-border-subtle font-bold text-ink-strong" data-school-total>
                  <th scope="row" className="py-2 text-start">{c.schoolTotal}</th>
                  <td className="py-2 text-end">{n(progress.school.classes)}</td>
                  <td className="py-2 text-end">{n(progress.school.students)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {progress.reconciled ? <p className="pt-2 text-xs font-semibold text-status-success-text">{c.reconciled}</p> : null}
        </div>
      ) : null}

      {lead ? (
        <details className="text-sm text-ink-muted">
          <summary className="cursor-pointer font-semibold text-ink-strong">{c.definitionsTitle}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5">{c.definitions.map(line => <li key={line}>{line}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
