"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, FileStack, Layers3, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { TaskStatus } from "@/components/ui/task-patterns";
import { ModalSurface } from "@/components/ui/modal";
import { schoolAICopy, interpolateAI, type SchoolAICopyKey } from "@/lib/school-ai/copy";
import { readSetupDraft, setupQuestions, setupReadiness, validateSetupAnswer, type SetupDraft, type SetupAnswers, type SetupPath } from "@/lib/school-ai/onboarding";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { MultimodalComposer } from "./multimodal-composer";
import { workspaceErrorText, type RecordAction } from "./workspace-client";
import { SetupHelp } from "./setup-help";
import styles from "./school-ai.module.css";
import { useWorkspaceDraftNavigation } from "./draft-safety";

interface Props {
  language: Language;
  record?: AiWorkspaceRecord;
  defaults?: SetupAnswers;
  voiceAvailable: boolean;
  assistantAvailable?: boolean;
  campusId?: string | null;
  onSave: (draft: SetupDraft, record?: AiWorkspaceRecord) => Promise<AiWorkspaceRecord>;
  onClose: () => void;
  onUpload: (file: File, origin: "upload" | "camera") => Promise<void>;
  canApprove?: boolean;
  onAction: RecordAction;
}
const paths: { key: SetupPath; hint: SchoolAICopyKey; Icon: typeof Building2 }[] = [{ key: "new", hint: "newHint", Icon: Building2 }, { key: "import", hint: "importHint", Icon: FileStack }, { key: "migrate", hint: "migrateHint", Icon: Layers3 }];
const outcomes = ["exams", "timetable", "fees", "records", "complete"] as const;

