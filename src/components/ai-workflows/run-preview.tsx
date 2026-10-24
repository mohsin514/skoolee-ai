"use client";
import { useId, useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import type { StepView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import { UI, receiptParts, t, type Lang } from "./run-copy";
import { fillNode, runText } from "./run-links";
import { Num } from "./workflow-format";

type Preview = NonNullable<StepView["preview"]>;
type Line = Preview["lines"][number];

const FOLD_AFTER = 8;
const FOLDED_ROWS = 6;

/** The "what will change" rows. More than 8 fold to 6 with an honest "Show N more" toggle. */
export function PreviewLines({ lines, changed, language }: { lines: Line[]; changed?: ReadonlySet<number>; language: Lang }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  const folds = lines.length > FOLD_AFTER;
  const shown = folds && !open ? lines.slice(0, FOLDED_ROWS) : lines;
  return (
    <div className="space-y-2">
      <dl id={id} data-ai-preview-lines={lines.length} className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {shown.map((line, index) => (
          <div key={index} className="contents">
            <dt className="text-xs font-semibold text-ink-muted [overflow-wrap:anywhere] sm:pt-0.5">{line.label}</dt>
            <dd dir="auto" className={cn("rounded-md text-sm text-ink-strong [overflow-wrap:anywhere]", changed?.has(index) && "sk-ai-flash")}>{line.value}</dd>
          </div>
        ))}
      </dl>
      {folds ? (
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
          {open ? t(UI, "showLess", language) : fillNode(t(UI, "showMore", language), <Num value={lines.length - FOLDED_ROWS} />)}
        </Button>
      ) : null}
    </div>
  );
}

/** Preview code chip: the word reads in the page direction, the code always LTR. */
function PreviewCode({ code, language }: { code: string; language: Lang }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.copied(); }
    catch (cause) { toast.actionFailed("copy the code", cause); }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip content={runText("previewCodeHelp", language)}>
        <Badge variant="outline" size="sm" tabIndex={0} className="gap-1.5">
          <span>{t(UI, "previewCode", language)}</span>
          <code dir="ltr" className="font-mono tabular-nums tracking-wider text-ink-strong">{code}</code>
        </Badge>
      </Tooltip>
      <IconButton label={runText("copyCode", language)} data-ai-copy-code onClick={() => void copy()}><Copy aria-hidden="true" /></IconButton>
    </span>
  );
}

/**
 * The confirm "ticket" for a class B step: exactly what will change, the person-only quick changes,
 * then a perforation and the one Save button. Nothing is focused automatically; only a click saves.
 * Keyed by preview version so a new version fades in, and values that changed flash once.
 */
export function RunPreview({ step, language, busy, pendingKey, onConfirm, onAmend }: {
  step: StepView & { preview: Preview }; language: Lang; busy: boolean; pendingKey: string | null;
  onConfirm: (step: StepView) => void; onAmend: (step: StepView, actionId: string, expect: number) => void;
}) {
  const preview = step.preview;
  // Remember the previous version's lines so a re-rendered preview can mark what changed.
  const [snapshot, setSnapshot] = useState<{ version: number; lines: Line[]; previous: Line[] | null }>({ version: preview.version, lines: preview.lines, previous: null });
  if (snapshot.version !== preview.version) setSnapshot({ version: preview.version, lines: preview.lines, previous: snapshot.lines });
  const changed = new Set<number>();
  if (snapshot.previous) {
    const before = new Map(snapshot.previous.map(line => [line.label, line.value]));
    preview.lines.forEach((line, index) => { if (before.get(line.label) !== line.value) changed.add(index); });
  }
  const parts = receiptParts({ counts: preview.counts }, language);
  const confirmKey = `confirm:${step.id}:${preview.version}`;
  return (
    <div key={preview.version} className="sk-receipt-stub sk-fade-in">
      <div className="space-y-1">
        <p className="sk-eyebrow text-2xs text-status-warning-text">{runText("checkBeforeSaving", language)}</p>
        {preview.title ? <p dir="auto" className="min-w-0 text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]">{preview.title}</p> : null}
      </div>
      <PreviewLines lines={preview.lines} changed={changed} language={language} />
      {parts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parts.map(part => <Badge key={part.key} size="sm" variant="neutral"><span><Num value={part.count} /> {part.label}</span></Badge>)}
        </div>
      ) : null}
      {preview.actions && preview.actions.length > 0 ? (
        <div role="group" aria-label={runText("quickChanges", language)} className="space-y-2">
          <p aria-hidden="true" className="sk-eyebrow text-2xs text-ink-muted">{runText("quickChanges", language)}</p>
          <div className="flex flex-wrap gap-2">
            {/* Only a person's own tap changes what is saved (control P3): e.g. "Mark the other 31 present". */}
            {preview.actions.map(action => (
              <Button key={action.id} type="button" data-ai-amend={action.id} variant="secondary" size="sm" className="w-full sm:w-auto"
                disabled={busy} loading={busy && pendingKey === `amend:${action.id}`} onClick={() => onAmend(step, action.id, action.expect)}>
                {busy && pendingKey === `amend:${action.id}` ? null : <Wand2 aria-hidden="true" />}
                <span dir="auto">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div data-part="perforation" aria-hidden="true" />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PreviewCode code={preview.code} language={language} />
        <Button type="button" data-ai-confirm data-ai-preview={preview.code} className="w-full sm:w-auto"
          disabled={busy} loading={busy && pendingKey === confirmKey} onClick={() => onConfirm(step)}>
          {busy && pendingKey === confirmKey ? null : <Check aria-hidden="true" />}
          <span dir="auto">{preview.confirmLabel ?? `${t(UI, "saveStep", language)} · ${step.title}`}</span>
        </Button>
      </div>
    </div>
  );
}
