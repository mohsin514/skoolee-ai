"use client";
import { useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { FieldError } from "./form-field";
import { LiveAnnouncer } from "./live-announcer";
import { TruncatedText } from "./truncated-text";

const WORDS = {
  remove: { en: "Remove {0}", ar: "إزالة {0}", ur: "{0} ہٹائیں" },
  removed: { en: "Removed {0}", ar: "أُزيل {0}", ur: "{0} ہٹا دیا گیا" },
  invalid: { en: "That doesn't look right. Check it and try again.", ar: "يبدو هذا غير صحيح. راجعه وحاول مجدداً.", ur: "یہ درست نہیں لگتا۔ دیکھ کر دوبارہ کوشش کریں۔" },
  duplicate: { en: "Already in the list.", ar: "موجود في القائمة بالفعل.", ur: "پہلے سے فہرست میں ہے۔" },
  limit: { en: "Limit reached", ar: "بلغت الحد", ur: "حد پوری ہو گئی" },
} as const;
const fill = (text: string, value: string) => text.replace("{0}", value);

/** A URL tag shows its host; the full value stays in the tooltip. */
function display(tag: string): string {
  if (!/^https?:\/\//i.test(tag)) return tag;
  try { const url = new URL(tag); return url.host + (url.pathname.length > 1 ? url.pathname : ""); } catch { return tag; }
}

/**
 * Free tags with optional suggestions. Enter, a comma or the Arabic comma adds; each tag has its own
 * 44px remove target. A duplicate keeps the typed text, says why and shakes the chip it repeats.
 */
export function TagList({ value, onChange, max, placeholder, suggestions = [], validate, label, className, removeLabel, invalidMessage, duplicateMessage }: {
  value: string[]; onChange: (value: string[]) => void; max: number; placeholder?: string; suggestions?: string[]; validate?: (tag: string) => boolean; label: string; className?: string;
  removeLabel?: (tag: string) => string; invalidMessage?: string; duplicateMessage?: string;
}) {
  const { language } = useLocale();
  const format = useLocaleFormat();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<"invalid" | "duplicate" | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const messageId = useId();
  const add = (raw: string) => {
    const tag = raw.trim().replace(/[,،]+$/, "").trim();
    if (!tag || value.length >= max) return setDraft("");
    if (value.includes(tag)) {
      setProblem("duplicate"); setShaking(null);
      window.requestAnimationFrame(() => setShaking(tag));
      return;
    }
    if (validate && !validate(tag)) return setProblem("invalid");
    onChange([...value, tag]); setDraft(""); setProblem(null);
  };
  const remove = (tag: string) => {
    onChange(value.filter(item => item !== tag));
    setAnnounce(fill(WORDS.removed[language], tag));
    input.current?.focus();
  };
  const open = suggestions.filter(item => !value.includes(item));
  const full = value.length >= max;
  const message = problem === "invalid" ? invalidMessage ?? WORDS.invalid[language] : problem === "duplicate" ? duplicateMessage ?? WORDS.duplicate[language] : null;
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div data-field-shell data-invalid={problem === "invalid" || undefined} className="flex min-h-12 min-w-0 flex-wrap items-center gap-2 rounded-2xl border p-2" onClick={event => { if (event.target === event.currentTarget) input.current?.focus(); }}>
        {value.map(tag => (
          <span key={tag} className={cn("inline-flex min-w-0 max-w-full items-center gap-1 rounded-xl bg-surface-selected py-1 ps-2.5 pe-1 text-sm font-medium text-ink-strong [overflow-wrap:anywhere]", shaking === tag && "sk-shake")} onAnimationEnd={() => setShaking(null)}>
            <TruncatedText text={display(tag)} className="max-w-[16rem]" />
            <button type="button" className="relative grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors duration-(--duration-control) after:absolute after:-inset-1.5 after:content-[''] hover:bg-surface-hover hover:text-primary"
              aria-label={removeLabel ? removeLabel(tag) : fill(WORDS.remove[language], tag)} onClick={() => remove(tag)}><X className="size-4" aria-hidden /></button>
          </span>
        ))}
        {!full && (
          <input
            ref={input} dir="auto" aria-label={label} aria-invalid={problem === "invalid" || undefined} aria-describedby={message ? messageId : undefined}
            placeholder={value.length ? "" : placeholder} value={draft}
            className="min-h-9 min-w-32 flex-1 bg-transparent px-1 text-base"
            onChange={event => { const next = event.target.value; setDraft(next); setProblem(null); if (/[,،]$/.test(next)) add(next); }}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft); } else if (event.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]); }}
            onBlur={() => { if (draft && problem !== "duplicate") add(draft); }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><FieldError id={messageId}>{message}</FieldError></div>
        {max > 1 && (
          <span className={cn("text-2xs font-medium", full ? "text-primary" : "text-ink-muted")}>
            <bdi data-numeric className="tabular-nums">{format.number(value.length, 0)} / {format.number(max, 0)}</bdi>{full && <> · {WORDS.limit[language]}</>}
          </span>
        )}
      </div>
      {open.length > 0 && !full && (
        <div className="flex flex-wrap gap-2">{open.slice(0, 8).map(item => (
          <button key={item} type="button" className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-sm text-ink transition-colors duration-(--duration-control) hover:border-primary hover:bg-surface-hover hover:text-primary" onClick={() => add(item)}>
            <Plus className="size-4 shrink-0" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]" dir="auto">{item}</span>
          </button>
        ))}</div>
      )}
      <LiveAnnouncer message={announce} />
    </div>
  );
}
