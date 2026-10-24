"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical, Info, ListChecks, MessageSquareText, Plus, PowerOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/tooltip";
import { useLocale } from "@/components/locale/LocaleProvider";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import type { RunView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import { AskComposer } from "./ask-composer";
import { AskRecent } from "./ask-recent";
import { ERROR_WORDS, UI, errorWords, t } from "./run-copy";
import { runText } from "./run-links";
import { RunPlanning } from "./run-planning";
import { RunSheet } from "./run-sheet";
import { InboxCountChip } from "./inbox-count-chip";
import { WorkflowRequestError, startWorkflow, useWorkflowRun } from "./use-workflow-run";

const TERMINAL = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "FAILED", "BLOCKED"]);
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function CanDoLink({ label }: { label: string }) {
  return (
    <Link href="/ai/can-do" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sk-nudge-trigger w-full sm:w-auto")}>
      <ListChecks aria-hidden="true" />
      <span>{label}</span>
      <ArrowRight aria-hidden="true" className="sk-nudge rtl:rotate-180" />
    </Link>
  );
}

/**
 * The AI Workflows home: one Ask field, the live Run Sheet, recent requests and honest outcomes.
 * Enter sends, Shift+Enter is a new line, and nothing sends while an Urdu/Arabic IME is composing.
 * A prefilled example (from "Try it") is only placed in the field, never sent.
 */
