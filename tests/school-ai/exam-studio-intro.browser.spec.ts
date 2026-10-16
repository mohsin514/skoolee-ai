import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STUDIO_INTRO_CEILING_MS, STUDIO_INTRO_DURATION_MS, STUDIO_INTRO_PHASES, STUDIO_INTRO_SESSION_KEY } from "../../src/components/school-ai/exam-studio/studio-intro";

// Feature: ai-exam-studio, Requirement 20 (Studio_Intro) — examples, not properties.
//
// The requirements document lists this as P25. Writing it as examples is the correct call rather
// than a shortcut: every claim in Requirement 20 is a fixed constant or a fixed input kind. The
// sequence is 1100 ms against an 1800 ms ceiling, the reduced-motion path is one animation frame
// against 200 ms, the skip inputs are exactly `pointerdown`, `keydown` and `wheel`/`scroll`, and the
// exclusions are four named surfaces. Nothing here varies with generated input, so a generator
// would add iterations without adding coverage.
//
// Two things are measured in the browser rather than read from source. Duration is one: a 1100 ms
// sequence is only 1100 ms if Framer Motion actually drives it, and `src/app/globals.css:723` does
// not reach JS-driven motion, so the reduced-motion claim cannot be proved from CSS. Exclusion is
// the other: R20.7 is asserted against the live attempt page and the live print response, plus an
// import census that no excluded module can pass.
//
// Everything is timed on one clock. `recorder()` installs a `MutationObserver`, capture-phase input
// listeners and a `fetch` wrapper before any application script runs, so overlay appearance, phase
// transitions, workspace state, input arrival and every request share `performance.now()`. No
// assertion depends on a Playwright-side stopwatch, which would fold in protocol round-trips.

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI test database.");

const origin = "http://localhost:3106";
const tokens = JSON.parse(readFileSync("test-results/school-ai/local-tokens.json", "utf8")) as Record<string, string>;
const fixture = JSON.parse(readFileSync("test-results/school-ai/exam-fixture.json", "utf8")) as { examId: string; paperId: string };
const signIn = (context: BrowserContext, role = "a-ADMIN") => context.addCookies([{ name: "skoolee_token", value: tokens[role], url: origin, httpOnly: true, sameSite: "Lax" }]);

/**
 * The surface that renders `StudioIntro`: `src/app/ai/studio-intro/page.tsx`, a non-production probe
 * that stands in for `exam-studio-shell.tsx` until task 3.2 lands. When the shell mounts the intro,
 * this constant is the only line that changes — every assertion below is about the intro itself.
 */
const STUDIO = "/ai/studio-intro";

interface FirstFrame {
  motion: string | null;
  phase: string | null;
  ariaHidden: string | null;
  marks: number;
  rings: number;
  markTransform: string;
  animations: number;
  pointerEvents: string;
  focusable: number;
}
interface Recorded {
  marks: { at: number; present: boolean; motion: string | null }[];
  phases: { at: number; phase: string | null; pointerEvents: string }[];
  workspace: { at: number; state: string | null }[];
  owner: { at: number; owner: string | null }[];
  requests: { at: number; url: string }[];
  inputs: { at: number; type: string }[];
  firstFrame: FirstFrame | null;
  /** One entry per animation frame: the watched computed styles of every node in the overlay. */
  styles: Record<string, string>[][];
  /** Every distinct position the workspace heading occupied while the overlay was on screen. */
  headings: string[];
}

/**
 * Appearance, layout and the two properties the sequence is allowed to touch. Sampling the computed
 * values is a stronger statement than reading a keyframe list: whatever the motion library chose to
 * drive the sequence with, these are the values that actually moved.
 */
const WATCHED = ["opacity", "transform", "width", "height", "marginTop", "marginLeft", "top", "left", "paddingTop", "borderTopWidth"];

