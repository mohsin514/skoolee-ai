"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSpacesCopy, type StudioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import type { AssessmentBrief, BriefQuestionKey, BriefValue } from "@/lib/school-ai/assessment-brief";
import type { BriefView } from "@/lib/school-ai/brief-service";
import type { StudioSpaceProps } from "../studio-space-registry";
import { Composed, Isolated, SpaceStateRegion, type SpaceState } from "../space-state";
import { Checkbox } from "@/components/ui/checkbox";

/** SKO-408 R3: the brief, one open decision at a time, with every value's classification shown. */
const KEY_COPY: Record<BriefQuestionKey, { label: keyof StudioSpacesCopy; ask: keyof StudioSpacesCopy }> = {
  subject: { label: "keySubject", ask: "askSubject" }, class: { label: "keyClass", ask: "askClass" },
  taughtCoverage: { label: "keyTaughtCoverage", ask: "askTaughtCoverage" }, durationMinutes: { label: "keyDurationMinutes", ask: "askDurationMinutes" },
  totalMarks: { label: "keyTotalMarks", ask: "askTotalMarks" }, languages: { label: "keyLanguages", ask: "askLanguages" },
  formCount: { label: "keyFormCount", ask: "askFormCount" }, deliveryTier: { label: "keyDeliveryTier", ask: "askDeliveryTier" },
  accommodationIntent: { label: "keyAccommodationIntent", ask: "askAccommodationIntent" },
};
const LANGUAGE_COPY = { en: "langEn", ar: "langAr", ur: "langUr" } as const;
const ASSIST_COPY = { READER: "assistReader", SCRIBE: "assistScribe", LARGE_TEXT: "assistLargeText", EXTRA_TIME: "assistExtraTime", SUPERVISED_BREAK: "assistBreak" } as const;

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; code: string; data: T | null }> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, data: payload } : { ok: false, error: typeof payload.error === "string" ? payload.error : "", code: typeof payload.code === "string" ? payload.code : "", data: payload };
}
/** R3.12 in the reader's language: the bound of the decision that failed, never the validator's own words. */
const BOUND_COPY: Record<BriefQuestionKey, keyof StudioSpacesCopy> = {
  subject: "boundSubject", class: "boundClass", taughtCoverage: "boundTaughtCoverage", durationMinutes: "boundDurationMinutes", totalMarks: "boundTotalMarks",
  languages: "boundLanguages", formCount: "boundFormCount", deliveryTier: "boundDeliveryTier", accommodationIntent: "boundAccommodationIntent",
};

