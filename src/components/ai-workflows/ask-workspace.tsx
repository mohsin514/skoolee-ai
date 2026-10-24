"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FlaskConical, Info, ListChecks, MessageSquareText, Plus, PowerOff, Sparkles } from "lucide-react";
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

/** Skoolee's side of the conversation: the spark mark, then the content (plan, questions, outcome). */
function AiTurn({ children, working = false }: { children: React.ReactNode; working?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm", working && "motion-safe:animate-pulse-subtle")}>
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The person's own words, echoed as a message (client state only, never the URL). */
function YouSaid({ text, label }: { text: string; label: string }) {
  return (
    <div className="sk-fade-in flex justify-end">
      <div className="max-w-[88%] space-y-1 rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm sm:max-w-[75%]">
        <p className="sr-only">{label}</p>
        <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]">{text}</p>
      </div>
    </div>
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
  // While the run asks a question, the Ask box answers it, unless the person chose to ask something new.
  const [reply, setReply] = useState("");
  const [askNew, setAskNew] = useState(false);
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
  const newRequest = () => { setInitial(null); setAsked(null); setAskNew(false); window.requestAnimationFrame(() => focusComposer()); };
  // A different run (or a new question round) starts in answer mode again.
  useEffect(() => { setAskNew(false); setReply(""); }, [run?.id, run?.version]);
  const sendReply = () => {
    const text = reply.trim();
    if (!run || !text || busy) return;
    void send({ type: "answer", text }, `answer:${run.version}`);
    setReply("");
  };

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
  const answering = Boolean(run && !starting && run.status === "NEEDS_INPUT" && run.questions.length > 0 && !askNew);
  const youSaid = starting ? pendingText : requestText;
  const empty = !run && !starting;

  return (
    <section ref={root} data-ai-workspace className={shell} dir={dir} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_17rem] @4xl:gap-0">
        {/* One conversation: the thread, then the Ask box docked under it. No card inside a card. */}
        <div data-ai-conversation className="flex min-w-0 flex-col gap-4 @4xl:pe-6">
          <div data-ai-thread className="space-y-5">
            {empty ? (
              <AiTurn>
                <div className="space-y-3 pt-0.5">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-ink-strong">{runText("welcomeTitle", language)}</p>
                    <p className="text-sm text-ink-muted">{runText("welcomeHint", language)}</p>
                  </div>
                  {examples && examples.length > 0 ? (
                    <div className="space-y-2">
                      <p className="sk-eyebrow text-2xs text-ink-muted">{runText("tryAsking", language)}</p>
                      <div className="sk-stagger flex flex-wrap gap-2">
                        {examples.slice(0, 4).map(example => (
                          <Button key={example} type="button" variant="choice" size="sm" data-ai-example className="sk-hover-lift w-full justify-start sm:w-auto" onClick={() => fill(example)}>
                            <MessageSquareText aria-hidden="true" className="text-primary" />
                            <span dir="auto" className="min-w-0 text-start">{example}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </AiTurn>
            ) : null}

            {youSaid ? <YouSaid text={youSaid} label={runText("youAsked", language)} /> : null}

            {starting ? <AiTurn working><RunPlanning language={language} /></AiTurn> : null}
            {run && !starting ? (
              <AiTurn working={run.status === "PLANNING" || run.status === "RUNNING"}>
                <RunSheet key={run.id} run={run} language={language} busy={busy} error={error}
                  onCommand={(body, clickKey) => void send(body, clickKey)} chrome={requestText ? "compact" : "full"}
                  headingLevel={heading === "none" ? 2 : 3} requestText={requestText} onRephrase={fill} examples={examples} connection={connection} onCheckNow={checkNow}
                  questionsInComposer={answering} />
              </AiTurn>
            ) : null}

            {startError ? <Alert tone="danger" data-ai-error={startError}>{errorWords(startError, language)}</Alert> : null}
          </div>

          <div className="space-y-2">
            {waitingRun && !starting && !answering ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Info aria-hidden="true" className="size-4 shrink-0" />
                <p className="min-w-0 flex-1 basis-56">{runText("stillWaiting", language)}</p>
                <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={newRequest}><Plus aria-hidden="true" />{runText("newRequest", language)}</Button>
              </div>
            ) : null}
            {answering ? (
              <AskComposer mode="answer" value={reply} onChange={setReply} onSubmit={sendReply} starting={busy} language={language} fieldRef={field}
                banner={<>
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-brand-700"><Sparkles aria-hidden="true" className="size-3.5" />{runText("answeringNow", language)}</span>
                  <Button type="button" variant="ghost" size="sm" className="-me-2 min-h-9 text-xs" onClick={() => { setAskNew(true); window.requestAnimationFrame(() => focusComposer()); }}>
                    <Plus aria-hidden="true" />{runText("askInstead", language)}
                  </Button>
                </>} />
            ) : (
              <AskComposer value={message} onChange={setMessage} onSubmit={() => void submit()} starting={starting} language={language}
                labelledBy={headingId} examples={examples} fieldRef={field} />
            )}
          </div>
        </div>
        <aside className="min-w-0 @4xl:border-s @4xl:border-border-subtle @4xl:ps-6">
          <AskRecent headingLevel={heading === "none" ? 2 : 3} language={language} currentId={run?.id ?? null} refreshKey={run ? `${run.id}:${run.status}` : null} onOpen={openRun} />
        </aside>
      </div>
    </section>
  );
}