/**
 * Installed before any application script. The first-frame snapshot is taken synchronously inside
 * the observer callback, which is what makes the reduced-motion claim checkable at all: that mark
 * lives for one animation frame, so a Playwright locator would be racing the frame it is trying to
 * read.
 */
function recorder(watched: string[]) {
  const log: Recorded = { marks: [], phases: [], workspace: [], owner: [], requests: [], inputs: [], firstFrame: null, styles: [], headings: [] };
  (window as unknown as { __intro: Recorded }).__intro = log;

  // Started from the observer the moment the overlay appears, so phase 1 is inside the samples
  // rather than already finished by the time the test runner could have asked.
  const sample = () => {
    const overlay = document.querySelector("[data-studio-intro]");
    const heading = document.querySelector("[data-probe='title']");
    if (heading) {
      const box = heading.getBoundingClientRect();
      const position = `${box.x},${box.y},${box.width},${box.height}`;
      if (!log.headings.includes(position)) log.headings.push(position);
    }
    if (overlay === null) return;
    log.styles.push(
      [overlay, ...overlay.querySelectorAll("*")].map((node) => {
        const style = getComputedStyle(node);
        return Object.fromEntries(watched.map((name) => [name, style.getPropertyValue(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))]));
      }),
    );
    requestAnimationFrame(sample);
  };

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    log.requests.push({ at: performance.now(), url: input instanceof Request ? input.url : String(input) });
    return original(input, init);
  };
  for (const type of ["pointerdown", "keydown", "wheel", "scroll"]) {
    document.addEventListener(type, () => log.inputs.push({ at: performance.now(), type }), { capture: true, passive: true });
  }

  const FOCUSABLE = "[data-studio-intro] a, [data-studio-intro] button, [data-studio-intro] input, [data-studio-intro] select, [data-studio-intro] textarea, [data-studio-intro] summary, [data-studio-intro] [tabindex], [data-studio-intro] [contenteditable]";
  let present: boolean | null = null;
  let phase: string | null | undefined;
  let state: string | null | undefined;
  let owner: string | null | undefined;
  const read = () => {
    const at = performance.now();
    const overlay = document.querySelector("[data-studio-intro]");
    const showing = overlay !== null;
    if (showing !== present) {
      log.marks.push({ at, present: showing, motion: overlay ? overlay.getAttribute("data-studio-intro") : null });
      present = showing;
      if (overlay && log.styles.length === 0) sample();
      if (overlay && log.firstFrame === null) {
        const mark = overlay.querySelector("[data-studio-intro-mark]");
        log.firstFrame = {
          motion: overlay.getAttribute("data-studio-intro"),
          phase: overlay.getAttribute("data-studio-intro-phase"),
          ariaHidden: overlay.getAttribute("aria-hidden"),
          marks: overlay.querySelectorAll("[data-studio-intro-mark]").length,
          rings: overlay.querySelectorAll("[data-studio-intro-ring]").length,
          markTransform: mark ? getComputedStyle(mark).transform : "missing",
          animations: overlay.getAnimations({ subtree: true }).length,
          pointerEvents: getComputedStyle(overlay).pointerEvents,
          focusable: document.querySelectorAll(FOCUSABLE).length,
        };
      }
    }
    const next = overlay ? overlay.getAttribute("data-studio-intro-phase") : null;
    if (overlay && next !== phase) {
      log.phases.push({ at, phase: next, pointerEvents: getComputedStyle(overlay).pointerEvents });
      phase = next;
    }
    const workspace = document.querySelector("[data-probe='workspace']")?.getAttribute("data-workspace-state") ?? null;
    if (workspace !== state) {
      log.workspace.push({ at, state: workspace });
      state = workspace;
    }
    const interaction = document.querySelector("[data-probe='owner']")?.getAttribute("data-interaction-owner") ?? null;
    if (interaction !== owner) {
      log.owner.push({ at, owner: interaction });
      owner = interaction;
    }
  };
  new MutationObserver(read).observe(document, { childList: true, subtree: true, attributes: true });
  read();
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __intro: Recorded }).__intro);
/** Appearance and removal of the overlay, on the page's own clock. */
function span(log: Recorded) {
  const shown = log.marks.find((entry) => entry.present);
  const hidden = shown === undefined ? undefined : log.marks.find((entry) => !entry.present && entry.at >= shown.at);
  return { shown, hidden };
}
const install = (page: Page) => page.addInitScript(recorder, WATCHED);
async function openStudio(page: Page, query = "") {
  await install(page);
  await page.goto(`${STUDIO}${query}`);
}
/** The watched properties whose computed value changed on any overlay node during the sequence. */
function moved(log: Recorded) {
  const names = new Set<string>();
  for (let index = 0; index < (log.styles[0]?.length ?? 0); index += 1) {
    for (const name of WATCHED) {
      if (new Set(log.styles.map((frame) => frame[index]?.[name])).size > 1) names.add(name);
    }
  }
  return [...names].sort();
}
/**
 * Waits in the page, on every animation frame, for the overlay to be on screen. A Playwright
 * locator assertion polls from the test runner, which samples a 1100 ms window and can step over
 * it; this resolves within a frame of the overlay committing, leaving the rest of the sequence to
 * work with.
 */
