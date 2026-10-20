import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "launch-guide.browser.spec.ts", workers: 1, fullyParallel: false,
  timeout: 120000, expect: { timeout: 30000 },
  use: { baseURL: "http://localhost:3110", viewport: { width: 1440, height: 1000 }, contextOptions: { reducedMotion: "reduce" }, screenshot: "only-on-failure" },
  reporter: "list", outputDir: "../../test-results/launch-guide",
});
