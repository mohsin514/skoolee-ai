"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

// SKO-428: study with class resources. Answers come only from the approved passages of this class and show
// their sources beside them; when the material does not support an answer, it says so. During an exam the
// page offers only the way back to the exam. "Ask my teacher" and the resources always keep working.

type Source = { label: string; passageId: string; resourceId: string; title: string; version: number; section: string; excerpt?: string };
type Answer = { explanation?: string; hint?: string; check?: string; sources?: Source[]; message?: string; exam?: { title: string; href: string } };
type Turn = { id: string; question: string; outcome: string; answer: Answer; createdAt: string; reportedAt: string | null; helpRequestedAt: string | null };
type Data = { blocked: { title: string; href: string } | null; resources: { id: string; title: string; version: number; language: string; sections: string[] }[]; turns: Turn[] };

class ExamActive extends Error { constructor(public examUrl: string) { super("Help for this assessment is restricted until it ends."); } }
async function call(method: string, body?: Record<string, unknown>) {
  const response = await fetch("/api/study", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  // The server's exam lock answers before the assistant: show only the way back to the exam.
  if (response.status === 409 && json.code === "EXAM_SESSION_ACTIVE") throw new ExamActive(String(json.examUrl ?? "/student"));
  if (!response.ok || !json.success) throw new Error(json.error || "Study assistance is unavailable. Your class resources still work.");
  return json.data;
}

export function StudyAssistant() {
  const ui = useUiText();
  const { language } = useLocale();
  const { dateTime } = useLocaleFormat();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(""), [resourceId, setResourceId] = useState(""), [latest, setLatest] = useState<{ id: string; outcome: string; answer: Answer; sources: Source[] } | null>(null), [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { setError(""); try { setData(await call("GET")); } catch (e) { if (e instanceof ExamActive) setData({ blocked: { title: "", href: e.examUrl }, resources: [], turns: [] }); else setError(ui(e instanceof Error ? e.message : "Study assistance is unavailable. Your class resources still work.")); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    setBusy(true);
    try { const result = await call("POST", { action: "ask", question, resourceId: resourceId || undefined, language }); setLatest(result); if (result.outcome === "BLOCKED") await load(); }
    catch (e) { if (e instanceof ExamActive) { setData(d => ({ blocked: { title: "", href: e.examUrl }, resources: d?.resources ?? [], turns: d?.turns ?? [] })); return; } toast.error(ui(e instanceof Error ? e.message : "Study assistance is unavailable. Your class resources still work.")); } finally { setBusy(false); }
  };
  const flag = async (turnId: string, action: "report" | "help") => { try { await call("POST", { action, turnId }); toast.success(action === "help" ? ui("Your teacher has been asked to help.") : ui("Thank you. Your teacher will check this answer.")); await load(); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } };

  if (error) return <section className="sk-panel p-5" data-study><p className="text-sm text-rose-700">{error}</p><Link className="text-sm underline" href="/student/resources">{ui("Open class resources")}</Link></section>;
  if (!data) return <section className="sk-panel p-5" data-study aria-busy="true"><p className="text-sm text-ink-muted">{ui("Loading your class material…")}</p></section>;
  if (data.blocked) return <section className="sk-panel space-y-2 p-5" data-study data-study-blocked><p className="text-sm font-bold">{ui("Help for this assessment is restricted until it ends.")}</p><Link className="text-sm underline" href={data.blocked.href}>{data.blocked.title ? <><bdi>{data.blocked.title}</bdi> — </> : null}{ui("Return to your exam")}</Link></section>;

  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-study>
    <header><h3 className="text-base font-bold">{ui("Study with class resources")}</h3><p className="text-xs text-ink-muted">{ui("Answers use only your class's approved materials, with their sources. Do not enter private personal information.")}</p></header>
    {!data.resources.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-ink-muted" data-study-empty>{ui("Your teachers have not added study material yet.")} <Link className="underline" href="/student/resources">{ui("Open class resources")}</Link></p> : <>
      <FormField name="study-resource" label={ui("Material")}><Select className="w-full min-w-0" value={resourceId} onChange={e => setResourceId(e.target.value)}><option value="">{ui("All my approved class material")}</option>{data.resources.map(r => <option key={r.id} value={r.id}>{r.title} · v{r.version}</option>)}</Select></FormField>
      <FormField name="study-question" label={ui("Your question")}><Textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} maxLength={600} /></FormField>
      <div className="flex flex-wrap justify-end gap-2"><Link className="inline-flex min-h-11 items-center rounded-xl border px-3 text-xs font-bold" href="/student/resources">{ui("Open resources")}</Link><Button disabled={busy || question.trim().length < 3} onClick={() => void submit()} data-study-ask>{busy ? ui("Finding an explanation…") : ui("Explain this topic")}</Button></div>
    </>}

    {latest ? <article className={cn("space-y-2 rounded-2xl border p-3", latest.outcome === "ANSWERED" ? "border-emerald-200" : "border-amber-300 bg-amber-50/40")} data-study-answer={latest.outcome} aria-live="polite">
      {latest.outcome === "ANSWERED" ? <>
        <p className="text-sm" dir="auto">{latest.answer.explanation}</p>
        <div className="space-y-1" data-study-sources><p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{ui("Sources")}</p>{latest.sources.map(s => <div key={s.passageId} className="rounded-lg bg-surface-sunken p-2 text-xs" data-study-source={s.passageId}>
          <Button type="button" variant="link" size="sm" className="h-auto min-h-0 whitespace-normal p-0 text-start text-xs font-bold" aria-expanded={open === s.passageId} onClick={() => setOpen(open === s.passageId ? null : s.passageId)}><bdi>[{s.label}]</bdi> <span dir="auto">{s.title}</span> · v<bdi>{s.version}</bdi> · <span dir="auto">{s.section}</span></Button>
          {open === s.passageId && s.excerpt ? <p className="mt-1 whitespace-pre-wrap" dir="auto">{s.excerpt}</p> : null}
        </div>)}</div>
        {latest.answer.hint ? <p className="text-sm"><span className="font-bold">{ui("Hint")}:</span> <span dir="auto">{latest.answer.hint}</span></p> : null}
        {latest.answer.check ? <p className="text-sm"><span className="font-bold">{ui("Check your understanding")}:</span> <span dir="auto">{latest.answer.check}</span></p> : null}
      </> : <p className="text-sm font-bold" data-study-message>{ui(latest.answer.message ?? "I could not find enough support in your approved materials.")}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void flag(latest.id, "help")} data-study-help>{ui("Ask my teacher")}</Button>{latest.outcome === "ANSWERED" ? <Button size="sm" variant="secondary" onClick={() => void flag(latest.id, "report")} data-study-report>{ui("Report this answer")}</Button> : null}</div>
    </article> : null}

    {data.turns.length ? <details className="text-sm"><summary className="cursor-pointer text-xs font-bold">{ui("Earlier questions")}</summary><ul className="mt-2 space-y-1">{data.turns.map(t => <li key={t.id} className="text-xs" data-study-turn={t.id}><bdi>{dateTime(t.createdAt)}</bdi> · <span dir="auto">{t.question}</span>{t.helpRequestedAt ? <> · {ui("Teacher asked")}</> : null}</li>)}</ul></details> : null}
  </section>;
}

type Desk = { resources: { id: string; title: string; kind: string; publishedVersion: number; eligible: boolean; passages: { id: string; section: string; text: string; version: number; current: boolean }[] }[]; flagged: { id: string; question: string; outcome: string; answer: Answer; reportedAt: string | null; reportReason: string | null; helpRequestedAt: string | null; learner: string }[] };

/** Teacher: add approved study text to published resources; see reports and help requests. */
export function TeacherStudyDesk() {
  const ui = useUiText();
  const [desk, setDesk] = useState<Desk | null>(null), [busy, setBusy] = useState(false);
  const [resourceId, setResourceId] = useState(""), [section, setSection] = useState(""), [text, setText] = useState("");
  const load = useCallback(async () => { const r = await fetch("/api/study/teacher", { cache: "no-store" }); const j = await r.json().catch(() => ({})); if (j.success) { setDesk(j.data); setResourceId(id => id || j.data.resources.find((x: { eligible: boolean }) => x.eligible)?.id || ""); } }, []);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: Record<string, unknown>, done: string) => { setBusy(true); try { const r = await fetch("/api/study/teacher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.success) throw new Error(j.error || "The change was not saved."); toast.success(ui(done)); await load(); return true; } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); return false; } finally { setBusy(false); } };
  if (!desk) return null;
  const eligible = desk.resources.filter(r => r.eligible);
  return <section className="sk-panel space-y-4 p-4 sm:p-5" data-study-desk>
    <header><h3 className="text-base font-bold">{ui("Study help")}</h3><p className="text-xs text-ink-muted">{ui("The study assistant answers only from text you approve here, for the published version of each resource. Answer keys and staff material are never used.")}</p></header>
    {desk.flagged.length ? <div className="space-y-2" data-study-flagged><p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{ui("Reports and help requests")}</p>{desk.flagged.map(f => <div key={f.id} className="rounded-xl border border-status-warning-border bg-status-warning-surface p-3 text-sm" data-study-flag={f.id}>
      <p className="text-xs text-ink-muted"><bdi>{f.learner}</bdi> · {f.helpRequestedAt ? ui("Asked for help") : ui("Reported an answer")}{f.reportReason ? <> · <span dir="auto">{f.reportReason}</span></> : null}</p>
      <p className="font-bold" dir="auto">{f.question}</p>{f.answer?.explanation ? <p className="text-xs" dir="auto">{f.answer.explanation}</p> : null}
      <div className="mt-1 flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={() => void post({ action: "reviewed", turnId: f.id }, "Marked as reviewed.")} data-study-reviewed>{ui("Mark reviewed")}</Button></div>
    </div>)}</div> : null}
    <div className="space-y-2 rounded-xl border border-dashed p-3" data-study-add>
      <FormField name="sp-resource" label={ui("Published resource")}><Select className="w-full min-w-0" value={resourceId} onChange={e => setResourceId(e.target.value)}>{eligible.map(r => <option key={r.id} value={r.id}>{r.title} · v{r.publishedVersion}</option>)}</Select></FormField>
      <FormField name="sp-section" label={ui("Page or section")}><Input value={section} onChange={e => setSection(e.target.value)} maxLength={60} /></FormField>
      <FormField name="sp-text" label={ui("Approved study text")}><Textarea rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={4000} /></FormField>
      <div className="flex justify-end"><Button disabled={busy || !resourceId || !section.trim() || text.trim().length < 20} onClick={() => void post({ action: "passage", resourceId, section, text }, "Study text added.").then(ok => { if (ok) { setSection(""); setText(""); } })} data-study-add-save>{ui("Add study text")}</Button></div>
    </div>
    {eligible.map(r => r.passages.length ? <div key={r.id} className="space-y-1" data-study-resource={r.id}><p className="text-sm font-bold"><span dir="auto">{r.title}</span> · v<bdi>{r.publishedVersion}</bdi></p>{r.passages.map(p => <div key={p.id} className={cn("flex items-start justify-between gap-2 rounded-lg border p-2 text-xs", !p.current && "opacity-60")} data-study-passage={p.id}>
      <span><span className="font-bold" dir="auto">{p.section}</span>{!p.current ? <> · {ui("Older version — not used")}</> : null}<span className="block line-clamp-2" dir="auto">{p.text}</span></span>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: "remove", passageId: p.id }, "Study text removed.")}>{ui("Remove")}</Button>
    </div>)}</div> : null)}
  </section>;
}
