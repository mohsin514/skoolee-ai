"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { examReadinessCopy } from "./exam-readiness-copy";

export type ExamInfo = { version: number; title: string; startsAt: string; endsAt: string; baseDurationMinutes: number; extraMinutes: number; breakMinutes?: number; assistance?: { reader: boolean; scribe: boolean; largeText: boolean }; durationMinutes: number; totalMarks: number; serverNow: string };
export function ExamPreflight({ id, exam, locale, busy, serverNow, onChecked, onStart }: { id: string; exam: ExamInfo; locale: AssessmentLocale; busy: boolean; serverNow: number; onChecked: (exam: ExamInfo) => void; onStart: (version: number) => void }) {
  const t = examReadinessCopy(locale);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ version: number; at: number; serverAt: number } | null>(null);
  const [storage, setStorage] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [practice, setPractice] = useState("");
  const available = serverNow >= new Date(exam.startsAt).getTime() && serverNow < new Date(exam.endsAt).getTime();
  const ready = !!checked && checked.version === exam.version && serverNow - checked.serverAt < 120000;
  const minutes = Math.max(0, Math.min(exam.durationMinutes, Math.floor((new Date(exam.endsAt).getTime() - serverNow) / 60000)));
  const check = async () => {
    setChecking(true); setChecked(null); setAcknowledged(false); setError("");
    // Never use a real answer for the storage probe or retain it after the check.
    const key = `school-ai-readiness-${crypto.randomUUID()}`;
    try { window.sessionStorage.setItem(key, "ready"); setStorage(window.sessionStorage.getItem(key) === "ready"); }
    catch { setStorage(false); }
    finally { try { window.sessionStorage.removeItem(key); } catch { /* Storage can be denied by browser policy. */ } }
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(t.connectionFailed);
      const payload = await response.json(); const current = payload.exam as ExamInfo;
      onChecked(current); setChecked({ version: current.version, at: Date.now(), serverAt: new Date(current.serverNow).getTime() });
    } catch { setError(t.connectionFailed); }
    finally { setChecking(false); }
  };
  return <section aria-labelledby="exam-readiness-title" className="sk-panel space-y-5 p-6">
    <h2 id="exam-readiness-title" className="text-xl font-bold">{t.heading}</h2>
    <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-ink-subtle">{t.base}</dt><dd className="font-semibold">{exam.baseDurationMinutes} {t.minutes}</dd></div><div><dt className="text-ink-subtle">{t.extra}</dt><dd className="font-semibold">{exam.extraMinutes} {t.minutes}</dd></div><div><dt className="text-ink-subtle">{t.summary}</dt><dd className="font-semibold">{exam.durationMinutes} {t.minutes}</dd></div></dl>
    <p className="text-sm">{t.close}: {new Date(exam.endsAt).toLocaleString(locale)}</p><p className="text-sm text-ink-subtle">{t.cap}</p>
    <p className="text-sm">{available ? `${t.availableTime}: ${minutes} ${t.minutes}` : t.unavailable}</p>
    <Button variant="outline" disabled={busy || checking} onClick={check}>{checking ? t.checking : t.check}</Button>
    <div aria-live="polite" className="space-y-2 text-sm"><p>{ready ? t.ready : t.pending}</p>{storage !== null && <p>{storage ? t.storageOk : t.storageWarning}</p>}{error && <p role="alert" className="text-status-error-text">{error}</p>}</div>
    <p className="text-xs text-ink-subtle">{t.storageNote}</p>
    <FormField name="exam-practice" label={t.practice} hint={t.practiceHint}><Textarea value={practice} maxLength={1000} rows={3} onChange={(event) => setPractice(event.target.value)} /></FormField>
    <label className="flex items-start gap-3 text-sm"><Checkbox checked={acknowledged} disabled={!ready || busy} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{t.acknowledge}</span></label>
    <p className="text-xs text-ink-subtle">{t.fresh}</p>
    <Button disabled={busy || checking || !available || !ready || !acknowledged} onClick={() => { if (checked && Date.now() - checked.at < 120000 && checked.version === exam.version) onStart(checked.version); else { setChecked(null); setAcknowledged(false); } }}>{t.start}</Button>
  </section>;
}
