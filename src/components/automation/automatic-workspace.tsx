"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { ModalSurface } from "@/components/ui/modal";
import { useLocale } from "@/components/locale/LocaleProvider";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import { useWorkspaceDraft } from "@/components/school-ai/draft-safety";
async function workspaceRequest<T>(url: string, init?: RequestInit): Promise<T> {
 const response = await fetch(url, { cache: "no-store", ...init });
 const body = await response.json().catch(() => null);
 if (!response.ok) throw new Error(response.status === 409 ? "conflict" : typeof body?.error === "string" ? body.error : "Unable to save this request. Please retry.");
 return body as T;
}
import { personalPlanSchema } from "@/lib/automation/role-actions";
import type { AutomaticJob } from "@/lib/automation/schema";
const copy = {
 en: { title: "Tell AI what to do", hint: "Describe the result you want. AI runs supported actions within your permissions, works through dependencies and asks for missing details. It tells you when an action is not connected to automation yet.", request: "Your request", start: "Run automatically", setup: "Set up automatically", working: "AI is setting things up", answer: "Answer and continue", pause: "Pause", resume: "Continue", close: "Close progress", history: "Saved work", done: "Completed", waiting: "One detail needed", failed: "This step needs attention", progress: "View progress", busy: "Working…", paused: "Paused", new: "New request" },
 ar: { title: "أخبر الذكاء الاصطناعي بما تريد تنفيذه", hint: "صف النتيجة المطلوبة. ينفذ الإجراءات المدعومة ضمن صلاحياتك، ويسأل عن التفاصيل الناقصة، ويوضح إذا لم يكن الإجراء متاحًا للأتمتة بعد.", request: "طلبك", start: "تنفيذ تلقائي", setup: "إعداد تلقائي", working: "يجري الذكاء الاصطناعي الإعداد", answer: "الإجابة والمتابعة", pause: "إيقاف مؤقت", resume: "متابعة", close: "إغلاق التقدم", history: "العمل المحفوظ", done: "مكتمل", waiting: "تفصيل مطلوب", failed: "هذه الخطوة تحتاج متابعة", progress: "عرض التقدم", busy: "جارٍ العمل…", paused: "متوقف مؤقتًا", new: "طلب جديد" },
 ur: { title: "اے آئی کو بتائیں کیا کرنا ہے", hint: "اپنا مطلوبہ نتیجہ بتائیں۔ اے آئی آپ کی اجازت کے مطابق دستیاب خودکار کام کرتا ہے، نامکمل تفصیل پوچھتا ہے اور بتاتا ہے اگر کوئی کام ابھی خودکار نہیں ہو سکتا۔", request: "آپ کی درخواست", start: "خودکار طور پر چلائیں", setup: "خودکار سیٹ اپ", working: "اے آئی سیٹ اپ کر رہا ہے", answer: "جواب دیں اور جاری رکھیں", pause: "روکیں", resume: "جاری رکھیں", close: "پیش رفت بند کریں", history: "محفوظ کام", done: "مکمل", waiting: "ایک تفصیل درکار ہے", failed: "اس مرحلے کو توجہ درکار ہے", progress: "پیش رفت دیکھیں", busy: "کام جاری ہے…", paused: "روکا گیا", new: "نئی درخواست" },
};
export function AutomaticWorkspace({ campusId, questionnaire, autoStart = false, disabled = false, role, roleSetup = false }: { role?: string; roleSetup?: boolean; campusId?: string | null; questionnaire?: { id: string; version: number }; autoStart?: boolean; disabled?: boolean }) {
 const { language } = useLocale(), t = copy[language];
 const [message, setMessage] = useState(""), [answer, setAnswer] = useState(""), [jobs, setJobs] = useState<AutomaticJob[]>([]), [job, setJob] = useState<AutomaticJob | null>(null);
 const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 useWorkspaceDraft(Boolean(message.trim() || answer.trim()));
 useUnsavedGuard(Boolean(message.trim() || answer.trim()));
 const key = useRef<{ message: string; id: string } | null>(null), started = useRef(false);
 const accept = useCallback((next: AutomaticJob) => { setJob(next); setJobs(previous => [next, ...previous.filter(item => item.id !== next.id)]); }, []);
 useEffect(() => { const abort = new AbortController(); void workspaceRequest<{ jobs: AutomaticJob[] }>("/api/automation", { signal: abort.signal }).then(result => { if (!abort.signal.aborted) setJobs(result.jobs.filter(item => item.campusId === (campusId ?? null))); }).catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load saved work."); }); return () => abort.abort(); }, [campusId]);
 const start = useCallback(async (setup = false) => {
  const text = questionnaire ? "Set up this campus automatically from my confirmed questionnaire answers. Create the requested real records in dependency order. Ask only for missing required details. Do not replace creation with planning briefs." : setup ? "Help me set up my role workspace. Ask the role-specific questions, then carry out the work I request from my answers." : message.trim();
  if (!text || disabled) return;
  setBusy(true); setError("");
  const fingerprint = JSON.stringify({ text, questionnaire, campusId, setup });
  if (key.current?.message !== fingerprint) key.current = { message: fingerprint, id: questionnaire ? `questionnaire-${questionnaire.id}-${questionnaire.version}` : crypto.randomUUID() };
  try { const result = await workspaceRequest<{ job: AutomaticJob }>("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, intent: setup ? "setup" : "workflow", campusId, questionnaire, language, idempotencyKey: key.current.id }) }); accept(result.job); setOpen(true); setMessage(""); }
  catch (error) { setError(error instanceof Error ? error.message : "Unable to start this workflow."); }
  finally { setBusy(false); }
 }, [questionnaire, message, disabled, campusId, language, accept, roleSetup]);
 useEffect(() => { if (autoStart && !started.current && !disabled) { started.current = true; void start(roleSetup); } }, [autoStart, disabled, start, roleSetup]);
 const change = useCallback(async (action: "advance" | "answer" | "pause" | "resume", response?: string) => {
  if (!job) return; setBusy(true); setError("");
  try { const result = await workspaceRequest<{ job: AutomaticJob }>(`/api/automation/${job.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: job.version, action, ...(response ? { answer: response } : {}) }) }); accept(result.job); if (action === "answer") setAnswer(""); }
  catch (error) {
   if (error instanceof Error && error.message === "conflict") {
    try { const result = await workspaceRequest<{ jobs: AutomaticJob[] }>("/api/automation"); const current = result.jobs.find(item => item.id === job.id); if (current) accept(current); else setError("This workflow is no longer available."); }
    catch { setError("Unable to refresh this workflow. Reopen saved work to continue."); }
   } else setError(error instanceof Error ? error.message : "Unable to refresh this workflow.");
  }
  finally { setBusy(false); }
 }, [job, accept]);
 useEffect(() => { if (!open || busy || error || job?.status !== "RUNNING") return; const timer = window.setTimeout(() => void change("advance"), 600); return () => window.clearTimeout(timer); }, [open, busy, error, job, change]);
 const title = !job ? t.working : job.status === "COMPLETED" ? (job.outcome === "plan_saved" ? (language === "ar" ? "تم حفظ الخطة" : language === "ur" ? "منصوبہ محفوظ" : "Plan saved") : job.outcome === "answered" ? (language === "ar" ? "تمت الإجابة" : language === "ur" ? "جواب دیا گیا" : "Answered") : t.done) : job.status === "WAITING_INPUT" ? t.waiting : ["FAILED", "BLOCKED"].includes(job.status) ? t.failed : job.status === "PAUSED" ? t.paused : t.working;
 return <section className="sk-panel space-y-4 p-5" dir={language === "en" ? "ltr" : "rtl"}><h2 className="text-xl font-bold">{t.title}</h2><p className="text-sm text-ink-muted">{t.hint}</p>{!questionnaire && <label className="block space-y-2"><span className="text-sm font-semibold">{t.request}</span><Textarea value={message} onChange={event => { setMessage(event.target.value); key.current = null; }} maxLength={24000} rows={4} disabled={disabled || busy} /></label>}<Button disabled={disabled || busy || !questionnaire && !message.trim()} onClick={() => void start()}>{busy ? t.busy : questionnaire ? t.setup : t.start}</Button>{!questionnaire && !["ADMIN", "CAMPUS_ADMIN"].includes(role ?? "") && <Button variant="outline" disabled={disabled || busy} onClick={() => void start(true)}>{language === "ar" ? "ابدأ إعداد دوري" : language === "ur" ? "میرے کردار کا سیٹ اپ" : "Start my role setup"}</Button>}{error && <Alert tone="danger">{error}<Button variant="outline" onClick={() => setError("")}>{t.resume}</Button></Alert>}{jobs.length > 0 && <details><summary className="cursor-pointer font-semibold">{t.history}</summary><ul className="mt-3 space-y-2">{jobs.map(item => <li key={item.id}><Button variant="outline" onClick={() => { accept(item); setOpen(true); }}>{item.request.split("\n")[0].slice(0, 100)} · {item.steps.length}</Button></li>)}</ul></details>}
 {open && job && <ModalSurface fullscreen ariaLabel={title} onClose={() => setOpen(false)}><div className="mx-auto max-w-3xl space-y-5 p-6" dir={language === "en" ? "ltr" : "rtl"}><h2 className="text-2xl font-bold">{title}</h2><p className="text-sm text-ink-muted">{job.request.split("\n")[0]}</p><ol className="space-y-3">{job.steps.map(step => <li key={step.key} className="rounded-xl border border-border p-3"><span aria-hidden="true">✓ </span>{step.title}{step.receipt.plan != null && <details className="mt-2"><summary>{t.progress}</summary><SavedPlan value={step.receipt.plan} /></details>}<p className="mt-1 break-all text-xs text-ink-muted">{String(step.receipt.id ?? "")}</p></li>)}</ol>{job.status === "RUNNING" && <p role="status">{job.pending?.title ?? t.busy}</p>}{job.summary && <p>{job.summary}</p>}{job.error && <Alert tone="danger">{job.error}</Alert>}{error && <Alert tone="danger">{error}<Button onClick={() => setError("")}>{t.resume}</Button></Alert>}{["WAITING_INPUT", "FAILED", "BLOCKED"].includes(job.status) && <div className="space-y-3"><label className="block space-y-2"><span>{job.question ?? t.request}</span><Textarea value={answer} onChange={event => setAnswer(event.target.value)} maxLength={8000} /></label><Button disabled={busy || !answer.trim()} onClick={() => void change("answer", answer)}>{t.answer}</Button></div>}{["RUNNING", "PAUSED", "FAILED"].includes(job.status) && <Button variant="outline" disabled={busy || job.steps.length >= 30} onClick={() => void change(job.status === "RUNNING" ? "pause" : "resume")}>{job.status === "RUNNING" ? t.pause : t.resume}</Button>}<Button variant="outline" onClick={() => setOpen(false)}>{t.close}</Button></div></ModalSurface>}
 </section>;
}

function SavedPlan({ value }: { value: unknown }) {
 const parsed = personalPlanSchema.safeParse(value);
 if (!parsed.success) return null;
 const plan = parsed.data;
 return <div className="space-y-3 py-3"><h3 className="font-semibold">{plan.title}</h3><p>{plan.goal}</p><ol className="list-decimal space-y-3 ps-5">{plan.steps.map((step, index) => <li key={index}><p className="font-semibold">{step.title}</p><p className="whitespace-pre-wrap">{step.detail}</p>{step.dueDate && <time dateTime={step.dueDate}>{step.dueDate}</time>}</li>)}</ol></div>;
}
