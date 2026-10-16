"use client";
import { AdvancedQuestionOptions } from "./assessment-extensions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import type { AssessmentLocale, CurriculumData, PaperData, Question } from "@/lib/school-ai/assessment";
import type { EligibleBankEntry } from "@/lib/school-ai/question-bank-service";
import { questionBankCopy } from "./question-bank-copy";
import { questionBankExposureCopy } from "./question-bank-exposure-copy";

export function QuestionBankLabels({ question, locale, onChange }: { question: Question; locale: AssessmentLocale; onChange: (next: Partial<Question>) => void }) {
  const t = questionBankCopy(locale);
  const [tagsText, setTagsText] = useState(question.bankMetadata?.tags.join(", ") ?? "");
  return <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 text-sm font-semibold">{t.labels}</legend><FormField name={`bank-tags-${question.id}`} label={t.tags} hint={t.limit}><Input maxLength={970} value={tagsText} onChange={(event) => { setTagsText(event.target.value); onChange({ bankMetadata: { difficulty: question.bankMetadata?.difficulty ?? "UNSPECIFIED", tags: event.target.value.split(/[,،]/).map((tag) => tag.trim()).filter(Boolean) } }); }} /></FormField><FormField name={`bank-difficulty-${question.id}`} label={t.difficulty} hint={t.difficultyHint}><Select value={question.bankMetadata?.difficulty ?? "UNSPECIFIED"} onChange={(event) => onChange({ bankMetadata: { tags: question.bankMetadata?.tags ?? [], difficulty: event.target.value as "UNSPECIFIED" | "EASY" | "MEDIUM" | "HARD" } })}><option value="UNSPECIFIED">{t.unspecified}</option><option value="EASY">{t.easy}</option><option value="MEDIUM">{t.medium}</option><option value="HARD">{t.hard}</option></Select></FormField><p className="text-xs text-ink-subtle">{t.unchanged}</p>{question.reusedFrom && <div className="space-y-1 text-sm"><p className="break-all">{t.derived}: {question.reusedFrom.paperId} · {t.version} {question.reusedFrom.paperVersion} · {t.originId}: {question.reusedFrom.questionId}</p><p>{t.curriculum}: {question.reusedFrom.curriculumVersion}</p><p className="text-ink-subtle">{t.reviewRequired}</p></div>}</fieldset>;
}

