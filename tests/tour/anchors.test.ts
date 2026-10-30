/**
 * Spotlight tour anchors (SPEC §9.4): every step points at a control something actually renders.
 *   node --import tsx --test tests/tour/anchors.test.ts
 *   TOUR_ANCHORS_STRICT=1 node --import tsx --test tests/tour/anchors.test.ts   (integration gate, §12 step 2)
 *
 * Shell and page anchors are emitter patterns (RoleHeader, RoleSidebar from registry ids, HelpMenu, PageHeader,
 * ViewTabs); their registry ids must exist in ROLE_NAV. Feature anchors are literal data-tour attributes placed by
 * the package that owns the screen. Until every package has landed, a missing feature anchor is reported, not
 * failed; with TOUR_ANCHORS_STRICT=1 it fails, and fixed shell/page anchors must be emitted literally too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { TOURS, TOUR_IDS, resolveTour, type TourStep } from "../../src/lib/onboarding/tours";
import { ANCHOR_FORMAT, FEATURE_ANCHORS, PAGE_ANCHORS, SHELL_ANCHORS, isShellOrPageAnchor } from "../../src/lib/onboarding/tours/anchors";
import { ROLE_NAV, leaves, type ConsoleId } from "../../src/lib/navigation/role-nav";

const STRICT = process.env.TOUR_ANCHORS_STRICT === "1";
const ROOT = process.cwd();
/** The tour definitions mention every anchor; they must never satisfy their own check. */
const SELF = join("src", "lib", "onboarding", "tours") + sep;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !relative(ROOT, path).startsWith(SELF)) out.push(path);
  }
  return out;
}

/**
 * Literal values found inside data-tour attributes — data-tour="x", data-tour={"x"}, data-tour={cond ? "x" : undefined}
 * — and inside the shared FlagshipCard's `tourAnchor` prop, which it renders as data-tour (addendum 2026-10-22).
 */
function emittedLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:data-tour|tourAnchor)=(?:"([^"]+)"|\{([^}]*)\})/g)) {
      const values = match[1] ? [match[1]] : [...(match[2] ?? "").matchAll(/["'`]([a-z0-9.-]+)["'`]/g)].map((m) => m[1]);
      for (const value of values) found.set(value, [...(found.get(value) ?? []), relative(ROOT, file)]);
    }
  }
  return found;
}

/** Any quoted occurrence (fixed shell anchors may be passed through a prop such as Menu's `anchor`). */
function quotedAnywhere(value: string): boolean {
  const needle = new RegExp(`["'\`]${value.replace(/[.-]/g, "\\$&")}["'\`]`);
  return sourceFiles(join(ROOT, "src")).some((file) => needle.test(readFileSync(file, "utf8")));
}

const everything = new Proxy({} as Record<string, boolean>, { get: () => true });

/** Desktop anchors as authored plus the mobile anchors the resolver derives (slots or More). */
function anchorsOf(id: (typeof TOUR_IDS)[number]): Array<{ anchor: string; step: TourStep; console: ConsoleId }> {
  const def = TOURS[id];
  const out = def.steps.map((step) => ({ anchor: step.anchor, step, console: def.console }));
  for (const step of def.steps) if (step.mobile?.anchor) out.push({ anchor: step.mobile.anchor, step, console: def.console });
  for (const step of resolveTour(def, { access: everything, mobile: true })) out.push({ anchor: step.anchor, step, console: def.console });
  return out;
}

const featureSet = new Set<string>(FEATURE_ANCHORS.map((f) => f.anchor));

test("every anchor is well formed and every feature anchor is in the inventory", () => {
  for (const f of FEATURE_ANCHORS) assert.match(f.anchor, ANCHOR_FORMAT, f.anchor);
  for (const a of [...SHELL_ANCHORS, ...PAGE_ANCHORS]) assert.match(a, ANCHOR_FORMAT, a);
  assert.equal(featureSet.size, FEATURE_ANCHORS.length, "feature anchors are unique");
  for (const id of TOUR_IDS) {
    for (const { anchor, step } of anchorsOf(id)) {
      assert.match(anchor, ANCHOR_FORMAT, `${id}.${step.id}: ${anchor}`);
      assert.ok(isShellOrPageAnchor(anchor) || featureSet.has(anchor), `${id}.${step.id}: ${anchor} is neither a shell/page pattern nor a listed feature anchor`);
    }
  }
});

