"use client";

import { useId, useState } from "react";
import { BookOpen, ChevronDown, Download, FileText, MessageCircle, Pencil, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/lib/locale/package";
import { buildSchoolAiDemo } from "@/lib/school-ai/demo";
import { AssistantResponse } from "./assistant-response";
import { prototypeCopy } from "./prototype-copy";
import styles from "./school-ai.module.css";

type Workflow = "assistant" | "curriculum" | "paper";
type DemoResult = ReturnType<typeof buildSchoolAiDemo>;

function draftText(result: DemoResult) {
  const sections = [result.notice, result.reply];
  if (result.curriculum) sections.push(...result.curriculum.outcomes.map((outcome, index) => `${index + 1}. ${outcome.title}`));
  if (result.paper) sections.push(result.paper.blueprint.title, result.paper.blueprint.instructions, ...result.paper.questions.map((question, index) => `${index + 1}. ${question.prompt}\n${question.options.map(option => `- ${option.text}`).join("\n")}\n${question.modelAnswer}`));
  return sections.filter(Boolean).join("\n\n");
}

/** Explicit, local sample output is never inserted into saved school records. */
export function DemoWorkflowPanel({ language, compact = false, initialWorkflow = "assistant", initialMessage }: {
  language: Language; compact?: boolean; initialWorkflow?: Workflow; initialMessage?: string;
}) {
  const t = prototypeCopy(language);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow);
  const [message, setMessage] = useState(initialMessage || t.defaultMessage);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(false);
  const run = () => {
    const next = buildSchoolAiDemo({ workflow, language, message });
    setResult(next); setDraft(draftText(next)); setEditing(false); setEdited(false);
  };
  const download = () => {
    if (!result) return;
    const blob = new Blob([`${t.sample}\n\n${draft}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `skoolee-sample-${workflow}-${language}.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className={styles.demoPanel} data-ai-sample-workflow dir={language === "en" ? "ltr" : "rtl"}>
    <div className={styles.demoHeader}>
      <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 text-base font-bold"><Sparkles className="size-4 text-primary" aria-hidden="true" />{t.title}</h2>{!compact && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-muted">{t.hint}</p>}</div>
      <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => { if (!open && !result) run(); setOpen(value => !value); }}>{open ? <X aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{open ? t.close : t.open}</Button>
    </div>
    {open && <div id={id} className="mt-5 space-y-4">
      <span className={styles.demoBadge}><Sparkles className="size-3" aria-hidden="true" />{t.sample}</span>
      <div className={styles.demoTools} aria-label={t.title}>{([{ id: "assistant", Icon: MessageCircle }, { id: "curriculum", Icon: BookOpen }, { id: "paper", Icon: FileText }] as const).map(({ id: key, Icon }) => <Button key={key} type="button" variant="choice" aria-pressed={workflow === key} onClick={() => { setWorkflow(key); setResult(null); }}><Icon aria-hidden="true" />{t[key]}</Button>)}</div>
      <FormField name={`${id}-message`} label={t.message}><Textarea rows={3} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} /></FormField>
      <Button type="button" disabled={!message.trim()} onClick={run}><Sparkles aria-hidden="true" />{t.run}</Button>
      {result && <div className="space-y-4" data-ai-sample-result>
        <p role="status" className="text-sm font-medium leading-relaxed text-ink-muted">{result.notice}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" aria-pressed={editing} onClick={() => setEditing(value => !value)}><Pencil aria-hidden="true" />{t.editSample}</Button><Button type="button" variant="outline" size="sm" onClick={download}><Download aria-hidden="true" />{t.download}</Button></div>
        {editing ? <FormField name={`${id}-draft`} label={t.editSample}><Textarea rows={14} value={draft} onChange={event => { setDraft(event.target.value); setEdited(true); }} /></FormField> : edited ? <div className={styles.demoResult}><AssistantResponse text={draft} /></div> : <>
          <div className={styles.demoResult}><AssistantResponse text={result.reply} /></div>
          {result.curriculum && !result.paper && <div className={styles.demoResult}><h3 className="mb-3 font-bold">{t.outcomes}</h3><ol className="list-decimal space-y-2 ps-5">{result.curriculum.outcomes.map(outcome => <li key={outcome.id}>{outcome.title}</li>)}</ol><h3 className="mb-2 mt-5 font-bold">{t.evidence}</h3>{result.curriculum.sources.map(source => <article key={source.id} className="mt-3"><h4 className="font-semibold">{source.title}</h4><p className="text-ink-muted">{source.excerpt}</p></article>)}</div>}
          {result.paper && <div className={styles.demoResult}><h3 className="font-bold">{result.paper.blueprint.title}</h3><p className="mb-2 text-xs text-ink-muted">{result.paper.blueprint.durationMinutes} {t.minutes} · {result.paper.blueprint.totalMarks} {t.marks}</p><p>{result.paper.blueprint.instructions}</p>{result.paper.questions.map((question, index) => <article key={question.id} className="mt-5 border-t border-border pt-4"><h4 className="font-semibold">{index + 1}. {question.prompt}</h4><p className="text-xs text-ink-muted">{question.marks} {t.marks}</p>{question.options.length > 0 && <ul className="mt-2 list-disc ps-5">{question.options.map(option => <li key={option.id}>{option.text}</li>)}</ul>}<details className="mt-3 rounded-xl border border-border bg-surface-subtle px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-primary">{t.answer}</summary><p className="mt-2">{question.modelAnswer}</p><ul className="mt-2 list-disc ps-5">{question.rubric.map(item => <li key={item.id}>{item.criterion} · {item.marks} {t.marks}</li>)}</ul></details></article>)}</div>}
        </>}
      </div>}
    </div>}
  </section>;
}
