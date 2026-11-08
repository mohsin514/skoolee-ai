import { defineConfig } from "@playwright/test";

// SKO-504: runs only the slice 5 spec (the other School AI specs pin their own isolated databases at import).
export default defineConfig({
  testDir: ".", testMatch: "exam-studio-s5.browser.spec.ts", workers: 1, fullyParallel: false,
  timeout: 180000, expect: { timeout: 20000 },
  use: { baseURL: process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106", viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: "reduce" }, screenshot: "only-on-failure" },
  reporter: "list", outputDir: "../../test-results/school-ai/sko504",
});
