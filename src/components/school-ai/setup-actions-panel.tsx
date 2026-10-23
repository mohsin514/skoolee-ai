"use client";
import { useState } from "react";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { workspaceRequest, workspaceErrorText, WorkspaceRequestError } from "./workspace-client";
import { useWorkspaceDraft } from "./draft-safety";
const copy = {
 en: { title: "Prepare the next setup actions", hint: "AI uses your confirmed resources and curriculum answers and the classes already saved in this campus to prepare room, period and subject drafts. Missing details become questions. Review and approve each draft before applying it.", prepare: "Prepare next actions", empty: "No complete action could be prepared from these answers. Supply the requested details, save your answers, and try again.", invalid: "The suggestions could not be verified. Add explicit room details, period times or subject names and total marks, then retry.", questions: "Details still needed", open: "Review this draft" },
 ar: { title: "إعداد إجراءات الإعداد التالية", hint: "يستخدم الذكاء الاصطناعي إجابات الموارد والمنهج المؤكدة والصفوف المحفوظة لإعداد مسودات الغرف والحصص والمواد. تتحول التفاصيل الناقصة إلى أسئلة. راجع كل مسودة واعتمدها قبل التطبيق.", prepare: "إعداد الإجراءات التالية", empty: "لا يمكن إعداد إجراء مكتمل. أضف التفاصيل المطلوبة واحفظ الإجابات ثم أعد المحاولة.", invalid: "تعذر التحقق من الاقتراحات. أضف تفاصيل الغرف وأوقات الحصص أو أسماء المواد ودرجاتها ثم أعد المحاولة.", questions: "تفاصيل ما زالت مطلوبة", open: "مراجعة هذه المسودة" },
 ur: { title: "سیٹ اپ کے اگلے کام تیار کریں", hint: "اے آئی وسائل اور نصاب کے تصدیق شدہ جوابات اور محفوظ جماعتوں سے کمروں، پیریڈ اور مضامین کے مسودے تیار کرتا ہے۔ نامکمل تفصیل کے لیے سوال پوچھتا ہے۔ نفاذ سے پہلے ہر مسودے کا جائزہ لے کر منظور کریں۔", prepare: "اگلے کام تیار کریں", empty: "کوئی مکمل کام تیار نہیں ہوسکا۔ مطلوبہ تفصیل درج کرکے جوابات محفوظ کریں اور دوبارہ کوشش کریں۔", invalid: "تجاویز کی تصدیق نہیں ہوسکی۔ کمروں کی تفصیل، پیریڈ کے اوقات یا مضامین اور کل نمبر واضح درج کریں۔", questions: "مزید تفصیل درکار ہے", open: "اس مسودے کا جائزہ لیں" },
};
export function SetupActionsPanel({ record, records, language, disabled, onGenerated, onOpen }: { record: AiWorkspaceRecord; records: AiWorkspaceRecord[]; language: Language; disabled: boolean; onGenerated: (records: AiWorkspaceRecord[]) => void; onOpen: (record: AiWorkspaceRecord) => void }) {
 const t = copy[language], c = schoolAICopy(language);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<{ records: AiWorkspaceRecord[]; questions: string[] } | null>(null);
 const saved = records.filter(item => item.campusId === record.campusId && item.kind === "WORKFLOW" && item.status !== "ARCHIVED" && (item.data.proposal as { sourceReference?: string } | undefined)?.sourceReference === `Questionnaire ${record.id} v${record.version}`);
 const shown = [...saved, ...(result?.records ?? []).filter(item => !records.some(current => current.id === item.id))];
 useWorkspaceDraft(busy);
 const prepare = async () => {
  setBusy(true); setError(""); setResult(null);
  try { const response = await workspaceRequest<NonNullable<typeof result>>("/api/school-ai/setup/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: record.id, version: record.version, language }) }); setResult(response); onGenerated(response.records); }
  catch (error) { setError(error instanceof WorkspaceRequestError && error.code === "SETUP_ANALYSIS_UNSUPPORTED" ? t.invalid : workspaceErrorText(error, c)); }
  finally { setBusy(false); }
 };
 return <section className="sk-panel space-y-4 p-4"><h2 className="text-lg font-bold">{t.title}</h2><p className="text-sm text-ink-muted">{t.hint}</p><Button loading={busy} disabled={disabled || busy} onClick={() => void prepare()}>{t.prepare}</Button>{error && <Alert tone="danger">{error}</Alert>}{result && !shown.length && <Alert tone="info">{t.empty}</Alert>}{shown.map(item => <article key={item.id} className="rounded-xl border border-border p-3"><h3 className="font-semibold">{item.title}</h3><Button variant="outline" disabled={busy || disabled} onClick={() => onOpen(item)}>{t.open}</Button></article>)}{Boolean(result?.questions.length) && <div><h3 className="font-semibold">{t.questions}</h3><ul className="list-disc space-y-2 ps-5">{result!.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}</section>;
}
