"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Archive, CheckCircle2, FilePen, MessageCircleQuestion, MoreHorizontal, Pencil, ScrollText, XCircle } from "lucide-react";
import { DeskFilterStatus, DeskPill, DeskRowIcon, DeskStats, RelativeTime, StatTile, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { IconButton } from "@/components/ui/icon-button";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { isApiOk, readApiError } from "@/lib/api/envelope-client";

// SKO-429: school leaders write and approve policy versions (audience, office, effective dates,
// numbered sections), answer escalated questions and check the assistant against owner questions.

type Section = { id: string; heading: string; text: string };
type Policy = { id: string; topic: string; title: string; office: string; audience: string; version: number; status: string; effectiveFrom: string; effectiveUntil: string | null; sections: Section[] };
type Queued = { id: string; askedBy: { fullName: string; role: string } | null; escalation: { office: string; message: string; includedQuestion: string | null; answerStatus: string }; escalatedAt: string; resolution: string | null };
type EvalResult = { passed: number; total: number; results: { id: string; question: string; passed: boolean; status: string; cited: string | null }[] };

const OFFICE_LABEL: Record<string, string> = { GENERAL: "School office", ATTENDANCE: "Attendance office", FINANCE: "Fees office", ACTIVITIES: "Activities office", ADMISSIONS: "Admissions office", WELFARE: "Student welfare office" };
const AUDIENCE_LABEL: Record<string, string> = { FAMILY: "Families", STAFF: "Staff only", ALL: "Everyone" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", APPROVED: "Approved", SUPERSEDED: "Superseded", ARCHIVED: "Archived", ANSWERED: "Answer from current policy", CONFLICT: "I found two policies that may conflict", UNCERTAIN: "The matching policy is not in effect now", NO_ANSWER: "No verified answer" };

const STATUS_TONE: Record<string, DeskTone> = { DRAFT: "warning", APPROVED: "success", SUPERSEDED: "neutral", ARCHIVED: "neutral" };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !isApiOk(json)) throw new Error(readApiError(json, ""));
  return json.data;
}
const blank = () => ({ topic: "", title: "", office: "GENERAL", audience: "FAMILY", effectiveFrom: new Date().toISOString().slice(0, 10), effectiveUntil: "", sections: [{ id: "1", heading: "", text: "" }] as Section[] });

/**
 * `command` lets a console's PageHeader drive the panel (Campus setup › Policies, primary "New policy"):
 * "new-policy" clears the draft form and moves focus to its first field. Each command runs once (by nonce).
 */
