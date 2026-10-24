"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdHint } from "@/components/ui/kbd";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { UI, t, type Lang } from "./run-copy";
import { runText } from "./run-links";
import { isComposing } from "./run-questions";
import { Num, useWorkflowFormat } from "./workflow-format";

export const ASK_MAX = 8000;
const ANSWER_MAX = 4000;
const COUNTER_FROM = 7000;
const WARN_FROM = 7800;
const ROTATE_MS = 4000;

/** True when a keypress belongs to a field the person is typing in (so "/" must not steal it). */
function typingElsewhere(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The Ask field: one rounded card with the AI mark, the field and the send button. Enter or
 * Cmd/Ctrl+Enter sends, Shift+Enter is a new line, nothing sends while an IME is composing, and "/"
 * jumps here from anywhere on the page that is not a field. While a request starts the field stays
 * focused (read-only) so focus never drops to the page.
 *
 * The placeholder cycles through the role's examples while the field is empty and unfocused (never
 * under reduced motion). Keyboard hints show only while focused with a fine pointer; otherwise the
 * footer says how AI acts, in words that stay true for steps that run on their own.
 */
export function AskComposer({ value, onChange, onSubmit, starting, language, labelledBy, examples, fieldRef, mode = "ask", banner }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; starting: boolean; language: Lang;
  labelledBy?: string; examples?: string[]; fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  /** "answer": the run asked a question; the same box sends the reply (same answer command as the question card). */
  mode?: "ask" | "answer";
  /** A strip above the field, e.g. "Answering Skoolee's question · Ask something new instead". */
  banner?: React.ReactNode;
}) {
  const answering = mode === "answer";
  const max = answering ? ANSWER_MAX : ASK_MAX;
  const format = useWorkflowFormat();
  const hintId = useId();
  const length = value.length;
  const ready = Boolean(value.trim());
  const level = answering ? (length >= max - 200 ? 2 : length >= max - 1000 ? 1 : 0) : length >= WARN_FROM ? 2 : length >= COUNTER_FROM ? 1 : 0;
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const lastLevel = useRef(0);
  const pool = examples?.filter(Boolean) ?? [];

  useEffect(() => {
    if (level > lastLevel.current) setAnnouncement(runText("charsNear", language, format.count(length), format.count(max)));
    lastLevel.current = level;
    // Announce on crossing a threshold only, not on every keystroke.
  }, [level]);

  // Cycle the placeholder through the examples only while nobody is typing.
  useEffect(() => {
    if (answering || pool.length < 2 || focused || value || prefersReducedMotion()) return;
    const timer = window.setInterval(() => setExampleIndex(index => (index + 1) % pool.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [answering, pool.length, focused, value]);

  // "/" focuses Ask, unless the person is typing somewhere else or holding a modifier.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.defaultPrevented) return;
      if (typingElsewhere(event.target)) return;
      const field = fieldRef.current;
      if (!field) return;
      event.preventDefault();
      field.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fieldRef]);

  // Auto-grow where `field-sizing: content` is not supported.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content"))) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 256)}px`;
  }, [value, fieldRef]);

  const example = pool.length ? pool[exampleIndex % pool.length] : null;
  const placeholder = answering ? runText("answerPlaceholder", language) : example ? runText("askPlaceholderExample", language, example) : t(UI, "askPlaceholder", language);
  // An empty field: the button invites typing instead of looking switched off.
  const send = () => { if (ready) onSubmit(); else fieldRef.current?.focus(); };

  return (
    <div
      data-field-shell data-ready={ready || undefined} data-mode={mode}
      className={cn(
        "group/ask rounded-3xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-(--duration-control)",
        (starting || answering) && "border-brand-300 shadow-glow",
      )}
    >
      {banner ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-100 bg-brand-50/70 px-3 py-2 text-xs sm:px-4">{banner}</div> : null}
      {/* One surface: the input group strips the field's own border, so there is no box inside the box. */}
      <div className="sk-input-group flex items-start pt-3 sm:pt-4">
        <span
          aria-hidden="true"
          className={cn(
            "order-first ms-3 mt-1 flex size-9 shrink-0 sm:ms-4 items-center justify-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-200/70 transition-colors duration-(--duration-control)",
            "group-focus-within/ask:bg-primary group-focus-within/ask:text-primary-foreground group-focus-within/ask:ring-primary",
            starting && "motion-safe:animate-pulse-subtle",
          )}
        >
          <Sparkles className="size-4" />
        </span>
        <Textarea
          ref={fieldRef} data-ai-request={answering ? undefined : ""} data-ai-answer={answering ? "" : undefined} value={value} rows={2} maxLength={max} dir="auto" enterKeyHint="send"
          readOnly={starting} aria-busy={starting || undefined}
          placeholder={placeholder} aria-labelledby={answering ? undefined : labelledBy} aria-label={answering ? runText("yourAnswer", language) : labelledBy ? undefined : t(UI, "askTitle", language)} aria-describedby={hintId}
          className="min-h-[4.5rem] max-h-64 resize-none overflow-y-auto pt-2 pb-1 text-base leading-relaxed [field-sizing:content] placeholder:text-ink-faint"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || isComposing(event)) return;
            if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            onSubmit();
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle px-3 py-2.5 sm:px-4">
        <p id={hintId} className="flex min-w-0 flex-1 basis-56 items-center gap-1.5 text-xs text-ink-muted">
          <span className="sr-only">{t(UI, "askHint", language)} </span>
          {focused ? (
            <KbdHint className="flex-wrap">
              <Kbd>Enter</Kbd> {runText("kbdSend", language)}
              <span className="px-1 text-ink-faint" aria-hidden="true">·</span>
              <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> {runText("kbdNewLine", language)}
            </KbdHint>
          ) : null}
          <span className={cn("inline-flex min-w-0 items-center gap-1.5", focused && "sk-ai-coarse-only")}>
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0">{runText("askTrust", language)}</span>
          </span>
        </p>
        {level > 0 ? (
          <span className={cn("text-2xs font-semibold tabular-nums", level === 2 ? "text-status-warning-text" : "text-ink-muted")}>
            <Num value={length} /> / <Num value={max} />
          </span>
        ) : null}
        <Button
          type="button" data-ai-start={answering ? undefined : ""} data-ai-answer-submit={answering ? "" : undefined} variant={ready || starting ? "default" : "outline"}
          className={cn("ms-auto min-h-11 min-w-28 rounded-2xl", !ready && !starting && "text-primary")}
          loading={starting} disabled={starting} aria-disabled={!ready || undefined} onClick={send}
        >
          {starting ? null : <ArrowUp aria-hidden="true" className={cn("transition-transform duration-(--duration-control)", ready && "motion-safe:group-focus-within/ask:-translate-y-0.5")} />}
          {answering ? t(UI, "answer", language) : t(UI, "send", language)}
        </Button>
      </div>
      <LiveAnnouncer message={announcement} />
    </div>
  );
}
