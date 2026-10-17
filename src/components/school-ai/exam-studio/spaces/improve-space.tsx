"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
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

/**
 * SKO-408 Results and improvement (R18). The evidence base is stated before any reading of it, an
 * item reads as learning evidence only when it is not first an item or marking question, and every
 * feedback line is an item, its moderated marks and the teacher's own words. No ranking (R18.11).
 */
type Exam = { id: string; title: string; classId: string; campusId: string; endsAt: string; status: string };
type Staff = {
  role: "STAFF"; exam: { id: string; title: string; endsAt: string; resultsReleasedAt: string | null; paperVersion: number };
  counts: { assigned: number; absent: number; inProgress: number; unmarked: number; reviewed: number };
  items: ItemAnalysis[]; learners: Array<{ attemptId: string; name: string | null; resultVersion: number; feedback: OutcomeFeedback[] }>;
};
const READING: Record<ItemAnalysis["reading"], keyof StudioSpacesCopy> = { LEARNING_EVIDENCE: "readingLearning", CHECK_ITEM: "readingCheck", INSUFFICIENT_EVIDENCE: "readingThin" };

export default function ImproveSpace({ language, scope, capabilities }: StudioSpaceProps) {
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
  return <div className="space-y-4" data-improve-space>
    <p className="text-sm text-ink-subtle">{t.improveIntro}</p>
    {exams && <label className="grid max-w-xl gap-1 text-sm font-semibold">{t.exam}<Select value={examId} onChange={event => setSelected(event.target.value)}>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</Select></label>}
    <SpaceStateRegion state={state} language={language}>{data => <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{data.exam.resultsReleasedAt ? fillStudioCopy(t.releasedOn, [new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(data.exam.resultsReleasedAt))]) : t.notReleased}</p>
        <Link href={`/ai/exams/${encodeURIComponent(data.exam.id)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{t.openDesk}</Link>
      </div>
      <section aria-labelledby="improve-base" className="sk-panel space-y-2 p-4"><h3 id="improve-base" className="font-semibold">{t.evidenceBase}</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">{([["assigned", data.counts.assigned], ["moderated", data.counts.reviewed], ["unmarked", data.counts.unmarked], ["inProgress", data.counts.inProgress], ["absent", data.counts.absent]] as const).map(([key, value]) =>
          <div key={key} className="rounded-xl border p-2"><dt className="text-xs text-ink-subtle">{t[key]}</dt><dd className="text-lg font-bold tabular-nums">{number(value)}</dd></div>)}</dl>
      </section>
      <section aria-labelledby="improve-items" className="sk-panel space-y-2 p-4"><h3 id="improve-items" className="font-semibold">{t.items}</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="text-start text-xs text-ink-subtle"><th className="p-2 text-start">{fillStudioCopy(t.question, ["#"])}</th><th className="p-2 text-start">{t.answered}</th><th className="p-2 text-start">{t.blank}</th><th className="p-2 text-start">{t.average}</th><th className="p-2 text-start">{t.fullMarks}</th><th className="p-2 text-start">{t.evidenceBase}</th></tr></thead>
          <tbody>{data.items.map(item => <tr key={item.questionId} className="border-t align-top" data-item-reading={item.reading}>
            <td className="p-2"><p className="font-semibold">{fillStudioCopy(t.question, [number(item.number)])}</p><p dir="auto" className="line-clamp-2 text-xs text-ink-subtle">{item.prompt}</p></td>
            <td className="p-2 tabular-nums">{number(item.answered)}</td><td className="p-2 tabular-nums">{number(item.unanswered)}</td>
            <td className="p-2 tabular-nums">{percent(item.percentage)}</td><td className="p-2 tabular-nums">{percent(item.fullCreditPercentage)}</td>
            <td className="p-2"><p className={item.reading === "CHECK_ITEM" ? "font-semibold text-status-warning-text" : ""}>{t[READING[item.reading]]}</p>
              {item.reasons.length > 0 && <p className="text-xs text-ink-subtle">{item.reasons.map(reason => reason === "FEW_RESPONSES" ? fillStudioCopy(t.reasonFew, [number(MINIMUM_ITEM_RESPONSES)]) : reason === "NOBODY_FULL_CREDIT" ? t.reasonNobody : t.reasonDistractor).join(" · ")}</p>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <ExamRemedyPanel examId={data.exam.id} locale={language} canAuthorize={capabilities.canApprove} onApplied={() => void load()} />
      <section aria-labelledby="improve-learners" className="sk-panel space-y-2 p-4"><h3 id="improve-learners" className="font-semibold">{t.learners}</h3>
        {data.learners.length === 0 ? <p className="text-sm text-ink-subtle">{t.noLearners}</p> : <ul className="grid gap-2">{data.learners.map(learner => <li key={learner.attemptId}>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold"><Isolated>{learner.name ?? "—"}</Isolated> <span className="text-xs font-normal text-ink-subtle">· {fillStudioCopy(t.resultVersion, [number(learner.resultVersion)])}</span></summary>
            <OutcomeFeedbackList feedback={learner.feedback} language={language} /></details>
        </li>)}</ul>}
      </section>
    </>}</SpaceStateRegion>
  </div>;
}
