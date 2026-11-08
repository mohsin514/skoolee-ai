"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import type { SetupAnswers } from "@/lib/school-ai/onboarding";
import type { SetupAnalysis } from "@/lib/school-ai/setup-analysis";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { MultimodalComposer } from "./multimodal-composer";
import { workspaceRequest, workspaceErrorText, WorkspaceRequestError } from "./workspace-client";
import { useWorkspaceDraft } from "./draft-safety";

const copy = {
  en: { title: "Explain your setup to AI", hint: "Type or dictate in your own language, or choose a reviewed document. Review each proposed answer before using it. Student and staff files use the import review separately.", document: "Reviewed document", none: "Use my explanation only", analyze: "Analyze and suggest answers", apply: "Use this answer", followup: "Information still needed", applied: "Added to your editable answers. Confirm it in the questionnaire before generating setup.", empty: "No supported answers found. Add more detail or answer the follow-up questions." },
  ar: { title: "اشرح إعدادك للذكاء الاصطناعي", hint: "اكتب أو أمْلِ بلغتك أو اختر مستندًا تمت مراجعته. راجع كل إجابة مقترحة قبل استخدامها. تُراجع ملفات الطلاب والموظفين في الاستيراد بشكل منفصل.", document: "مستند تمت مراجعته", none: "استخدام شرحي فقط", analyze: "تحليل واقتراح الإجابات", apply: "استخدام هذه الإجابة", followup: "معلومات ما زالت مطلوبة", applied: "أُضيفت إلى إجاباتك القابلة للتحرير. أكدها في الاستبيان قبل إنشاء الإعداد.", empty: "لم نجد إجابات مدعومة. أضف تفاصيل أو أجب عن الأسئلة التالية." },
  ur: { title: "اے آئی کو اپنا سیٹ اپ سمجھائیں", hint: "اپنی زبان میں لکھیں، بولیں یا جائزہ شدہ دستاویز منتخب کریں۔ ہر مجوزہ جواب استعمال کرنے سے پہلے دیکھیں۔ طلبہ اور عملے کی فائلوں کا جائزہ الگ درآمد میں لیا جاتا ہے۔", document: "جائزہ شدہ دستاویز", none: "صرف میری وضاحت استعمال کریں", analyze: "تجزیہ کریں اور جواب تجویز کریں", apply: "یہ جواب استعمال کریں", followup: "مزید معلومات درکار ہیں", applied: "قابلِ ترمیم جوابات میں شامل ہوگیا۔ سیٹ اپ بنانے سے پہلے سوالنامے میں تصدیق کریں۔", empty: "کوئی مستند جواب نہیں ملا۔ مزید تفصیل دیں یا اگلے سوالوں کے جواب دیں۔" },
};
export function SetupAnswerAnalysis({ language, campusId, sources, voiceAvailable, disabled, onUpload, onApply, onActivityChange }: {
  language: Language; campusId?: string | null; sources: AiWorkspaceRecord[]; voiceAvailable: boolean; disabled: boolean;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>; onApply: (answers: SetupAnswers) => void; onActivityChange: (busy: boolean) => void;
}) {
  const t = copy[language], c = schoolAICopy(language);
  const [text, setText] = useState(""); const [sourceId, setSourceId] = useState("");
  const [proposal, setProposal] = useState<SetupAnalysis | null>(null); const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useWorkspaceDraft(Boolean(text) || busy || mediaBusy);
  const available = sources.filter(source => source.kind === "SOURCE" && source.campusId === campusId && source.status === "APPROVED" && !["register", "staff_list", "answer_script"].includes(String(source.data.documentKind)));
  const analyze = async () => {
    if (!campusId) return;
    setBusy(true); onActivityChange(true); setError(""); setNotice(""); setProposal(null);
    try {
      const source = available.find(item => item.id === sourceId);
      if (sourceId && !source) throw new Error("failed");
      setProposal(await workspaceRequest<SetupAnalysis>("/api/school-ai/setup/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campusId, language, text, sources: source ? [{ id: source.id, version: source.version }] : [] }) }));
    } catch (error) { setError(error instanceof WorkspaceRequestError && error.code === "SETUP_ANALYSIS_UNSUPPORTED" ? t.empty : workspaceErrorText(error, c)); }
    finally { setBusy(false); onActivityChange(false); }
  };
  return <details className="sk-panel mt-5 p-4"><summary className="cursor-pointer font-semibold">{t.title}</summary><div className="mt-4 space-y-4">
    <p className="text-sm text-ink-muted">{t.hint}</p>
    <MultimodalComposer language={language} value={text} onChange={value => { setText(value); setProposal(null); setNotice(""); }} label={c.answer} placeholder={c.answer} disabled={disabled || busy} voiceAvailable={voiceAvailable} onUpload={onUpload} onActivityChange={active => { setMediaBusy(active); onActivityChange(active); }} />
    {available.length > 0 && <FormField name="setup-answer-source" label={t.document}><Select disabled={disabled || busy || mediaBusy} value={sourceId} onChange={event => { setSourceId(event.target.value); setProposal(null); }}><option value="">{t.none}</option>{available.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</Select></FormField>}
    <Button loading={busy} disabled={disabled || busy || mediaBusy || !campusId || !text.trim() && !sourceId} onClick={() => void analyze()}><Sparkles aria-hidden="true" />{t.analyze}</Button>
    {error && <Alert tone="danger" compact>{error}</Alert>}{notice && <Alert tone="info" compact>{notice}</Alert>}
    {proposal?.answers.map(answer => <article key={answer.key} className="rounded-xl border border-border p-3"><h3 className="font-semibold">{c[answer.key]}</h3><p className="mt-2 whitespace-pre-wrap">{answer.value}</p><blockquote className="my-3 border-s-2 border-border ps-3 text-sm text-ink-muted">{answer.quote}</blockquote><Button variant="outline" disabled={disabled || busy} onClick={() => { onApply({ [answer.key]: answer.value }); setNotice(t.applied); }}>{t.apply}</Button></article>)}
    {proposal && !proposal.answers.length && <p className="text-sm">{t.empty}</p>}
    {Boolean(proposal?.questions.length) && <section><h3 className="font-semibold">{t.followup}</h3><ul className="list-disc space-y-2 ps-5">{proposal!.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></section>}
  </div></details>;
}
