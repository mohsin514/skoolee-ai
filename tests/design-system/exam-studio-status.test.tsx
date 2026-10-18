import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { STUDIO_STATUS_FAMILY, StudioStatus, type StudioStatusFamily } from "../../src/components/school-ai/exam-studio/studio-status";
import { STUDIO_STATUS_TOKENS, studioStatusLabel } from "../../src/lib/school-ai/exam-studio-copy";

const LANGUAGES = ["en", "ar", "ur"] as const;
const SOURCE = "src/components/school-ai/exam-studio/studio-status.tsx";
/** Text with every tag — and therefore every class — removed: what survives is not carried by colour. */
const words = (html: string) => html.replace(/<[^>]*>/g, "");
const iconName = (html: string) => html.match(/lucide lucide-([a-z0-9-]+)/)?.[1] ?? "";
const rootClasses = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
const colourClasses = (html: string) => rootClasses(html).filter((name) => /^(?:bg|border|text|shadow)-/.test(name) && name !== "text-xs").sort();

// R23.9: every state conveyed by colour carries an additional text or icon indicator. Strip the
// markup and the state must still be named; two tokens of one colour family must still differ.
test("each of the sixteen status tokens renders its own word and its own icon in every language", () => {
  assert.equal(STUDIO_STATUS_TOKENS.length, 16);
  for (const language of LANGUAGES) {
    const icons = new Set<string>();
    for (const token of STUDIO_STATUS_TOKENS) {
      const html = renderToStaticMarkup(<StudioStatus token={token} language={language} />);
      const word = studioStatusLabel(token, language);
      assert.notEqual(word, "");
      assert.equal(words(html), word, `${token}/${language} must read as its word with no markup`);
      assert.match(html, /<svg[^>]*aria-hidden="true"/, `${token} icon must be decorative beside its word`);
      assert.match(html, new RegExp(`data-studio-status="${token}"`));
      icons.add(iconName(html));
    }
    assert.equal(icons.size, 16, `${language}: one icon per token, never shared`);
    assert.ok(!icons.has(""));
  }
  // The non-English words really are translated, not an English fallback (R22.1).
  for (const language of ["ar", "ur"] as const) for (const token of STUDIO_STATUS_TOKENS) assert.match(studioStatusLabel(token, language), /[\u0600-\u06ff]/);
});

// R21.2 / R21.3: colour is the third channel and it comes only from values already recorded in
// docs/ui-plan/tokens-and-styles.md or from an existing Badge variant. Six meanings, five colour
// identities, no new palette.
test("colour comes only from the existing status, success, subtle-surface and Badge-variant tokens", () => {
  const expected: Record<StudioStatusFamily, string[]> = {
    neutral: ["bg-surface-subtle", "border-border-subtle", "text-ink"],
    review: ["bg-brand-50", "border-brand-200/70", "text-brand-700"],
    settled: ["bg-success/10", "border-success/30", "text-success"],
    sealed: ["bg-success", "border-transparent", "shadow-sm", "text-white"],
    attention: ["bg-status-warning-surface", "border-status-warning-border", "text-status-warning-text"],
    blocked: ["bg-status-error-surface", "border-status-error-border", "text-status-error-text"],
  };
  for (const token of STUDIO_STATUS_TOKENS) {
    const html = renderToStaticMarkup(<StudioStatus token={token} language="en" />);
    assert.deepEqual(colourClasses(html), [...expected[STUDIO_STATUS_FAMILY[token]]].sort(), `${token} colour treatment`);
  }
  assert.equal(new Set(Object.values(STUDIO_STATUS_FAMILY)).size, 6);
});

// R22.2: the icon/word pair must follow the document direction, so it is laid out by a flex row with
// a logical gap. A physical margin would pin the icon to the left in Arabic and Urdu. R21.8: the
// spinner is the vocabulary's only motion and a reduced-motion preference removes it.
test("spacing is direction-agnostic and the save spinner is the only motion", () => {
  for (const token of STUDIO_STATUS_TOKENS) {
    const html = renderToStaticMarkup(<StudioStatus token={token} language="ar" />);
    assert.match(html, /\bgap-1\.5\b/, `${token} must space icon and word with a logical gap`);
    assert.doesNotMatch(html, /\s-?m[lr]-\d|\s-?p[lr]-\d/, `${token} must not use a physical margin or padding`);
    const animations = html.match(/animate-[a-z-]+/g) ?? [];
    assert.deepEqual(animations, token === "SAVING" ? ["animate-spin"] : [], `${token} motion`);
    if (token === "SAVING") assert.match(html, /motion-safe:animate-spin/);
  }
});

// The task presentation must genuinely reuse the shared TaskStatus pill rather than restyle one, and
// must raise its `attention` look for exactly the families that owe the reader something.
test("the task presentation reuses the shared TaskStatus pill and flags what is owed", () => {
  for (const token of STUDIO_STATUS_TOKENS) {
    const html = renderToStaticMarkup(<StudioStatus token={token} language="en" presentation="task" />);
    const owed = STUDIO_STATUS_FAMILY[token] === "attention" || STUDIO_STATUS_FAMILY[token] === "blocked";
    // The shared pill's own geometry, with its own `attention` colours replacing its neutral ones —
    // nothing added, so a later change to TaskStatus still reaches Exam Studio.
    assert.deepEqual(rootClasses(html), `inline-flex items-center rounded-full border ${owed ? "" : "border-border-subtle bg-surface-subtle "}px-3 py-1.5 text-xs font-semibold ${owed ? "border-status-warning-border bg-status-warning-surface text-status-warning-text" : "text-ink"}`.split(" "), `${token} pill`);
    assert.equal(words(html), studioStatusLabel(token, "en"));
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
  }
});

// The vocabulary is reached from the server-rendered print output and Attempt_Receipt, so it must
// stay outside the client module graph: no "use client" directive and no locale-provider import.
// This test is itself the proof — it renders on the server with no client runtime.
test("the status vocabulary stays renderable on the server", () => {
  const code = readFileSync(SOURCE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /["']use client["']/);
  assert.doesNotMatch(code, /components\/locale\/LocaleProvider/);
  assert.doesNotMatch(code, /\buse[A-Z]\w*\(/, "a hook would force a client boundary");
  assert.match(renderToStaticMarkup(<StudioStatus token="SEALED" language="ur" />), /مہر شدہ/);
});