export default function BriefSpace({ language, scope, records, capabilities, reload }: StudioSpaceProps) {
  const t = studioSpacesCopy(language);
  const briefs = useMemo(() => records.filter(record => record.kind === "BRIEF" && (!scope.subjectId || record.data.subjectId === scope.subjectId)), [records, scope.subjectId]);
  const [selected, setSelected] = useState<string>("");
  const [state, setState] = useState<SpaceState<BriefView> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<BriefQuestionKey | null>(null);
  const recordId = selected || briefs[0]?.id || "";
  const load = useCallback(async () => {
    if (!recordId) return;
    setState({ kind: "loading" });
    const result = await call<{ brief: BriefView }>(`/api/school-ai/workspace/${encodeURIComponent(recordId)}/brief`);
    setState(result.ok ? { kind: "ready", data: result.data.brief } : { kind: "error", reason: result.error || t.failed, retry: () => void load() });
  }, [recordId, t.failed]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!scope.subjectId || !scope.classId || !scope.campusId) return;
    setBusy(true); setNotice(null);
    const { emptyAssessmentBrief } = await import("@/lib/school-ai/assessment-brief");
    const result = await call<{ record: { id: string } }>("/api/school-ai/workspace", { method: "POST", body: JSON.stringify({ kind: "BRIEF", campusId: scope.campusId, title: fillStudioCopy(t.briefRecordTitle, [scope.subjectName ?? ""]), data: emptyAssessmentBrief({ subjectId: scope.subjectId, classId: scope.classId }), idempotencyKey: crypto.randomUUID() }) });
    setBusy(false);
    if (!result.ok) { setNotice({ tone: "error", text: result.error || t.failed }); return; }
    setSelected(result.data.record.id); reload();
  };

  const answer = async (body: Record<string, unknown>) => {
    if (state?.kind !== "ready") return;
    setBusy(true); setNotice(null);
    const result = await call<{ brief: BriefView }>(`/api/school-ai/workspace/${encodeURIComponent(recordId)}/brief`, { method: "POST", body: JSON.stringify({ version: state.data.record.version, ...body }) });
    setBusy(false);
    // R3.12: a refused answer comes back with the brief that keeps the entered text.
    if (result.data && "brief" in result.data && result.data.brief) setState({ kind: "ready", data: result.data.brief });
    if (!result.ok) {
      const key = typeof body.key === "string" ? body.key as BriefQuestionKey : null;
      setNotice({ tone: "error", text: result.code === "BRIEF_UNTAUGHT_OUTCOME" ? t.untaught : result.code === "BRIEF_FAILED_BOUND" && key ? t[BOUND_COPY[key]] : result.error || t.failed });
      return;
    }
    setEditing(null); setNotice({ tone: "ok", text: t.saved }); reload();
  };

  const sendForReview = async () => {
    if (state?.kind !== "ready") return;
    setBusy(true);
    const result = await call(`/api/school-ai/workspace/${encodeURIComponent(recordId)}`, { method: "PATCH", body: JSON.stringify({ version: state.data.record.version, action: "review" }) });
    setBusy(false);
    if (!result.ok) { setNotice({ tone: "error", text: result.error || t.failed }); return; }
    setNotice({ tone: "ok", text: t.saved }); reload(); void load();
  };

  if (!scope.subjectId || !scope.classId) return <TaskFeedback kind="empty" title={t.briefTitle}><p>{t.briefNeedsSubject}</p></TaskFeedback>;
  return <div className="space-y-4" data-brief-space>
    <p className="text-sm text-ink-subtle">{t.briefIntro}</p>
    <div className="flex flex-wrap items-end gap-3">
      {briefs.length > 0 && <label className="grid min-w-64 flex-1 gap-1 text-sm font-semibold">{t.briefPick}
        <Select value={recordId} onChange={event => { setSelected(event.target.value); setEditing(null); setNotice(null); }}>{briefs.map(brief => <option key={brief.id} value={brief.id}>{brief.title} · v{brief.version}</option>)}</Select></label>}
      {capabilities.canCreate && <Button variant="outline" disabled={busy} onClick={() => void create()}>{t.briefNew}</Button>}
    </div>
    {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-status-error-border bg-status-error-surface text-status-error-text"}`}><Isolated>{notice.text}</Isolated></p>}
    {!recordId ? <TaskFeedback kind="empty" title={t.briefNone}><p>{t.briefIntro}</p></TaskFeedback>
      : state && <SpaceStateRegion state={state} language={language}>{view => <BriefBody view={view} t={t} language={language} scopeNames={{ subject: scope.subjectName, class: scope.className }} editing={editing} setEditing={setEditing} busy={busy || !capabilities.canCreate} onAnswer={answer} onReview={sendForReview} />}</SpaceStateRegion>}
  </div>;
}

function classification(value: BriefValue, t: StudioSpacesCopy) {
  if (value.classification === "CONFIRMED_FACT") return t.classConfirmed;
  if (value.classification === "EXTRACTED_SUGGESTION") return t.classSuggestion;
  return value.skipped ? t.classSkipped : t.classOpen;
}

function display(key: BriefQuestionKey, value: unknown, t: StudioSpacesCopy, language: string, names: { subject: string | null; class: string | null }, view: BriefView): string {
  const number = (n: unknown) => new Intl.NumberFormat(language).format(Number(n));
  switch (key) {
    case "subject": return names.subject ?? String(value);
    case "class": return names.class ?? String(value);
    case "durationMinutes": return fillStudioCopy(t.minutes, [number(value)]);
    case "totalMarks": return fillStudioCopy(t.marks, [number(value)]);
    case "formCount": return fillStudioCopy(t.forms, [number(value)]);
    case "languages": return (value as Array<keyof typeof LANGUAGE_COPY>).map(code => t[LANGUAGE_COPY[code]]).join(" · ");
    case "deliveryTier": return value === "MANAGED" ? t.tierManaged : t.tierStandard;
    case "accommodationIntent": { const intent = value as { expected: boolean; assistance: Array<keyof typeof ASSIST_COPY> }; return intent.expected ? intent.assistance.map(kind => t[ASSIST_COPY[kind]]).join(" · ") : t.expectNone; }
    case "taughtCoverage": {
      const coverage = value as { section: string; outcomeIds: string[] };
      const titles = new Map(view.coverage.flatMap(choice => choice.sections.flatMap(section => section.outcomes.map(outcome => [outcome.id, outcome.title] as const))));
      return `${coverage.section}: ${coverage.outcomeIds.map(id => titles.get(id) ?? id).join(" · ")}`;
    }
  }
}

