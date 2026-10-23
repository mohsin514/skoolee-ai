"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, ScanLine, ClipboardCheck, PencilLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { ScriptQrReader } from "@/components/school-ai/script-qr-reader";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";

/**
 * SKO-503: one sealed paper sat on paper. Per section: print the covers (a QR per candidate) and the
 * paper, keep the room sheet, scan covers back in (once each), and enter per-question marks after hand
 * marking. A recorded absence blocks scanning and marking until the office reopens it.
 */
type Pupil = { id: string; name: string; rollNo: string | null; attendance: string | null; reopened: boolean; script: { id: string; candidateNo: number; scanned: boolean; total: number | null; version: number; marks: Record<string, number> | null } | null };
type View = { office: boolean; sealed: boolean; compromised: boolean; questions: Array<{ id: string; number: number; marks: number }>; totalMarks: number | null; sections: Array<{ scheduleId: string; name: string; date: string; printRuns: number; pupils: Pupil[] }> };

export function PaperSittingPanel({ slotId }: { slotId: string }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const [view, setView] = useState<View | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [absent, setAbsent] = useState<Record<string, Set<string>>>({});
  const [code, setCode] = useState("");
  const [marking, setMarking] = useState<Pupil | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [reopening, setReopening] = useState<{ pupilId: string; reason: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/sitting`, { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed }); return; }
    setView(payload.data);
    setAbsent(Object.fromEntries((payload.data as View).sections.map(section => [section.scheduleId, new Set(section.pupils.filter(pupil => pupil.attendance === "ABSENT").map(pupil => pupil.id))])));
  }, [slotId, t.failed]);
  useEffect(() => { void load(); }, [load]);

  const post = async (url: string, body: unknown, success: (data: Record<string, unknown>) => string) => {
    setNotice(null);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed }); return false; }
    setNotice({ tone: "success", text: success(payload.data ?? {}) }); await load(); return true;
  };
  const scan = async (value: string) => {
    // Clear first, so a code typed while the list reloads is never wiped.
    setCode("");
    await post("/api/academic/paper-scripts/scan", { code: value.trim() }, data => fillStudioCopy(t.scannedOne, [String(data.candidateNo ?? ""), String((data.student as { fullName?: string } | undefined)?.fullName ?? "")]));
  };

  if (!view) return notice ? <Alert tone={notice.tone} compact>{notice.text}</Alert> : <TaskLoading label={t.sittingTitle} />;
  return <div className="space-y-4" data-paper-sitting>
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    <section className="space-y-2 rounded-xl border border-border-subtle p-3">
      <h3 className="flex items-center gap-2 text-sm font-bold"><ScanLine aria-hidden="true" className="size-4 text-primary" />{t.scanTitle}</h3>
      <ScriptQrReader locale={language} onRead={scan} />
      <div className="flex flex-wrap items-end gap-2">
        <FormField name="scriptCode" label={t.scanCode} className="min-w-64 flex-1"><Input dir="ltr" value={code} onChange={event => setCode(event.currentTarget.value)} /></FormField>
        <Button type="button" disabled={code.trim().length < 10} onClick={() => void scan(code)} data-scan-submit>{t.scanSubmit}</Button>
      </div>
    </section>
    {view.sections.map(section => {
      const scanned = section.pupils.filter(pupil => pupil.script?.scanned).length;
      const marked = section.pupils.filter(pupil => pupil.script?.total !== null && pupil.script?.total !== undefined).length;
      const chosen = absent[section.scheduleId] ?? new Set<string>();
      return <section key={section.scheduleId} className="space-y-3 rounded-xl border border-border-subtle p-3" data-sitting-section={section.scheduleId}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold"><bdi>{section.name}</bdi> · <bdi>{section.date}</bdi></h3>
          <p className="text-xs text-ink-muted">{fillStudioCopy(t.scriptsSummary, [number(scanned), number(section.pupils.length), number(marked)])}</p>
        </header>
        {view.office ? <div className="flex flex-wrap gap-2">
          <a href={`/api/academic/paper-slots/${encodeURIComponent(slotId)}/print-run?scheduleId=${encodeURIComponent(section.scheduleId)}&lang=${language}`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "outline" })} data-print-covers><Printer aria-hidden="true" />{t.printCovers}</a>
          <a href={`/api/academic/paper-slots/${encodeURIComponent(slotId)}/print`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "ghost" })}><Printer aria-hidden="true" />{t.printPaper}</a>
        </div> : null}
        <table className="w-full text-sm">
          <thead><tr className="text-start text-2xs text-ink-subtle"><th className="text-start">{t.colPupil}</th><th className="text-start">{t.colCandidate}</th><th className="text-start">{t.colMarks}</th></tr></thead>
          <tbody>
            {section.pupils.map(pupil => <tr key={pupil.id} className="border-t border-border-subtle" data-pupil={pupil.id}>
              <td className="py-1.5">
                <label className="flex items-center gap-2"><Checkbox checked={chosen.has(pupil.id)} disabled={pupil.attendance === "ABSENT"} aria-label={t.absentLabel} onChange={event => { const next = new Set(chosen); if (event.currentTarget.checked) next.add(pupil.id); else next.delete(pupil.id); setAbsent(current => ({ ...current, [section.scheduleId]: next })); }} /><bdi>{pupil.name}</bdi></label>
                {pupil.attendance === "ABSENT" ? <span className="text-2xs text-status-error-text">{t.absentNote}</span> : pupil.reopened ? <span className="text-2xs text-ink-subtle">{t.reopened}</span> : null}
              </td>
              <td>{pupil.script ? <>{fillStudioCopy(t.candidateLabel, [number(pupil.script.candidateNo)])} {pupil.script.scanned ? <Badge variant="success" size="sm">✓</Badge> : <Badge variant="neutral" size="sm">{t.notScanned}</Badge>}</> : "—"}</td>
              <td>
                {pupil.attendance === "ABSENT" && view.office ? (reopening?.pupilId === pupil.id
                  ? <span className="flex flex-wrap items-center gap-1"><Input aria-label={t.reopenReason} placeholder={t.reopenReason} value={reopening.reason} onChange={event => { const reason = event.currentTarget.value; setReopening(current => current ? { ...current, reason } : current); }} className="h-9 w-44" /><Button type="button" size="sm" disabled={reopening.reason.trim().length < 5} onClick={() => void post(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/attendance/reopen?scheduleId=${encodeURIComponent(section.scheduleId)}`, { studentId: pupil.id, reason: reopening.reason.trim() }, () => t.reopened).then(done => { if (done) setReopening(null); })} data-reopen-confirm>{t.reopen}</Button></span>
                  : <Button type="button" size="sm" variant="ghost" onClick={() => setReopening({ pupilId: pupil.id, reason: "" })} data-reopen>{t.reopen}</Button>)
                  : pupil.script?.scanned ? <Button type="button" size="sm" variant="outline" onClick={() => { setMarking(pupil); setMarks(Object.fromEntries(Object.entries(pupil.script!.marks ?? {}).map(([key, value]) => [key, String(value)]))); }} data-enter-marks><PencilLine aria-hidden="true" />{pupil.script.total !== null ? `${number(pupil.script.total)} / ${number(view.totalMarks ?? 0)}` : t.enterMarks}</Button> : null}
              </td>
            </tr>)}
          </tbody>
        </table>
        <Button type="button" size="sm" variant="outline" onClick={() => void post(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/attendance?scheduleId=${encodeURIComponent(section.scheduleId)}`, { absentStudentIds: [...chosen] }, () => t.roomSheetSaved)} data-save-room-sheet><ClipboardCheck aria-hidden="true" />{t.roomSheet}</Button>
      </section>;
    })}
    {marking?.script ? <section className="space-y-2 rounded-xl border border-brand-200 p-3" data-marks-form>
      <h3 className="text-sm font-bold">{fillStudioCopy(t.marksTitle, [number(marking.script.candidateNo)])}</h3>
      <div className="grid gap-2 sm:grid-cols-3">{view.questions.map(question => <FormField key={question.id} name={`mark-${question.id}`} label={fillStudioCopy(t.questionLabel, [number(question.number), number(question.marks)])}><Input type="number" inputMode="decimal" min={0} max={question.marks} step="0.5" value={marks[question.id] ?? ""} onChange={event => { const value = event.currentTarget.value; setMarks(current => ({ ...current, [question.id]: value })); }} /></FormField>)}</div>
      <Button type="button" onClick={() => void post(`/api/academic/paper-scripts/${encodeURIComponent(marking.script!.id)}/marks`, { version: marking.script!.version, marks: Object.fromEntries(Object.entries(marks).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)])) }, data => fillStudioCopy(t.marksSaved, [String(data.total ?? ""), String(data.of ?? "")])).then(done => { if (done) setMarking(null); })} data-save-marks>{t.marksSave}</Button>
    </section> : null}
  </div>;
}
