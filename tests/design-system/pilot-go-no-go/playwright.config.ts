import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "pilot-go-no-go.spec.ts", workers: 1, timeout: 60000, use: { viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: "reduce" }, trace: "retain-on-failure" }, reporter: "list", outputDir: "../../../test-results/design-system/pilot-go-no-go" });
