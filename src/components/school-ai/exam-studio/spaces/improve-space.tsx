"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSpacesCopy, type StudioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import type { ItemAnalysis, OutcomeFeedback } from "@/lib/school-ai/recovery";
import { MINIMUM_ITEM_RESPONSES } from "@/lib/school-ai/recovery";
import type { StudioSpaceProps } from "../studio-space-registry";
import { Isolated, SpaceStateRegion, type SpaceState } from "../space-state";
import { OutcomeFeedbackList } from "../../outcome-feedback";
import { ExamRemedyPanel } from "../../exam-remedy-panel";
import { AssessmentRepairPanel } from "../../assessment-repair-panel";
import { EvidencePackPanel } from "../evidence-pack-panel";
import { ExamModerationPanel } from "../../exam-moderation-panel";
import { PracticeProgressPanel } from "../../practice-progress-panel";
import type { MistakeMap } from "@/lib/school-ai/mistake-map";
import { FamilyNotesPanel, MistakeMapPanel } from "../mistake-map-panel";
import { TwinPanel } from "../twin-panel";

/**
 * SKO-408 Results and improvement (R18). The evidence base is stated before any reading of it, an
 * item reads as learning evidence only when it is not first an item or marking question, and every
 * feedback line is an item, its moderated marks and the teacher's own words. No ranking (R18.11).
 */
type Exam = { id: string; title: string; classId: string; campusId: string; startsAt: string; endsAt: string; status: string };
type Staff = {
  role: "STAFF"; exam: { id: string; title: string; endsAt: string; resultsReleasedAt: string | null; paperVersion: number };
  counts: { assigned: number; absent: number; inProgress: number; unmarked: number; reviewed: number };
  items: ItemAnalysis[]; map: MistakeMap; learners: Array<{ attemptId: string; name: string | null; resultVersion: number; feedback: OutcomeFeedback[] }>;
};
const READING: Record<ItemAnalysis["reading"], keyof StudioSpacesCopy> = { LEARNING_EVIDENCE: "readingLearning", CHECK_ITEM: "readingCheck", INSUFFICIENT_EVIDENCE: "readingThin" };

