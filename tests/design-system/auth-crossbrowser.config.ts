import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["auth-register/register.spec.ts", "auth-verification/verification.spec.ts", "protect-account-live.spec.ts"],
  workers: 2,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  reporter: "list",
  outputDir: "../../test-results/design-system/auth-crossbrowser",
});
