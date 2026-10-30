/**
 * Charter Desk CSS guard: every motion in the "Setup · Charter Desk" block of
 * globals.css has an explicit reduced-motion off-switch, the block covers
 * forced colors, and nothing in it loops forever.
 *   node --import tsx --test tests/onboarding/charter-css.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const HEADER = "═══ Setup · Charter Desk";
const start = css.indexOf(HEADER);
const next = css.indexOf("/* ═══", start + HEADER.length);
const block = css.slice(start, next < 0 ? css.length : next);

type Rule = { selectors: string[]; body: string; media: string[] };

/** A small CSS walker: leaf rules with the at-rule stack they sit in. Comments are dropped first. */
function rules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const stack: string[] = [];
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const prelude = text.slice(cursor, i).trim();
      const close = matching(text, i);
      const inner = text.slice(i + 1, close);
      if (prelude.startsWith("@keyframes")) {
        // keyframe selectors are not rules
      } else if (prelude.startsWith("@")) {
        stack.push(prelude);
        out.push(...rules(inner).map((rule) => ({ ...rule, media: [prelude, ...rule.media] })));
        stack.pop();
      } else {
        out.push({ selectors: prelude.split(",").map((s) => s.trim().replace(/\s+/g, " ")), body: inner, media: [] });
      }
      i = close;
      cursor = close + 1;
    } else if (ch === ";" && stack.length === 0) {
      cursor = i + 1;
    }
  }
  return out;
}

function matching(text: string, open: number) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces in globals.css");
}

const all = rules(block);
const isReduce = (rule: Rule) => rule.media.some((m) => /prefers-reduced-motion:\s*reduce/.test(m));
const isForced = (rule: Rule) => rule.media.some((m) => /forced-colors:\s*active/.test(m));

test("the Setup · Charter Desk block exists and appends after the signup view-transition section", () => {
  assert.ok(start > 0, "block header present");
  assert.ok(start > css.indexOf("::view-transition-group(sk-step-card)"), "after the view-transition section");
  assert.ok(all.length > 100, "the block has its rules");
});

test("every animation and transition in the block has a reduced-motion off-switch", () => {
  const reduce = all.filter(isReduce);
  assert.ok(reduce.length > 0, "the block has a reduced-motion @media");
  const off = new Set(reduce.filter((rule) => /\b(animation|transition)\s*:\s*none\s*!important/.test(rule.body)).flatMap((rule) => rule.selectors));
  const moving = all.filter((rule) => !isReduce(rule) && !isForced(rule))
    .filter((rule) => /(^|[;\s])(animation|transition)\s*:\s*(?!none)/.test(rule.body));
  assert.ok(moving.length >= 10, "the block's motions were found");
  for (const rule of moving) {
    for (const selector of rule.selectors) {
      assert.ok(off.has(selector), `reduced motion switches off ${selector}`);
    }
  }
});

test("the block covers forced colors", () => {
  const forced = all.filter(isForced);
  assert.ok(forced.length >= 10, "a forced-colors @media with its rules");
  const covered = forced.flatMap((rule) => rule.selectors).join("\n");
  for (const cls of [".sk-option", ".sk-option-radio", ".sk-rail-dot", ".sk-rail-ink", ".sk-seal-slot", ".sk-capacity [data-cell]", ".sk-weekday", ".sk-step-dock", ".sk-setup-bar", ".sk-charter-article", ".sk-step-title::after"]) {
    assert.ok(covered.includes(cls), `forced colors cover ${cls}`);
  }
});

test("nothing in the block loops forever", () => {
  assert.doesNotMatch(block, /\binfinite\b/, "no infinite iteration anywhere in the block");
  for (const match of block.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const body = block.slice(match.index ?? 0, matching(block, (match.index ?? 0) + match[0].length - 1) + 1);
    assert.doesNotMatch(body, /infinite/, `@keyframes ${match[1]}`);
  }
});

test("new sticky chrome never blurs what is behind it", () => {
  assert.doesNotMatch(block, /backdrop-filter/, "no backdrop-filter on the setup bar or dock (slow in Android WebView)");
});