export default function ImproveSpace({ language, scope, capabilities, records, reload }: StudioSpaceProps) {
  const t = studioSpacesCopy(language);
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<SpaceState<Staff>>({ kind: "loading" });
  const loadExams = useCallback(async () => {
    const response = await fetch("/api/school-ai/exams", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setState({ kind: "error", reason: typeof payload.error === "string" ? payload.error : t.failed, retry: () => void loadExams() }); return; }
    setExams((payload.exams as Exam[]).filter(exam => (!scope.campusId || exam.campusId === scope.campusId) && (!scope.classId || exam.classId === scope.classId)));
  }, [scope.campusId, scope.classId, t.failed]);
  useEffect(() => { void loadExams(); }, [loadExams]);
  const examId = selected || exams?.[0]?.id || "";
  const load = useCallback(async () => {
    if (!examId) return;
    setState({ kind: "loading" });
    const response = await fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/improvement`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setState(response.ok ? { kind: "ready", data: payload.improvement } : { kind: "error", reason: typeof payload.error === "string" ? payload.error : t.failed, retry: () => void load() });
  }, [examId, t.failed]);
  useEffect(() => { void load(); }, [load]);
  if (exams && exams.length === 0) return <TaskFeedback kind="empty" title={t.noExams}><p>{t.improveIntro}</p></TaskFeedback>;
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
  return <div className="min-w-0 space-y-4" data-improve-space>
    <p className="text-sm text-ink-subtle">{t.improveIntro}</p>
    {exams && <label className="grid max-w-xl gap-1 text-sm font-semibold">{t.exam}<Select aria-label={t.exam} value={examId} onChange={event => setSelected(event.target.value)}>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</Select></label>}
    <SpaceStateRegion state={state} language={language}>{data => <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{data.exam.resultsReleasedAt ? fillStudioCopy(t.releasedOn, [new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(data.exam.resultsReleasedAt))]) : t.notReleased}</p>
        <Link href={`/ai/exams/${encodeURIComponent(data.exam.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{t.openDesk}</Link>
      </div>
      <section aria-labelledby="improve-base" className="sk-panel space-y-4 p-4 sm:p-5"><h3 id="improve-base" className="text-base font-semibold">{t.evidenceBase}</h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{([["assigned", data.counts.assigned], ["moderated", data.counts.reviewed], ["unmarked", data.counts.unmarked], ["inProgress", data.counts.inProgress], ["absent", data.counts.absent]] as const).map(([key, value]) =>
          <div key={key} className="space-y-2 rounded-xl bg-surface-subtle p-3"><dt className="text-xs leading-relaxed text-ink-muted">{t[key]}</dt><dd className="text-2xl font-semibold tabular-nums">{number(value)}</dd></div>)}</dl>
      </section>
      <section aria-labelledby="improve-items" className="sk-panel min-w-0 space-y-4 p-4 sm:p-5"><h3 id="improve-items" className="text-base font-semibold">{t.items}</h3>
        <Table className="min-w-[48rem]" containerClassName="max-w-full" aria-labelledby="improve-items">
          <TableHeader><TableRow><TableHead>{fillStudioCopy(t.question, ["#"])}</TableHead><TableHead className="text-end">{t.answered}</TableHead><TableHead className="text-end">{t.blank}</TableHead><TableHead className="text-end">{t.average}</TableHead><TableHead className="text-end">{t.fullMarks}</TableHead><TableHead>{t.evidenceBase}</TableHead></TableRow></TableHeader>
          <TableBody>{data.items.map(item => <TableRow key={item.questionId} data-item-reading={item.reading}>
            <TableHead scope="row" className="min-w-56 max-w-sm py-4 align-top text-sm text-foreground"><p>{fillStudioCopy(t.question, [number(item.number)])}</p><p dir="auto" className="mt-1 line-clamp-2 text-xs font-normal leading-relaxed text-ink-muted">{item.prompt}</p></TableHead>
            <TableCell className="align-top text-end tabular-nums">{number(item.answered)}</TableCell><TableCell className="align-top text-end tabular-nums">{number(item.unanswered)}</TableCell>
            <TableCell className="align-top text-end font-semibold tabular-nums">{percent(item.percentage)}</TableCell><TableCell className="align-top text-end tabular-nums">{percent(item.fullCreditPercentage)}</TableCell>
            <TableCell className="min-w-56 align-top"><Badge variant={item.reading === "CHECK_ITEM" ? "warning" : item.reading === "LEARNING_EVIDENCE" ? "info" : "neutral"} className="leading-relaxed">{t[READING[item.reading]]}</Badge>
              {item.reasons.length > 0 && <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-muted">{item.reasons.map(reason => reason === "FEW_RESPONSES" ? fillStudioCopy(t.reasonFew, [number(MINIMUM_ITEM_RESPONSES)]) : reason === "NOBODY_FULL_CREDIT" ? t.reasonNobody : t.reasonDistractor).join(" · ")}</p>}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </section>
      <TwinPanel examId={data.exam.id} language={language} />
      {data.exam.resultsReleasedAt && <MistakeMapPanel examId={data.exam.id} map={data.map} language={language} canCreate={capabilities.canCreate} onPractice={reload} />}
      {data.exam.resultsReleasedAt && (capabilities.canApprove || capabilities.canCreate) && <FamilyNotesPanel examId={data.exam.id} language={language} canCreate={capabilities.canApprove || capabilities.canCreate} />}
      <ExamRemedyPanel examId={data.exam.id} locale={language} canAuthorize={capabilities.canApprove} onApplied={() => void load()} />
      {capabilities.canApprove || capabilities.canCreate ? <AssessmentRepairPanel examId={data.exam.id} /> : null}
      {capabilities.canApprove || capabilities.canCreate ? <EvidencePackPanel examId={data.exam.id} language={language} canIncludeKeys={capabilities.canApprove || capabilities.canCreate} /> : null}
      {capabilities.canApprove || capabilities.canCreate ? <ExamModerationPanel examId={data.exam.id} /> : null}
      <PracticeProgressPanel practice={records.filter(record => record.kind === "PRACTICE" && record.status === "APPROVED" && Array.isArray(record.data.sourceAssignmentIds) && (record.data.sourceAssignmentIds as string[]).includes(data.exam.id)).map(record => ({ id: record.id, title: record.title }))} />
      <PracticeFollowUp examId={data.exam.id} exams={exams ?? []} language={language} records={records} canApprove={capabilities.canApprove} canCreate={capabilities.canCreate} reload={reload} released={!!data.exam.resultsReleasedAt} />
      <section aria-labelledby="improve-learners" className="sk-panel space-y-2 p-4"><h3 id="improve-learners" className="font-semibold">{t.learners}</h3>
        {data.learners.length === 0 ? <p className="text-sm text-ink-subtle">{t.noLearners}</p> : <ul className="grid gap-2">{data.learners.map(learner => <li key={learner.attemptId}>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold"><Isolated>{learner.name ?? "—"}</Isolated> <span className="text-xs font-normal text-ink-subtle">· {fillStudioCopy(t.resultVersion, [number(learner.resultVersion)])}</span></summary>
            <OutcomeFeedbackList feedback={learner.feedback} language={language} /></details>
        </li>)}</ul>}
      </section>
    </>}</SpaceStateRegion>
  </div>;
}

type PracticeRecord = StudioSpaceProps["records"][number];
type Comparison = { earlier: { id: string; title: string }; later: { id: string; title: string }; outcomes: Array<{ outcomeId: string; title: string | null; earlier: { percentage: number; items: number; candidates: number } | null; later: { percentage: number; items: number; candidates: number } | null }> };

/** R18.4-R18.10: practice from released items through teacher approval, and an earlier/later comparison with sample sizes. */
function PracticeFollowUp({ examId, exams, language, records, canApprove, canCreate, reload, released }: { examId: string; exams: Exam[]; language: StudioSpaceProps["language"]; records: StudioSpaceProps["records"]; canApprove: boolean; canCreate: boolean; reload: () => void; released: boolean }) {
  const t = studioSpacesCopy(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [later, setLater] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  // R18.8: a released formative check is shown beside the exam it followed up without being asked.
  const [formative, setFormative] = useState<Comparison | null>(null);
  useEffect(() => {
    let live = true;
    setFormative(null);
    void fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/formative-comparison`, { cache: "no-store" }).then(async response => { const payload = await response.json().catch(() => ({})); if (live && response.ok) setFormative(payload.comparison); });
    return () => { live = false; };
  }, [examId]);
  const practice = records.filter(record => record.kind === "PRACTICE" && Array.isArray(record.data.sourceAssignmentIds) && (record.data.sourceAssignmentIds as string[]).includes(examId));
  const current = exams.find(exam => exam.id === examId);
  const laterExams = exams.filter(exam => exam.id !== examId && current && exam.classId === current.classId && new Date(exam.startsAt) > new Date(current.startsAt));
  useEffect(() => {
    if (!later) { setComparison(null); return; }
    let live = true;
    void fetch(`/api/school-ai/exams/${encodeURIComponent(examId)}/compare?later=${encodeURIComponent(later)}`, { cache: "no-store" }).then(async response => { const payload = await response.json().catch(() => ({})); if (!live) return; if (response.ok) { setComparison(payload.comparison); setError(""); } else setError(typeof payload.error === "string" ? payload.error : t.failed); });
    return () => { live = false; };
  }, [examId, later, t.failed]);
  const act = async (path: string, init: RequestInit, done?: string) => {
    setBusy(true); setError(""); setNotice("");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : t.failed); return; }
    if (done) setNotice(done);
    reload();
  };
  const sample = (value: { percentage: number; items: number; candidates: number } | null) => value ? fillStudioCopy(t.sample, [new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value.percentage), new Intl.NumberFormat(language).format(value.items), new Intl.NumberFormat(language).format(value.candidates)]) : "—";
  if (!released) return null;
  const shownComparison = comparison ?? formative;
  return <section aria-labelledby="improve-practice" className="sk-panel min-w-0 space-y-4 p-4 sm:p-5" data-practice>
    <h3 id="improve-practice" className="font-semibold">{t.practiceTitle}</h3>
    <p className="text-sm text-ink-subtle">{t.practiceHint}</p>
    {practice.length > 0 && <ul className="grid gap-2">{practice.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm" data-practice-status={record.status}>
      <span><bdi dir="auto" className="font-semibold">{record.title}</bdi> · {fillStudioCopy(t.practiceItems, [new Intl.NumberFormat(language).format((record.data.items as unknown[] | undefined)?.length ?? 0)])} · {record.status === "APPROVED" ? t.statusApproved : record.status === "IN_REVIEW" ? t.statusInReview : t.statusDraft}</span>
      <span className="flex gap-2">
        {record.status === "DRAFT" && canCreate && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(`/api/school-ai/workspace/${encodeURIComponent(record.id)}`, { method: "PATCH", body: JSON.stringify({ version: record.version, action: "review" }) })}>{t.sendReview}</Button>}
        {record.status === "IN_REVIEW" && canApprove && <Button size="sm" disabled={busy} onClick={() => void act(`/api/school-ai/workspace/${encodeURIComponent(record.id)}`, { method: "PATCH", body: JSON.stringify({ version: record.version, action: "approve" }) })}>{t.approveForLearners}</Button>}
        {record.status === "APPROVED" && canCreate && <Button size="sm" variant="outline" disabled={busy} data-schedule-formative onClick={() => void act(`/api/school-ai/workspace/${encodeURIComponent(record.id)}/formative-check`, { method: "POST", body: "{}" }, t.formativeScheduled)}>{t.scheduleFormative}</Button>}
      </span>
    </li>)}</ul>}
    {canCreate && <Button variant="outline" disabled={busy} onClick={() => void act(`/api/school-ai/exams/${encodeURIComponent(examId)}/practice`, { method: "POST", body: "{}" })}>{t.draftPractice}</Button>}
    {error && <p role="alert" className="text-sm text-status-error-text"><bdi dir="auto">{error}</bdi></p>}
    {notice && <p role="status" className="text-sm text-status-success-text" data-formative-notice>{notice}</p>}
    <div className="space-y-2 border-t pt-3" data-compare>
      <h4 className="text-sm font-semibold">{t.compareTitle}</h4>
      <p className="text-xs text-ink-subtle">{t.compareHint}</p>
      {!laterExams.length ? <p className="text-sm text-ink-subtle">{t.noLater}</p> : <label className="grid max-w-md gap-1 text-sm font-semibold">{t.laterExam}<Select aria-label={t.laterExam} value={later} onChange={event => setLater(event.target.value)}><option value="">—</option>{laterExams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</Select></label>}
      {!comparison && formative && <p className="text-sm" data-formative-compared>{fillStudioCopy(t.formativeCompared, [formative.earlier.title])}</p>}
      {shownComparison && <Table className="min-w-[40rem]" containerClassName="max-w-full" aria-label={t.compareTitle}><TableHeader><TableRow><TableHead className="w-1/3">{t.outcomeCol}</TableHead><TableHead className="w-1/3 py-3 text-end">{t.earlierCol}<bdi dir="auto" className="mt-1 block font-normal leading-relaxed">{shownComparison.earlier.title}</bdi></TableHead><TableHead className="w-1/3 py-3 text-end">{t.laterCol}<bdi dir="auto" className="mt-1 block font-normal leading-relaxed">{shownComparison.later.title}</bdi></TableHead></TableRow></TableHeader>
        <TableBody>{shownComparison.outcomes.map(row => <TableRow key={row.outcomeId} data-compare-row><TableHead scope="row" className="py-4 text-sm text-foreground"><bdi dir="auto">{row.title ?? row.outcomeId}</bdi></TableHead><TableCell className="text-end leading-relaxed tabular-nums">{sample(row.earlier)}</TableCell><TableCell className="text-end leading-relaxed tabular-nums">{sample(row.later)}</TableCell></TableRow>)}</TableBody></Table>}
    </div>
  </section>;
}
