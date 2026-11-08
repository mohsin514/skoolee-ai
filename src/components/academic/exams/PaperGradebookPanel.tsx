"use client";

import { useRef, useState } from "react";
import { ArrowRight, BookOpenCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import type { GradebookConversion } from "@/lib/school-ai/exam-gradebook";
import type { PaperGradebookPreview } from "@/lib/school-ai/paper-gradebook";
import { paperGradebookCopy } from "@/lib/school-ai/paper-gradebook-copy";

export function PaperGradebookPanel({ slotId, scheduleId, onSent }: { slotId: string; scheduleId: string; onSent?: () => void | Promise<void> }) {
  const { language } = useLocale();
  const t = paperGradebookCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  const [preview, setPreview] = useState<PaperGradebookPreview | null>(null);
  const [conversion, setConversion] = useState<GradebookConversion>("EXACT");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const replayKey = useRef<{ hash: string; key: string } | null>(null);
  const url = `/api/academic/paper-slots/${encodeURIComponent(slotId)}/gradebook?scheduleId=${encodeURIComponent(scheduleId)}`;
  const driftByPupil = new Map(preview?.drift.map(row => [row.studentId, row]) ?? []);
  const driftNote = (studentId: string) => {
    const drift = driftByPupil.get(studentId);
    return drift ? <p className="mt-2 text-xs font-medium text-status-warning-text" data-paper-gradebook-drift={studentId}>{fillStudioCopy(t.currentMark, [drift.current === null ? t.unavailable : number(drift.current)])}</p> : null;
  };

  const load = async (next = conversion) => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`${url}&conversion=${next}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
      const value = payload.data as PaperGradebookPreview;
      setPreview(value); setConversion(next);
      if (replayKey.current?.hash !== value.previewHash) replayKey.current = { hash: value.previewHash, key: crypto.randomUUID() };
    } catch (error) { setNotice({ tone: "danger", text: error instanceof Error ? error.message : t.failed }); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!preview || preview.blockers.length || !replayKey.current) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversion: preview.conversion, previewHash: preview.previewHash, idempotencyKey: replayKey.current.key }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failed);
      await load(preview.conversion);
      await onSent?.();
      setNotice({ tone: "success", text: t.sent });
    } catch (error) { setNotice({ tone: "danger", text: error instanceof Error ? error.message : t.failed }); }
    finally { setBusy(false); }
  };

  return <section className="min-w-0 space-y-5 border-t border-border-subtle pt-5" data-paper-gradebook={scheduleId}>
    {notice && (notice.tone === "danger" || !preview?.receipt) ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    {!preview ? <Button type="button" variant="outline" disabled={busy} onClick={() => void load()} className="h-auto min-h-11 whitespace-normal" data-paper-gradebook-preview><BookOpenCheck aria-hidden="true" />{t.open}</Button> : <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h4 className="flex items-center gap-2 text-base font-bold"><BookOpenCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />{t.title}</h4>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{t.intro}</p>
        </div>
        <Badge variant={preview.receipt ? "success" : preview.blockers.length ? "warning" : "secondary"} dot>{preview.receipt ? t.transferredState : preview.blockers.length ? t.attention : t.ready}</Badge>
      </header>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
        <dl className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
          <div className="min-w-0 flex-1"><dt className="text-xs font-medium text-ink-muted">{t.paperMaximum}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{number(preview.sourceMaximum)}</dd></div>
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted rtl:rotate-180" />
          <div className="min-w-0 flex-1"><dt className="text-xs font-medium text-ink-muted">{t.gradebookMaximum}</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-primary">{number(preview.targetMaximum)}</dd></div>
        </dl>
        <p className="w-full text-sm text-ink-muted sm:w-auto">{fillStudioCopy(t.rosterSummary, [number(preview.rows.length), number(preview.rows.filter(row => row.isAbsent).length)])}</p>
      </div>
      {preview.receipt ? <Alert tone="success" live="polite"><div className="space-y-2"><p className="font-semibold">{t.sent}</p><details className="text-sm"><summary className="cursor-pointer py-1 font-medium">{t.receiptDetails}</summary><p className="mt-2 break-all text-xs"><bdi>{fillStudioCopy(t.receipt, [preview.receipt.id])}</bdi></p></details></div></Alert> : <FormField name={`conversion-${scheduleId}`} label={t.conversion}>
        <Select value={conversion} disabled={busy} onChange={event => void load(event.currentTarget.value as GradebookConversion)} data-paper-gradebook-conversion>
          <option value="EXACT">{t.exact}</option><option value="PROPORTIONAL_WHOLE">{t.proportional}</option>
        </Select>
      </FormField>}
      {!preview.receipt && preview.blockers.length ? <Alert tone="danger" compact><ul className="list-disc space-y-1 ps-4">{preview.blockers.map(blocker => <li key={blocker}>{t[blocker]}</li>)}</ul></Alert> : null}
      {preview.drift.length ? <Alert tone="danger" compact>{t.drift}</Alert> : null}
      <Table containerClassName="hidden max-h-[28rem] custom-scrollbar sm:block" className="min-w-[32rem]" aria-label={t.title}>
        <TableHeader className="sticky top-0 z-10"><TableRow><TableHead>{t.pupil}</TableHead><TableHead className="text-end">{t.raw}</TableHead><TableHead className="text-end">{preview.receipt ? t.transferred : t.target}</TableHead><TableHead className="text-center">{t.grade}</TableHead></TableRow></TableHeader>
        <TableBody>{preview.rows.map(row => <TableRow key={row.studentId}>
          <TableCell className="min-w-48 py-3"><div className="flex flex-wrap items-center gap-2"><bdi className="font-semibold">{row.fullName}</bdi>{row.isAbsent ? <Badge variant="neutral" size="sm">{t.absent}</Badge> : null}</div>{row.rollNo ? <p className="mt-1 text-xs text-ink-muted"><bdi>{fillStudioCopy(t.rollNumber, [row.rollNo])}</bdi></p> : null}</TableCell>
          <TableCell className="py-3 text-end tabular-nums">{row.isAbsent ? "—" : row.rawTotal === null ? <Badge variant="neutral" size="sm">{t.pending}</Badge> : number(row.rawTotal)}</TableCell>
          <TableCell className="py-3 text-end font-semibold tabular-nums text-primary">{row.isAbsent ? "—" : row.targetMark === null ? <Badge variant="warning" size="sm">{t.pending}</Badge> : number(row.targetMark)}{driftNote(row.studentId)}</TableCell>
          <TableCell className="py-3 text-center">{row.grade ? <Badge variant="neutral">{row.grade}</Badge> : "—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <ol className="space-y-3 sm:hidden" aria-label={t.title} data-paper-gradebook-mobile>
        {preview.rows.map(row => <li key={row.studentId} className="space-y-3 rounded-xl border border-border-subtle bg-white p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold"><bdi>{row.fullName}</bdi></p>{row.rollNo ? <p className="mt-1 text-xs text-ink-muted"><bdi>{fillStudioCopy(t.rollNumber, [row.rollNo])}</bdi></p> : null}</div>{row.isAbsent ? <Badge variant="neutral">{t.absent}</Badge> : row.grade ? <Badge variant="neutral">{t.grade}: {row.grade}</Badge> : null}</div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3"><div><dt className="text-xs text-ink-muted">{t.raw}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{row.isAbsent ? "—" : row.rawTotal === null ? t.pending : number(row.rawTotal)}</dd></div><div><dt className="text-xs text-ink-muted">{preview.receipt ? t.transferred : t.target}</dt><dd className="mt-1 text-base font-semibold tabular-nums text-primary">{row.isAbsent ? "—" : row.targetMark === null ? t.pending : number(row.targetMark)}</dd></div></dl>
          {driftNote(row.studentId)}
        </li>)}
      </ol>
      {preview.outcomes.length ? <section className="space-y-4 rounded-2xl border border-border-subtle p-4" data-paper-outcome-evidence>
        <div className="space-y-2"><h5 className="text-sm font-bold">{t.outcomes}</h5><p className="text-xs leading-relaxed text-ink-muted">{t.outcomeHint}</p></div>
        {preview.outcomes.map(outcome => <div key={outcome.id} className="space-y-2 border-t border-border-subtle pt-4">
          <div className="flex items-start justify-between gap-4"><p className="text-sm font-medium"><bdi>{outcome.title}</bdi></p><span className="shrink-0 text-base font-bold tabular-nums text-primary">{new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(outcome.scoredShare / 100)}</span></div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, outcome.scoredShare))}%` }} /></div>
          <p className="text-xs text-ink-muted">{fillStudioCopy(t.outcomeSample, [number(outcome.candidates), number(outcome.earned), number(outcome.possible)])}</p>
        </div>)}
      </section> : null}
      <footer className="flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="outline" disabled={busy} onClick={() => void load()} className="h-auto min-h-11 whitespace-normal"><RefreshCw aria-hidden="true" />{t.refresh}</Button>{!preview.receipt ? <Button type="button" disabled={busy || preview.blockers.length > 0} onClick={() => void send()} className="h-auto min-h-11 whitespace-normal" data-paper-gradebook-send><Send aria-hidden="true" />{busy ? t.sending : t.send}</Button> : null}</footer>
    </>}
  </section>;
}
