import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const SENTENCE_END = /(?<=[.!?؟۔])\s+/u;

const STRONG_MAX_WORDS = 3;
const STRONG_MAX_CHARS = 18;   // keeps the strong phrase on one line, so the swash fits it

/**
 * Splits a headline into the Front Desk's light lead and bold strong phrase:
 * the longest ending of the last sentence that stays short — "Your school. |
 * Brought to life.", "Choose your first | coordination task" — and never the
 * whole line. Works for English, Arabic and Urdu.
 */
export function splitHeadline(text: string): { light: string; strong: string } {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return { light: "", strong: words.join(" ") };
  const lastSentence = text.trim().split(SENTENCE_END).at(-1)!.split(/\s+/).length;
  let count = Math.min(STRONG_MAX_WORDS, lastSentence, words.length - 1);
  while (count > 1 && words.slice(-count).join(" ").length > STRONG_MAX_CHARS) count--;
  return { light: words.slice(0, -count).join(" "), strong: words.slice(-count).join(" ") };
}

const delay = (ms: number) => ({ ["--sk-delay" as string]: `${ms}ms` }) as CSSProperties;

/**
 * The Front Desk editorial headline (AuthCover's heading, for any surface):
 * a light lead, a bold strong phrase and the berry ink swash drawn once under
 * it. `swashKey` replays the swash without remounting the heading, so focus
 * and refs survive a line change. Size comes from the caller's className.
 */
export function InkHeading({ text, as: Tag = "h1", className, swashKey, ref, ...props }: {
  text: string; as?: "h1" | "h2"; swashKey?: string | number; ref?: Ref<HTMLHeadingElement>;
} & Omit<HTMLAttributes<HTMLHeadingElement>, "children">) {
  const { light, strong } = splitHeadline(text);
  return <Tag ref={ref} className={cn("sk-ink-heading", className)} {...props}>
    {light ? `${light} ` : null}
    <strong className="relative inline-block max-w-full">
      {strong}
      <svg key={swashKey} className="sk-ink-underline sk-ink-mirror" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="sk-ink-draw" style={delay(260)} pathLength={1} strokeWidth="3.4" d="M4 11.6C48 6.4 112 4.6 196 6.4" />
        <path className="sk-ink-draw" style={delay(480)} pathLength={1} strokeWidth="2.1" opacity="0.7" d="M26 13.8C78 10.2 134 9.6 180 11.2" />
      </svg>
    </strong>
  </Tag>;
}
