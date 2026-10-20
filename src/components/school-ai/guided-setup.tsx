"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, FileStack, Layers3, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { TaskStatus } from "@/components/ui/task-patterns";
import { Alert } from "@/components/ui/alert";
import { ModalSurface } from "@/components/ui/modal";
import { schoolAICopy, interpolateAI, type SchoolAICopyKey } from "@/lib/school-ai/copy";
import { readSetupDraft, setupQuestions, setupReadiness, validateSetupAnswer, type SetupDraft, type SetupAnswers, type SetupPath } from "@/lib/school-ai/onboarding";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord } from "@/lib/school-ai/types";
import { MultimodalComposer } from "./multimodal-composer";
import { WorkspaceRequestError, workspaceErrorText, workspaceRequest, type RecordAction } from "./workspace-client";
import { SetupHelp } from "./setup-help";
import styles from "./school-ai.module.css";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { SetupGenerationPanel, type SetupGenerationPhase, type SetupGenerationResult } from "./setup-generation-panel";
import { setupGenerationCopy } from "./setup-generation-copy";
import { restoreSetupGeneration } from "./setup-generation-client";

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
  onGenerated: (records: AiWorkspaceRecord[]) => void;
  onOpenRecord: (record: AiWorkspaceRecord) => void;
}
const paths: { key: SetupPath; hint: SchoolAICopyKey; Icon: typeof Building2 }[] = [{ key: "new", hint: "newHint", Icon: Building2 }, { key: "import", hint: "importHint", Icon: FileStack }, { key: "migrate", hint: "migrateHint", Icon: Layers3 }];
const outcomes = ["exams", "timetable", "fees", "records", "complete"] as const;

