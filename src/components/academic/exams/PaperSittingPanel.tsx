"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, ScanLine, ClipboardCheck, PencilLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { ScriptQrReader } from "@/components/school-ai/script-qr-reader";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import { paperGradebookCopy } from "@/lib/school-ai/paper-gradebook-copy";
import { PaperGradebookPanel } from "./PaperGradebookPanel";

/**
 * SKO-503: one sealed paper sat on paper. Per section: print the covers (a QR per candidate) and the
 * paper, keep the room sheet, scan covers back in (once each), and enter per-question marks after hand
 * marking. A recorded absence blocks scanning and marking until the office reopens it.
 */
type Pupil = { id: string; name: string; rollNo: string | null; attendance: string | null; reopened: boolean; script: { id: string; candidateNo: number; scanned: boolean; total: number | null; version: number; marks: Record<string, number> | null } | null };
type View = { office: boolean; sealed: boolean; compromised: boolean; questions: Array<{ id: string; number: number; marks: number }>; markingSections: Array<{ id: string; title: string; answerCount: number; questionCount: number }>; totalMarks: number | null; sections: Array<{ scheduleId: string; name: string; date: string; printRuns: number; transferred: boolean; pupils: Pupil[] }> };

export function PaperSittingPanel({ slotId }: { slotId: string }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const gradebookCopy = paperGradebookCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const [view, setView] = useState<View | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [absent, setAbsent] = useState<Record<string, Set<string>>>({});
  const [code, setCode] = useState("");
  const [marking, setMarking] = useState<Pupil | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [reopening, setReopening] = useState<{ pupilId: string; reason: string } | null>(null);
  const markingForm = useRef<HTMLElement>(null);
  const markingOpener = useRef<HTMLButtonElement>(null);
  const closeMarking = () => {
    setMarking(null);
    if (markingOpener.current?.isConnected) markingOpener.current.focus();
  };
  useEffect(() => {
    if (!marking) return;
    markingForm.current?.scrollIntoView({ block: "nearest" });
    markingForm.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [marking]);
  const load = useCallback(async () => {
    const response = await fetch(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/sitting`, { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed }); return; }
    setView(payload.data);
    setAbsent(Object.fromEntries((payload.data as View).sections.map(section => [section.scheduleId, new Set(section.pupils.filter(pupil => pupil.attendance === "ABSENT").map(pupil => pupil.id))])));
  }, [slotId, t.failed]);
  useEffect(() => { void load(); }, [load]);
  const handleTransferred = useCallback(async () => {
    setMarking(null); setReopening(null); await load();
  }, [load, setMarking]);

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
  return <div className="min-w-0 space-y-6" data-paper-sitting>
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface-subtle p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-base font-bold"><ScanLine aria-hidden="true" className="size-5 text-primary" />{t.scanTitle}</h3>
      <ScriptQrReader locale={language} onRead={scan} />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <FormField name="scriptCode" label={t.scanCode} className="w-full min-w-0 flex-1"><Input dir="ltr" value={code} onChange={event => setCode(event.currentTarget.value)} /></FormField>
        <Button type="button" disabled={code.trim().length < 10} onClick={() => void scan(code)} className="h-auto min-h-11 whitespace-normal" data-scan-submit>{t.scanSubmit}</Button>
      </div>
    </section>
    {view.sections.map(section => {
      const scanned = section.pupils.filter(pupil => pupil.script?.scanned).length;
      const marked = section.pupils.filter(pupil => pupil.script?.total !== null && pupil.script?.total !== undefined).length;
      const chosen = absent[section.scheduleId] ?? new Set<string>();
      return <section key={section.scheduleId} className="min-w-0 space-y-4 rounded-2xl border border-border-subtle p-3 sm:p-5" data-sitting-section={section.scheduleId}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1"><h3 className="text-base font-bold"><bdi>{section.name}</bdi></h3><p className="text-xs text-ink-muted"><bdi>{section.date}</bdi></p></div>
          <Badge variant="secondary" className="leading-relaxed">{fillStudioCopy(t.scriptsSummary, [number(scanned), number(section.pupils.length), number(marked)])}</Badge>
        </header>
        {view.office ? <div className="flex flex-wrap gap-2">
          <a href={`/api/academic/paper-slots/${encodeURIComponent(slotId)}/print-run?scheduleId=${encodeURIComponent(section.scheduleId)}&lang=${language}`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "outline" })} data-print-covers><Printer aria-hidden="true" />{t.printCovers}</a>
          <a href={`/api/academic/paper-slots/${encodeURIComponent(slotId)}/print`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "ghost" })}><Printer aria-hidden="true" />{t.printPaper}</a>
        </div> : null}
        <Table containerClassName="max-h-[28rem] custom-scrollbar" className="min-w-[36rem]" aria-label={fillStudioCopy(t.roomSheetTitle, [section.name])} data-paper-sitting-table>
          <TableHeader className="sticky top-0 z-20"><TableRow><TableHead className="sticky start-0 z-20 w-40 bg-surface-subtle sm:w-56">{t.colPupil}</TableHead><TableHead className="text-center">{t.absentLabel}</TableHead><TableHead>{t.colCandidate}</TableHead><TableHead className="text-end">{t.colMarks}</TableHead></TableRow></TableHeader>
          <TableBody>
            {section.pupils.map(pupil => <TableRow key={pupil.id} data-state={marking?.id === pupil.id ? "selected" : undefined} data-pupil={pupil.id}>
              <TableCell className={`sticky start-0 z-10 w-40 min-w-36 max-w-40 py-3 sm:w-56 sm:min-w-44 sm:max-w-56 ${marking?.id === pupil.id ? "bg-surface-selected" : "bg-white"}`}>
                <p className="break-words font-semibold"><bdi>{pupil.name}</bdi></p>
                {pupil.rollNo ? <p className="mt-1 text-xs text-ink-muted"><bdi>{fillStudioCopy(gradebookCopy.rollNumber, [pupil.rollNo])}</bdi></p> : null}
                {pupil.attendance === "ABSENT" ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t.absentNote}</p> : pupil.reopened ? <p className="mt-2 text-xs text-ink-muted">{t.reopened}</p> : null}
              </TableCell>
              <TableCell className="py-3 text-center"><label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><Checkbox checked={chosen.has(pupil.id)} disabled={section.transferred || pupil.attendance === "ABSENT"} aria-label={`${t.absentLabel}: ${pupil.name}`} onChange={event => { const next = new Set(chosen); if (event.currentTarget.checked) next.add(pupil.id); else next.delete(pupil.id); setAbsent(current => ({ ...current, [section.scheduleId]: next })); }} /></label></TableCell>
              <TableCell className="py-3">{pupil.script ? <div className="space-y-2"><p className="text-xs font-medium tabular-nums"><bdi>{fillStudioCopy(t.candidateLabel, [number(pupil.script.candidateNo)])}</bdi></p><Badge variant={pupil.script.scanned ? "success" : "neutral"} size="sm" dot>{pupil.script.scanned ? t.scannedLabel : t.notScanned}</Badge></div> : "—"}</TableCell>
              <TableCell className="py-3 text-end tabular-nums">
                {pupil.attendance === "ABSENT" && view.office && !section.transferred ? (reopening?.pupilId === pupil.id
                  ? <span className="flex flex-wrap items-center gap-1"><Input aria-label={t.reopenReason} placeholder={t.reopenReason} value={reopening.reason} onChange={event => { const reason = event.currentTarget.value; setReopening(current => current ? { ...current, reason } : current); }} className="h-9 w-44" /><Button type="button" size="sm" disabled={reopening.reason.trim().length < 5} onClick={() => void post(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/attendance/reopen?scheduleId=${encodeURIComponent(section.scheduleId)}`, { studentId: pupil.id, reason: reopening.reason.trim() }, () => t.reopened).then(done => { if (done) setReopening(null); })} data-reopen-confirm>{t.reopen}</Button></span>
                  : <Button type="button" size="sm" variant="ghost" onClick={() => setReopening({ pupilId: pupil.id, reason: "" })} data-reopen>{t.reopen}</Button>)
                  : pupil.attendance !== "ABSENT" && pupil.script?.scanned ? <Button type="button" size="sm" variant="outline" disabled={section.transferred} onClick={event => { markingOpener.current = event.currentTarget; setMarking(pupil); setMarks(Object.fromEntries(Object.entries(pupil.script!.marks ?? {}).map(([key, value]) => [key, String(value)]))); }} data-enter-marks><PencilLine aria-hidden="true" />{pupil.script.total !== null ? `${number(pupil.script.total)} / ${number(view.totalMarks ?? 0)}` : t.enterMarks}</Button> : null}
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        <Button type="button" variant="outline" disabled={section.transferred} onClick={() => void post(`/api/academic/paper-slots/${encodeURIComponent(slotId)}/attendance?scheduleId=${encodeURIComponent(section.scheduleId)}`, { absentStudentIds: [...chosen] }, () => t.roomSheetSaved)} data-save-room-sheet><ClipboardCheck aria-hidden="true" />{t.roomSheet}</Button>
        {section.transferred ? <p className="text-xs text-ink-subtle" data-paper-transferred>{gradebookCopy.transferredHint}</p> : null}
        {view.office ? <PaperGradebookPanel slotId={slotId} scheduleId={section.scheduleId} onSent={handleTransferred} /> : null}
      </section>;
    })}
    {marking?.script ? <section ref={markingForm} className="space-y-4 rounded-2xl border border-brand-200 bg-surface-subtle p-4 sm:p-5" data-marks-form>
      <header className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><h3 className="text-base font-bold"><bdi>{marking.name}</bdi></h3><p className="text-sm text-ink-muted">{fillStudioCopy(t.marksTitle, [number(marking.script.candidateNo)])}</p></div><Button type="button" variant="ghost" size="sm" onClick={closeMarking}>{t.closeMarking}</Button></header>
      <p className="text-sm leading-relaxed text-ink-muted">{t.marksHint}</p>
      {view.markingSections.map(section => <p key={section.id} className="text-xs text-ink-subtle">{fillStudioCopy(t.marksSection, [section.title, number(section.answerCount), number(section.questionCount)])}</p>)}
      <div className="grid gap-2 sm:grid-cols-3">{view.questions.map(question => <FormField key={question.id} name={`mark-${question.id}`} label={fillStudioCopy(t.questionLabel, [number(question.number), number(question.marks)])}><Input type="number" inputMode="decimal" min={0} max={question.marks} step="0.5" value={marks[question.id] ?? ""} onChange={event => { const value = event.currentTarget.value; setMarks(current => ({ ...current, [question.id]: value })); }} /></FormField>)}</div>
      <Button type="button" onClick={() => void post(`/api/academic/paper-scripts/${encodeURIComponent(marking.script!.id)}/marks`, { version: marking.script!.version, marks: Object.fromEntries(Object.entries(marks).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)])) }, data => fillStudioCopy(t.marksSaved, [String(data.total ?? ""), String(data.of ?? "")])).then(done => { if (done) closeMarking(); })} data-save-marks>{t.marksSave}</Button>
    </section> : null}
  </div>;
}
