"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-442: a teacher's cover. Lessons I cover: the handover, its resources (open only until the end of the
// lesson's day), acknowledge, then say what actually happened. My lessons being covered: write the handover.
// Missed learning I own: plan a catch-up, share it with the class, complete it — or say why none is needed.

type Duty = { id: string; role: "COVERING" | "COVERED"; date: string; startTime: string; endTime: string; className: string; subjectName: string; roomNumber: string | null; substitute: string; originalTeacher: string; handover: { objective: string | null; instructions: string | null; resourceIds: string[]; acknowledgedAt: string | null; outcome: string | null; actualActivity: string | null } | null; resources: { id: string; title: string }[]; choices: { id: string; title: string }[]; resourcesOpen: boolean; canRecord: boolean };
type Recovery = { id: string; version: number; date: string; className: string; subjectName: string; source: string; status: string; title: string | null; instructions: string | null; dueDate: string | null; decisionNote: string | null; evidenceNote: string | null };
type Data = { today: string; duties: Duty[]; recoveries: Recovery[] };

async function call(method: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/cover", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved.");
  return json.data;
}

export function MyCover() {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Duty | null>(null), [objective, setObjective] = useState(""), [instructions, setInstructions] = useState(""), [picked, setPicked] = useState<string[]>([]);
  const [outcomeFor, setOutcomeFor] = useState<Duty | null>(null), [outcome, setOutcome] = useState(""), [activity, setActivity] = useState("");
  const [rec, setRec] = useState<Recovery | null>(null), [recTitle, setRecTitle] = useState(""), [recText, setRecText] = useState(""), [recDue, setRecDue] = useState(""), [recNote, setRecNote] = useState("");
  const load = useCallback(async () => { setError(""); try { setData(await call("GET")); } catch (e) { setError(ui(e instanceof Error ? e.message : "Cover could not be loaded.")); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<unknown>, done: string) => { setBusy(true); try { await work(); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); await load(); return false; } finally { setBusy(false); } };

  if (error) return <section className="sk-panel p-5" data-my-cover><p className="text-sm text-rose-700">{error}</p></section>;
  if (!data) return <section className="sk-panel p-5" data-my-cover aria-busy="true"><p className="text-sm text-ink-muted">{ui("Loading cover…")}</p></section>;
  if (!data.duties.length && !data.recoveries.length) return null;
  const lesson = (d: Duty) => <><bdi>{date(d.date)}</bdi> <bdi>{d.startTime}–{d.endTime}</bdi> · <bdi>{d.className}</bdi> · <span dir="auto">{d.subjectName}</span>{d.roomNumber ? <> · {ui("Room")} <bdi>{d.roomNumber}</bdi></> : null}</>;
  const outcomeLabel = (o: string) => o === "DELIVERED" ? ui("Taught as planned") : o === "SUPERVISED_ONLY" ? ui("Supervised only") : ui("Did not take place");
  const recStatus = (s: string) => ({ DECISION_NEEDED: ui("Decision needed"), PLANNED: ui("Planned, not shared"), PUBLISHED: ui("Shared with the class"), COMPLETED: ui("Completed"), NOT_NEEDED: ui("No catch-up needed") } as Record<string, string>)[s] ?? s;
  const covering = data.duties.filter(d => d.role === "COVERING"), covered = data.duties.filter(d => d.role === "COVERED");

  return <section className="sk-panel space-y-4 p-5" data-my-cover>
    <header><h3 className="text-base font-black">{ui("Cover and missed learning")}</h3><p className="text-xs text-ink-muted">{ui("Covering a room is not the same as teaching the planned lesson. Say what happened so missed learning is followed up.")}</p></header>

    {covering.length ? <div className="space-y-2" data-cover-covering><p className="text-xs font-black uppercase text-ink-muted">{ui("Lessons you are covering")}</p>
      {covering.map(d => <div key={d.id} className="rounded-xl border border-[#cfc2d6]/40 p-3" data-duty={d.id}>
        <p className="text-sm font-bold">{lesson(d)}</p><p className="text-xs text-ink-muted">{ui("For {0}", [d.originalTeacher])}</p>
        {d.handover?.objective ? <div className="mt-2 rounded-lg bg-[#f6f2f8] p-2 text-sm" data-handover><p><span className="font-bold">{ui("Objective")}:</span> <span dir="auto">{d.handover.objective}</span></p>{d.handover.instructions ? <p className="mt-1 text-xs" dir="auto">{d.handover.instructions}</p> : null}
          {d.resources.length ? <ul className="mt-1 text-xs">{d.resources.map(r => <li key={r.id}>{d.resourcesOpen ? <a className="underline" href={`/api/resources/${r.id}/file`} data-handover-resource={r.id} dir="auto">{r.title}</a> : <span dir="auto">{r.title}</span>}</li>)}</ul> : null}
          {!d.resourcesOpen && d.resources.length ? <p className="text-[11px] text-ink-muted">{ui("Resources were available until the end of the lesson's day.")}</p> : null}
        </div> : <p className="mt-2 text-xs font-bold text-amber-800">{ui("No handover yet. Ask the class teacher or your coordinator.")}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {!d.handover?.acknowledgedAt ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => call("POST", { action: "acknowledge", dutyId: d.id }), "Cover acknowledged.")} data-duty-ack>{ui("Acknowledge")}</Button> : <span className="text-xs font-bold text-emerald-700">{ui("Acknowledged")}</span>}
          {d.handover?.outcome ? <span className="text-xs font-bold">{outcomeLabel(d.handover.outcome)}</span> : d.canRecord ? <Button size="sm" disabled={busy} onClick={() => { setOutcomeFor(d); setOutcome(""); setActivity(""); }} data-duty-outcome>{ui("Say what happened")}</Button> : null}
        </div>
      </div>)}</div> : null}

    {covered.length ? <div className="space-y-2" data-cover-covered><p className="text-xs font-black uppercase text-ink-muted">{ui("Your lessons being covered")}</p>
      {covered.map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfc2d6]/40 p-3" data-duty={d.id}>
        <div><p className="text-sm font-bold">{lesson(d)}</p><p className="text-xs text-ink-muted">{ui("Covered by {0}", [d.substitute])}{d.handover?.acknowledgedAt ? <> · {ui("Acknowledged")}</> : null}{d.handover?.outcome ? <> · {outcomeLabel(d.handover.outcome)}</> : null}</p></div>
        {d.date >= data.today ? <Button size="sm" variant={d.handover?.objective ? "outline" : "default"} onClick={() => { setEditing(d); setObjective(d.handover?.objective ?? ""); setInstructions(d.handover?.instructions ?? ""); setPicked(d.handover?.resourceIds ?? []); }} data-duty-handover>{d.handover?.objective ? ui("Edit handover") : ui("Write handover")}</Button> : null}
      </div>)}</div> : null}

    {data.recoveries.length ? <div className="space-y-2" data-cover-recoveries><p className="text-xs font-black uppercase text-ink-muted">{ui("Missed learning to follow up")}</p>
      {data.recoveries.map(r => <div key={r.id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3", r.status === "DECISION_NEEDED" ? "border-amber-300 bg-amber-50/60" : "border-[#cfc2d6]/40")} data-recovery={r.id} data-recovery-status={r.status}>
        <div><p className="text-sm font-bold"><bdi>{date(r.date)}</bdi> · <bdi>{r.className}</bdi> · <span dir="auto">{r.subjectName}</span></p><p className="text-xs text-ink-muted">{r.source === "UNCOVERED" ? ui("No cover") : r.source === "SUPERVISED_ONLY" ? ui("Supervised only") : ui("Did not take place")} · {recStatus(r.status)}{r.title ? <> · <span dir="auto">{r.title}</span></> : null}{r.dueDate ? <> · {ui("Due")} <bdi>{date(r.dueDate)}</bdi></> : null}</p></div>
        {["DECISION_NEEDED", "PLANNED", "PUBLISHED"].includes(r.status) ? <Button size="sm" onClick={() => { setRec(r); setRecTitle(r.title ?? ""); setRecText(r.instructions ?? ""); setRecDue(r.dueDate ?? data.today); setRecNote(""); }} data-recovery-open>{ui("Follow up")}</Button> : null}
      </div>)}</div> : null}

    {editing ? <ModalFrame title={ui("Handover")} eyebrow={editing.substitute} subtitle={`${date(editing.date)} ${editing.startTime}–${editing.endTime} · ${editing.className}`} onClose={() => setEditing(null)}>
      <div className="space-y-3" data-handover-dialog>
        <FormField name="h-objective" label={ui("What should pupils learn?")}><Input value={objective} onChange={e => setObjective(e.target.value)} maxLength={300} /></FormField>
        <FormField name="h-instructions" label={ui("Instructions for the substitute (staff only)")}><Textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={2000} /></FormField>
        <fieldset><legend className="text-xs font-bold">{ui("Resources the substitute may open for this lesson")}</legend>
          {editing.choices.length ? editing.choices.map(c => <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={picked.includes(c.id)} onChange={e => setPicked(e.target.checked ? [...picked, c.id] : picked.filter(x => x !== c.id))} data-handover-pick={c.id} /> <span dir="auto">{c.title}</span></label>) : <p className="text-xs text-ink-muted">{ui("This class has no published resources.")}</p>}</fieldset>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>{ui("Back")}</Button><Button disabled={busy || !objective.trim()} onClick={() => void run(() => call("POST", { action: "handover", dutyId: editing.id, objective, instructions, resourceIds: picked }), "Handover saved. The substitute has been told.").then(ok => ok && setEditing(null))} data-handover-save>{ui("Save handover")}</Button></div>
      </div>
    </ModalFrame> : null}

    {outcomeFor ? <ModalFrame title={ui("What happened in this lesson?")} eyebrow={outcomeFor.className} subtitle={`${date(outcomeFor.date)} ${outcomeFor.startTime}–${outcomeFor.endTime}`} onClose={() => setOutcomeFor(null)}>
      <div className="space-y-3" data-outcome-dialog>
        <fieldset className="space-y-1 text-sm">{["DELIVERED", "SUPERVISED_ONLY", "NOT_HELD"].map(o => <label key={o} className="flex items-center gap-2"><input type="radio" name="cover-outcome" checked={outcome === o} onChange={() => setOutcome(o)} data-outcome={o} /> {outcomeLabel(o)}</label>)}</fieldset>
        {outcome && outcome !== "DELIVERED" ? <FormField name="o-activity" label={ui("What did pupils do instead?")} hint={ui("The class teacher will decide on a catch-up.")}><Textarea rows={2} value={activity} onChange={e => setActivity(e.target.value)} /></FormField> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOutcomeFor(null)}>{ui("Back")}</Button><Button disabled={busy || !outcome || (outcome !== "DELIVERED" && !activity.trim())} onClick={() => void run(() => call("POST", { action: "outcome", dutyId: outcomeFor.id, outcome, actualActivity: activity }), "Recorded.").then(ok => ok && setOutcomeFor(null))} data-outcome-save>{ui("Record")}</Button></div>
      </div>
    </ModalFrame> : null}

    {rec ? <ModalFrame title={ui("Catch-up for a missed lesson")} eyebrow={`${rec.className} · ${rec.subjectName}`} subtitle={date(rec.date)} onClose={() => setRec(null)}>
      <div className="space-y-3" data-recovery-dialog>
        {rec.status !== "PUBLISHED" ? <>
          <FormField name="r-title" label={ui("Catch-up task")}><Input value={recTitle} onChange={e => setRecTitle(e.target.value)} maxLength={200} /></FormField>
          <FormField name="r-text" label={ui("Instructions for pupils")}><Textarea rows={3} value={recText} onChange={e => setRecText(e.target.value)} /></FormField>
          <FormField name="r-due" label={ui("Due")}><Input type="date" value={recDue} min={rec.date} onChange={e => setRecDue(e.target.value)} /></FormField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy || !recTitle.trim()} onClick={() => void run(() => recovery(rec, "plan", { title: recTitle, instructions: recText, dueDate: recDue }), "Catch-up saved. It is not shared yet.").then(ok => ok && setRec(null))} data-recovery-plan>{ui("Save catch-up")}</Button>
            {rec.status === "PLANNED" ? <Button disabled={busy} onClick={() => void run(() => recovery(rec, "publish", {}), "Shared with the class.").then(ok => ok && setRec(null))} data-recovery-publish>{ui("Share with the class")}</Button> : null}
          </div>
          <div className="space-y-2 rounded-xl border border-dashed p-3"><FormField name="r-none" label={ui("Or: why no catch-up is needed")}><Input value={recNote} onChange={e => setRecNote(e.target.value)} /></FormField>
            <div className="flex justify-end"><Button size="sm" variant="secondary" disabled={busy || !recNote.trim()} onClick={() => void run(() => recovery(rec, "not_needed", { note: recNote }), "Recorded.").then(ok => ok && setRec(null))} data-recovery-none>{ui("No catch-up needed")}</Button></div></div>
        </> : <>
          <p className="text-sm"><span className="font-bold" dir="auto">{rec.title}</span>{rec.dueDate ? <> · {ui("Due")} <bdi>{date(rec.dueDate)}</bdi></> : null}</p>
          <FormField name="r-evidence" label={ui("How do you know the learning was recovered?")}><Textarea rows={2} value={recNote} onChange={e => setRecNote(e.target.value)} /></FormField>
          <div className="flex justify-end"><Button disabled={busy || !recNote.trim()} onClick={() => void run(() => recovery(rec, "complete", { evidenceNote: recNote }), "Catch-up completed.").then(ok => ok && setRec(null))} data-recovery-complete>{ui("Mark catch-up complete")}</Button></div>
        </>}
      </div>
    </ModalFrame> : null}
  </section>;
}

const recovery = (r: Recovery, step: string, fields: Record<string, unknown>) => call("POST", { ...fields, action: "recovery", recoveryId: r.id, knownVersion: r.version, step });
