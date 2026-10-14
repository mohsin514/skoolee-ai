import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "*.browser.spec.ts", workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:3106", viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: "reduce" }, screenshot: "only-on-failure" },
  reporter: "list", outputDir: "../../test-results/school-ai/browser",
});
