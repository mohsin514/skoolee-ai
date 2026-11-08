import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// One sequential rehearsal of the merged feature. Each slice resets ONLY the
// labelled synthetic tenant; run against a separate, disposable local database.
const database = new URL(process.env.DATABASE_URL || "http://missing");
if (!["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    process.env.DATABASE_URL !== process.env.DIRECT_URL) {
  throw new Error("Set identical DATABASE_URL and DIRECT_URL for a disposable loopback database.");
}
const evidence = resolve(process.env.EXAM_STUDIO_EVIDENCE_DIR || "test-results/exam-studio-audit");
const roleEvidence = resolve(evidence, "screenshots", "roles");
mkdirSync(roleEvidence, { recursive: true });
process.env.EXAM_STUDIO_ROLE_SHOTS = roleEvidence;
for (const [slice, ticket] of [500, 501, 503, 502, 504, 505, 506, 507].entries()) {
  const directory = resolve(evidence, "screenshots", `slice-${slice + 1}`);
  mkdirSync(directory, { recursive: true });
  process.env[`SKO${ticket}_SHOTS`] = directory;
}

export default defineConfig({
  testDir: ".",
  testMatch: /exam-studio-(?:s[1-8]|roles)\.browser\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    baseURL: process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3518",
    viewport: { width: 1440, height: 1000 },
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { outputFolder: resolve(evidence, "report"), open: "never" }], ["json", { outputFile: resolve(evidence, "results.json") }]],
  outputDir: resolve(evidence, "browser"),
});