export function PolicyManager({ command }: { command?: { id: string; nonce: number } | null } = {}) {
  const ui = useUiText();
  const { date: formatDay } = useLocaleFormat();
  const formRef = useRef<HTMLFormElement>(null);
  const lastCommand = useRef<number | null>(command?.nonce ?? null);
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [evalForm, setEvalForm] = useState({ question: "", audience: "FAMILY", expectedTopic: "", expectedSection: "", expectNoAnswer: false });
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  // F16: approving puts a policy in front of families; archiving takes it away. Both are confirmed first.
  const [confirming, setConfirming] = useState<{ action: "approve" | "archive"; policy: Policy } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // R4: a load failure is an inline ErrorState with retry, not a banner over an empty list.
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => { try { const d = await call("/api/policies?view=manage"); setPolicies(d.policies); setQueue(d.queue); setLoadFailed(false); } catch { setLoadFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  // R4: an action's result is one translated toast where the person is looking; a failure keeps the form as typed.
  const post = async (body: object, success: string) => { try { const r = await call("/api/policies", { method: "POST", body: JSON.stringify(body) }); toast.success(ui(success)); await load(); return r; } catch (e) { toast.error(friendlyErrorMessage(e, ui("The change was not saved. Please try again."))); return null; } };
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    if (command.id !== "new-policy") return;
    setForm(blank());
    setEditing(null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [command]);
  // Opening a draft from a row's overflow brings its form into view (the form sits below the list).
  useEffect(() => {
    if (!editing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [editing]);
  const setSection = (i: number, key: keyof Section, value: string) => setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
  // The counters filter the list; drafts lead because they are the ones waiting on an approval.
  const [statusFilter, setStatusFilter] = useState<"DRAFT" | "APPROVED" | null>(null);
  const shownPolicies = policies ? urgencyFirst(statusFilter ? policies.filter((p) => p.status === statusFilter) : policies, (p) => (p.status === "DRAFT" ? 0 : p.status === "APPROVED" ? 1 : 2)) : null;
  const count = (status: string) => policies?.filter((p) => p.status === status).length ?? 0;
  const waiting = queue.filter((q) => !q.resolution).length;
  return (
    <section aria-labelledby="policy-manager" className="sk-panel space-y-4 p-4">
      <h2 id="policy-manager" className="flex items-center gap-2 text-lg font-bold"><ScrollText className="size-5 shrink-0 text-primary" aria-hidden="true" />{ui("School policies")}</h2>
      <p className="text-sm text-ink-subtle">{ui("Only approved versions in effect on the question date and meant for the asker's audience are used to answer questions.")}</p>

      <ConfirmAction
        open={Boolean(confirming)}
        title={confirming?.action === "approve" ? ui("Approve {0}?", [confirming?.policy.title ?? ""]) : ui("Archive {0}?", [confirming?.policy.title ?? ""])}
        description={confirming?.action === "approve"
          ? ui("From its effective date this version answers questions from its audience and replaces the version before it.")
          : ui("It stops answering questions straight away. Its versions stay on file.")}
        confirmLabel={confirming?.action === "approve" ? ui("Approve") : ui("Archive")}
        cancelLabel={ui("Keep editing")}
        tone="warning"
        busy={confirmBusy}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          if (!confirming) return;
          setConfirmBusy(true);
          const ok = confirming.action === "approve"
            ? await post({ action: "approve", id: confirming.policy.id }, "Policy approved. It answers questions from its effective date.")
            : await post({ action: "archive", id: confirming.policy.id }, "Policy archived. It no longer answers questions.");
          setConfirmBusy(false);
          if (ok !== null) setConfirming(null);
        }}
      />

      {loadFailed && !policies ? <ErrorState title={ui("School policies could not be loaded.")} onRetry={() => void load()} retryLabel={ui("Try again")} />
        : !policies ? <SkeletonList rows={3} label={ui("Loading policies…")} />
        : policies.length === 0 ? <EmptyState size="sm" icon={ScrollText} title={ui("No policies yet")} description={ui("Write the first policy below. Families get answers from it once you approve it.")} />
        : null}
      {policies && policies.length > 0 ? <DeskStats>
        <StatTile index={0} icon={FilePen} tone="warning" value={count("DRAFT")} label={ui("Draft")} onSelect={() => setStatusFilter((f) => (f === "DRAFT" ? null : "DRAFT"))} selected={statusFilter === "DRAFT"} />
        <StatTile index={1} icon={CheckCircle2} tone="success" value={count("APPROVED")} label={ui("Approved")} onSelect={() => setStatusFilter((f) => (f === "APPROVED" ? null : "APPROVED"))} selected={statusFilter === "APPROVED"} />
        <StatTile index={2} icon={MessageCircleQuestion} tone={waiting ? "danger" : "neutral"} value={waiting} label={ui("Questions sent to the school office")} />
      </DeskStats> : null}
      {policies ? <DeskFilterStatus shown={shownPolicies?.length ?? 0} total={policies.length} onClear={() => setStatusFilter(null)} /> : null}
      <ul className="space-y-2">{shownPolicies?.map((p) => (
        <li key={p.id} data-tone={STATUS_TONE[p.status] ?? "neutral"} className={`${deskRow} flex flex-wrap items-center justify-between gap-3 text-sm`}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <DeskRowIcon icon={ScrollText} />
            <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold"><span><bdi>{p.title}</bdi> · v{p.version}</span><DeskPill tone={STATUS_TONE[p.status] ?? "neutral"}>{ui(STATUS_LABEL[p.status] ?? p.status)}</DeskPill></p>
            <p className="text-ink-subtle"><span dir="ltr">{p.topic}</span> · {ui(AUDIENCE_LABEL[p.audience] ?? p.audience)} · {ui(OFFICE_LABEL[p.office] ?? p.office)} · <span>{formatDay(p.effectiveFrom)} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {p.effectiveUntil ? formatDay(p.effectiveUntil) : "…"}</span></p>
            </div>
          </div>
          {/* §4.5.2–3: one inline action per row (Approve a draft, start the next version of an approved one); Edit
              and Archive sit in the row overflow, Archive behind its confirmation. */}
          <div className="flex flex-wrap items-center gap-2">
            {p.status === "DRAFT" ? <Button size="sm" onClick={() => setConfirming({ action: "approve", policy: p })}>{ui("Approve")}</Button> : null}
            {p.status === "APPROVED" ? <Button size="sm" variant="outline" onClick={() => post({ action: "version", id: p.id }, "A draft of the next version was created.")}>{ui("New version")}</Button> : null}
            {p.status !== "ARCHIVED" && p.status !== "SUPERSEDED" ? (
              <Menu
                label={ui("More actions for {0}", [p.title])}
                align="end"
                trigger={<IconButton label={ui("More actions for {0}", [p.title])}><MoreHorizontal aria-hidden="true" /></IconButton>}
                items={[
                  ...(p.status === "DRAFT" ? [{ id: "edit", label: "Edit", icon: Pencil, onSelect: () => { setEditing(p.id); setForm({ topic: p.topic, title: p.title, office: p.office, audience: p.audience, effectiveFrom: p.effectiveFrom.slice(0, 10), effectiveUntil: p.effectiveUntil?.slice(0, 10) ?? "", sections: p.sections }); } } satisfies MenuItem] : []),
                  { id: "archive", label: "Archive", icon: Archive, tone: "danger", onSelect: () => setConfirming({ action: "archive", policy: p }) } satisfies MenuItem,
                ]}
              />
            ) : null}
          </div>
        </li>
      ))}</ul>

      <form ref={formRef} id="policy-draft-form" className="grid scroll-mt-4 gap-3 rounded-xl border border-border p-3 md:grid-cols-2" onSubmit={async (e) => {
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
        {queue.length === 0 ? <EmptyState size="sm" icon={MessageCircleQuestion} title={ui("No questions are waiting.")} /> : urgencyFirst(queue, (q) => (q.resolution ? 1 : 0)).map((q) => (
          <div key={q.id} data-tone={q.resolution ? "success" : "warning"} className={`${deskRow} space-y-1 text-sm`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold"><DeskRowIcon icon={MessageCircleQuestion} className="me-1" /><span className="min-w-0 flex-1">{ui(OFFICE_LABEL[q.escalation.office] ?? q.escalation.office)} · <bdi>{q.askedBy?.fullName ?? "—"}</bdi></span><DeskPill tone={q.resolution ? "success" : "warning"}>{ui(STATUS_LABEL[q.escalation.answerStatus] ?? q.escalation.answerStatus)}</DeskPill><RelativeTime iso={q.escalatedAt} full={formatDay(q.escalatedAt)} className="text-xs font-normal text-ink-subtle" /></p>
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
          <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={evalForm.expectNoAnswer} onChange={(e) => setEvalForm((f) => ({ ...f, expectNoAnswer: e.target.checked }))} /> {ui("This question should not get an answer")}</label>
          <div className="flex gap-2 md:col-span-2"><Button type="submit" size="sm" variant="outline">{ui("Add check")}</Button><Button type="button" size="sm" onClick={async () => { const r = await post({ action: "eval-run" }, "Checks run against the current policies."); if (r) setEvalResult(r as EvalResult); }}>{ui("Run all checks")}</Button></div>
        </form>
        {evalResult ? <div className="text-sm"><p className="font-semibold">{ui("{0} of {1} checks passed", [evalResult.passed, evalResult.total])}</p>
          <ul className="space-y-1">{evalResult.results.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1"><DeskPill tone={r.passed ? "success" : "danger"}>{r.passed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <XCircle className="size-3.5" aria-hidden="true" />}{ui(r.passed ? "Passed" : "Failed")}</DeskPill><bdi>{r.question}</bdi> · {ui(STATUS_LABEL[r.status] ?? r.status)}{r.cited ? <> · <span dir="ltr">{r.cited}</span></> : null}</li>)}</ul></div> : null}
      </div>
    </section>
  );
}
