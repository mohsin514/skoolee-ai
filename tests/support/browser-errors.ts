/**
 * SKAI-952 — browser-test noise filter.
 *
 * Several `*.browser.test.ts` suites collect `pageerror` messages and assert the
 * list is empty. Next.js (App Router) intermittently emits transient, benign
 * errors during fast client navigation (goBack/goto before hydration settles)
 * that are NOT product bugs but make the suites flaky on CI. This predicate
 * returns true for those known-benign messages so tests can drop them while
 * still failing on any genuine page error.
 *
 * Keep this list tight: only add a pattern that is demonstrably framework noise.
 */
const BENIGN_BROWSER_ERRORS: RegExp[] = [
  // App Router: a client action/navigation fired before the router finished
  // initialising during a fast goBack()/goto() in tests. Harmless hydration race.
  /Router action dispatched before initialization/i,
  // ResizeObserver loop notices are advisory and never a product failure.
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
];

/** True when a captured browser error is known framework noise, not a product bug. */
export function isBenignBrowserError(message: string): boolean {
  return BENIGN_BROWSER_ERRORS.some((re) => re.test(message));
}

/**
 * Collect page errors into `sink`, skipping benign framework noise. Use as:
 *   const errors: string[] = [];
 *   page.on("pageerror", collectPageError(errors));
 */
export function collectPageError(sink: string[]) {
  return (error: Error) => {
    if (!isBenignBrowserError(error.message)) sink.push(error.message);
  };
}
