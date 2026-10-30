"use client";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, ChevronDown, ArrowRight, FlaskConical, Info, ListChecks, MessageSquareText, Plus, PowerOff, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/tooltip";
import { useLocale } from "@/components/locale/LocaleProvider";
import { useUnsavedGuard } from "@/lib/hooks/use-unsaved-guard";
import type { RunView } from "@/lib/ai-workflows/view";
import { cn } from "@/lib/utils";
import styles from "./ask-workspace.module.css";
import { AskComposer } from "./ask-composer";
import { AskRecent } from "./ask-recent";
import { ERROR_WORDS, UI, errorWords, t } from "./run-copy";
import { runText } from "./run-links";
import { RunPlanning } from "./run-planning";
import { RunAnswer } from "./run-answer";
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expanded, setExpanded] = useState(Boolean(initialMessage));
  const anchor = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [dock, setDock] = useState<{ left: number; width: number; keyboard: number } | null>(null);
  useEffect(() => {
    const node = anchor.current;
    if (!node || !enabled) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const viewport = window.visualViewport;
      setDock({ left: rect.left, width: rect.width, keyboard: viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const workspace = document.getElementById("workspace-content");
    if (workspace) observer.observe(workspace);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("scroll", measure); };
  }, [enabled]);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [starting, setStarting] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [initial, setInitial] = useState<RunView | null>(null);
  // The words behind the visible run, held in client state only (never the URL).
  const [chatHistory, setChatHistory] = useState<Array<{ id: string; question: string; receipt: NonNullable<RunView["steps"][number]["receipt"]> & { text: string } }>>([]);
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
    setExpanded(true);
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

  useEffect(() => {
    if (!expanded || !run?.steps.some(step => step.receipt?.conversational)) return;
    const frame = window.requestAnimationFrame(() => {
      const turn = root.current?.querySelector<HTMLElement>("[data-ai-current-turn]");
      const panel = document.getElementById(panelId);
      if (turn && panel) panel.scrollTop += turn.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [run?.id, run?.status, expanded, panelId]);

  const submit = async () => {
    setExpanded(true);
    const text = message.trim();
    if (!text || starting) return;
    if (key.current?.text !== text) key.current = { text, id: crypto.randomUUID() };
    setStarting(true); setStartError(null); setPendingText(text);
    try {
      const { run: next } = await startWorkflow(text, language, key.current.id, campusId, run?.status === "COMPLETED" && run.steps.length === 1 && ["assistant.app_knowledge", "assistant.conversation"].includes(run.steps[0].capabilityKey) ? run.id : undefined);
      const previous = run?.steps.length === 1 ? run.steps[0].receipt : null;
      if (run && previous?.conversational && previous.text) setChatHistory(items => [...items.filter(item => item.id !== run.id), { id: run.id, question: asked?.runId === run.id ? asked.text : "", receipt: { ...previous, text: previous.text! } }].slice(-20));
      setAsked({ runId: next.id, text });
      setInitial(next); setMessage(""); setPrefill(""); key.current = null;
    }
    catch (thrown) { setStartError(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setStarting(false); setPendingText(null); }
  };

  const fill = (text: string) => { setMessage(text); window.requestAnimationFrame(() => focusComposer()); };
  const openRun = useCallback((next: RunView) => { setHistoryOpen(false); setChatHistory([]); setReply(""); setAskNew(false); setStartError(null); setExpanded(true); setInitial(next); setAsked(current => (current?.runId === next.id ? current : null)); }, []);
  const newRequest = () => { const url = new URL(window.location.href); url.searchParams.delete("run"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); setInitial(null); setAsked(null); setChatHistory([]); setAskNew(false); setReply(""); setStartError(null); key.current = null; window.requestAnimationFrame(() => focusComposer()); };
  // Persist only the opaque job id in the URL. The API rechecks actor ownership on every reopen.
  useEffect(() => {
    if (!enabled || initialMessage) return;
    const id = new URL(window.location.href).searchParams.get("run");
    if (!id || !/^[\w-]{1,128}$/.test(id)) return;
    const controller = new AbortController();
    void fetch(`/api/ai-workflows/${id}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const body = await response.json();
      if (!controller.signal.aborted) { setInitial(body.run); setExpanded(true); }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, initialMessage, campusId]);
  useEffect(() => {
    if (!run) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run", run.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [run?.id]);
    // A different run (or a new question round) starts in answer mode again.
  useEffect(() => { setAskNew(false); setReply(""); }, [run?.id, run?.version]);
  const sendReply = async () => {
    const text = reply.trim();
    if (!run || !text || busy) return;
    if (await send({ type: "answer", text }, `answer:${run.version}`)) setReply("");
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
  const requestText = run && asked?.runId === run.id ? asked.text : run?.requestText;
  const answering = Boolean(run && !starting && run.status === "NEEDS_INPUT" && run.questions.length > 0 && !askNew);
  const youSaid = starting ? pendingText : requestText;
  const empty = !run && !starting;

  return (
    <div ref={anchor} className={styles.anchor}>
    <section ref={root} tabIndex={-1} data-ai-workspace data-expanded={expanded} className={cn(styles.dock, dock && styles.positioned)} dir={dir} aria-labelledby={headingId}
      style={dock ? { left: dock.left, width: dock.width, "--ask-keyboard-inset": `${dock.keyboard}px` } as CSSProperties : undefined}
      onKeyDown={event => { if (event.key === "Escape" && expanded && !event.defaultPrevented) { event.preventDefault(); setExpanded(false); root.current?.focus({ preventScroll: true }); } }}>
      <div hidden={!expanded} className={styles.toolbar}>
        <h2 id={heading === "visible" ? ownHeadingId : undefined} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-strong"><Sparkles aria-hidden="true" className="size-4 text-primary" /><span className="truncate">{t(UI, "askTitle", language)}</span></h2>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={starting || busy} onClick={newRequest} aria-label={runText("newRequest", language)}><Plus aria-hidden="true" /><span className="hidden sm:inline">{runText("newRequest", language)}</span></Button>
          <Button type="button" variant="ghost" size="sm" disabled={starting || busy} aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}><History aria-hidden="true" />{language === "ar" ? "السجل" : language === "ur" ? "ہسٹری" : "History"}</Button>
          <Button type="button" variant="ghost" size="sm" aria-label={language === "ar" ? "تصغير" : language === "ur" ? "چھوٹا کریں" : "Minimize"} aria-expanded={expanded} aria-controls={panelId} onClick={() => { setExpanded(false); root.current?.focus({ preventScroll: true }); }}><ChevronDown aria-hidden="true" /></Button>
        </div>
      </div>
      <div id={panelId} hidden={!expanded} className={styles.panel}>

      {practiceMode ? (
        <Alert compact tone="warning" icon={FlaskConical} live="off" data-ai-practice title={t(UI, "practiceTitle", language)}>
          <span className="inline-flex flex-wrap items-center gap-1">
            {ERROR_WORDS.PRACTICE_MODE?.[language]}
            <InfoTip content={t(UI, "practiceTip", language)} />
          </span>
        </Alert>
      ) : null}

      <div className="mx-auto w-full max-w-4xl">
        {/* One conversation: the thread, then the Ask box docked under it. No card inside a card. */}
        <div data-ai-conversation className="flex min-w-0 flex-col gap-4">
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

            {(run?.conversation?.length ? run.conversation.map(turn => ({ ...turn, receipt: { kind: "read" as const, counts: {}, link: null, replayed: false, entities: 0, conversational: true, text: turn.text } })) : chatHistory).map(turn => <div key={turn.id} className="space-y-3">{turn.question ? <YouSaid text={turn.question} label={runText("youAsked", language)} /> : null}<AiTurn><RunAnswer receipt={turn.receipt} language={language} /></AiTurn></div>)}
            {youSaid ? <YouSaid text={youSaid} label={runText("youAsked", language)} /> : null}

            {starting ? <AiTurn working><RunPlanning language={language} /></AiTurn> : null}
            {run && !starting ? (
              <div data-ai-current-turn>
              <AiTurn working={run.status === "PLANNING" || run.status === "RUNNING"}>
                {run.steps.length === 1 && run.steps[0].receipt?.conversational && run.steps[0].receipt.text ? <RunAnswer receipt={{ ...run.steps[0].receipt, text: run.steps[0].receipt.text }} language={language} /> : <RunSheet key={run.id} run={run} language={language} busy={busy} error={error}
                  onCommand={(body, clickKey) => void send(body, clickKey)} chrome={requestText ? "compact" : "full"}
                  headingLevel={heading === "none" ? 2 : 3} requestText={requestText} onRephrase={fill} examples={examples} connection={connection} onCheckNow={checkNow}
                  questionsInComposer={answering} />}
              </AiTurn>
              </div>
            ) : null}

            {startError ? <Alert tone="danger" data-ai-error={startError}>{errorWords(startError, language)}</Alert> : null}
          </div>


        </div>

      </div>
      </div>
      <div className={styles.composer} onPointerDown={() => setExpanded(true)} onFocusCapture={() => setExpanded(true)}>
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
    </section>
    {historyOpen ? (
      <Modal title={t(UI, "history", language)} icon={History} size="lg" dir={dir} onClose={() => setHistoryOpen(false)}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-4">
            <CanDoLink label={t(UI, "canDoTitle", language)} />
            <Link href="/ai/knowledge" className={buttonVariants({ variant: "ghost", size: "sm" })}>{language === "ur" ? "معلوماتی لائبریری" : language === "ar" ? "مكتبة المعرفة" : "Knowledge library"}</Link>
            <InboxCountChip />
          </div>
          <AskRecent language={language} currentId={run?.id ?? null} refreshKey={run ? `${run.id}:${run.status}` : null} onOpen={openRun} />
        </div>
      </Modal>
    ) : null}
    </div>
  );
}