export function GuidedSetup({ language, record, defaults, voiceAvailable, assistantAvailable = false, campusId, canApprove, onSave, onClose, onUpload, onAction }: Props) {
  const c = schoolAICopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [savedRecord, setSavedRecord] = useState(record);
  const initial = readSetupDraft(record?.data || { answers: defaults });
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [index, setIndex] = useState(() => Math.max(0, setupQuestions(initial).findIndex(question => question.key === initial.currentQuestion)));
  const [reviewing, setReviewing] = useState(initial.step === "review");
  const [pending, setPending] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [helpActive, setHelpActive] = useState(false);
  const [helpDirty, setHelpDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const questions = setupQuestions(draft);
  const question = questions[Math.min(index, questions.length - 1)];
  const value = question.key === "path" ? draft.path : draft.answers[question.key] || "";
  useEffect(() => { heading.current?.focus(); }, [index, reviewing]);
  const change = (answer: string) => {
    setError(""); setNotice("");
    setDraft(previous => question.key === "path" ? { ...previous, path: answer as SetupPath } : { ...previous, answers: { ...previous.answers, [question.key]: answer }, confirmedKeys: previous.confirmedKeys.filter(key => key !== question.key) });
  };
  const persist = async (next: SetupDraft) => {
    if (savedRecord && JSON.stringify(next) === JSON.stringify(baseline)) return true;
    setPending(true); setError("");
    try { const saved = await onSave(next, savedRecord); setSavedRecord(saved); setDraft(next); setBaseline(next); setNotice(c.saved); return true; }
    catch (error) { setError(workspaceErrorText(error, c)); return false; }
    finally { setPending(false); }
  };
  const advance = async (skip = false) => {
    if (!skip) {
      const problem = validateSetupAnswer(question.key, value, draft.answers);
      if (problem) { setError(c[problem]); return; }
    }
    const confirmedKeys = question.key === "path" || skip ? draft.confirmedKeys : [...new Set([...draft.confirmedKeys, question.key])];
    const last = index >= questions.length - 1;
    const nextQuestion = questions[Math.min(index + 1, questions.length - 1)];
    const next: SetupDraft = { ...draft, confirmedKeys, step: last ? "review" : nextQuestion.section, currentQuestion: last ? question.key : nextQuestion.key };
    if (await persist(next)) { if (last) setReviewing(true); else setIndex(index + 1); }
  };
  const close = async () => {
    const saveAndClose = async () => { if (await persist({ ...draft, currentQuestion: question.key, step: reviewing ? "review" : question.section })) onClose(); };
    if (helpDirty) guard(() => void saveAndClose());
    else await saveAndClose();
  };
  const upload = async (file: File, origin: "upload" | "camera") => {
    setPending(true); setError("");
    try { await onUpload(file, origin); setNotice(c.sourceAdded); } catch { setError(c.failed); } finally { setPending(false); }
  };
  const approve = async () => {
    if (!savedRecord || JSON.stringify(draft) !== JSON.stringify(baseline)) { setError(c.reviewBeforeApproval); return; }
    const required = ["schoolName", "country", "timezone", "campuses", "grades", "academicYear", "startDate", "endDate", "workingDays", "firstOutcome"] as const;
    const missing = required.filter(key => !draft.confirmedKeys.includes(key) || validateSetupAnswer(key, draft.answers[key] || "", draft.answers));
    if (missing.length) { setError(interpolateAI(c.confirmSetupFacts, { fields: missing.map(key => c[key]).join(" · ") })); return; }
    setPending(true); setError("");
    try { const approved = await onAction(savedRecord, "approve"); setSavedRecord(approved); setNotice(c.APPROVED); }
    catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setPending(false); }
  };
  return <ModalSurface fullscreen ariaLabel={c.setupTitle} onClose={onClose} disableBackdropClose dismissible={!pending && !mediaBusy && !helpActive} dirty={JSON.stringify(draft) !== JSON.stringify(baseline) || helpDirty} initialFocusRef={heading}><section className={styles.setup} aria-busy={pending || mediaBusy || helpActive} dir={language === "en" ? "ltr" : "rtl"}>
    <header className={styles.setupHeader}><div className="flex items-center gap-3"><span className={styles.choiceIcon}><Sparkles aria-hidden="true" className="size-5" /></span><span className="font-extrabold">{c.workspace}</span></div><Button variant="outline" disabled={pending || mediaBusy || helpActive} onClick={() => void close()}><Save aria-hidden="true" />{c.saveExit}</Button></header>
    <div className={styles.setupBody}>
      {reviewing ? <div className={styles.question} key="review"><p className={styles.eyebrow}>{c.workspace}</p><h1 ref={heading} tabIndex={-1} className={styles.questionTitle}>{c.review}</h1><p className={styles.description}>{c.reviewHint}</p>
        <div className="sk-panel mb-5 p-5"><h2 className="font-bold">{c.readiness}</h2>{setupReadiness(draft.answers).map(group => <div className={styles.recordRow} key={group.label}><div><p className="text-sm font-bold">{c[group.label]}</p>{group.missing.length > 0 && <p className="mt-1 text-xs text-ink-muted">{group.missing.map(key => c[key === "curriculum" ? "curriculumQuestion" : key]).join(" · ")}</p>}</div><TaskStatus attention={Boolean(group.missing.length)}>{group.missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>)}</div>
        <div className={styles.reviewGrid}>{questions.map((item, questionIndex) => <article className={`sk-panel ${styles.reviewFact}`} key={item.key}><div className="flex items-start justify-between gap-2"><h2 className="text-xs font-bold text-ink-muted">{c[item.label]}</h2><Button variant="ghost" size="sm" disabled={pending} aria-label={`${c.edit}: ${c[item.label]}`} onClick={() => { setIndex(questionIndex); setReviewing(false); setNotice(""); setError(""); }}>{c.edit}</Button></div><p className={styles.factValue}>{item.key === "path" ? c[draft.path] : item.key === "firstOutcome" && outcomes.includes(draft.answers.firstOutcome as typeof outcomes[number]) ? c[draft.answers.firstOutcome as typeof outcomes[number]] : draft.answers[item.key] || c.unknown}</p></article>)}</div>
        <div className="flex flex-wrap gap-3"><Button onClick={() => void close()} disabled={pending || helpActive}><CheckCircle2 aria-hidden="true" />{c.saveExit}</Button>{canApprove && <Button variant="outline" disabled={pending || helpActive || !savedRecord || savedRecord.status === "APPROVED"} onClick={() => void approve()}>{savedRecord?.status === "APPROVED" ? c.APPROVED : c.approve}</Button>}</div>
      </div> : <div key={question.key} className={styles.question}>
        <p className={styles.eyebrow}>{interpolateAI(c.questionOf, { current: index + 1, total: questions.length })}</p>
        <h1 ref={heading} tabIndex={-1} className={styles.questionTitle}>{c[question.label]}</h1><p className={styles.description}>{c[question.hint]}</p>
        {question.type === "path" ? <div className={styles.choices} aria-label={c.setupPath}>{paths.map(({ key, hint, Icon }) => <Button key={key} type="button" variant="choice" className={styles.choice} aria-pressed={draft.path === key} disabled={pending} onClick={() => change(key)}><span className={styles.choiceBody}><span className={styles.choiceIcon}><Icon aria-hidden="true" className="size-5" /></span><span className="flex-1"><span className="block text-base font-bold">{c[key]}</span><span className={styles.choiceHint}>{c[hint]}</span></span>{draft.path === key && <Check className="mt-2 size-4 text-primary" aria-hidden="true" />}</span></Button>)}</div>
          : question.type === "outcome" ? <div className={styles.choices} aria-label={c.firstOutcome}>{outcomes.map(outcome => <Button type="button" key={outcome} variant="choice" className={styles.choice} aria-pressed={value === outcome} disabled={pending} onClick={() => change(outcome)}>{c[outcome]}{value === outcome && <Check aria-hidden="true" />}</Button>)}</div>
          : question.type === "date" ? <FormField name={`setup-${question.key}`} label={c.answer} error={error || undefined}><Input type="date" disabled={pending} value={value} onChange={event => change(event.target.value)} min={question.key === "endDate" ? draft.answers.startDate : undefined} /></FormField>
          : <MultimodalComposer language={language} value={value} onChange={change} label={c.answer} placeholder={c.answer} disabled={pending || helpActive} voiceAvailable={voiceAvailable} onUpload={upload} onActivityChange={setMediaBusy} />}
        <div className={styles.setupFooter}><Button variant="ghost" disabled={index === 0 || pending || mediaBusy || helpActive} onClick={() => { setIndex(index - 1); setError(""); setNotice(""); }}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{c.back}</Button><div className="flex flex-wrap gap-2">{question.key !== "path" && <Button variant="ghost" disabled={pending || mediaBusy || helpActive} onClick={() => void advance(true)}>{c.skip}</Button>}<Button disabled={pending || mediaBusy || helpActive} onClick={() => void advance()}>{pending ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRight className="rtl:rotate-180" aria-hidden="true" />}{pending ? c.saving : c.next}</Button></div></div>
      </div>}
      {error && question.type !== "date" && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
      {notice && <p className="mt-4 text-sm text-ink-muted" role="status">{notice}</p>}
      <SetupHelp language={language} question={reviewing ? c.review : c[question.label]} campusId={campusId} assistantAvailable={assistantAvailable} voiceAvailable={voiceAvailable} disabled={pending || mediaBusy} onUpload={upload} onActivityChange={setHelpActive} onDraftChange={setHelpDirty} />
    </div>
  </section></ModalSurface>;
}