test("registry anchors name real ids in the tour's own console", () => {
  for (const id of TOUR_IDS) {
    for (const { anchor, step, console } of anchorsOf(id)) {
      const nav = ROLE_NAV[console];
      const leaf = /^shell\.nav\.([a-z0-9-]+)$/.exec(anchor);
      if (leaf) assert.ok(leaves(nav).some((l) => l.id === leaf[1]), `${id}.${step.id}: no leaf "${leaf[1]}" in ${console}`);
      const group = /^shell\.nav-group\.([a-z0-9-]+)$/.exec(anchor);
      if (group) assert.ok(nav.entries.some((e) => e.kind === "group" && e.id === group[1]), `${id}.${step.id}: no group "${group[1]}" in ${console}`);
      const slot = /^shell\.mobile\.([a-z0-9-]+)$/.exec(anchor);
      if (slot && slot[1] !== "more") assert.ok(leaves(nav).some((l) => l.id === slot[1] && (l.mobile || l.mobileWhen)), `${id}.${step.id}: "${slot[1]}" is not a mobile slot in ${console}`);
      if (anchor.startsWith("page.")) assert.ok((PAGE_ANCHORS as readonly string[]).includes(anchor) || /^page\.tab\.[a-z0-9-]+$/.test(anchor), `${id}.${step.id}: unknown page anchor ${anchor}`);
      if (anchor.startsWith("shell.") && !leaf && !group && !slot) {
        assert.ok((SHELL_ANCHORS as readonly string[]).includes(anchor) || featureSet.has(anchor), `${id}.${step.id}: unknown shell anchor ${anchor}`);
      }
    }
  }
});

test(`feature anchors are emitted as literal data-tour attributes${STRICT ? " (strict)" : " (reported until integration)"}`, (t) => {
  const emitted = emittedLiterals();
  const used = new Map<string, string[]>();
  for (const id of TOUR_IDS) for (const { anchor, step } of anchorsOf(id)) {
    if (featureSet.has(anchor)) used.set(anchor, [...new Set([...(used.get(anchor) ?? []), `${id}.${step.id}`])]);
  }
  const missing = [...used.keys()].filter((anchor) => !emitted.has(anchor));
  for (const anchor of missing) {
    const owner = FEATURE_ANCHORS.find((f) => f.anchor === anchor)!;
    t.diagnostic(`missing data-tour="${anchor}" (owner ${owner.owner}: ${owner.emitter}; used by ${used.get(anchor)!.join(", ")})`);
  }
  if (STRICT) assert.deepEqual(missing, [], "every feature anchor a step uses is rendered somewhere in src/");
  // An anchor emitted from more than one file is fine (desktop and mobile layouts); within one file uniqueness is
  // the check:ui hard rule (§8.4.6).
});

test(`fixed shell and page anchors have an emitter${STRICT ? " (strict)" : " (reported until integration)"}`, (t) => {
  const fixed = new Set<string>();
  for (const id of TOUR_IDS) for (const { anchor } of anchorsOf(id)) {
    if ((SHELL_ANCHORS as readonly string[]).includes(anchor) || (PAGE_ANCHORS as readonly string[]).includes(anchor)) fixed.add(anchor);
  }
  const emitted = emittedLiterals();
  const missing = [...fixed].filter((anchor) => !emitted.has(anchor) && !quotedAnywhere(anchor));
  for (const anchor of missing) t.diagnostic(`no emitter found for ${anchor}`);
  if (STRICT) assert.deepEqual(missing, []);
});

test("the help step closes every tour and no tour points at the notification bell in v1", () => {
  for (const id of TOUR_IDS) {
    const anchors = TOURS[id].steps.map((s) => s.anchor);
    assert.equal(anchors.at(-1), "shell.header.help", id);
    assert.ok(!anchors.includes("shell.header.notifications"), id);
  }
});
