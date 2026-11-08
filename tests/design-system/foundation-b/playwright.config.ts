import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "contracts.spec.ts",
  workers: 1,
  use: { timezoneId: "America/Los_Angeles", trace: "retain-on-failure" },
  reporter: "list",
  outputDir: "../../../test-results/design-system/foundation-b",
});
