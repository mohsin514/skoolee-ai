"use client";

import { Alert } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { useUiText } from "@/components/locale/LocaleProvider";

// SKO-429: ask about school policy. Answers quote the current approved policy with its version and
// section; conflicts and gaps say so plainly and offer a reviewed message to the right office.

type Citation = { policyId: string; title: string; version: number; sectionId: string; heading: string; text: string; effectiveFrom: string; effectiveUntil: string | null };
type Answer = { id: string; question: string; status: "ANSWERED" | "CONFLICT" | "UNCERTAIN" | "NO_ANSWER"; citations: Citation[]; office: string; note: string; stale?: boolean; feedback?: string | null; escalatedAt?: string | null; resolution?: string | null };

const OFFICE_LABEL: Record<string, string> = { GENERAL: "School office", ATTENDANCE: "Attendance office", FINANCE: "Fees office", ACTIVITIES: "Activities office", ADMISSIONS: "Admissions office", WELFARE: "Student welfare office" };
const STATUS_LABEL: Record<string, string> = { ANSWERED: "Answer from current policy", CONFLICT: "I found two policies that may conflict", UNCERTAIN: "The matching policy is not in effect now", NO_ANSWER: "No verified answer" };
const NOTE_LABEL: Record<string, string> = {
  ANSWERED: "This quotes the current approved policy. It does not approve a request or change any record.",
  CONFLICT: "Two current policies on this topic both apply and they may not agree. The school office needs to confirm which one to follow.",
  UNCERTAIN: "The only matching policy is not in effect on this date, so it cannot be relied on. The school office can confirm what applies now.",
  NO_ANSWER: "I could not verify an answer from the current policies. You can send this question to the school office.",
};

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.success) throw new Error(json?.error || "Request failed");
  return json.data;
}

export function PolicyAssistant() {
  const ui = useUiText();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [history, setHistory] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setHistory((await call("/api/policies")).questions); } catch { /* history is optional */ } }, []);
  useEffect(() => { void load(); }, [load]);
  const post = async (body: object) => { try { const r = await call("/api/policies", { method: "POST", body: JSON.stringify(body) }); setError(null); return r; } catch (e) { setError(ui((e as Error).message)); return null; } };
  return (
    <section aria-labelledby="policy-assistant" className="sk-panel space-y-3 p-4">
      <h2 id="policy-assistant" className="text-lg font-bold">{ui("Ask about school policy")}</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (busy || question.trim().length < 3) return; setBusy(true); const r = await post({ action: "ask", data: { question } }); if (r) { setAnswer(r); void load(); } setBusy(false); }}>
        <FormField name="policy-question" label={ui("Your question")} hint={ui("For example: How do I request leave?")} className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"><Input value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} /></FormField>
        <Button type="submit" loading={busy} disabled={busy || question.trim().length < 3}>{ui(busy ? "Checking current policies…" : "Ask")}</Button>
      </form>
      <div>{error ? <Alert tone="danger" compact>{error}</Alert> : null}</div>
      {answer ? <AnswerCard answer={answer} post={post} onChanged={load} /> : <p className="text-sm text-ink-subtle">{ui("Ask about an approved school policy, such as attendance, fees or trips.")}</p>}
      {history.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">{ui("Your recent questions")}</summary>
          <ul className="mt-2 space-y-2">{history.map((h) => (
            <li key={h.id} className="rounded-lg border border-border p-2">
              <p className="font-semibold"><bdi>{h.question}</bdi></p>
              <p className="text-ink-subtle">{ui(STATUS_LABEL[h.status] ?? h.status)}{h.stale ? ` · ${ui("The policy has changed since this answer — ask again.")}` : ""}</p>
              {h.escalatedAt ? <p className="text-ink-subtle">{h.resolution ? <>{ui("Reply from the school")}: <bdi>{h.resolution}</bdi></> : ui("Sent to the school office. Waiting for a reply.")}</p> : null}
            </li>
          ))}</ul>
        </details>
      ) : null}
    </section>
  );
}

function AnswerCard({ answer, post, onChanged }: { answer: Answer; post: (body: object) => Promise<unknown>; onChanged: () => void }) {
  const ui = useUiText();
  const [escalating, setEscalating] = useState(answer.status !== "ANSWERED");
  const [office, setOffice] = useState(answer.office);
  const [include, setInclude] = useState(true);
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <div className="space-y-3 rounded-xl border border-border p-3 text-sm" role="status">
      <p className="font-semibold">{ui(STATUS_LABEL[answer.status])}</p>
      {answer.citations.map((c) => (
        <figure key={`${c.policyId}:${c.sectionId}`} className="space-y-1 rounded-lg bg-surface-muted p-3">
          <blockquote dir="auto" className="whitespace-pre-wrap">{c.text}</blockquote>
          <figcaption className="text-xs text-ink-subtle">{ui("Based on {0} v{1}, section {2} ({3}) · in effect from {4}", [c.title, c.version, c.sectionId, c.heading, c.effectiveFrom])}{c.effectiveUntil ? ` · ${ui("until {0}", [c.effectiveUntil])}` : ""}</figcaption>
        </figure>
      ))}
      <p className="text-ink-subtle">{ui(NOTE_LABEL[answer.status])}</p>
      {sent ? <p className="font-medium text-status-success-text">{ui("Sent to {0}. The reply will appear under your recent questions.", [ui(OFFICE_LABEL[sent] ?? sent)])}</p>
        : escalating ? (
          <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={async (e) => {
            e.preventDefault();
            if (!reviewed) return;
            const r = await post({ action: "escalate", id: answer.id, data: { office, confirmedOffice: office, includeQuestion: include, message } });
            if (r) { setSent(office); onChanged(); }
          }}>
            <p className="font-semibold">{ui("Send this to the school office")}</p>
            <FormField name={`office-${answer.id}`} label={ui("Recipient")}><Select value={office} onChange={(e) => { setOffice(e.target.value); setReviewed(false); }}>{Object.entries(OFFICE_LABEL).map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</Select></FormField>
            <label className="flex min-h-11 items-center gap-2"><Checkbox checked={include} onChange={(e) => { setInclude(e.target.checked); setReviewed(false); }} /> {ui("Include my question")}</label>
            <FormField name={`message-${answer.id}`} label={ui("Your message")}><Textarea value={message} maxLength={2000} onChange={(e) => { setMessage(e.target.value); setReviewed(false); }} /></FormField>
            <p className="text-xs text-ink-subtle">{ui("No student record is attached. Nothing is sent until you confirm.")}</p>
            <label className="flex min-h-11 items-center gap-2"><Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> {ui("I have checked the recipient and what will be sent")}</label>
            <Button type="submit" size="sm" disabled={!reviewed || message.trim().length < 10}>{ui("Send to school office")}</Button>
          </form>
        ) : <Button size="sm" variant="outline" onClick={() => setEscalating(true)}>{ui("Ask the school office instead")}</Button>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        {feedback ? <p className="text-xs text-ink-subtle">{ui("Thank you for the feedback.")}</p> : <>
          <span className="text-xs text-ink-subtle">{ui("Was this helpful?")}</span>
          <Button size="sm" variant="ghost" onClick={async () => { if (await post({ action: "feedback", id: answer.id, data: { helpful: true } })) setFeedback("yes"); }}>{ui("Yes")}</Button>
          <Button size="sm" variant="ghost" onClick={async () => { if (await post({ action: "feedback", id: answer.id, data: { helpful: false } })) setFeedback("no"); }}>{ui("No")}</Button>
        </>}
      </div>
    </div>
  );
}