function BriefBody({ view, t, language, scopeNames, editing, setEditing, busy, onAnswer, onReview }: {
  view: BriefView; t: StudioSpacesCopy; language: string; scopeNames: { subject: string | null; class: string | null };
  editing: BriefQuestionKey | null; setEditing: (key: BriefQuestionKey | null) => void; busy: boolean;
  onAnswer: (body: Record<string, unknown>) => Promise<void>; onReview: () => Promise<void>;
}) {
  const draft = view.record.status === "DRAFT";
  const sequence = view.sequence as readonly BriefQuestionKey[];
  // One decision at a time, in sequence: a suggestion waiting for acceptance is presented before moving on.
  const pending = sequence.find(key => { const value = view.brief.decisions[key]; return value.classification === "EXTRACTED_SUGGESTION" || (value.classification === "OPEN_DECISION" && !value.skipped); }) ?? null;
  const current = draft ? editing ?? pending : null;
  return <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
    <div className="space-y-4">
      {!draft && <p className="rounded-xl border p-3 text-sm">{t.inReview}</p>}
      {current ? <DecisionCard key={`${current}:${view.record.version}`} decisionKey={current} brief={view.brief} view={view} t={t} language={language} scopeNames={scopeNames} index={sequence.indexOf(current) + 1} total={sequence.length} busy={busy} onAnswer={onAnswer} />
        : draft && (view.readiness.ready
          ? <section className="sk-panel space-y-3 p-5"><p className="font-semibold">{t.allConfirmed}</p><Button disabled={busy} onClick={() => void onReview()}>{t.sendReview}</Button></section>
          : <section className="sk-panel space-y-2 p-5" aria-labelledby="brief-blocking"><h3 id="brief-blocking" className="font-semibold">{t.blockingTitle}</h3>
            <ul className="grid gap-2">{view.readiness.blocking.map(key => <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-sm"><span>{t[KEY_COPY[key].label]} · {classification(view.brief.decisions[key], t)}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(key)}>{t.change}</Button></li>)}</ul>
          </section>)}
    </div>
    <section className="sk-panel space-y-2 p-5" aria-labelledby="brief-answers">
      <h3 id="brief-answers" className="font-semibold">{t.answersTitle}</h3>
      <dl className="grid gap-2">{sequence.map(key => {
        const value = view.brief.decisions[key];
        return <div key={key} className="rounded-xl border p-2 text-sm" data-brief-key={key} data-classification={value.classification}>
          <dt className="flex items-center justify-between gap-2 font-semibold"><span>{t[KEY_COPY[key].label]}</span>{draft && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(key)}>{t.change}</Button>}</dt>
          <dd className="text-ink-subtle">{value.classification === "OPEN_DECISION" ? classification(value, t) : <><Isolated>{display(key, value.value, t, language, scopeNames, view)}</Isolated><span className="block text-xs">{classification(value, t)}{value.classification === "CONFIRMED_FACT" ? ` · ${fillStudioCopy(t.confirmedOn, [new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value.at))])}` : ""}</span></>}</dd>
        </div>;
      })}</dl>
    </section>
  </div>;
}

function initialValue(key: BriefQuestionKey, value: BriefValue, brief: AssessmentBrief): unknown {
  if (value.classification !== "OPEN_DECISION") return value.value;
  if (key === "subject") return brief.subjectId;
  if (key === "class") return brief.classId;
  if (key === "languages") return ["en"];
  if (key === "deliveryTier") return "STANDARD";
  if (key === "accommodationIntent") return { expected: false, assistance: [] };
  if (key === "taughtCoverage") return { section: "", outcomeIds: [] };
  return value.lastEnteredText ?? "";
}

function DecisionCard({ decisionKey: key, brief, view, t, language, scopeNames, index, total, busy, onAnswer }: {
  decisionKey: BriefQuestionKey; brief: AssessmentBrief; view: BriefView; t: StudioSpacesCopy; language: string; scopeNames: { subject: string | null; class: string | null };
  index: number; total: number; busy: boolean; onAnswer: (body: Record<string, unknown>) => Promise<void>;
}) {
  const current = brief.decisions[key];
  const [value, setValue] = useState<unknown>(() => initialValue(key, current, brief));
  const sections = view.coverage.flatMap(choice => choice.sections.map(section => ({ ...section, curriculumId: choice.curriculumId, curriculum: choice.title })));
  const coverage = value as { section: string; outcomeIds: string[] };
  const chosenSection = key === "taughtCoverage" ? sections.find(section => section.section === coverage.section) : undefined;
  const numeric = key === "durationMinutes" || key === "totalMarks" || key === "formCount";
  const submitValue = () => numeric ? (String(value).trim() === "" || Number.isNaN(Number(value)) ? String(value) : Number(value)) : value;
  return <section className="sk-panel space-y-4 p-5" aria-labelledby="brief-question" data-brief-decision={key}>
    <p className="sk-eyebrow tabular-nums">{fillStudioCopy(t.decisionOf, [new Intl.NumberFormat(language).format(index), new Intl.NumberFormat(language).format(total)])} · {classification(current, t)}</p>
    <h3 id="brief-question" className="text-lg font-bold">{t[KEY_COPY[key].ask]}</h3>
    {current.classification === "EXTRACTED_SUGGESTION" && <div className="space-y-2 rounded-xl border border-status-warning-border p-3 text-sm" data-brief-suggestion>
      <p className="font-semibold"><Isolated>{display(key, current.value, t, language, scopeNames, view)}</Isolated></p>
      <p className="text-ink-subtle"><Composed template={t.suggestedFrom} values={[<Isolated key="reference">{current.reference}</Isolated>, <q key="excerpt" className="italic"><Isolated>{current.excerpt}</Isolated></q>]} /></p>
      <Button size="sm" disabled={busy} onClick={() => void onAnswer({ op: "accept", key })}>{t.accept}</Button>
    </div>}
    {current.classification === "OPEN_DECISION" && current.lastEnteredText && <p className="text-sm text-ink-subtle">{fillStudioCopy(t.entered, [current.lastEnteredText])}</p>}
    <div className="space-y-3">
      {(key === "subject" || key === "class") && <p className="text-sm">{fillStudioCopy(t.scopeValue, [(key === "subject" ? scopeNames.subject : scopeNames.class) ?? String(value)])}</p>}
      {numeric && <label className="grid max-w-xs gap-1 text-sm font-semibold">{t[KEY_COPY[key].label]}<Input inputMode="decimal" value={String(value ?? "")} onChange={event => setValue(event.target.value)} /></label>}
      {key === "languages" && <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">{t.keyLanguages}</legend>{(["en", "ar", "ur"] as const).map(code => <label key={code} className="flex items-center gap-2 text-sm"><Checkbox checked={(value as string[]).includes(code)} onChange={event => setValue(event.target.checked ? [...(value as string[]), code] : (value as string[]).filter(item => item !== code))} />{t[LANGUAGE_COPY[code]]}</label>)}</fieldset>}
      {key === "deliveryTier" && <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">{t.keyDeliveryTier}</legend>{(["STANDARD", "MANAGED"] as const).map(tier => <label key={tier} className="flex items-center gap-2 text-sm"><input type="radio" name="brief-tier" checked={value === tier} onChange={() => setValue(tier)} />{tier === "MANAGED" ? t.tierManaged : t.tierStandard}</label>)}</fieldset>}
      {key === "accommodationIntent" && <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">{t.keyAccommodationIntent}</legend>{(Object.keys(ASSIST_COPY) as Array<keyof typeof ASSIST_COPY>).map(kind => {
        const intent = value as { expected: boolean; assistance: string[] };
        return <label key={kind} className="flex items-center gap-2 text-sm"><Checkbox checked={intent.assistance.includes(kind)} onChange={event => { const assistance = event.target.checked ? [...intent.assistance, kind] : intent.assistance.filter(item => item !== kind); setValue({ expected: assistance.length > 0, assistance }); }} />{t[ASSIST_COPY[kind]]}</label>;
      })}</fieldset>}
      {key === "taughtCoverage" && (sections.length === 0 ? <p className="text-sm">{t.noCoverage}</p> : <div className="space-y-2">
        <label className="grid max-w-md gap-1 text-sm font-semibold">{t.section}<Select value={coverage.section} onChange={event => setValue({ section: event.target.value, outcomeIds: sections.find(section => section.section === event.target.value)?.outcomes.map(outcome => outcome.id) ?? [] })}><option value="">—</option>{sections.map(section => <option key={`${section.curriculumId}:${section.section}`} value={section.section}>{section.curriculum} · {section.section}</option>)}</Select></label>
        {chosenSection && <fieldset className="grid gap-1"><legend className="text-sm font-semibold">{t.outcomes}</legend>{chosenSection.outcomes.map(outcome => <label key={outcome.id} className="flex items-start gap-2 text-sm"><Checkbox className="mt-1" checked={coverage.outcomeIds.includes(outcome.id)} onChange={event => setValue({ ...coverage, outcomeIds: event.target.checked ? [...coverage.outcomeIds, outcome.id] : coverage.outcomeIds.filter(id => id !== outcome.id) })} /><Isolated>{outcome.title}</Isolated></label>)}</fieldset>}
        {chosenSection && <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAnswer({ op: "suggest-coverage", curriculumId: chosenSection.curriculumId, section: chosenSection.section })}>{t.suggestCoverage}</Button>}
      </div>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => void onAnswer({ op: "confirm", key, value: submitValue() })}>{t.confirm}</Button>
      {current.classification === "OPEN_DECISION" && <Button variant="ghost" disabled={busy} onClick={() => void onAnswer({ op: "skip", key, ...(numeric && String(value).trim() ? { enteredText: String(value) } : {}) })}>{t.skip}</Button>}
    </div>
  </section>;
}
