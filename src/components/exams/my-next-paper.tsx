"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, MonitorCheck, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import type { TimelineEntry, TimelineState } from "@/lib/school-ai/exam-timeline";

type Timeline = { now: string; timeZone: string; next: TimelineEntry | null; upcoming: TimelineEntry[]; past: TimelineEntry[] };

const STATE: Record<TimelineState, { label: string; tone: "info" | "success" | "warning" | "neutral" | "default" }> = {
  UPCOMING: { label: "Opens", tone: "info" }, OPEN: { label: "Open now", tone: "default" }, IN_PROGRESS: { label: "Resume", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "success" }, RESULT_RELEASED: { label: "Result released", tone: "success" }, MISSED: { label: "Missed", tone: "neutral" }, DONE: { label: "Done", tone: "neutral" },
};

/**
 * SKO-505 My Next Paper: one date sheet of paper and online sittings, the next one first with a countdown.
 * The countdown runs from the server's clock (its offset from this device is measured once), so a wrong
 * device clock does not move it; times are shown in the school's time zone.
 */
export function MyNextPaper({ source, examHref }: { source: string; examHref?: (id: string) => string }) {
  const ui = useUiText();
  const { language } = useLocale();
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    setTimeline(null); setFailed(false);
    void fetch(source, { cache: "no-store" }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!live) return;
      if (!response.ok || !payload.timeline) { setFailed(true); return; }
      setOffset(new Date(payload.timeline.now).getTime() - Date.now());
      setTimeline(payload.timeline);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [source]);
  useEffect(() => { const id = window.setInterval(() => setTick(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
  if (failed || !timeline) return null;
  const zone = timeline.timeZone;
  const day = (entry: TimelineEntry) => new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", timeZone: entry.startsAt ? zone : "UTC" }).format(new Date(entry.startsAt ?? `${entry.date}T00:00:00Z`));
  const time = (iso: string | null) => iso ? new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(iso)) : null;
  const countdown = (entry: TimelineEntry) => {
    if (!entry.startsAt) return null;
    const left = new Date(entry.startsAt).getTime() - (tick + offset);
    if (left <= 0) return ui("Starts now");
    const minutes = Math.floor(left / 60_000), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
    const n = (value: number) => new Intl.NumberFormat(language).format(value);
    return days ? ui("Starts in {0} d {1} h", [n(days), n(hours)]) : ui("Starts in {0} h {1} min", [n(hours), n(minutes % 60)]);
  };
  const row = (entry: TimelineEntry) => {
    const state = STATE[entry.state], Icon = entry.kind === "ONLINE" ? MonitorCheck : FileText;
    const start = time(entry.startsAt), end = time(entry.endsAt);
    return <li key={entry.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3" data-timeline-entry={entry.kind} data-timeline-state={entry.state}>
      <div className="flex min-w-0 items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        <div className="min-w-0">
          <p className="font-semibold text-ink-strong [overflow-wrap:anywhere]"><bdi>{entry.subject ?? entry.title}</bdi></p>
          <p className="text-xs text-ink-muted [overflow-wrap:anywhere]"><bdi>{entry.title}</bdi> · {entry.kind === "ONLINE" ? ui("Online") : ui("On paper")}</p>
          <p className="text-xs text-ink-muted">{day(entry)}{start ? <> · <bdi dir="ltr">{start}{end ? `–${end}` : ""}</bdi></> : null}</p>
          {entry.room ? <p className="text-xs text-ink-muted">{ui("Room {0}", [entry.room])}{entry.seat ? <> · {ui("Seat {0}", [entry.seat])}</> : null}{entry.invigilator ? <> · {ui("Invigilator: {0}", [entry.invigilator])}</> : null}</p> : null}
        </div>
      </div>
      <Badge variant={state.tone} size="sm">{ui(state.label)}</Badge>
    </li>;
  };
  const next = timeline.next;
  return <section aria-labelledby="my-next-paper" className="sk-panel space-y-3 p-4" data-my-next-paper>
    <h2 id="my-next-paper" className="flex items-center gap-2 text-base font-bold text-ink-strong"><CalendarClock aria-hidden="true" className="size-4" />{ui("My next paper")}</h2>
    {!next ? <p className="text-sm text-ink-muted">{ui("No exams on your date sheet yet.")}</p> : <div className="rounded-2xl bg-surface-subtle p-4" data-next-paper={next.kind}>
      <p className="text-lg font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{next.subject ?? next.title}</bdi></p>
      <p className="text-sm font-semibold text-primary" data-countdown>{countdown(next)}</p>
      {next.kind === "ONLINE" && examHref && (next.state === "OPEN" || next.state === "IN_PROGRESS") ? <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" href={examHref(next.id.replace(/^online:/, ""))}>{next.state === "IN_PROGRESS" ? ui("Resume") : ui("Open now")}</Link> : null}
    </div>}
    {timeline.upcoming.length > 0 && <ul className="grid gap-2" aria-label={ui("Upcoming exams")}>{timeline.upcoming.map(row)}</ul>}
    {timeline.past.length > 0 && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{ui("Past exams")} · <bdi>{new Intl.NumberFormat(language).format(timeline.past.length)}</bdi></summary><ul className="mt-2 grid gap-2">{timeline.past.map(row)}</ul></details>}
  </section>;
}
