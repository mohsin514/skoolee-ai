"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

/**
 * SKO-501 (F2b): upload or paste a paper the teacher already wrote, for a requested paper. The file goes
 * through the existing intake as a "paper" source; its text is read into draft questions, each to check
 * in the review desk. Scanned files need the approved document provider; text and pasted papers do not.
 */
type Warning = { code: string; values: Array<string | number> };

export function UploadPaper({ slotId, subjectId, classId, onDone }: { slotId: string; subjectId: string | null; classId: string | null; onDone: () => void }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ questions: number; warnings: Warning[] } | null>(null);
  const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "");

  const run = async () => {
    setBusy(true); setError(null);
    try {
      let sourceId: string;
      if (file) {
        const form = new FormData();
        form.set("file", file); form.set("documentKind", "paper"); form.set("language", language);
        if (subjectId && classId) { form.set("subjectId", subjectId); form.set("classId", classId); }
        const response = await fetch("/api/school-ai/intake", { method: "POST", body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
        sourceId = payload.record.id;
      } else {
        const response = await fetch("/api/school-ai/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "SOURCE", title: t.uploadPaper, idempotencyKey: key(), data: { extractedText: text.trim(), documentKind: "paper", fileName: "typed-paper.txt", mimeType: "text/plain", ...(subjectId && classId ? { subjectId, classId } : {}), origin: "manual", extractionStatus: "manual" } }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
        sourceId = payload.record.id;
      }
      const response = await fetch(`/api/school-ai/workspace/${encodeURIComponent(sourceId)}/paper-from-upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
      setResult({ questions: payload.questions, warnings: payload.warnings ?? [] }); onDone();
    } catch (reason) { setError(reason instanceof Error && reason.message ? reason.message : t.failed); }
    finally { setBusy(false); }
  };

  if (result) return <div className="space-y-3" data-upload-result>
    <Alert tone="success" compact live="polite">{fillStudioCopy(t.uploadDone, [new Intl.NumberFormat(language).format(result.questions)])}</Alert>
    {result.warnings.filter(warning => warning.code !== "NO_QUESTIONS").map((warning, index) => <Alert key={index} tone="warning" compact>{fillStudioCopy(warning.code === "MARKS_NOT_STATED" ? t.uploadWarnMarks : t.uploadWarnKey, warning.values.map(String))}</Alert>)}
    <a href="#space=review" className="text-sm font-semibold text-primary underline">{t.openReview}</a>
  </div>;
  return <div className="space-y-4" data-upload-paper>
    <p className="text-sm text-ink-muted">{t.uploadIntro}</p>
    {error ? <Alert tone="danger" compact live="polite">{error}</Alert> : null}
    {busy ? <TaskLoading label={t.uploadReading} /> : null}
    <FormField name="paperFile" label={t.uploadFile}><Input type="file" accept="application/pdf,image/*,text/plain,.docx" onChange={event => setFile(event.currentTarget.files?.[0] ?? null)} /></FormField>
    <FormField name="paperText" label={t.pasteText}><Textarea rows={8} dir="auto" value={text} maxLength={80000} onChange={event => setText(event.currentTarget.value)} /></FormField>
    <Button type="button" disabled={busy || (!file && !text.trim())} onClick={() => void run()} data-upload-read><FileUp aria-hidden="true" />{t.uploadDo}</Button>
  </div>;
}
