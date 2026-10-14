import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "register.spec.ts", workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
  },
  reporter: "list", outputDir: "../../../test-results/design-system/auth-register",
});