export function QuestionBank({ paper, curriculum, campusId, locale, onReuse, onBusyChange }: { paper: PaperData; curriculum: CurriculumData; campusId: string; locale: AssessmentLocale; onReuse: (paper: PaperData) => void; onBusyChange: (busy: boolean) => void }) {
  const t = questionBankCopy(locale);
  const exposure = questionBankExposureCopy(locale);
  const [filters, setFilters] = useState({ search: "", tag: "", difficulty: "", type: "", language: paper.language as string, minMarks: "", maxMarks: "" });
  const [entries, setEntries] = useState<EligibleBankEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<EligibleBankEntry | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [replaceId, setReplaceId] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const section = paper.blueprint.sections.find((item) => item.id === sectionId);
  const changeFilter = (key: keyof typeof filters, value: string) => { setFilters((previous) => ({ ...previous, [key]: value })); setCursor(null); setLoaded(false); setEntries([]); setSelected(null); };
  const search = async (more = false) => {
    setBusy(true); setError(""); setMessage(""); setSelected(null);
    const params = new URLSearchParams({ campusId, subjectId: paper.subjectId, classId: paper.classId });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (more && cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/school-ai/question-bank?${params}`, { cache: "no-store" }); const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      setEntries((previous) => more ? [...previous, ...payload.items] : payload.items); setCursor(payload.nextCursor ?? null); setLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); }
  };
  const select = (value: EligibleBankEntry) => { setSelected(value); setSectionId(""); setReplaceId(""); setMappings({}); setConfirmed(false); setError(""); setMessage(""); };
  const insert = async () => {
    if (!selected || selected.eligibility?.reuse !== "NO_RECORDED_CONFLICT" || !confirmed || !section || busy) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const response = await fetch("/api/school-ai/question-bank/reuse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: selected.source, paper, sectionId, ...(replaceId ? { replaceQuestionId: replaceId } : {}), mappings: selected.outcomes.map((outcome) => ({ sourceOutcomeId: outcome.id, targetOutcomeId: mappings[outcome.id] ?? "" })), alignmentConfirmed: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : t.failure);
      onReuse(payload.paper); setSelected(null); setMessage(t.success);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.failure); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return <section aria-labelledby="question-bank-title" className="sk-panel space-y-4 p-5">
    <h3 id="question-bank-title" className="text-lg font-bold">{t.title}</h3><p className="text-sm text-ink-subtle">{t.intro}</p><p className="text-sm">{t.currentScope}</p>
    <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><FormField name="bank-search" label={t.search}><Input maxLength={120} value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} /></FormField><FormField name="bank-tag" label={t.tag}><Input maxLength={80} value={filters.tag} onChange={(event) => changeFilter("tag", event.target.value)} /></FormField><FormField name="bank-filter-difficulty" label={t.difficulty}><Select value={filters.difficulty} onChange={(event) => changeFilter("difficulty", event.target.value)}><option value="">{t.all}</option><option value="UNSPECIFIED">{t.unspecified}</option><option value="EASY">{t.easy}</option><option value="MEDIUM">{t.medium}</option><option value="HARD">{t.hard}</option></Select></FormField><FormField name="bank-type" label={t.type}><Select value={filters.type} onChange={(event) => changeFilter("type", event.target.value)}><option value="">{t.all}</option><option value="SINGLE_CHOICE">{t.single}</option><option value="SHORT_TEXT">{t.short}</option><option value="EXTENDED_TEXT">{t.extended}</option><AdvancedQuestionOptions locale={locale} /></Select></FormField><FormField name="bank-language" label={t.language}><Select value={filters.language} onChange={(event) => changeFilter("language", event.target.value)}><option value="">{t.all}</option><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></FormField><FormField name="bank-min" label={t.min}><Input type="number" min={0.25} max={100} step={0.25} value={filters.minMarks} onChange={(event) => changeFilter("minMarks", event.target.value)} /></FormField><FormField name="bank-max" label={t.max}><Input type="number" min={0.25} max={100} step={0.25} value={filters.maxMarks} onChange={(event) => changeFilter("maxMarks", event.target.value)} /></FormField></fieldset>
    <Button variant="outline" disabled={busy} onClick={() => search()}>{t.find}</Button><p className="text-xs text-ink-subtle">{t.difficultyHint} {t.translation}</p>
    {error && <p role="alert" className="text-status-error-text">{error}</p>}{message && <p role="status">{message}</p>}{!loaded && <p className="text-sm text-ink-subtle">{t.pending}</p>}{loaded && !entries.length && <p>{t.empty}</p>}
    <div className="grid gap-3 md:grid-cols-2">{entries.map((item) => <article key={`${item.source.paperId}:${item.source.paperVersion}:${item.source.questionId}`} className="space-y-3 rounded-xl border border-border p-4"><p className="whitespace-pre-wrap font-semibold">{item.question.prompt}</p><p className="text-sm">{t.marks}: {item.question.marks} · {item.language.toUpperCase()} · {item.question.bankMetadata?.tags.join(" · ")}</p><p className="text-xs text-ink-subtle">{t.source}: {item.paperTitle} · {t.version} {item.source.paperVersion}</p><p className="text-sm font-medium">{item.eligibility?.reuse === "NO_RECORDED_CONFLICT" ? exposure.noConflict : exposure.blocked}</p><Button variant="outline" disabled={busy} onClick={() => select(item)}>{t.preview}</Button></article>)}</div>
    {cursor && <Button variant="outline" disabled={busy} onClick={() => search(true)}>{t.more}</Button>}
    {selected && <div className="space-y-4 border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{selected.question.prompt}</h4><Button variant="ghost" onClick={() => setSelected(null)}>{t.cancel}</Button></div><p className="text-sm">{t.source}: {selected.paperTitle} · {t.version} {selected.source.paperVersion} · {t.approved}: {new Date(selected.approvedAt).toLocaleDateString(locale)}</p><p className="text-sm">{t.curriculum}: {selected.curriculumVersion}</p>
      <div className="space-y-2 rounded-xl border border-border p-3" aria-label={exposure.title}>
        <h5 className="font-semibold">{exposure.title}</h5>
        <p>{selected.eligibility?.reuse === "NO_RECORDED_CONFLICT" ? exposure.noConflict : exposure.blocked}</p>
        {selected.eligibility && <><ul className="list-disc space-y-1 ps-5 text-sm">{selected.eligibility.reasons.map(reason => <li key={reason}>{exposure.reasons[reason]}</li>)}</ul>
          <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt>{exposure.last}</dt><dd>{selected.eligibility.lastExposureAt ? new Date(selected.eligibility.lastExposureAt).toLocaleString(locale) : exposure.none}</dd></div><div><dt>{exposure.next}</dt><dd>{selected.eligibility.nextExposureAt ? new Date(selected.eligibility.nextExposureAt).toLocaleString(locale) : exposure.none}</dd></div><div><dt>{exposure.count}</dt><dd>{selected.eligibility.recordedExposureCount.toLocaleString(locale)}</dd></div></dl></>}
        <p className="text-sm text-ink-subtle">{exposure.practice}</p>
        {selected.eligibility?.reuse !== "NO_RECORDED_CONFLICT" && <p className="text-sm">{exposure.repair}</p>}
      </div>
      <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-semibold">{t.model}</summary><p className="mt-3 whitespace-pre-wrap">{selected.question.modelAnswer}</p><ul className="list-disc ps-5 text-sm">{selected.question.rubric.map((criterion) => <li key={criterion.id}>{criterion.criterion} · {criterion.marks}</li>)}</ul>{selected.question.options.map((option) => <p key={option.id} className="text-sm">{option.id === selected.question.correctOptionId || selected.question.correctOptionIds?.includes(option.id) ? "✓ " : ""}{option.text}</p>)}</details>
      <div><h5 className="font-semibold">{t.outcomes}</h5>{selected.outcomes.map((outcome) => <p key={outcome.id} className="mt-2 text-sm">{outcome.title} · {outcome.sourceTitle} · {outcome.sourceReference} · {outcome.page}</p>)}{selected.question.sourceRefs.map((ref, index) => <blockquote key={index} className="my-2 border-s-2 border-border ps-3 text-sm">{ref.excerpt}</blockquote>)}</div>
      <FormField name="bank-target-section" label={t.section}><Select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setMappings({}); setReplaceId(""); setConfirmed(false); }}><option value="">{t.choose}</option>{paper.blueprint.sections.filter((item) => item.type === selected.question.type && Math.abs(item.marksPerQuestion - selected.question.marks) < 0.00001).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></FormField>
      {section && <><FormField name="bank-replace" label={t.replace}><Select value={replaceId} onChange={(event) => { setReplaceId(event.target.value); setConfirmed(false); }}><option value="">{t.append}</option>{paper.questions.filter((question) => question.sectionId === sectionId && !question.locked).map((question) => <option key={question.id} value={question.id}>{question.prompt || question.id}</option>)}</Select></FormField><p className="text-sm text-ink-subtle">{t.pinned}</p><p className="text-sm">{t.mapHint}</p>{selected.outcomes.map((outcome) => <FormField key={outcome.id} name={`bank-map-${outcome.id}`} label={`${t.mapping}: ${outcome.title}`}><Select value={mappings[outcome.id] ?? ""} onChange={(event) => { setMappings((previous) => ({ ...previous, [outcome.id]: event.target.value })); setConfirmed(false); }}><option value="">{t.choose}</option>{curriculum.outcomes.filter((item) => item.included && item.taught && section.outcomeIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></FormField>)}<label className="flex items-start gap-3 text-sm"><Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t.confirm}</span></label><Button disabled={busy || selected.eligibility?.reuse !== "NO_RECORDED_CONFLICT" || !confirmed || selected.outcomes.some((outcome) => !mappings[outcome.id]) || paper.language !== selected.language} onClick={insert}>{t.insert}</Button></>}
      <p className="text-xs text-ink-subtle">{t.draft}</p>
    </div>}
  </section>;
}
