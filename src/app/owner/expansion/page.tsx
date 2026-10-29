"use client";

/**
 * SKAI-1019/1020 founder console: deferred science, later-grade and alternative-curriculum candidates, their current
 * ADOPT/DEFER/REJECT decision and exactly which prerequisites block each. Nothing here activates a pack: availability
 * is recomputed server-side from the stored evidence and every candidate stays unavailable until its own gate passes.
 */

import { useCallback, useEffect, useState } from "react";
import { Layers, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageCard } from "@/components/ui/page-card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { ExpansionStatus } from "@/lib/school-ai/pack-expansion-store";

const COPY = {
  en: { title: "Pack expansion gate", description: "Deferred packs stay unavailable until their own evidence, sign-offs and pilot gate pass.", candidate: "Candidate", decision: "Decision", availability: "Availability", blockers: "Blocking prerequisites", available: "Available", unavailable: "Unavailable", record: "Record a decision", recordHint: "Full gate record (JSON): source identity and rights, school selection, science calibration areas, educator sign-off and decision with founder + educator references, rationale and bounded ticket.", save: "Save decision", saved: "Decision recorded. Availability is recomputed from the evidence.", loadFailed: "Expansion candidates could not be loaded.", none: "None", PENDING: "Pending", ADOPT: "Adopt", DEFER: "Defer", REJECT: "Reject" },
  ur: { title: "پیک توسیعی گیٹ", description: "مؤخر پیک اس وقت تک دستیاب نہیں جب تک ان کے اپنے شواہد، منظوریاں اور پائلٹ گیٹ پاس نہ ہوں۔", candidate: "امیدوار", decision: "فیصلہ", availability: "دستیابی", blockers: "رکاوٹ بننے والی شرائط", available: "دستیاب", unavailable: "دستیاب نہیں", record: "فیصلہ درج کریں", recordHint: "مکمل گیٹ ریکارڈ (JSON): ماخذ کی شناخت اور حقوق، اسکول کا انتخاب، سائنس کیلیبریشن، معلم کی منظوری اور بانی و معلم کے حوالوں کے ساتھ فیصلہ۔", save: "فیصلہ محفوظ کریں", saved: "فیصلہ درج ہو گیا۔ دستیابی شواہد سے دوبارہ معلوم کی جاتی ہے۔", loadFailed: "توسیعی امیدوار لوڈ نہیں ہو سکے۔", none: "کوئی نہیں", PENDING: "زیرِ التوا", ADOPT: "اختیار", DEFER: "مؤخر", REJECT: "مسترد" },
  ar: { title: "بوابة توسيع الحزم", description: "تبقى الحزم المؤجلة غير متاحة حتى تجتاز أدلتها واعتماداتها وبوابة التجربة الخاصة بها.", candidate: "المرشح", decision: "القرار", availability: "الإتاحة", blockers: "المتطلبات المانعة", available: "متاحة", unavailable: "غير متاحة", record: "تسجيل قرار", recordHint: "سجل البوابة الكامل (JSON): هوية المصدر وحقوقه، واختيار المدرسة، ومجالات معايرة العلوم، واعتماد المعلم، والقرار مع مرجعي المؤسس والمعلم والمبرر والتذكرة المحددة.", save: "حفظ القرار", saved: "تم تسجيل القرار. تُعاد حساب الإتاحة من الأدلة.", loadFailed: "تعذر تحميل مرشحي التوسيع.", none: "لا شيء", PENDING: "معلّق", ADOPT: "اعتماد", DEFER: "تأجيل", REJECT: "رفض" },
} as const;

const TONE: Record<ExpansionStatus["outcome"], BadgeProps["variant"]> = { PENDING: "neutral", ADOPT: "success", DEFER: "warning", REJECT: "danger" };

const template = (candidateId: string) => JSON.stringify({ candidateId, source: { board: "", qualification: "", subject: "", grade: "", edition: "", examYear: "", academicYear: "", term: "", tier: "", language: "en", officialUrl: "https://", retrievedOn: "", rightsStatus: "UNKNOWN", verification: "UNVERIFIED" }, calibration: [], decision: { outcome: "DEFER", founder: { role: "Founder", reference: "", on: "" }, educator: { role: "Subject educator", reference: "", on: "" }, rationale: "" } }, null, 2);

export default function PackExpansionPage() {
  const { language } = useLocale();
  const t = COPY[language] ?? COPY.en;
  const [rows, setRows] = useState<ExpansionStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetch("/api/owner/pack-expansion", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (!json?.success) { setFailed(true); return; }
    setRows(json.data);
    setCandidate((c) => c || json.data[0]?.id || "");
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (candidate) setDraft(template(candidate)); }, [candidate]);

  async function save() {
    setSaving(true); setMessage(null);
    let record: unknown;
    try { record = JSON.parse(draft); } catch { setSaving(false); setMessage({ tone: "danger", text: "JSON" }); return; }
    const res = await fetch("/api/owner/pack-expansion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ record }) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSaving(false);
    if (json?.success) { setMessage({ tone: "success", text: t.saved }); await load(); }
    else setMessage({ tone: "danger", text: json?.error ?? t.loadFailed });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader icon={Layers} title={t.title} description={t.description} />
      {failed ? <ErrorState title={t.loadFailed} onRetry={load} /> : (
        <PageCard>
          <Table>
            <TableHeader><TableRow><TableHead>{t.candidate}</TableHead><TableHead>{t.decision}</TableHead><TableHead>{t.availability}</TableHead><TableHead>{t.blockers}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell><bdi dir="ltr" className="font-semibold">{r.id}</bdi><div className="text-xs text-ink-muted" dir="ltr">{r.board} · {r.qualification} · {r.subject} · {r.grade}</div></TableCell>
                  <TableCell><Badge size="sm" variant={TONE[r.outcome]}>{t[r.outcome]}</Badge>{r.boundedTicket ? <div className="text-xs" dir="ltr">{r.boundedTicket}</div> : null}</TableCell>
                  <TableCell><Badge size="sm" variant={r.available ? "success" : "neutral"}>{r.available ? t.available : t.unavailable}</Badge></TableCell>
                  <TableCell>{r.blockers.length ? <ul className="list-disc ps-4 text-sm" dir="ltr">{r.blockers.map((b) => <li key={b}>{b}</li>)}</ul> : t.none}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageCard>
      )}
      <PageCard>
        <h2 className="mb-4 text-lg font-semibold">{t.record}</h2>
        <div className="flex flex-col gap-4">
          <FormField name="candidate" label={t.candidate}>
            <Select value={candidate} onChange={(e) => setCandidate(e.target.value)}>{(rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}</Select>
          </FormField>
          <FormField name="record" label={t.decision} hint={t.recordHint}>
            <Textarea dir="ltr" rows={14} className="font-mono text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </FormField>
          {message ? <Alert tone={message.tone} role="status">{message.text}</Alert> : null}
          <div><Button onClick={save} disabled={saving || !candidate}><Save aria-hidden="true" />{t.save}</Button></div>
        </div>
      </PageCard>
    </div>
  );
}
