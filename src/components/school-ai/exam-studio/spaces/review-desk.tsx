"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSpacesCopy, type StudioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import { ExamReleasePanel, type Readiness } from "../../exam-release-panel";
import { examReleaseCopy } from "../../exam-release-copy";
import type { StudioSpaceProps } from "../studio-space-registry";
import { Composed, Isolated } from "../space-state";

/**
 * SKO-408 Review desk: the item states and rehearsal of `ExamReleasePanel`, plus the evidence drawer
 * (R4.7, R4.8, R4.11) and every invalidated check with its trigger, actor and time (R6.8).
 */
const TRIGGER_COPY: Record<string, keyof StudioSpacesCopy> = {
  PROMPT: "triggerPrompt", OPTIONS: "triggerOptions", MARKS: "triggerMarks", FIGURES: "triggerFigures",
  SOURCE_VERSION: "triggerSourceVersion", OUTCOME_MAP: "triggerOutcomeMap", COVERAGE: "triggerCoverage",
};

export default function ReviewDesk({ language, scope, records, capabilities, reload }: StudioSpaceProps) {
  const t = studioSpacesCopy(language), r = examReleaseCopy(language);
  const papers = useMemo(() => records.filter(record => record.kind === "PAPER" && (!scope.subjectId || record.data.subjectId === scope.subjectId)), [records, scope.subjectId]);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<Readiness | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const paper = papers.find(record => record.id === selected) ?? papers[0];
  const onLoaded = useCallback((next: Readiness) => setView(next), []);
  const onChanged = useCallback(async () => { reload(); }, [reload]);
  if (!paper) return <TaskFeedback kind="empty" title={t.noPapers}><p>{t.reviewIntro}</p></TaskFeedback>;
  const number = (id: string) => (view?.items.findIndex(item => item.id === id) ?? -1) + 1;
  const date = (at: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(at));
  const item = view?.items.find(entry => entry.id === inspecting);
  return <div className="space-y-4" data-review-desk>
    <p className="text-sm text-ink-subtle">{t.reviewIntro}</p>
    <label className="grid max-w-xl gap-1 text-sm font-semibold">{t.paper}
      <Select value={paper.id} onChange={event => { setSelected(event.target.value); setView(null); }}>{papers.map(record => <option key={record.id} value={record.id}>{record.title} · v{record.version} · {record.status}</option>)}</Select></label>
    {view && view.notices.length > 0 && <section aria-labelledby="review-stale" className="space-y-1 rounded-xl border border-status-warning-border bg-status-warning-surface p-3 text-sm text-status-warning-text">
      <h3 id="review-stale" className="font-semibold">{t.staleTitle}</h3>
      <ul className="list-disc ps-5">{view.notices.map((notice, index) => <li key={index}>
        {notice.questionId ? `${fillStudioCopy(t.question, [new Intl.NumberFormat(language).format(number(notice.questionId))])} · ` : ""}
        {fillStudioCopy(t.staleEntry, [notice.scope === "FORM" ? t.artifactRehearsal : r.artifacts[notice.artifact as keyof typeof r.artifacts] ?? notice.artifact, t[TRIGGER_COPY[notice.change] ?? "triggerPrompt"], notice.name ?? t.someone, date(notice.at)])}
      </li>)}</ul>
    </section>}
    <ExamReleasePanel key={`${paper.id}:${paper.version}`} recordId={paper.id} locale={language} canApprove={capabilities.canApprove} disabled={!capabilities.canCreate} onChanged={onChanged}
      onLoaded={onLoaded} inspectLabel={t.inspect} onInspect={questionId => { opener.current = document.activeElement as HTMLElement | null; setInspecting(questionId); }} />
    {item && view && <Modal title={fillStudioCopy(t.evidenceFor, [new Intl.NumberFormat(language).format(number(item.id))])} subtitle={r.states[item.state]} size="md" returnFocusRef={opener} onClose={() => setInspecting(null)}>
      <div className="space-y-4 text-sm" data-evidence-drawer>
        <p dir="auto" className="whitespace-pre-wrap font-medium">{item.prompt}</p>
        <section aria-labelledby="ev-why" className="space-y-2"><h4 id="ev-why" className="font-semibold">{t.why}</h4>
          <ul className="grid gap-2">{item.sources.map((source, index) => <li key={index} className="rounded-xl border p-2">
            <p className="text-xs text-ink-subtle">{t.source}: <Isolated>{source.title ?? t.sourceUnknown}</Isolated> · {r.page} <bdi dir="ltr">{source.page}</bdi></p>
            <q dir="auto">{source.excerpt}</q></li>)}</ul>
          <p><span className="font-semibold">{t.outcomesLabel}:</span> {item.outcomes.map((outcome, index) => <span key={outcome.id}>{index ? " · " : ""}<Isolated>{outcome.title ?? outcome.id}</Isolated></span>)}</p>
          <p><span className="font-semibold">{t.marksLabel}:</span> {new Intl.NumberFormat(language).format(item.marks)}</p>
          <p><span className="font-semibold">{t.generation}:</span> {view.generation.kind === "AI" && view.generation.model ? <Composed template={t.generationAi} values={[<Isolated key="m">{view.generation.model}</Isolated>, view.generation.generatedAt ? date(view.generation.generatedAt) : "—"]} /> : t.generationManual}</p>
          {item.reusedFrom && <p><Composed template={t.reused} values={[<Isolated key="p">{item.reusedFrom.paperId}</Isolated>, new Intl.NumberFormat(language).format(item.reusedFrom.paperVersion), <Isolated key="q">{item.reusedFrom.questionId}</Isolated>]} /></p>}
        </section>
        <section aria-labelledby="ev-key" className="space-y-1"><h4 id="ev-key" className="font-semibold">{t.answerKey}</h4>
          {!item.key ? <p className="text-ink-subtle">{t.keyHidden}</p> : <>
            {item.key.correct.length > 0 && <p dir="auto">{item.key.correct.join(" · ")}</p>}
            {item.key.numeric && <p><bdi dir="ltr">{item.key.numeric.value} ± {item.key.numeric.tolerance}</bdi></p>}
            {item.key.modelAnswer && <p><span className="font-semibold">{t.modelAnswer}:</span> <span dir="auto">{item.key.modelAnswer}</span></p>}
            {item.key.rubric.length > 0 && <><p className="font-semibold">{t.rubric}</p><ul className="list-disc ps-5">{item.key.rubric.map((row, index) => <li key={index}><span dir="auto">{row.criterion}</span> · {fillStudioCopy(t.marks, [new Intl.NumberFormat(language).format(row.marks)])}</li>)}</ul></>}
          </>}
        </section>
        <section aria-labelledby="ev-history" className="space-y-1"><h4 id="ev-history" className="font-semibold">{t.history}</h4>
          {item.approvedBy && <p>{fillStudioCopy(t.approvedBy, [new Intl.NumberFormat(language).format(item.approvedBy.itemRevision), item.approvedBy.name ?? t.someone, date(item.approvedBy.at)])}</p>}
          {item.reviewHistory.length === 0 ? <p className="text-ink-subtle">{t.noHistory}</p>
            : <ol className="grid gap-1">{item.reviewHistory.map((entry, index) => <li key={index}>{fillStudioCopy(t.historyEntry, [r.states[entry.state], entry.name ?? t.someone, date(entry.at)])}{entry.note ? <> · <span dir="auto">{entry.note}</span></> : null}</li>)}</ol>}
        </section>
      </div>
    </Modal>}
  </div>;
}
