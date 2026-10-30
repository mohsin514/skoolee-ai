"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { AlertTriangle, BookOpenCheck, CalendarCheck, DoorOpen, Hourglass } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskStats, StatTile, deskRow, urgencyFirst } from "@/components/ui/desk";
import { cn } from "@/lib/utils";

import { checkedJson, readRequest, requestFailure, RequestFailure } from "@/lib/http/request-state";

// SKO-442: after cover is approved — did each covered lesson get a handover, was it acknowledged, what
// happened — and which lessons had no cover. A lesson without cover is recorded here so its teacher gets a
// recovery decision; nothing on this panel marks learning as delivered.

type Covered = { id: string; date: string; startTime: string; endTime: string; className: string; subjectName: string; substitute: string; originalTeacher: string; handoverReady: boolean; acknowledged: boolean; outcome: string | null };
type Recovery = { id: string; date: string; className: string; subjectName: string; source: string; status: string; owner: string; dueDate: string | null };
type Uncovered = { slotId: string; startTime: string; endTime: string; className: string; subject: string | null; absentTeacher: string | null };
const todayText = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

export function CoverFollowUp({ campusId }: { campusId?: string }) {
  const ui = useUiText();
  const { date: formatDate } = useLocaleFormat();
  const scope = campusId ? `campusId=${encodeURIComponent(campusId)}&` : "";
  const [day, setDay] = useState(todayText()), [busy, setBusy] = useState(false), [error, setError] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);
  const [focus, setFocus] = useState<"" | "covered" | "uncovered" | "recoveries">("");
  const toggle = (next: typeof focus) => setFocus(f => f === next ? "" : next);
  const show = (part: typeof focus) => !focus || focus === part;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ covered: Covered[]; recoveries: Recovery[]; uncoveredRecorded: string[] } | null>(null), [uncovered, setUncovered] = useState<Uncovered[]>([]);
  const load = useCallback(async () => {
    const version = ++sequence.current;
    setError(null); setLoading(true);
    try {
      const [ja, jb] = await Promise.all([
        readRequest(`/api/cover/campus?${scope}date=${day}`).then(r => checkedJson(r)),
        readRequest(`/api/staff/cover?${scope}date=${day}`).then(r => checkedJson(r)),
      ]);
      if (version !== sequence.current) return;
      if (!Array.isArray(ja.data?.covered) || !Array.isArray(ja.data?.recoveries) || !Array.isArray(ja.data?.uncoveredRecorded) || !Array.isArray(jb.data?.lessons)) throw new RequestFailure("server");
      setData(ja.data); setUncovered(jb.data.lessons);
    } catch (failure) {
      if (version === sequence.current) { setData(null); setUncovered([]); setError(requestFailure(failure)); }
    } finally { if (version === sequence.current) setLoading(false); }
  }, [scope, day]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const recordNoCover = async (slotId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/cover/campus?${scope.replace(/&$/, "")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "uncovered", slotId, date: day }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
      toast.success(ui("Recorded. The class teacher will decide on a catch-up.")); await load();
    } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); }
  };
  const outcome = (o: string | null) => o === "DELIVERED" ? ui("Taught as planned") : o === "SUPERVISED_ONLY" ? ui("Supervised only") : o === "NOT_HELD" ? ui("Did not take place") : ui("Outcome not recorded");
  const status = (s: string) => ({ DECISION_NEEDED: ui("Decision needed"), PLANNED: ui("Planned, not shared"), PUBLISHED: ui("Shared with the class") } as Record<string, string>)[s] ?? s;

  return <section className="sk-panel space-y-4 p-5" data-cover-follow-up>
    <header className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-base font-bold text-ink-strong">{ui("Cover follow-up")}</h3><p className="text-xs leading-relaxed text-ink-muted">{ui("Covering a room is not the same as teaching the planned lesson.")}</p></div>
      <FormField name="cover-day" label={ui("Day")}><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></FormField></header>
    {error ? <ErrorState variant="panel" error={error} onRetry={() => void load()} /> : loading || !data ? <SkeletonList rows={3} label={ui("Loading cover…")} /> : <>
      <DeskStats data-follow-pulse>
        <StatTile index={0} icon={DoorOpen} tone={data.covered.some(c => !c.handoverReady || !c.acknowledged) ? "warning" : "success"} value={data.covered.length} label={ui("Covered lessons")} onSelect={() => toggle("covered")} selected={focus === "covered"} />
        <StatTile index={1} icon={AlertTriangle} tone={uncovered.some(l => !data.uncoveredRecorded.includes(l.slotId)) ? "danger" : uncovered.length ? "info" : "success"} value={uncovered.length} label={ui("Lessons without cover")} onSelect={uncovered.length ? () => toggle("uncovered") : undefined} selected={focus === "uncovered"} />
        <StatTile index={2} icon={Hourglass} tone={data.recoveries.length ? "warning" : "success"} value={data.recoveries.length} label={ui("Missed learning still open")} onSelect={() => toggle("recoveries")} selected={focus === "recoveries"} />
      </DeskStats>
      <DeskFilterStatus shown={(show("covered") ? data.covered.length : 0) + (show("uncovered") ? uncovered.length : 0) + (show("recoveries") ? data.recoveries.length : 0)} total={data.covered.length + uncovered.length + data.recoveries.length} onClear={() => setFocus("")} />
      {show("covered") ? <div className="space-y-2" data-follow-covered><p className="sk-eyebrow">{ui("Covered lessons")}</p>
        {data.covered.length ? data.covered.map(c => <div key={c.id} className={cn(deskRow, "flex flex-wrap items-center justify-between gap-2 text-sm")} data-tone={!c.handoverReady ? "warning" : c.outcome === "DELIVERED" ? "success" : undefined} data-follow-duty={c.id}>
          <span className="flex min-w-0 items-center gap-3"><DeskRowIcon icon={DoorOpen} /><span className="min-w-0"><bdi>{c.startTime}–{c.endTime}</bdi> · <bdi>{c.className}</bdi> · <span dir="auto">{c.subjectName}</span> · {ui("Covered by {0}", [c.substitute])}</span></span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">{c.handoverReady ? <DeskPill tone="success">{ui("Handover ready")}</DeskPill> : <DeskPill tone="warning">{ui("No handover")}</DeskPill>}<DeskPill tone={c.acknowledged ? "success" : "neutral"}>{c.acknowledged ? ui("Acknowledged") : ui("Not acknowledged")}</DeskPill><DeskPill tone={c.outcome === "DELIVERED" ? "success" : c.outcome ? "warning" : "neutral"}>{outcome(c.outcome)}</DeskPill></span>
        </div>) : <EmptyState size="sm" icon={CalendarCheck} title={ui("No approved cover on this day.")} />}</div> : null}
      {uncovered.length && show("uncovered") ? <div className="space-y-2" data-follow-uncovered><p className="sk-eyebrow">{ui("Lessons without cover")}</p>
        {urgencyFirst(uncovered, l => data.uncoveredRecorded.includes(l.slotId) ? 1 : 0).map(l => <div key={l.slotId} className={cn(deskRow, "flex flex-wrap items-center justify-between gap-2 text-sm")} data-tone={data.uncoveredRecorded.includes(l.slotId) ? "info" : "warning"} data-follow-lesson={l.slotId}>
          <span className="flex min-w-0 items-center gap-3"><DeskRowIcon icon={AlertTriangle} /><span className="min-w-0"><bdi>{l.startTime}–{l.endTime}</bdi> · <bdi>{l.className}</bdi> · <span dir="auto">{l.subject ?? ""}</span>{l.absentTeacher ? <> · <bdi>{l.absentTeacher}</bdi></> : null}</span></span>
          {data.uncoveredRecorded.includes(l.slotId) ? <DeskPill tone="info">{ui("Recorded for follow-up")}</DeskPill> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void recordNoCover(l.slotId)} data-follow-record>{ui("Record no cover")}</Button>}
        </div>)}</div> : null}
      {show("recoveries") ? <div className="space-y-2" data-follow-recoveries><p className="sk-eyebrow">{ui("Missed learning still open")}</p>
        {data.recoveries.length ? data.recoveries.map(r => <p key={r.id} className={cn(deskRow, "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink")} data-tone={r.status === "DECISION_NEEDED" ? "warning" : undefined} data-follow-recovery={r.id}><DeskRowIcon icon={BookOpenCheck} /><span className="min-w-0 flex-1"><bdi>{formatDate(r.date)}</bdi> · <bdi>{r.className}</bdi> · <span dir="auto">{r.subjectName}</span> · <bdi>{r.owner}</bdi>{r.dueDate ? <> · {ui("Due")} <bdi>{formatDate(r.dueDate)}</bdi></> : null}</span><DeskPill tone={r.status === "DECISION_NEEDED" ? "warning" : r.status === "PUBLISHED" ? "brand" : "info"}>{status(r.status)}</DeskPill></p>) : <p className="flex items-center gap-2 rounded-(--radius-control) bg-status-success-surface px-3 py-2.5 text-sm text-status-success-text"><CalendarCheck aria-hidden="true" className="size-4 shrink-0" />{ui("No missed learning is waiting.")}</p>}</div> : null}
    </>}
  </section>;
}