export function GuidedSetup({ language, record, defaults, voiceAvailable, assistantAvailable = false, campusId, canApprove, onSave, onClose, onUpload, onAction, onGenerated, onOpenRecord }: Props) {
  const c = schoolAICopy(language);
  const generationCopy = setupGenerationCopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [savedRecord, setSavedRecord] = useState(record);
  const initial = readSetupDraft(record?.data || { answers: defaults });
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [index, setIndex] = useState(() => Math.max(0, setupQuestions(initial).findIndex(question => question.key === initial.currentQuestion)));
  const [reviewing, setReviewing] = useState(initial.step === "review");
  const [editingReview, setEditingReview] = useState(false);
  const [generation, setGeneration] = useState<SetupGenerationResult | null>(null);
  const [generationPhase, setGenerationPhase] = useState<SetupGenerationPhase>("idle");
  const [generationError, setGenerationError] = useState("");
  const [pending, setPending] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [helpActive, setHelpActive] = useState(false);
  const [helpDirty, setHelpDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const preparingRef = useRef(false);
  const generationRequest = useRef<AbortController | null>(null);
  const restoreRequest = useRef<AbortController | null>(null);
  const live = useRef(true);
  const generatedCallback = useRef(onGenerated);
  useEffect(() => { generatedCallback.current = onGenerated; }, [onGenerated]);
  const questions = setupQuestions(draft);
  const question = questions[Math.min(index, questions.length - 1)];
  const value = question.key === "path" ? draft.path : draft.answers[question.key] || "";
  const preparing = generationPhase === "saving" || generationPhase === "generating";
  const busy = pending || preparing;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useWorkspaceDraft(dirty || preparing);
  useEffect(() => { live.current = true; return () => { live.current = false; generationRequest.current?.abort(); restoreRequest.current?.abort(); }; }, []);
  useEffect(() => { heading.current?.focus(); }, [index, reviewing]);
  useEffect(() => {
    if (!reviewing || !savedRecord || preparingRef.current) return;
    const controller = new AbortController();
    restoreRequest.current = controller;
    setGenerationPhase("restoring"); setGenerationError("");
    void restoreSetupGeneration({ recordId: savedRecord.id, expectedVersion: savedRecord.version, language }, controller.signal, () => { if (!controller.signal.aborted && live.current) setGenerationPhase("generating"); }).then(result => {
      if (controller.signal.aborted || !live.current || preparingRef.current) return;
      setGeneration(result); setGenerationPhase(result ? "complete" : "idle");
      if (result) generatedCallback.current(result.records);
    }).catch(() => {
      if (controller.signal.aborted || !live.current || preparingRef.current) return;
      setGenerationPhase("failed"); setGenerationError(generationCopy.restoreFailed);
    });
    return () => controller.abort();
  }, [reviewing, savedRecord?.id, savedRecord?.version, language, generationCopy.restoreFailed]);
  const change = (answer: string) => {
    setError(""); setNotice("");
    setDraft(previous => question.key === "path" ? { ...previous, path: answer as SetupPath } : { ...previous, answers: { ...previous.answers, [question.key]: answer }, confirmedKeys: previous.confirmedKeys.filter(key => key !== question.key) });
  };
  const persist = async (next: SetupDraft): Promise<AiWorkspaceRecord | null> => {
    if (savedRecord && JSON.stringify(next) === JSON.stringify(baseline)) return savedRecord;
    setPending(true); setError("");
    try { const saved = await onSave(next, savedRecord); if (live.current) { setSavedRecord(saved); setDraft(next); setBaseline(next); setNotice(c.saved); } return saved; }
    catch (error) { if (live.current) setError(workspaceErrorText(error, c)); return null; }
    finally { setPending(false); }
  };
  const prepare = async (next: SetupDraft) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    restoreRequest.current?.abort();
    setReviewing(true); setEditingReview(false); setGenerationError(""); setError(""); setNotice(""); setGenerationPhase("saving");
    try {
      // Use the returned record immediately: React state may still hold the
      // previous version when the save promise resolves.
      const saved = await persist({ ...next, step: "review" });
      if (!saved || !live.current) { if (live.current) setGenerationPhase("failed"); return; }
      setNotice(""); setGenerationPhase("generating");
      const controller = new AbortController();
      generationRequest.current = controller;
      const input = { recordId: saved.id, expectedVersion: saved.version, language };
      let result: SetupGenerationResult | null;
      try { result = await workspaceRequest<SetupGenerationResult>("/api/school-ai/setup/generate", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(input) }); }
      catch (error) {
        if (!(error instanceof WorkspaceRequestError) || error.code !== "SETUP_GENERATION_PROCESSING") throw error;
        result = await restoreSetupGeneration(input, controller.signal, () => setGenerationPhase("generating"));
      }
      if (!live.current || controller.signal.aborted) return;
      if (!result?.records?.length) throw new Error("empty-generation");
      setGeneration(result); setGenerationPhase("complete"); generatedCallback.current(result.records);
    } catch (error) {
      if (!live.current) return;
      setGenerationPhase("failed");
      setGenerationError(error instanceof Error && error.message === "empty-generation" ? generationCopy.empty : workspaceErrorText(error, c));
    } finally { preparingRef.current = false; generationRequest.current = null; }
  };
  const advance = async (skip = false) => {
    if (busy || preparingRef.current) return;
    if (!skip) {
      const problem = validateSetupAnswer(question.key, value, draft.answers);
      if (problem) { setError(c[problem]); return; }
    }
    const confirmedKeys = question.key === "path" ? draft.confirmedKeys : skip ? draft.confirmedKeys.filter(key => key !== question.key) : [...new Set([...draft.confirmedKeys, question.key])];
    const last = editingReview || index >= questions.length - 1;
    const nextQuestion = questions[Math.min(index + 1, questions.length - 1)];
    const next: SetupDraft = { ...draft, confirmedKeys, step: last ? "review" : nextQuestion.section, currentQuestion: last ? question.key : nextQuestion.key };
    if (last) await prepare(next);
    else if (await persist(next)) setIndex(index + 1);
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
  return <ModalSurface fullscreen ariaLabel={c.setupTitle} onClose={onClose} disableBackdropClose dismissible={!busy && !mediaBusy && !helpActive} dirty={dirty || helpDirty} initialFocusRef={heading}><section className={styles.setup} dir={language === "en" ? "ltr" : "rtl"}>
    <header className={styles.setupHeader}><div className="flex items-center gap-3"><span className={styles.choiceIcon}><Sparkles aria-hidden="true" className="size-5" /></span><span className="font-extrabold">{c.workspace}</span></div><Button variant="outline" disabled={busy || mediaBusy || helpActive} onClick={() => void close()}><Save aria-hidden="true" />{c.saveExit}</Button></header>
    <div className={styles.setupBody}>
      {reviewing ? <div className={styles.question} key="review"><p className={styles.eyebrow}>{c.workspace}</p><h1 ref={heading} tabIndex={-1} className={styles.questionTitle}>{generationCopy.reviewTitle}</h1><p className={styles.description}>{generationCopy.reviewHint}</p>
        <SetupGenerationPanel language={language} phase={generationPhase} result={generation} error={generationError || (generationPhase === "failed" ? error : "")} stale={Boolean(generation && (dirty || generation.currentSourceVersion !== savedRecord?.version))} disabled={busy || helpActive || mediaBusy} onGenerate={() => void prepare({ ...draft, step: "review" })} onOpen={next => { const open = () => onOpenRecord(next); if (helpDirty) guard(open); else open(); }} />
        <details className={styles.reviewAnswers} open={!generation && !preparing}><summary>{generationCopy.reviewAnswers}</summary>
          <div className="sk-panel mb-5 p-5"><h2 className="text-base font-bold text-ink-strong">{c.readiness}</h2>{setupReadiness(draft.answers).map(group => {
            const missing = [...new Set([...group.missing, ...group.keys.filter(key => !draft.confirmedKeys.includes(key))])];
            return <div className={styles.recordRow} key={group.label}><div><p className="text-sm font-semibold text-ink-strong">{c[group.label]}</p>{missing.length > 0 && <p className="mt-1 text-xs text-ink-subtle">{missing.map(key => c[key === "curriculum" ? "curriculumQuestion" : key]).join(" · ")}</p>}</div><TaskStatus attention={Boolean(missing.length)}>{missing.length ? c.needsInformation : c.readyDraft}</TaskStatus></div>;
          })}</div>
          <div className={styles.reviewGrid}>{questions.map((item, questionIndex) => <article className={`sk-panel ${styles.reviewFact}`} key={item.key}><div className="flex items-start justify-between gap-2"><h2 className="text-xs font-semibold text-ink-subtle">{c[item.label]}</h2><Button variant="ghost" size="sm" disabled={busy || helpActive || mediaBusy} aria-label={`${c.edit}: ${c[item.label]}`} onClick={() => { setIndex(questionIndex); setReviewing(false); setEditingReview(true); setNotice(""); setError(""); }}>{c.edit}</Button></div><p className={styles.factValue}>{item.key === "path" ? c[draft.path] : item.key === "firstOutcome" && outcomes.includes(draft.answers.firstOutcome as typeof outcomes[number]) ? c[draft.answers.firstOutcome as typeof outcomes[number]] : draft.answers[item.key] || c.unknown}</p>{item.key !== "path" && !draft.confirmedKeys.includes(item.key) && <p className="mt-2 text-xs font-semibold text-ink-muted">{generationCopy.unconfirmed}</p>}</article>)}</div>
        </details>
        <div className="flex flex-wrap gap-3"><Button onClick={() => void close()} disabled={busy || helpActive || mediaBusy}><CheckCircle2 aria-hidden="true" />{c.saveExit}</Button>{canApprove && <Button variant="outline" disabled={busy || helpActive || mediaBusy || !savedRecord || savedRecord.status === "APPROVED"} onClick={() => void approve()}>{savedRecord?.status === "APPROVED" ? c.APPROVED : c.approve}</Button>}</div>
      </div> : <div key={question.key} className={styles.question}>
        <p className={styles.eyebrow}>{interpolateAI(c.questionOf, { current: index + 1, total: questions.length })}</p>
        <h1 ref={heading} tabIndex={-1} className={styles.questionTitle}>{c[question.label]}</h1><p className={styles.description}>{c[question.hint]}</p>
        {question.type === "path" ? <div className={styles.choices} aria-label={c.setupPath}>{paths.map(({ key, hint, Icon }) => <Button key={key} type="button" variant="choice" className={styles.choice} aria-pressed={draft.path === key} disabled={busy} onClick={() => change(key)}><span className={styles.choiceBody}><span className={styles.choiceIcon}><Icon aria-hidden="true" className="size-5" /></span><span className="flex-1"><span className="block text-base font-bold">{c[key]}</span><span className={styles.choiceHint}>{c[hint]}</span></span>{draft.path === key && <Check className="mt-2 size-4 text-primary" aria-hidden="true" />}</span></Button>)}</div>
          : question.type === "outcome" ? <div className={styles.choices} aria-label={c.firstOutcome}>{outcomes.map(outcome => <Button type="button" key={outcome} variant="choice" className={styles.choice} aria-pressed={value === outcome} disabled={busy} onClick={() => change(outcome)}>{c[outcome]}{value === outcome && <Check aria-hidden="true" />}</Button>)}</div>
          : question.type === "date" ? <FormField name={`setup-${question.key}`} label={c.answer} error={error || undefined}><Input type="date" disabled={busy} value={value} onChange={event => change(event.target.value)} min={question.key === "endDate" ? draft.answers.startDate : undefined} /></FormField>
          : <MultimodalComposer language={language} value={value} onChange={change} label={c.answer} placeholder={c.answer} disabled={busy || helpActive} voiceAvailable={voiceAvailable} onUpload={upload} onActivityChange={setMediaBusy} />}
        <div className={styles.setupFooter}><Button variant="ghost" disabled={index === 0 || busy || mediaBusy || helpActive} onClick={() => { setIndex(index - 1); setError(""); setNotice(""); }}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{c.back}</Button><div className="flex flex-wrap gap-2">{question.key !== "path" && <Button variant="ghost" disabled={busy || mediaBusy || helpActive} onClick={() => void advance(true)}>{index >= questions.length - 1 || editingReview ? generationCopy.skipFinish : c.skip}</Button>}<Button loading={pending} disabled={busy || mediaBusy || helpActive} onClick={() => void advance()}>{!pending && <ArrowRight className="rtl:rotate-180" aria-hidden="true" />}{pending ? c.saving : editingReview ? generationCopy.regenerate : index >= questions.length - 1 ? generationCopy.finish : c.next}</Button></div></div>
      </div>}
      {error && (reviewing || question.type !== "date") && <Alert className="mt-4" tone="danger" compact live="assertive">{error}</Alert>}
      {notice && <Alert tone="success" compact live="polite" className="mt-4">{notice}</Alert>}
      <SetupHelp language={language} topicKey={reviewing ? "review" : question.key} question={reviewing ? c.review : c[question.label]} campusId={campusId} assistantAvailable={assistantAvailable} voiceAvailable={voiceAvailable} disabled={busy || mediaBusy} onUpload={upload} onActivityChange={setHelpActive} onDraftChange={setHelpDirty} />
    </div>
  </section></ModalSurface>;
}
