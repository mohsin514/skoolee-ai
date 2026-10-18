"use client";

import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";

// SKO-429: school leaders write and approve policy versions (audience, office, effective dates,
// numbered sections), answer escalated questions and check the assistant against owner questions.

type Section = { id: string; heading: string; text: string };
type Policy = { id: string; topic: string; title: string; office: string; audience: string; version: number; status: string; effectiveFrom: string; effectiveUntil: string | null; sections: Section[] };
type Queued = { id: string; askedBy: { fullName: string; role: string } | null; escalation: { office: string; message: string; includedQuestion: string | null; answerStatus: string }; escalatedAt: string; resolution: string | null };
type EvalResult = { passed: number; total: number; results: { id: string; question: string; passed: boolean; status: string; cited: string | null }[] };

const OFFICE_LABEL: Record<string, string> = { GENERAL: "School office", ATTENDANCE: "Attendance office", FINANCE: "Fees office", ACTIVITIES: "Activities office", ADMISSIONS: "Admissions office", WELFARE: "Student welfare office" };
const AUDIENCE_LABEL: Record<string, string> = { FAMILY: "Families", STAFF: "Staff only", ALL: "Everyone" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", APPROVED: "Approved", SUPERSEDED: "Superseded", ARCHIVED: "Archived", ANSWERED: "Answer from current policy", CONFLICT: "I found two policies that may conflict", UNCERTAIN: "The matching policy is not in effect now", NO_ANSWER: "No verified answer" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}
const blank = () => ({ topic: "", title: "", office: "GENERAL", audience: "FAMILY", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveUntil: "", sections: [{ id: "1", heading: "", text: "" }] as Section[] });

export function PolicyManager() {
  const ui = useUiText();
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [evalForm, setEvalForm] = useState({ question: "", audience: "FAMILY", expectedTopic: "", expectedSection: "", expectNoAnswer: false });
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const load = useCallback(async () => { try { const d = await call("/api/policies?view=manage"); setPolicies(d.policies); setQueue(d.queue); } catch (e) { setError(ui((e as Error).message)); } }, [ui]);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object, success: string) => { try { const r = await call("/api/policies", { method: "POST", body: JSON.stringify(body) }); setNotice(ui(success)); setError(null); await load(); return r; } catch (e) { setError(ui((e as Error).message)); setNotice(null); return null; } };
  const setSection = (i: number, key: keyof Section, value: string) => setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
  return (
    <section aria-labelledby="policy-manager" className="sk-panel space-y-4 p-4">
      <h2 id="policy-manager" className="text-lg font-bold">{ui("School policies")}</h2>
      <p className="text-sm text-ink-subtle">{ui("Only approved versions in effect on the question date and meant for the asker's audience are used to answer questions.")}</p>
      <div className="space-y-2">
        {error ? <Alert tone="danger" compact>{error}</Alert> : null}
        {notice ? <Alert tone="success" compact>{notice}</Alert> : null}
      </div>

      <ul className="space-y-2">{policies?.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
          <div>
            <p className="font-semibold"><bdi>{p.title}</bdi> · v{p.version} · {ui(STATUS_LABEL[p.status] ?? p.status)}</p>
            <p className="text-ink-subtle"><span dir="ltr">{p.topic}</span> · {ui(AUDIENCE_LABEL[p.audience] ?? p.audience)} · {ui(OFFICE_LABEL[p.office] ?? p.office)} · <span dir="ltr">{p.effectiveFrom.slice(0, 10)} → {p.effectiveUntil ? p.effectiveUntil.slice(0, 10) : "…"}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.status === "DRAFT" ? <>
              <Button size="sm" variant="outline" onClick={() => { setEditing(p.id); setForm({ topic: p.topic, title: p.title, office: p.office, audience: p.audience, effectiveFrom: p.effectiveFrom.slice(0, 10), effectiveUntil: p.effectiveUntil?.slice(0, 10) ?? "", sections: p.sections }); }}>{ui("Edit")}</Button>
              <Button size="sm" onClick={() => post({ action: "approve", id: p.id }, "Policy approved. It answers questions from its effective date.")}>{ui("Approve")}</Button>
            </> : null}
            {p.status === "APPROVED" ? <Button size="sm" variant="outline" onClick={() => post({ action: "version", id: p.id }, "A draft of the next version was created.")}>{ui("New version")}</Button> : null}
            {p.status !== "ARCHIVED" && p.status !== "SUPERSEDED" ? <Button size="sm" variant="ghost" onClick={() => post({ action: "archive", id: p.id }, "Policy archived. It no longer answers questions.")}>{ui("Archive")}</Button> : null}
          </div>
        </li>
      ))}</ul>

      <form className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        const r = await post({ action: "save", id: editing ?? undefined, data: { ...form, effectiveUntil: form.effectiveUntil || null } }, "Draft saved. Approve it to make it answer questions.");
        if (r) { setForm(blank()); setEditing(null); }
      }}>
        <h3 className="font-semibold md:col-span-2">{ui(editing ? "Edit draft" : "New policy draft")}</h3>
        <FormField name="pol-title" label={ui("Title")}><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></FormField>
        <FormField name="pol-topic" label={ui("Topic key")} hint={ui("For example: attendance or fee-refunds")}><Input dir="ltr" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} /></FormField>
        <FormField name="pol-audience" label={ui("Audience")}><Select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>{Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
        <FormField name="pol-office" label={ui("Responsible office")}><Select value={form.office} onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))}>{Object.entries(OFFICE_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
        <FormField name="pol-from" label={ui("In effect from")}><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></FormField>
        <FormField name="pol-until" label={ui("In effect until (optional)")}><Input type="date" value={form.effectiveUntil} onChange={(e) => setForm((f) => ({ ...f, effectiveUntil: e.target.value }))} /></FormField>
        {form.sections.map((s, i) => (
          <fieldset key={i} className="grid gap-2 rounded-lg border border-border p-2 md:col-span-2 md:grid-cols-[6rem_1fr]">
            <legend className="px-1 text-xs font-semibold">{ui("Section {0}", [i + 1])}</legend>
            <FormField name={`pol-sec-id-${i}`} label={ui("Number")}><Input dir="ltr" value={s.id} onChange={(e) => setSection(i, "id", e.target.value)} /></FormField>
            <FormField name={`pol-sec-head-${i}`} label={ui("Heading")}><Input value={s.heading} onChange={(e) => setSection(i, "heading", e.target.value)} /></FormField>
            <FormField name={`pol-sec-text-${i}`} label={ui("Policy wording")} className="md:col-span-2"><Textarea value={s.text} onChange={(e) => setSection(i, "text", e.target.value)} /></FormField>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, { id: String(f.sections.length + 1), heading: "", text: "" }] }))}>{ui("Add section")}</Button>
          <Button type="submit" size="sm">{ui("Save draft")}</Button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="font-semibold">{ui("Questions sent to the school office")}</h3>
        {queue.length === 0 ? <p className="text-sm text-ink-subtle">{ui("No questions are waiting.")}</p> : queue.map((q) => (
          <div key={q.id} className="space-y-1 rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold">{ui(OFFICE_LABEL[q.escalation.office] ?? q.escalation.office)} · <bdi>{q.askedBy?.fullName ?? "—"}</bdi> · {ui(STATUS_LABEL[q.escalation.answerStatus] ?? q.escalation.answerStatus)}</p>
            {q.escalation.includedQuestion ? <p>{ui("Question")}: <bdi>{q.escalation.includedQuestion}</bdi></p> : null}
            <p><bdi>{q.escalation.message}</bdi></p>
            {q.resolution ? <p className="text-ink-subtle">{ui("Reply")}: <bdi>{q.resolution}</bdi></p> : (
              <div className="flex flex-wrap items-end gap-2">
                <FormField name={`reply-${q.id}`} label={ui("Reply")} className="min-w-[14rem] flex-1"><Input value={replies[q.id] ?? ""} onChange={(e) => setReplies((r) => ({ ...r, [q.id]: e.target.value }))} /></FormField>
                <Button size="sm" disabled={(replies[q.id] ?? "").trim().length < 5} onClick={() => post({ action: "resolve", id: q.id, data: { resolution: replies[q.id] } }, "Reply sent.")}>{ui("Send reply")}</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">{ui("Check the assistant")}</h3>
        <form className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "eval-add", data: { ...evalForm, expectedTopic: evalForm.expectedTopic || undefined, expectedSection: evalForm.expectedSection || undefined } }, "Check question saved.")) setEvalForm((f) => ({ ...f, question: "" })); }}>
          <FormField name="ev-q" label={ui("Question")} className="md:col-span-2"><Input value={evalForm.question} onChange={(e) => setEvalForm((f) => ({ ...f, question: e.target.value }))} /></FormField>
          <FormField name="ev-aud" label={ui("Asked by")}><Select value={evalForm.audience} onChange={(e) => setEvalForm((f) => ({ ...f, audience: e.target.value }))}><option value="FAMILY">{ui("Families")}</option><option value="STAFF">{ui("Staff only")}</option></Select></FormField>
          <FormField name="ev-topic" label={ui("Expected topic key")}><Input dir="ltr" value={evalForm.expectedTopic} onChange={(e) => setEvalForm((f) => ({ ...f, expectedTopic: e.target.value }))} /></FormField>
          <FormField name="ev-sec" label={ui("Expected section (optional)")}><Input dir="ltr" value={evalForm.expectedSection} onChange={(e) => setEvalForm((f) => ({ ...f, expectedSection: e.target.value }))} /></FormField>
          <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={evalForm.expectNoAnswer} onChange={(e) => setEvalForm((f) => ({ ...f, expectNoAnswer: e.target.checked }))} /> {ui("This question should NOT get an answer")}</label>
          <div className="flex gap-2 md:col-span-2"><Button type="submit" size="sm" variant="outline">{ui("Add check")}</Button><Button type="button" size="sm" onClick={async () => { const r = await post({ action: "eval-run" }, "Checks run against the current policies."); if (r) setEvalResult(r as EvalResult); }}>{ui("Run all checks")}</Button></div>
        </form>
        {evalResult ? <div className="text-sm"><p className="font-semibold">{ui("{0} of {1} checks passed", [evalResult.passed, evalResult.total])}</p>
          <ul className="space-y-1">{evalResult.results.map((r) => <li key={r.id} className={r.passed ? "" : "text-status-error-text"}>{ui(r.passed ? "Passed" : "Failed")} · <bdi>{r.question}</bdi> · {ui(STATUS_LABEL[r.status] ?? r.status)}{r.cited ? <> · <span dir="ltr">{r.cited}</span></> : null}</li>)}</ul></div> : null}
      </div>
    </section>
  );
}
