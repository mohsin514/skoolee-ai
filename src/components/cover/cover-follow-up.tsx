"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

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
  const [day, setDay] = useState(todayText()), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [data, setData] = useState<{ covered: Covered[]; recoveries: Recovery[]; uncoveredRecorded: string[] } | null>(null), [uncovered, setUncovered] = useState<Uncovered[]>([]);
  const load = useCallback(async () => {
    setError("");
    const [a, b] = await Promise.all([fetch(`/api/cover/campus?${scope}date=${day}`, { cache: "no-store" }).catch(() => null), fetch(`/api/staff/cover?${scope}date=${day}`, { cache: "no-store" }).catch(() => null)]);
    const ja = await a?.json().catch(() => ({})), jb = await b?.json().catch(() => ({}));
    if (!a?.ok || !ja?.success) { setError(ui(ja?.error || "Cover follow-up could not be loaded.")); return; }
    setData(ja.data); setUncovered(jb?.success ? jb.data.lessons : []);
  }, [scope, day, ui]);
  useEffect(() => { void load(); }, [load]);
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
    <header className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-base font-bold">{ui("Cover follow-up")}</h3><p className="text-xs text-ink-muted">{ui("Covering a room is not the same as teaching the planned lesson.")}</p></div>
      <FormField name="cover-day" label={ui("Day")}><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></FormField></header>
    {error ? <p className="text-sm text-rose-700">{error}</p> : !data ? <p className="text-sm text-ink-muted">{ui("Loading cover…")}</p> : <>
      <div className="space-y-1" data-follow-covered><p className="text-xs font-semibold uppercase text-ink-muted">{ui("Covered lessons")}</p>
        {data.covered.length ? data.covered.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge/40 px-3 py-2 text-sm" data-follow-duty={c.id}>
          <span><bdi>{c.startTime}–{c.endTime}</bdi> · <bdi>{c.className}</bdi> · <span dir="auto">{c.subjectName}</span> · {ui("Covered by {0}", [c.substitute])}</span>
          <span className="text-xs">{c.handoverReady ? ui("Handover ready") : <span className="font-bold text-amber-800">{ui("No handover")}</span>} · {c.acknowledged ? ui("Acknowledged") : ui("Not acknowledged")} · {outcome(c.outcome)}</span>
        </div>) : <p className="text-sm text-ink-muted">{ui("No approved cover on this day.")}</p>}</div>
      {uncovered.length ? <div className="space-y-1" data-follow-uncovered><p className="text-xs font-semibold uppercase text-ink-muted">{ui("Lessons without cover")}</p>
        {uncovered.map(l => <div key={l.slotId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm" data-follow-lesson={l.slotId}>
          <span><bdi>{l.startTime}–{l.endTime}</bdi> · <bdi>{l.className}</bdi> · <span dir="auto">{l.subject ?? ""}</span>{l.absentTeacher ? <> · <bdi>{l.absentTeacher}</bdi></> : null}</span>
          {data.uncoveredRecorded.includes(l.slotId) ? <span className="text-xs font-bold">{ui("Recorded for follow-up")}</span> : <Button size="sm" variant="outline" disabled={busy} onClick={() => void recordNoCover(l.slotId)} data-follow-record>{ui("Record no cover")}</Button>}
        </div>)}</div> : null}
      <div className="space-y-1" data-follow-recoveries><p className="text-xs font-semibold uppercase text-ink-muted">{ui("Missed learning still open")}</p>
        {data.recoveries.length ? data.recoveries.map(r => <p key={r.id} className="text-sm" data-follow-recovery={r.id}><bdi>{formatDate(r.date)}</bdi> · <bdi>{r.className}</bdi> · <span dir="auto">{r.subjectName}</span> · <bdi>{r.owner}</bdi> · {status(r.status)}{r.dueDate ? <> · {ui("Due")} <bdi>{formatDate(r.dueDate)}</bdi></> : null}</p>) : <p className="text-sm text-ink-muted">{ui("No missed learning is waiting.")}</p>}</div>
    </>}
  </section>;
}