const onScreen = (page: Page) => page.waitForFunction(() => document.querySelector("[data-studio-intro]") !== null);

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

// The Playwright config sets `contextOptions.reducedMotion = "reduce"` for the whole suite, which is
// the right default for every other file. The animated path therefore asks for motion explicitly;
// without this block these tests would silently be exercising the static branch.
test.describe("with motion allowed", () => {
  // This Playwright version exposes the preference only through `contextOptions`, which is also how
  // `playwright.config.ts` sets the suite default — replacing the object replaces that one key.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the sequence plays its four phases, completes inside the ceiling and hands over interaction", async ({ page }) => {
    // R20.13, made deterministic. The real workspace response is fetched and then held back so it
    // lands mid sequence, which turns "continued loading while the intro played" into a timestamp
    // rather than an assumption. Both calls swallow their rejection so a failing assertion
    // elsewhere in the test reports itself rather than this handler unwinding over it.
    await page.route("**/api/school-ai/workspace", async (route) => {
      const response = await route.fetch().catch(() => null);
      if (response === null) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ response }).catch(() => undefined);
    });
    await openStudio(page);
    const overlay = page.locator("[data-studio-intro]");

    // Waiting in the page rather than polling from the test runner: the overlay lives for 1100 ms,
    // and a locator assertion would be sampling a window it can miss.
    await onScreen(page);

    // Read everything that needs the overlay on screen in one round trip, well inside the sequence.
    // `brand` is read from two throwaway elements painted from the brand custom properties, so the
    // colour assertion compares the overlay against the tokens rather than against a hex literal
    // copied out of `globals.css`.
    const identity = await page.evaluate(() => {
      const node = document.querySelector("[data-studio-intro]") as HTMLElement;
      const scrim = node.querySelector("div") as HTMLElement;
      const token = (name: string) => {
        const probe = document.createElement("div");
        // `color-mix(in oklab, …)` is how Tailwind v4 compiles an alpha modifier, and it is what
        // makes the computed value an `oklab()` triplet comparable with the gradient's stops.
        probe.style.backgroundColor = `color-mix(in oklab, var(${name}) 100%, transparent)`;
        document.body.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      return {
        motion: node.getAttribute("data-studio-intro"),
        font: getComputedStyle(node).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
        wash: getComputedStyle(scrim).backgroundImage,
        brand: [token("--brand-1"), token("--brand-2")].join(" "),
        layer: getComputedStyle(node).zIndex,
      };
    });

    expect(identity.motion).toBe("sequence"); // R20.1
    // R20.11. The overlay inherits the document font, so no new font is introduced, and every
    // colour stop in the wash is one of the two existing brand tokens. Alpha is dropped from the
    // comparison: the alpha is the overlay's own opacity, the triplet is the identity.
    const stops = (value: string) => [...new Set([...value.matchAll(/oklab\(([^)]+)\)/g)].map((match) => match[1].split("/")[0].trim()))].sort();
    expect(identity.font).toBe(identity.body);
    expect(stops(identity.brand), "the brand tokens resolve").toHaveLength(2);
    expect(stops(identity.wash)).toEqual(stops(identity.brand));
    // Below the shared 1200 modal base in `src/components/ui/modal.tsx`, so a dialog is never
    // covered by a brand animation.
    expect(Number(identity.layer)).toBeLessThan(1200);

    await expect(overlay).toHaveCount(0, { timeout: STUDIO_INTRO_CEILING_MS * 3 });

    const log = await recorded(page);

    // Only `opacity`, `scale` and `y` are animated, and `scale`/`y` are `transform`, so nothing the
    // sequence touches can reflow the workspace. The sampling started inside the observer callback
    // at the overlay's first frame, so phase 1 is inside the window too.
    expect(log.styles.length, "the overlay was sampled across the sequence").toBeGreaterThan(5);
    expect(moved(log)).toEqual(["opacity", "transform"]);
    // And nothing underneath moved while all that was happening.
    expect(log.headings, "the workspace heading never moved").toHaveLength(1);

    const { shown, hidden } = span(log);
    expect(shown, "the overlay was observed").toBeDefined();
    expect(hidden, "the overlay was removed").toBeDefined();
    const elapsed = hidden!.at - shown!.at;

    // R20.2. The ceiling is the contract, 1100 ms is the build. Asserting both keeps a later change
    // honest: it may not creep past 1800 ms, and it may not quietly become 1700 ms either.
    expect(elapsed).toBeLessThanOrEqual(STUDIO_INTRO_CEILING_MS);
    expect(STUDIO_INTRO_DURATION_MS).toBe(1100);
    expect(STUDIO_INTRO_CEILING_MS - STUDIO_INTRO_DURATION_MS).toBe(700);
    expect(elapsed).toBeGreaterThanOrEqual(STUDIO_INTRO_DURATION_MS * 0.8);

    // R20.1. All four phases, in the recorded order. Phase 1 is the state the overlay appears in.
    expect(log.phases.map((entry) => entry.phase)).toEqual(STUDIO_INTRO_PHASES.map((entry) => String(entry.phase)));
    // The design's "pointer-events: none from phase 3": while the brand moment owns the screen an
    // accidental click is spent on skipping, and once the workspace is visible beneath, the overlay
    // is inert (R20.9 for the surface it covers).
    for (const entry of log.phases) expect(entry.pointerEvents, `phase ${entry.phase}`).toBe(Number(entry.phase) >= 3 ? "none" : "auto");

    // R20.2 and R20.1. Completion is where the studio takes over, not merely where the overlay
    // stops painting.
    const handover = log.owner.find((entry) => entry.owner === "studio");
    expect(handover).toBeDefined();
    expect(handover!.at).toBeGreaterThanOrEqual(shown!.at);
    expect(handover!.at - hidden!.at).toBeLessThanOrEqual(100);
    await expect(page.locator("[data-probe='action']")).toBeFocused();

    // R20.13. The workspace request went out with the mount, not after the sequence, and resolved
    // while the overlay was still on screen.
    const workspaceRequest = log.requests.find((entry) => entry.url.includes("/api/school-ai/workspace"));
    expect(workspaceRequest, "the workspace fetch was issued").toBeDefined();
    expect(workspaceRequest!.at).toBeLessThanOrEqual(shown!.at + 100);
    const ready = log.workspace.find((entry) => entry.state === "ready");
    expect(ready, "the workspace finished loading").toBeDefined();
    expect(ready!.at).toBeGreaterThan(shown!.at);
    expect(ready!.at).toBeLessThan(hidden!.at);

    // R20.14. Everything the page asked the server for while the overlay was up, excluding the
    // framework's own module and asset traffic, is the one fetch the workspace owns.
    const during = log.requests
      .filter((entry) => entry.at >= shown!.at && entry.at <= hidden!.at)
      .map((entry) => new URL(entry.url, origin).pathname)
      .filter((path) => !path.startsWith("/_next") && !path.startsWith("/__next"));
    expect(during.filter((path) => path !== "/api/school-ai/workspace")).toEqual([]);

    // The deliberately slowed route must not outlive the test it was slowing down.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("the overlay is decoration: hidden from assistive technology and exposing no focusable element", async ({ page }) => {
    await openStudio(page);
    await expect(page.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
    const log = await recorded(page);

    // R20.12. No `Tab` is pressed to check this, because a keystroke would end the sequence; the
    // absence of any focusable descendant across the whole overlay is the stronger statement.
    expect(log.firstFrame).not.toBeNull();
    expect(log.firstFrame!.ariaHidden).toBe("true");
    expect(log.firstFrame!.focusable).toBe(0);
    // R20.11. The mark is the `Sparkles` glyph the AI workspace already uses as its identity.
    expect(log.firstFrame!.marks).toBe(1);
    expect(log.firstFrame!.rings).toBe(2);
    await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
  });

  for (const input of ["pointerdown", "keydown", "wheel"] as const) {
    test(`a ${input} during the sequence ends it immediately and presents the workspace`, async ({ page }) => {
      await openStudio(page);
      await onScreen(page);

      // Delivered as the real browser event, from outside the React tree, so the capture-phase
      // document listener is what has to catch it.
      if (input === "pointerdown") await page.mouse.click(720, 500);
      else if (input === "keydown") await page.keyboard.press("ArrowDown");
      else await page.mouse.wheel(0, 240);
      await expect(page.locator("[data-studio-intro]")).toHaveCount(0, { timeout: 2000 });

      const log = await recorded(page);
      const { shown, hidden } = span(log);
      const arrived = log.inputs.find((entry) => entry.type === input && shown !== undefined && entry.at >= shown.at);
      expect(arrived, `the ${input} was delivered while the sequence played`).toBeDefined();
      expect(hidden).toBeDefined();

      // R20.3. "Immediately" is read as the same tick, allowing one frame of scheduling. Both
      // timestamps come from the page's own clock, so no protocol latency is counted.
      expect(hidden!.at - arrived!.at).toBeLessThanOrEqual(120);
      expect(hidden!.at - shown!.at).toBeLessThan(STUDIO_INTRO_DURATION_MS);

      // The workspace is presented, and the input was not swallowed on the way: the listeners are
      // passive and never call `preventDefault`, so the key or scroll that ended the sequence still
      // belonged to the page it handed over to.
      await expect(page.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
      // Focus is only asserted for the inputs that do not themselves move it. A real `mousedown`
      // sets focus to the element under the cursor after the skip handler has run, so asserting
      // focus there would be testing the browser's click behaviour, not the handover.
      if (input !== "pointerdown") await expect(page.locator("[data-probe='action']")).toBeFocused();
      await page.locator("[data-probe='action']").click();
      await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
    });
  }

  test("it plays at most once per browser session and never when the account preference suppresses it", async ({ page, context }) => {
    // R20.6, first half. A reload inside the same session is the real test of a session key.
    await openStudio(page);
    await onScreen(page);
    await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), STUDIO_INTRO_SESSION_KEY)).toBe("played");

    // The reload is watched by a fresh recorder, so "it did not play again" is the absence of an
    // appearance across the whole load rather than the absence at one sampled moment.
    await page.reload();
    await expect(page.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
    expect(span(await recorded(page)).shown, "the second load played nothing").toBeUndefined();

    // A new browser session is a new first time: the key is per session, not per account.
    const next = await context.browser()!.newContext({ reducedMotion: "no-preference" });
    await signIn(next);
    const fresh = await next.newPage();
    await install(fresh);
    await fresh.goto(`${origin}${STUDIO}`);
    await onScreen(fresh);
    await next.close();

    // R20.6, second half. The recorded account preference suppresses it from the first frame and
    // leaves the session key untouched, so clearing the preference restores the sequence.
    const preferring = await context.browser()!.newContext({ reducedMotion: "no-preference" });
    await signIn(preferring);
    const quiet = await preferring.newPage();
    await install(quiet);
    await quiet.goto(`${origin}${STUDIO}?suppressed=1`);
    await expect(quiet.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
    expect(span(await recorded(quiet)).shown, "no overlay ever appeared").toBeUndefined();
    expect(await quiet.evaluate((key) => window.sessionStorage.getItem(key), STUDIO_INTRO_SESSION_KEY)).toBeNull();
    await preferring.close();
  });

  test("an initialization failure renders the workspace without the intro", async ({ page }) => {
    // R20.15. A browser that refuses session storage is the realistic failure, and the one the
    // component deliberately does not defend against: the read throws, the error boundary catches
    // it, and the reader loses a brand moment and nothing else.
    await page.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key.startsWith("skoolee:exam-studio-intro")) throw new DOMException("Storage refused for this test", "SecurityError");
        return original.call(this, key);
      };
    });
    await install(page);
    await page.goto(STUDIO);

    await expect(page.locator("[data-probe='title']")).toHaveText("Exam Studio");
    await expect(page.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
    await expect(page.locator("[data-probe='workspace']")).toHaveAttribute("data-workspace-state", "ready");
    await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
    expect(span(await recorded(page)).shown, "no overlay was ever rendered").toBeUndefined();
  });
});

