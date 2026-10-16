"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import type { ExamIntegrityDisclosure, ExamIntegrityView } from "@/lib/school-ai/exam-integrity";
import { examIntegrityPolicyCopy } from "./exam-integrity-policy-copy";

export function ExamIntegrityNotice({ policy, locale }: { policy?: ExamIntegrityDisclosure; locale: AssessmentLocale }) {
  const t = examIntegrityPolicyCopy(locale);
  return <section className="space-y-2 rounded-xl border border-border p-4" aria-label={t.title}><h3 className="font-semibold">{t.title}</h3><p className="text-sm text-ink-subtle">{policy?.enabled ? t.notice(policy.retentionDays) : t.off}</p><p className="text-sm text-ink-subtle">{t.safeguards}</p></section>;
}

export function ExamIntegrityPolicySettings({ id, data, locale, onSaved }: { id: string; data: ExamIntegrityView; locale: AssessmentLocale; onSaved: () => Promise<void> }) {
  const t = examIntegrityPolicyCopy(locale);
  const [enabled, setEnabled] = useState(data.policy.enabled);
  const [days, setDays] = useState(data.policy.enabled ? String(data.policy.retentionDays) : "");
  const [reference, setReference] = useState(data.policy.enabled ? data.policy.policyReference : "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const valid = !enabled || /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 365 && reference.trim().length >= 3;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!valid || !data.canConfigurePolicy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(id)}/integrity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: data.policyVersion, policy: enabled ? { enabled: true, retentionDays: Number(days), policyReference: reference.trim() } : { enabled: false } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : t.failure);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3"><ExamIntegrityNotice policy={data.policy} locale={locale} /><p className="text-xs text-ink-subtle">{t.retentionHint}</p><form onSubmit={save} aria-label={t.title} className="space-y-3"><fieldset disabled={busy || !data.canConfigurePolicy} className="space-y-3"><label className="flex items-start gap-3 text-sm"><Checkbox checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>{t.enable}</span></label>{enabled && <><FormField name="integrity-retention-days" label={t.days} hint={t.daysHint}><Input type="number" min={1} max={365} step={1} required value={days} onChange={event => setDays(event.target.value)} /></FormField><FormField name="integrity-policy-reference" label={t.reference} hint={t.referenceHint}><Input minLength={3} maxLength={200} required value={reference} onChange={event => setReference(event.target.value)} /></FormField></>}{data.canConfigurePolicy && <Button type="submit" disabled={busy || !valid}>{busy ? t.saving : t.save}</Button>}</fieldset><p className="text-xs text-ink-subtle">{t.frozen}</p>{error && <p role="alert" className="text-sm text-status-error-text">{error}</p>}</form></div>;
}
