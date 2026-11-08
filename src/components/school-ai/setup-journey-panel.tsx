"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Language } from "@/lib/locale/package";
import type { SetupJourneyItem, SetupJourneyStep } from "@/lib/school-ai/setup-journey";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { moduleWorkspaceHref } from "@/lib/school-ai/navigation";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { workspaceRequest, workspaceErrorText } from "./workspace-client";
const labels: Record<SetupJourneyStep, [string, string, string]> = {
 academics: ["Active academic year and classes", "السنة الدراسية والصفوف النشطة", "فعال تعلیمی سال اور جماعتیں"],
 staff: ["Active teachers", "المعلمون النشطون", "فعال اساتذہ"], students: ["Enrolled students", "الطلاب المسجلون", "داخل شدہ طلبہ"],
 subjects: ["Subjects and teacher assignments", "المواد وتعيين المعلمين", "مضامین اور اساتذہ کی تعیناتی"], resources: ["Rooms and teaching periods", "الغرف والحصص", "کمرے اور تدریسی پیریڈ"],
 curriculum: ["Syllabus topics for each subject", "مواضيع المنهج لكل مادة", "ہر مضمون کے نصابی موضوعات"], timetable: ["Published class timetables", "جداول الصفوف المنشورة", "شائع شدہ جماعتی ٹائم ٹیبل"], fees: ["Current fee structures", "هياكل الرسوم الحالية", "موجودہ فیس کے قواعد"],
};
const copy = {
 en: { title: "Your setup, step by step", hint: "These checks read saved school records. They show basic coverage, not a guarantee that every imported record or timetable is correct. Review counts and receipts before opening the school.", refresh: "Check saved records", done: "Basic records present", missing: "Needs setup", before: "Complete first", open: "Continue this step", delegated: "Ask the assigned lead to complete this step.", invites: "Invited staff count after they accept and become active teachers. Draft timetables count after publication." },
 ar: { title: "إعدادك خطوة بخطوة", hint: "تقرأ الفحوص السجلات المحفوظة وتعرض التغطية الأساسية، ولا تضمن صحة كل سجل أو جدول. راجع الأعداد والإيصالات قبل بدء العمل.", refresh: "فحص السجلات المحفوظة", done: "السجلات الأساسية موجودة", missing: "يحتاج إعدادًا", before: "أكمل أولًا", open: "متابعة هذه الخطوة", delegated: "اطلب من المسؤول المعين إكمال هذه الخطوة.", invites: "يُحتسب الموظفون بعد قبول الدعوة وتفعيلهم كمعلمين، والجداول بعد نشرها." },
 ur: { title: "آپ کا سیٹ اپ، مرحلہ وار", hint: "یہ جانچ محفوظ ریکارڈ سے بنیادی تکمیل دکھاتی ہے، ہر ریکارڈ یا ٹائم ٹیبل کے درست ہونے کی ضمانت نہیں۔ کام شروع کرنے سے پہلے تعداد اور رسیدیں دیکھیں۔", refresh: "محفوظ ریکارڈ جانچیں", done: "بنیادی ریکارڈ موجود ہیں", missing: "سیٹ اپ درکار ہے", before: "پہلے مکمل کریں", open: "یہ مرحلہ جاری رکھیں", delegated: "متعلقہ ذمہ دار سے یہ مرحلہ مکمل کروائیں۔", invites: "مدعو عملہ قبولیت اور فعال استاد بننے کے بعد شمار ہوتا ہے۔ ٹائم ٹیبل اشاعت کے بعد شمار ہوتا ہے۔" },
};
export function SetupJourneyPanel({ recordId, language, role, workflows, disabled, onOpen }: { recordId: string; language: Language; role: string; workflows: string[]; disabled: boolean; onOpen: (workflow: string) => void }) {
 const t = copy[language], c = useMemo(() => schoolAICopy(language), [language]), index = language === "en" ? 0 : language === "ar" ? 1 : 2;
 const [steps, setSteps] = useState<Array<SetupJourneyItem & { restricted: boolean }>>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const refresh = useCallback(async (signal?: AbortSignal) => {
  setBusy(true); setError("");
  try { const result = await workspaceRequest<{ steps: typeof steps }>(`/api/school-ai/setup/journey?recordId=${encodeURIComponent(recordId)}`, { signal }); if (!signal?.aborted) setSteps(result.steps); }
  catch (error) { if (!signal?.aborted) setError(workspaceErrorText(error, c)); }
  finally { if (!signal?.aborted) setBusy(false); }
 }, [recordId, c]);
 useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
 return <section className="sk-panel space-y-4 p-4"><h2 className="text-lg font-bold">{t.title}</h2><p className="text-sm text-ink-muted">{t.hint}</p><Button variant="outline" loading={busy} disabled={disabled || busy} onClick={() => void refresh()}>{t.refresh}</Button>{error && <Alert tone="danger">{error}</Alert>}<ol className="space-y-3">{steps.map((step, number) => <li key={step.key} className="rounded-xl border border-border p-4"><h3 className="font-semibold">{number + 1}. {labels[step.key][index]}</h3>{!step.restricted && <p className="mt-2 text-sm">{step.complete ? t.done : t.missing} · {new Intl.NumberFormat(language).format(step.evidence)} / {new Intl.NumberFormat(language).format(step.target)}</p>}{step.blockedBy.length > 0 && <p className="mt-2 text-sm text-ink-muted">{t.before}: {step.blockedBy.map(key => labels[key][index]).join(" · ")}</p>}{workflows.includes(step.workflow) && !step.restricted ? <Button className="mt-3" variant="outline" disabled={disabled || busy || step.blockedBy.length > 0} onClick={() => onOpen(step.workflow)}>{t.open}</Button> : <p className="mt-2 text-sm">{t.delegated}</p>}{step.key === "academics" && <a className="ms-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" href={moduleWorkspaceHref(role, "academics")}>{language === "ar" ? "مراجعة السنة الدراسية وتفعيلها" : language === "ur" ? "تعلیمی سال کا جائزہ لیں اور فعال کریں" : "Review and activate the academic year"}</a>}</li>)}</ol><p className="text-sm text-ink-muted">{t.invites}</p></section>;
}
