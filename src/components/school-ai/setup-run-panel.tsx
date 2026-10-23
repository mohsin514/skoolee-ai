"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ModalSurface } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { SchoolRun, RunStep } from "@/lib/school-ai/runs";
import type { SchoolAiExecutionPreview } from "@/lib/school-ai/execution";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { ExecutionPreview } from "./execution-preview";
import { runCopy } from "./run-copy";
import { workspaceRequest, workspaceErrorText } from "./workspace-client";
import { useWorkspaceDraft } from "./draft-safety";
const copy = {
 en: { title: "Apply reviewed setup", hint: "Only approved actions with a valid preview can run. Unresolved plans remain for review; completing a run does not mean the entire school is configured.", preview: "Preview approved actions", start: "Confirm and apply these changes", progress: "Creating your reviewed setup", done: "Reviewed actions completed", blocked: "Setup needs attention. Completed changes are saved. Review the remaining actions before starting a new run.", empty: "Review and approve the generated action plans first.", partial: "Some plans still need review or prerequisites. They will not run automatically.", saved: "Progress is saved. You can close this view and return later.", close: "Close progress", reopen: "View saved setup progress", failed: "Progress could not be refreshed. Reopen the saved run before retrying." },
 ar: { title: "تطبيق الإعداد المعتمد", hint: "تُنفّذ فقط الإجراءات المعتمدة ذات المعاينة الصالحة. تبقى الخطط غير المحسومة للمراجعة؛ اكتمال التنفيذ لا يعني اكتمال إعداد المدرسة كلها.", preview: "معاينة الإجراءات المعتمدة", start: "تأكيد وتطبيق هذه التغييرات", progress: "إنشاء الإعداد الذي راجعته", done: "اكتملت الإجراءات المعتمدة", blocked: "يحتاج الإعداد إلى مراجعة. التغييرات المكتملة محفوظة. راجع الباقي قبل بدء تنفيذ جديد.", empty: "راجع خطط الإجراءات واعتمدها أولًا.", partial: "بعض الخطط تحتاج مراجعة أو متطلبات سابقة ولن تُنفذ تلقائيًا.", saved: "التقدم محفوظ ويمكنك العودة لاحقًا.", close: "إغلاق التقدم", reopen: "عرض تقدم الإعداد المحفوظ", failed: "تعذر تحديث التقدم. افتح التنفيذ المحفوظ قبل إعادة المحاولة." },
 ur: { title: "منظور شدہ سیٹ اپ نافذ کریں", hint: "صرف منظور شدہ اور درست پیش منظر والے کام چلیں گے۔ نامکمل منصوبے جائزے کے لیے رہیں گے؛ یہ عمل مکمل ہونے کا مطلب پورے اسکول کا مکمل سیٹ اپ نہیں۔", preview: "منظور شدہ کاموں کا پیش منظر", start: "تصدیق کریں اور یہ تبدیلیاں نافذ کریں", progress: "آپ کا جائزہ شدہ سیٹ اپ بن رہا ہے", done: "منظور شدہ کام مکمل ہوگئے", blocked: "سیٹ اپ کو توجہ درکار ہے۔ مکمل تبدیلیاں محفوظ ہیں۔ نیا عمل شروع کرنے سے پہلے باقی کام دیکھیں۔", empty: "پہلے تیار شدہ عملی منصوبوں کا جائزہ لے کر منظور کریں۔", partial: "کچھ منصوبوں کو جائزہ یا پیشگی ضروریات درکار ہیں۔ وہ خودکار نہیں چلیں گے۔", saved: "پیش رفت محفوظ ہے۔ آپ بند کرکے بعد میں واپس آسکتے ہیں۔", close: "پیش رفت بند کریں", reopen: "محفوظ سیٹ اپ کی پیش رفت دیکھیں", failed: "پیش رفت تازہ نہیں ہوسکی۔ دوبارہ کوشش سے پہلے محفوظ عمل کھولیں۔" },
};
export function SetupRunPanel({ language, campusId, records, additionalRecords = [], allowedOperations = [], disabled }: { language: Language; campusId: string; records: AiWorkspaceRecord[]; additionalRecords?: AiWorkspaceRecord[]; allowedOperations?: string[]; disabled: boolean }) {
 const t = copy[language], runText = runCopy(language), c = useMemo(() => schoolAICopy(language), [language]);
 const [selected, setSelected] = useState<string[]>([]);
 const permitted = (record: AiWorkspaceRecord) => allowedOperations.includes(record.kind === "CURRICULUM" ? "curriculum.import_topics" : String((record.data.proposal as { operation?: string } | undefined)?.operation));
 const additional = additionalRecords.filter(record => permitted(record) && record.campusId === campusId && !records.some(base => base.id === record.id) && record.status === "APPROVED" && (record.kind === "CURRICULUM" || record.kind === "WORKFLOW" && record.data.proposal));
 const allRecords = [...records, ...additional];
 const choiceLabel = language === "ar" ? "إضافة خطط معتمدة أخرى من هذا الفرع" : language === "ur" ? "اس کیمپس کے مزید منظور شدہ منصوبے شامل کریں" : "Include other approved plans from this campus";
 const [previews, setPreviews] = useState<Array<{ title: string; step: RunStep; changes: SchoolAiExecutionPreview }>>([]);
 const [run, setRun] = useState<SchoolRun | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const request = useRef<{ fingerprint: string; key: string; scheduledAt: string; expiresAt: string } | null>(null);
 const identity = allRecords.map(record => `${record.id}:${record.version}:${record.status}`).sort().join("|");
 const ids = useMemo(() => [...records, ...additionalRecords].map(record => record.id).sort().join("|"), [records, additionalRecords]);
 const candidates = allRecords.filter(record => permitted(record) && (records.some(base => base.id === record.id) || selected.includes(record.id)) && !run?.receipts.some(receipt => receipt.recordId === record.id && receipt.version === record.version) && record.status === "APPROVED" && (record.kind === "CURRICULUM" || record.kind === "WORKFLOW" && record.data.proposal));
 useWorkspaceDraft(busy || previews.length > 0);
 const refresh = useCallback(async () => {
   const result = await workspaceRequest<{ runs: SchoolRun[] }>(`/api/school-ai/runs?campusId=${encodeURIComponent(campusId)}`);
   const selectedIds = new Set(ids.split("|"));
   const latest = result.runs.find(item => item.owner?.mine && Object.values(copy).some(text => text.title === item.title) && item.steps.length > 0 && item.steps.every(step => selectedIds.has(step.recordId)));
   setRun(latest ?? null); return latest;
 }, [campusId, ids]);
 useEffect(() => { let live = true; void refresh().catch(() => { if (live) setError(t.failed); }); return () => { live = false; }; }, [refresh, t.failed]);
 useEffect(() => { setPreviews([]); request.current = null; }, [identity, selected]);
 useEffect(() => {
   if (!open || error || run?.status !== "QUEUED") return;
   let stopped = false;
   const timer = window.setTimeout(async () => {
     try {
       await workspaceRequest(`/api/school-ai/runs/${run.id}/advance`, { method: "POST" });
       if (!stopped) await refresh();
     } catch (error) { if (!stopped) { setError(workspaceErrorText(error, c)); await refresh().catch(() => {}); } }
   }, 1000);
   return () => { stopped = true; window.clearTimeout(timer); };
 }, [open, run, refresh, c, error]);
 const changeRun = async (action: "pause" | "resume") => {
   if (!run) return;
   setBusy(true); setError("");
   try { await workspaceRequest(`/api/school-ai/runs/${run.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: run.version, action }) }); await refresh(); }
   catch (error) { setError(workspaceErrorText(error, c)); }
   finally { setBusy(false); }
 };
 const preview = async () => {
   setBusy(true); setError(""); setPreviews([]); request.current = null;
   try {
     const items = [];
     for (const record of candidates) {
       const operation = record.kind === "CURRICULUM" ? "curriculum.import_topics" : String((record.data.proposal as { operation: string }).operation);
       const result = await workspaceRequest<{ preview: SchoolAiExecutionPreview }>(`/api/school-ai/workspace/${record.id}/execute?operation=${encodeURIComponent(operation)}&version=${record.version}`);
       items.push({ title: record.title, changes: result.preview, step: { recordId: record.id, version: record.version, operation: result.preview.operation, previewHash: result.preview.previewHash } });
     }
     setPreviews(items);
   } catch (error) { setError(workspaceErrorText(error, c)); } finally { setBusy(false); }
 };
 const start = async () => {
   setBusy(true); setError("");
   try {
     const steps = previews.map(item => item.step), fingerprint = JSON.stringify(steps);
     if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID(), scheduledAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
     const saved = await workspaceRequest<{ run: SchoolRun }>("/api/school-ai/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t.title, campusId, steps, idempotencyKey: request.current.key, scheduledAt: request.current.scheduledAt, expiresAt: request.current.expiresAt }) });
     setRun(saved.run); setOpen(true); setPreviews([]);
   } catch (error) { setError(workspaceErrorText(error, c)); } finally { setBusy(false); }
 };
 return <section className="sk-panel space-y-4 p-4"><h2 className="text-lg font-bold">{t.title}</h2><p className="text-sm text-ink-muted">{t.hint}</p>
   {additional.length > 0 && <fieldset className="space-y-2"><legend className="font-semibold">{choiceLabel}</legend>{additional.map(record => <label key={record.id} className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={selected.includes(record.id)} disabled={disabled || busy || run?.status === "QUEUED"} onChange={event => setSelected(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))} />{record.title}</label>)}</fieldset>}
   {!candidates.length && !run && <p>{t.empty}</p>}{records.some(record => record.kind === "WORKFLOW" && (!record.data.proposal || record.status !== "APPROVED")) && <Alert tone="info" compact>{t.partial}</Alert>}
   {run && <Button variant="outline" onClick={() => setOpen(true)}>{t.reopen}</Button>}
   <Button disabled={disabled || busy || !candidates.length || candidates.length > 20 || run?.status === "QUEUED" || run?.status === "PAUSED"} loading={busy} onClick={() => void preview()}>{t.preview}</Button>
   {candidates.length > 20 && <Alert tone="warning">{language === "ar" ? "اختر 20 خطة أو أقل لكل تشغيل." : language === "ur" ? "ہر رن کے لیے 20 یا کم منصوبے منتخب کریں۔" : "Choose 20 or fewer plans per run."}</Alert>}
   {previews.map(item => <article key={item.step.recordId}><h3 className="font-semibold">{item.title}</h3><ExecutionPreview preview={item.changes} language={language} /></article>)}
   {previews.length > 0 && <Button disabled={disabled || busy} onClick={() => void start()}>{t.start}</Button>}
   {error && <Alert tone="danger" compact>{error}</Alert>}
   {open && run && <ModalSurface fullscreen ariaLabel={t.progress} onClose={() => setOpen(false)}><section className="mx-auto max-w-3xl space-y-6 p-6" dir={language === "en" ? "ltr" : "rtl"} aria-busy={run.status === "QUEUED"}><h2 className="text-2xl font-bold">{run.status === "COMPLETED" ? t.done : t.progress}</h2><Progress value={run.nextStep} max={run.steps.length} label={t.progress} showValue /><ol className="space-y-3">{run.steps.map((step, index) => <li key={`${step.recordId}:${step.version}`} className="rounded-xl border border-border p-3"><span aria-hidden="true">{index < run.nextStep ? "✓ " : `${index + 1}. `}</span>{allRecords.find(record => record.id === step.recordId)?.title ?? c.savedPlans}{run.receipts.find(receipt => receipt.recordId === step.recordId && receipt.version === step.version) && <span className="mt-1 block break-all text-xs text-ink-muted">{runText.receipt.replace("{0}", run.receipts.find(receipt => receipt.recordId === step.recordId && receipt.version === step.version)!.id)}</span>}</li>)}</ol>{["BLOCKED", "EXPIRED", "CANCELLED"].includes(run.status) && <Alert tone="warning">{t.blocked}</Alert>}{error && <Alert tone="danger">{error}<Button variant="outline" onClick={() => { setError(""); void refresh().catch(() => setError(t.failed)); }}>{c.retry}</Button></Alert>}<p role="status" className="text-sm">{runText[run.status]}</p>{["QUEUED", "PAUSED"].includes(run.status) && <Button variant="outline" disabled={busy} onClick={() => void changeRun(run.status === "PAUSED" ? "resume" : "pause")}>{run.status === "PAUSED" ? runText.resume : runText.pause}</Button>}<p className="text-sm">{t.saved}</p><Button variant="outline" onClick={() => setOpen(false)}>{t.close}</Button></section></ModalSurface>}
 </section>;
}
