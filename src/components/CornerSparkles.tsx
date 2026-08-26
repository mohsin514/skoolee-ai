"use client";

/**
 * Twelve twinkling dots around the corners of a card.
 *
 * The keyframes and the base rule live in globals.css under `.sk-sparkle`.
 * They used to be inlined here, which meant every mounted instance injected
 * another copy of the same `<style>` block into the document — the AI screen
 * alone mounts three — and the dots animated forever even for viewers who ask
 * for reduced motion. Both are now handled once, in CSS.
 */

const DOTS = [
  { t: "4px", l: "4px", d: 0 },
  { t: "4px", r: "4px", d: 0.6 },
  { b: "4px", l: "4px", d: 1.2 },
  { b: "4px", r: "4px", d: 1.8 },
  { t: "20px", l: "4px", d: 0.9 },
  { t: "4px", l: "20px", d: 0.3 },
  { t: "20px", r: "4px", d: 1.5 },
  { t: "4px", r: "20px", d: 2.1 },
  { b: "20px", l: "4px", d: 0.5 },
  { b: "4px", l: "20px", d: 1.1 },
  { b: "20px", r: "4px", d: 1.7 },
  { b: "4px", r: "20px", d: 2.3 },
] as const;

export function CornerSparkles({ color = "#8127cf" }: { color?: string }) {
  return (
    <span aria-hidden>
      {DOTS.map((p, i) => (
        <span
          key={i}
          className="sk-sparkle"
          style={
            {
              top: "t" in p ? p.t : undefined,
              left: "l" in p ? p.l : undefined,
              right: "r" in p ? p.r : undefined,
              bottom: "b" in p ? p.b : undefined,
              "--sk-sparkle-duration": `${1.5 + (i % 3) * 0.5}s`,
              "--sk-sparkle-delay": `${p.d}s`,
            } as React.CSSProperties
          }
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 0L7.35 4.65L12 6L7.35 7.35L6 12L4.65 7.35L0 6L4.65 4.65Z" fill={color} />
            <path d="M6 2L6.9 5.1L10 6L6.9 6.9L6 10L5.1 6.9L2 6L5.1 5.1Z" fill="white" opacity="0.7" />
          </svg>
        </span>
      ))}
    </span>
  );
}
