/**
 * Playwright configuration for the logout end-to-end suite.
 *
 * Target selection is shared with the API suite (tests/support/env.ts) rather
 * than configured separately, so both harnesses cannot disagree about which
 * deployment they are testing — and so the remote-target gate applies here too.
 */
import { defineConfig, devices } from "@playwright/test";

import { resolveTarget } from "./tests/support/env";

const target = resolveTarget();

export default defineConfig({
  testDir: "./tests/e2e",
  // Sign-in, sign-out and the session row are shared, mutable state. Roles are
  // independent of one another, but running them in parallel against one dev
  // server produced enough contention to be slower and far noisier than
  // running them in order, so this stays serial and predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    baseURL: target.baseUrl,
    // The whole point of this suite is the browser-side half of signing out —
    // the client cache, the Back button, the real cookie jar — so a trace on
    // failure is what makes a failure diagnosable.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // The sidebar sign-out control is `hidden md:flex`, so a narrower viewport
    // would silently skip it.
    viewport: { width: 1440, height: 900 },
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Only ever started for a local target; a remote one is already running, and
  // starting a second copy pointed at it would be nonsense.
  webServer: target.isRemote
    ? undefined
    : {
        command: "npm run dev",
        url: target.baseUrl,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
