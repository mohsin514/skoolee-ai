"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CornerDownRight, HelpCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RunView } from "@/lib/ai-workflows/view";
import { QUESTION_WORDS, UI, humanisePointer, t, type Lang } from "./run-copy";
import { fillNode, runText } from "./run-links";
import { Num, useWorkflowFormat } from "./workflow-format";

type Question = RunView["questions"][number];

/** True while an IME (Urdu, Arabic) is composing: Enter then picks a candidate, it never sends. */
export function isComposing(event: React.KeyboardEvent) {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function useQuestionText() {
  const format = useWorkflowFormat();
  return (question: Question, language: Lang) => {
    if (question.text) return question.text;
    const { code, count } = question.params ?? {};
    const fill = code !== undefined ? String(code) : typeof count === "number" ? format.count(count) : count !== undefined ? String(count) : humanisePointer(question.pointer, language);
    if (QUESTION_WORDS[question.promptKey]) return t(QUESTION_WORDS, question.promptKey, language, fill);
    return t(UI, "missingField", language, humanisePointer(question.pointer, language));
  };
}

/**
 * The run's open questions as one "needs you" card (#64's question card). One tap on an option
 * sends it exactly as before; otherwise type an answer (Enter sends, Shift+Enter is a new line).
 */
export function RunQuestions({ run, language, busy, pendingKey, onAnswer, level = 4, inComposer = false }: {
  run: RunView; language: Lang; busy: boolean; pendingKey: string | null; level?: 3 | 4 | 5;
  onAnswer: (text: string, pendingKey: string) => void;
  /** Ask's conversation: the typed answer goes in the Ask box itself, so only the questions and option chips render here. */
  inComposer?: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const questionText = useQuestionText();
  const many = run.questions.length > 1;
  const titles = [...new Set(run.questions.map(question => question.capabilityTitle).filter(Boolean))];
  const sharedTitle = inComposer && titles.length === 1 ? titles[0] : null;
  const answerKey = `answer:${run.version}`;
  const Heading = `h${level}` as "h3" | "h4" | "h5";

  // Questions just arrived: move to the answer only when the person is already working in this workspace.
  useEffect(() => {
    const node = field.current;
    const scope = node?.closest("[data-ai-workspace], [data-ai-run-sheet]");
    if (node && scope && document.activeElement && scope.contains(document.activeElement) && document.activeElement !== document.body) node.focus({ preventScroll: true });
  }, []);

  const submit = () => {
    if (!answer.trim() || busy) return;
    onAnswer(answer, answerKey);
    setAnswer("");
  };

  return (
    <section data-ai-questions data-active data-in-composer={inComposer || undefined}
      className={inComposer ? "sk-enter space-y-3 rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100 sm:p-5" : "sk-quiz-card sk-enter space-y-4 p-4 sm:p-6"}>
      <div className="flex items-start gap-3">
        <span className="sk-quiz-num" aria-hidden="true"><HelpCircle className="size-5" /></span>
        <div className="min-w-0 flex-1 space-y-1">
          {sharedTitle ? <p className="sk-eyebrow text-2xs text-brand-700">{sharedTitle}</p> : null}
          <Heading className="text-base font-semibold text-ink-strong">
            {many ? fillNode(t(UI, "questionsTitleMany", language), <Num value={run.questions.length} />) : t(UI, "questionsTitle", language)}
          </Heading>
        </div>
      </div>
      <ul className={inComposer ? "space-y-2" : "space-y-3"}>
        {run.questions.map(question => (
          <li key={question.id} data-ai-question={question.promptKey} className={inComposer ? "space-y-2 rounded-xl bg-card px-3 py-2.5 ring-1 ring-brand-100/70 sm:px-4" : "space-y-2 rounded-xl bg-surface-subtle p-3 sm:p-4"}>
            {question.capabilityTitle && !sharedTitle ? <p className="sk-eyebrow text-2xs text-ink-muted">{question.capabilityTitle}</p> : null}
            <p dir="auto" className="text-sm text-ink-strong [overflow-wrap:anywhere] sm:text-base">{questionText(question, language)}</p>
            {question.pointer && !inComposer ? <Badge size="sm" variant="neutral">{humanisePointer(question.pointer, language)}</Badge> : null}
            {question.options.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {question.options.map(option => {
                  const key = `${answerKey}:${option.value}`;
                  return (
                    <Button key={option.value} type="button" size="sm" variant="choice" data-ai-option={option.value} disabled={busy} loading={busy && pendingKey === key}
                      onClick={() => onAnswer(option.label, key)}>
                      <span dir="auto">{option.label}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {inComposer ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
          <CornerDownRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {run.questions.some(question => question.options.length > 0) ? runText("replyBelowOrTap", language) : runText("replyBelow", language)}
        </p>
      ) : <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-xs font-semibold text-ink-muted">
          {run.questions.some(question => question.options.length > 0) ? runText("orTypeAnswer", language) : runText("yourAnswer", language)}
        </label>
        <div data-field-shell className="rounded-2xl">
          <div className="sk-input-group flex">
            <Textarea
              ref={field} id={fieldId} data-ai-answer value={answer} rows={2} maxLength={4000} dir="auto" enterKeyHint="send"
              aria-label={runText("yourAnswer", language)}
              className="min-h-0 max-h-48 resize-none overflow-y-auto py-3 [field-sizing:content]"
              onChange={event => setAnswer(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !isComposing(event)) { event.preventDefault(); submit(); } }}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" data-ai-answer-submit className="w-full sm:w-auto" disabled={busy || !answer.trim()} loading={busy && pendingKey === answerKey} onClick={submit}>
            {busy && pendingKey === answerKey ? null : <Send aria-hidden="true" className="rtl:-scale-x-100" />}
            {t(UI, "answer", language)}
          </Button>
        </div>
      </div>}
    </section>
  );
}
