"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { Checkbox } from "@/components/ui/checkbox";
import { assessmentExtensionCopy } from "./assessment-extension-copy";
import { examCameraCopy } from "./exam-camera-copy";
import { examReadinessCopy } from "./exam-readiness-copy";

type Roster = { version: number; canApprove: boolean; baseDurationMinutes: number; endsAt: string; students: Array<{ id: string; fullName: string; rollNo: string; extraMinutes: number; breakMinutes?: number; reader?: boolean; scribe?: boolean; largeText?: boolean; cameraExempt?: boolean; reason?: string; approvedAt?: string; attempt: { deadlineAt: string; status: string } | null }> };
export function ExamAccommodations({ id, locale }: { id: string; locale: AssessmentLocale }) {
  const camera = examCameraCopy(locale), t = examReadinessCopy(locale), extension = assessmentExtensionCopy(locale);
  const [assistance, setAssistance] = useState({ breakMinutes: 0, reader: false, scribe: false, largeText: false, cameraExempt: false });
  const [roster, setRoster] = useState<Roster | null>(null);
  const [studentId, setStudentId] = useState("");
  const [extra, setExtra] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const api = `/api/school-ai/exams/${encodeURIComponent(id)}/accommodations`;
  const selected = roster?.students.find((student) => student.id === studentId);
  const load = useCallback(async () => {
    const response = await fetch(api, { cache: "no-store" }); const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.serverFailure);
    setRoster(payload.accommodations); setStudentId(""); setExtra("0"); setReason("");
  }, [api, t.serverFailure]);
  const refresh = useCallback(async () => {
    setBusy(true); setError(""); setMessage("");
    try { await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : t.serverFailure); }
    finally { setBusy(false); }
  }, [load, t.serverFailure]);
  useEffect(() => { void refresh(); }, [refresh]);
  const approve = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !roster || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: roster.version, studentId, extraMinutes: Number(extra), reason, ...assistance }) });
      const payload = await response.json();
      if (!response.ok) { if (response.status === 409) await load(); throw new Error(typeof payload.error === "string" ? payload.error : t.serverFailure); }
      await load(); setMessage(t.approved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.serverFailure); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="exam-extra-time-title" className="sk-panel space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="exam-extra-time-title" className="text-lg font-bold">{t.accommodations}</h2><Button variant="outline" disabled={busy} onClick={refresh}>{t.refresh}</Button></div>
    <p className="text-sm text-ink-subtle">{t.accommodationHint}</p><p className="text-sm text-ink-subtle">{t.cap}</p>
    {error && <p role="alert" className="text-status-error-text">{error}</p>}{message && <p role="status">{message}</p>}
    {roster && <form onSubmit={approve} className="space-y-4"><FormField name="extra-time-student" label={t.learner}><Select value={studentId} disabled={busy} onChange={(event) => { const student = roster.students.find((item) => item.id === event.target.value); setStudentId(event.target.value); setExtra(String(student?.extraMinutes ?? 0)); setAssistance({ breakMinutes: student?.breakMinutes ?? 0, reader: student?.reader ?? false, scribe: student?.scribe ?? false, largeText: student?.largeText ?? false, cameraExempt: student?.cameraExempt ?? false }); setReason(student?.reason ?? ""); setMessage(""); }}><option value="">{t.choose}</option>{roster.students.map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.rollNo} · +{student.extraMinutes} {t.minutes}</option>)}</Select></FormField>
      {!roster.canApprove && <p className="text-sm">{t.noApprove}</p>}
      {selected && <><p className="text-sm">{t.base}: {roster.baseDurationMinutes} {t.minutes} · {t.close}: {new Date(roster.endsAt).toLocaleString(locale)}</p>{selected.approvedAt && <p className="text-sm">{t.approvedOn}: {new Date(selected.approvedAt).toLocaleString(locale)}</p>}
        {selected.attempt ? <div className="space-y-2"><p>{t.locked}</p><p className="text-sm">{t.existingDeadline}: {new Date(selected.attempt.deadlineAt).toLocaleString(locale)}</p></div> : <fieldset disabled={busy || !roster.canApprove} className="space-y-4"><FormField name="extra-time-minutes" label={t.extraInput}><Input type="number" required min={0} max={240} step={1} value={extra} onChange={(event) => setExtra(event.target.value)} /></FormField><FormField name="extra-break-minutes" label={extension.breakMinutes}><Input type="number" min={0} max={120} step={1} value={assistance.breakMinutes} onChange={event => setAssistance(previous => ({ ...previous, breakMinutes: Number(event.target.value) }))} /></FormField><p className="text-sm text-ink-subtle">{extension.assistanceHint}</p>{(["reader", "scribe", "largeText"] as const).map(key => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={assistance[key]} onChange={event => setAssistance(previous => ({ ...previous, [key]: event.target.checked }))} />{extension[key]}</label>)}<label className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={assistance.cameraExempt} onChange={event => setAssistance(previous => ({ ...previous, cameraExempt: event.target.checked }))} />{camera.cameraExempt}</label><p className="text-sm text-ink-subtle">{camera.exemptionHint}</p><FormField name="extra-time-reason" label={t.reason}><Textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></FormField><p className="text-sm">{t.summary}: {roster.baseDurationMinutes + (Number(extra) || 0) + assistance.breakMinutes} {t.minutes}</p><Button type="submit">{t.approve}</Button></fieldset>}
      </>}
    </form>}
  </section>;
}
