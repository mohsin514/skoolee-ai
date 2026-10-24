"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
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
const COUNTER_FROM = 7000;
const WARN_FROM = 7800;

/** True when a keypress belongs to a field the person is typing in (so "/" must not steal it). */
function typingElsewhere(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The Ask field: one rounded field card with the send button at its end. Enter or Cmd/Ctrl+Enter
 * sends, Shift+Enter is a new line, nothing sends while an IME is composing, and "/" jumps here
 * from anywhere on the page that is not a field. While a request starts the field stays focused
 * (read-only) so focus never drops to the page.
 */
export function AskComposer({ value, onChange, onSubmit, starting, language, labelledBy, placeholder, fieldRef }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; starting: boolean; language: Lang;
  labelledBy?: string; placeholder: string; fieldRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const format = useWorkflowFormat();
  const hintId = useId();
  const length = value.length;
  const level = length >= WARN_FROM ? 2 : length >= COUNTER_FROM ? 1 : 0;
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const lastLevel = useRef(0);

  useEffect(() => {
    if (level > lastLevel.current) setAnnouncement(runText("charsNear", language, format.count(length), format.count(ASK_MAX)));
    lastLevel.current = level;
    // Announce on crossing a threshold only, not on every keystroke.
  }, [level]);

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

  return (
    <div data-field-shell className="rounded-3xl bg-card shadow-sm">
      <div className="sk-input-group flex">
        <Textarea
          ref={fieldRef} data-ai-request value={value} rows={3} maxLength={ASK_MAX} dir="auto" enterKeyHint="send"
          readOnly={starting} aria-busy={starting || undefined}
          placeholder={placeholder} aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : t(UI, "askTitle", language)} aria-describedby={hintId}
          className="min-h-[5.5rem] max-h-64 resize-none overflow-y-auto px-4 pt-4 pb-2 text-base sm:px-5 [field-sizing:content]"
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || isComposing(event)) return;
            if (event.shiftKey && !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            onSubmit();
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-4">
        <p id={hintId} className="min-w-0 flex-1 text-2xs text-ink-muted">
          <span className="sr-only">{t(UI, "askHint", language)}</span>
          <KbdHint className="flex-wrap">
            <Kbd>Enter</Kbd> {runText("kbdSend", language)}
            <span className="px-1 text-ink-faint">·</span>
            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> {runText("kbdNewLine", language)}
            <span className="px-1 text-ink-faint">·</span>
            <Kbd>/</Kbd> {runText("kbdFocus", language)}
          </KbdHint>
        </p>
        {level > 0 ? (
          <span className={cn("text-2xs font-semibold tabular-nums", level === 2 ? "text-status-warning-text" : "text-ink-muted")}>
            <Num value={length} /> / <Num value={ASK_MAX} />
          </span>
        ) : null}
        <Button type="button" data-ai-start className="ms-auto min-w-24" loading={starting} disabled={starting || !value.trim()} onClick={onSubmit}>
          {starting ? null : <ArrowUp aria-hidden="true" />}
          {t(UI, "send", language)}
        </Button>
      </div>
      <LiveAnnouncer message={announcement} />
    </div>
  );
}