test("under a reduced-motion preference it is one static mark with no transform, finished in a frame", async ({ page }) => {
  // The suite-wide default is `reducedMotion: "reduce"`, so this is the configured context.
  await openStudio(page);
  await expect(page.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");

  const log = await recorded(page);
  const { shown, hidden } = span(log);
  expect(shown, "the static mark was rendered").toBeDefined();
  expect(hidden, "the static mark was removed").toBeDefined();

  // R20.5. One animation frame, measured on the page's clock, against a 200 ms bound.
  expect(hidden!.at - shown!.at).toBeLessThanOrEqual(200);
  expect(hidden!.at - shown!.at).toBeLessThan(STUDIO_INTRO_DURATION_MS);

  // R20.4 and R21.8. The static branch, not the sequence with its animations switched off: one
  // mark, no rings, no phases, no `transform`, and nothing JS-driven running — which matters
  // because the global reduced-motion rule at `globals.css:723` could not have stopped it.
  // The snapshot is taken inside the observer callback, so this is genuinely the first frame, and
  // because it is also the only frame it is the final frame too.
  const frame = log.firstFrame!;
  expect(frame.motion).toBe("static");
  expect(frame.phase).toBeNull();
  expect(log.phases.map((entry) => entry.phase)).toEqual([null]);
  expect(frame.marks).toBe(1);
  expect(frame.rings).toBe(0);
  expect(frame.markTransform).toBe("none");
  expect(frame.animations).toBe(0);
  expect(frame.pointerEvents).toBe("none");
  // Sampled with the same frame-by-frame sampler the sequence is measured with: on this path not
  // one watched property ever changed value, which is what "the first frame is the final frame"
  // means in computed styles.
  expect(moved(log), "nothing moved under a reduced-motion preference").toEqual([]);
  expect(log.headings, "the workspace heading never moved").toHaveLength(1);
  // R20.12 holds on this path too.
  expect(frame.ariaHidden).toBe("true");
  expect(frame.focusable).toBe(0);

  // R20.13 and R20.14 on the reduced path: the workspace still loads, and the intro still asks for
  // nothing of its own.
  await expect(page.locator("[data-probe='workspace']")).toHaveAttribute("data-workspace-state", "ready");
  const during = log.requests
    .filter((entry) => entry.at >= shown!.at && entry.at <= hidden!.at)
    .map((entry) => new URL(entry.url, origin).pathname)
    .filter((path) => !path.startsWith("/_next") && !path.startsWith("/__next"));
  expect(during.filter((path) => path !== "/api/school-ai/workspace")).toEqual([]);
});

test("the intro is absent from the attempt page, the attempt start action and the print output", async ({ page, context }) => {
  // R20.7–R20.10 against the live surfaces. This test creates an exam of its own, so the shared
  // fixture attempt that `exam.browser.spec.ts` starts and submits is left untouched.
  const created = await page.request.post("/api/school-ai/exams", { data: { idempotencyKey: crypto.randomUUID(), paperId: fixture.paperId, title: `Studio intro exclusion ${Date.now()}`, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), studentIds: ["school-ai-browser-a-student"], mode: "STANDARD" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const exam = (await created.json()).exam;
  const api = `/api/school-ai/exams/${exam.id}`;

  // R20.7, print output. The server projection a Candidate paper prints from carries no overlay and
  // no reference to one — asserted on the response body, before a browser can add anything.
  const record = await page.request.get(`/api/school-ai/workspace/${fixture.paperId}`);
  expect(record.ok(), await record.text()).toBeTruthy();
  const printed = await page.request.get(`/api/school-ai/workspace/${fixture.paperId}/print?version=${(await record.json()).record.version}`);
  expect(printed.ok(), await printed.text()).toBeTruthy();
  expect(await printed.text()).not.toMatch(/studio-intro|framer-motion/i);

  await context.clearCookies();
  await signIn(context, "a-STUDENT");
  await install(page);
  await page.goto(`/ai/exams/${exam.id}`);
  await expect(page.getByRole("heading", { name: /Studio intro exclusion/ })).toBeVisible();
  await expect(page.locator("[data-studio-intro]")).toHaveCount(0); // R20.7, the attempt page

  // R20.7, the attempt start action, and R20.8: nothing is interposed between the readiness check,
  // the start and the first question.
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await expect(page.getByText("Connected to the exam server", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "I understand the timer, availability end, and saving requirements, and I am ready to start." }).check();
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What is 2 + 2?" })).toBeVisible();
  await expect(page.locator("[data-studio-intro]")).toHaveCount(0);

  const started = (await (await page.request.get(`${api}/attempt`)).json()).attempt;
  const deadline = started.deadlineAt;
  // R20.10. The deadline is the server's arithmetic over the exam's own recorded duration — no
  // client animation is an input to it.
  const metadata = (await (await page.request.get(api)).json()).exam;
  expect(metadata.durationMinutes).toBeGreaterThan(0);
  expect(new Date(deadline).getTime() - new Date(started.startedAt).getTime()).toBe(metadata.durationMinutes * 60000);

  // R20.9. The save state and the remaining time are not merely present; each is the topmost
  // element at its own centre, so nothing is sitting over it. The attempt tree holds no overlay at
  // all, which is what also covers the recording indicator this standard-mode attempt never raises.
  const timer = page.getByRole("timer", { name: "Time remaining" });
  await expect(timer).toBeVisible();
  await page.locator("fieldset#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  const status = page.getByRole("status").filter({ hasText: "Saved to server" });
  await expect(status).toBeVisible();
  for (const target of [timer, status]) {
    expect(
      await target.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return top !== null && (node.contains(top) || top.contains(node));
      }),
      "nothing overlays the attempt save state or remaining time",
    ).toBeTruthy();
  }

  // R20.8 and R20.10. Playing the intro on the studio surface, in the same browser session, between
  // two reads of the authoritative deadline leaves the deadline exactly where the server put it.
  await context.clearCookies();
  await signIn(context);
  const studio = await context.newPage();
  await install(studio);
  await studio.goto(STUDIO);
  await expect(studio.locator("[data-probe='owner']")).toHaveAttribute("data-interaction-owner", "studio");
  expect(span(await recorded(studio)).shown, "the intro really did play beside the live attempt").toBeDefined();
  await studio.close();

  await context.clearCookies();
  await signIn(context, "a-STUDENT");
  expect((await (await page.request.get(`${api}/attempt`)).json()).attempt.deadlineAt).toBe(deadline);
  await page.reload();
  await expect(page.getByRole("heading", { name: "What is 2 + 2?" })).toBeVisible();
  await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
  expect((await (await page.request.get(`${api}/attempt`)).json()).attempt.deadlineAt).toBe(deadline);
});

test("no excluded surface can import the intro, and the intro reaches no network primitive", async () => {
  // R20.7 as an invariant rather than a sample. The excluded surfaces are named by path, so this
  // keeps holding when task 3.2 moves the intro behind `exam-studio-shell.tsx` and when the control
  // room arrives in slice 3 — neither needs this test edited.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) files.push(path);
    }
  };
  walk("src");
  const importers = files.filter((path) => /from\s+["'][^"']*exam-studio\/studio-intro["']/.test(readFileSync(path, "utf8")));
  expect(importers.length, "something renders the intro").toBeGreaterThan(0);

  const excluded = [
    join("src", "app", "ai", "exams"), // the Candidate attempt page and the attempt start action
    join("src", "components", "school-ai", "exam-player.tsx"),
    join("src", "components", "school-ai", "exam-page-client.tsx"),
    join("src", "components", "school-ai", "exam-proctor"), // capture, console and the control-room view
    join("src", "app", "api"), // the print route and every other server projection
  ];
  for (const importer of importers) for (const surface of excluded) expect(importer.startsWith(surface), `${importer} must not reach the intro`).toBeFalsy();

  // R20.14 at the source. The runtime checks prove no request was observed; this proves there is no
  // primitive to make one with, including the quiet ones a reviewer would miss.
  const source = readFileSync(join("src", "components", "school-ai", "exam-studio", "studio-intro.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const primitive of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /EventSource/, /WebSocket/, /new\s+Image\b/, /\bsrc\s*[:=]/, /\bhref\s*[:=]/, /\bnavigator\b/, /use server/]) {
    expect(source, `the intro must not reach ${primitive}`).not.toMatch(primitive);
  }

  // The companion to the sampled "only opacity and transform moved" check: every declared target
  // names only `opacity`, `scale` and `y`, so a later edit cannot introduce a layout-affecting
  // property that happens to settle between two samples.
  const declarations = [...source.matchAll(/(?:initial|animate)=\{\{([^}]*)\}\}/g)].map((match) => match[1]);
  expect(declarations.length, "four animated elements, each with a start and an end").toBe(8);
  for (const declaration of declarations) {
    for (const property of declaration.split(",").map((pair) => pair.split(":")[0].trim()).filter(Boolean)) {
      expect(["opacity", "scale", "y"], `animated property ${property}`).toContain(property);
    }
  }

  // And every phase finishes inside the exported budget, with the last one ending exactly on it —
  // so the table the duration assertions use is the table the elements are animated against.
  const ends = [...source.matchAll(/transition=\{\{([^}]*)\}\}/g)].map((match) => {
    const read = (name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)`).exec(match[1])?.[1] ?? 0);
    return Math.round((read("delay") + read("duration")) * 1000);
  });
  expect(ends).toHaveLength(4);
  for (const end of ends) expect(end).toBeLessThanOrEqual(STUDIO_INTRO_DURATION_MS);
  expect(Math.max(...ends)).toBe(STUDIO_INTRO_DURATION_MS);
  expect(ends.sort((left, right) => left - right)).toEqual(STUDIO_INTRO_PHASES.map((phase) => phase.endMs).sort((left, right) => left - right));
});