export function AskWorkspace({ campusId, practiceMode, enabled = true, examples, initialMessage, heading = "visible", labelledBy }: {
  campusId: string | null; practiceMode: boolean; enabled?: boolean;
  examples?: string[]; initialMessage?: string; heading?: "visible" | "none"; labelledBy?: string;
}) {
  const { language } = useLocale();
  const router = useRouter();
  const ownHeadingId = useId();
  const headingId = labelledBy ?? ownHeadingId;
  const [message, setMessage] = useState(initialMessage ?? "");
  const [starting, setStarting] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [initial, setInitial] = useState<RunView | null>(null);
  // The words behind the visible run, held in client state only (never the URL).
  const [asked, setAsked] = useState<{ runId: string; text: string } | null>(null);
  const { run, busy, error, send, connection, checkNow } = useWorkflowRun(initial);
  const key = useRef<{ text: string; id: string } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLElement>(null);
  const [prefill, setPrefill] = useState(initialMessage ?? "");
  // An unedited prefill is not unsaved work.
  useUnsavedGuard(Boolean(message.trim()) && message !== prefill);

  const focusComposer = useCallback((select = false) => {
    const node = field.current;
    if (!node) return;
    node.focus();
    if (select) node.select();
    node.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);

  // "Try it" prefill: place and select the example, then drop ?try from the URL. Never auto-submits.
  useEffect(() => {
    if (!initialMessage) return;
    setPrefill(initialMessage);
    setMessage(initialMessage);
    const frame = window.requestAnimationFrame(() => focusComposer(true));
    const url = new URL(window.location.href);
    if (url.searchParams.has("try")) {
      url.searchParams.delete("try");
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }
    return () => window.cancelAnimationFrame(frame);
  }, [initialMessage, focusComposer, router]);

  // A new run arrived (sent or reopened): focus its heading. Confirm is never focused automatically.
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    const id = run?.id ?? null;
    if (!id || id === shownId.current) { shownId.current = id; return; }
    shownId.current = id;
    const target = root.current?.querySelector<HTMLElement>("[data-ai-run-sheet] [data-ai-run-heading]");
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [run?.id]);

  const submit = async () => {
    const text = message.trim();
    if (!text || starting) return;
    if (key.current?.text !== text) key.current = { text, id: crypto.randomUUID() };
    setStarting(true); setStartError(null); setPendingText(text);
    try {
      const { run: next } = await startWorkflow(text, language, key.current.id, campusId);
      setAsked({ runId: next.id, text });
      setInitial(next); setMessage(""); setPrefill(""); key.current = null;
    }
    catch (thrown) { setStartError(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setStarting(false); setPendingText(null); }
  };

  const fill = (text: string) => { setMessage(text); window.requestAnimationFrame(() => focusComposer()); };
  const openRun = useCallback((next: RunView) => { setInitial(next); setAsked(current => (current?.runId === next.id ? current : null)); }, []);
  const newRequest = () => { setInitial(null); setAsked(null); window.requestAnimationFrame(() => focusComposer()); };

  const dir = language === "en" ? "ltr" : "rtl";
  const overlap = heading === "none";
  const shell = cn(
    "@container space-y-5 p-4 sm:p-6",
    overlap ? "relative z-10 -mt-8 rounded-3xl border border-border-subtle bg-card shadow-glow sm:-mt-10" : "sk-panel",
  );

  if (!enabled) return (
    <section data-ai-workspace data-ai-disabled className={shell} dir={dir} aria-labelledby={heading === "none" ? labelledBy : undefined}>
      <EmptyState size="sm" icon={PowerOff} title={t(UI, "askTitle", language)}
        description={`${runText("offTitle", language)} ${runText("offHint", language)}`}
        secondaryAction={<CanDoLink label={t(UI, "canDoTitle", language)} />} />
    </section>
  );

  const waitingRun = run && !TERMINAL.has(run.status) ? run : null;
  const requestText = run && asked?.runId === run.id ? asked.text : undefined;

  return (
    <section ref={root} data-ai-workspace className={shell} dir={dir} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start gap-2">
        {heading === "visible" ? <h2 id={ownHeadingId} className="min-w-0 flex-1 basis-48 text-xl font-semibold text-ink-strong">{t(UI, "askTitle", language)}</h2> : <span className="hidden flex-1 sm:block" />}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <CanDoLink label={t(UI, "canDoTitle", language)} />
          <InboxCountChip className="w-full sm:w-auto" />
        </div>
      </div>

      {practiceMode ? (
        <Alert compact tone="warning" icon={FlaskConical} live="off" data-ai-practice title={t(UI, "practiceTitle", language)}>
          <span className="inline-flex flex-wrap items-center gap-1">
            {ERROR_WORDS.PRACTICE_MODE?.[language]}
            <InfoTip content={t(UI, "practiceTip", language)} />
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <AskComposer value={message} onChange={setMessage} onSubmit={() => void submit()} starting={starting} language={language}
            labelledBy={headingId} placeholder={examples?.[0] ?? t(UI, "askPlaceholder", language)} fieldRef={field} />

          {waitingRun && !starting ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <Info aria-hidden="true" className="size-4 shrink-0" />
              <p className="min-w-0 flex-1 basis-56">{runText("stillWaiting", language)}</p>
              <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={newRequest}><Plus aria-hidden="true" />{runText("newRequest", language)}</Button>
            </div>
          ) : null}

          {!run && !starting && examples && examples.length > 0 ? (
            <div className="space-y-2">
              <p className="sk-eyebrow text-2xs text-ink-muted">{runText("tryAsking", language)}</p>
              <div className="sk-stagger flex flex-wrap gap-2">
                {examples.slice(0, 4).map(example => (
                  <Button key={example} type="button" variant="choice" size="sm" data-ai-example className="w-full justify-start sm:w-auto" onClick={() => fill(example)}>
                    <MessageSquareText aria-hidden="true" className="text-primary" />
                    <span dir="auto" className="min-w-0 text-start">{example}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {startError ? <Alert tone="danger" data-ai-error={startError}>{errorWords(startError, language)}</Alert> : null}
          {starting ? <RunPlanning requestText={pendingText ?? undefined} language={language} /> : null}
          {run && !starting ? (
            <RunSheet key={run.id} run={run} language={language} busy={busy} error={error}
              onCommand={(body, clickKey) => void send(body, clickKey)}
              headingLevel={heading === "none" ? 2 : 3} requestText={requestText} onRephrase={fill} examples={examples} connection={connection} onCheckNow={checkNow} />
          ) : null}
        </div>
        <aside className="min-w-0">
          <AskRecent headingLevel={heading === "none" ? 2 : 3} language={language} currentId={run?.id ?? null} refreshKey={run ? `${run.id}:${run.status}` : null} onOpen={openRun} />
        </aside>
      </div>
    </section>
  );
}
