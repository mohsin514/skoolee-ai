import { defineConfig } from "@playwright/test";
const baseURL = process.env.JOBS_TEST_ORIGIN || "http://localhost:3220";
const target = new URL(baseURL);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !["3220", "3221", "3107"].includes(target.port)) throw new Error("Isolated local jobs app required");
export default defineConfig({ testDir: ".", testMatch: "jobs.browser.spec.ts", workers: 1, fullyParallel: false, timeout: 45000, expect: { timeout: 10000 }, use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", acceptDownloads: true }, reporter: "list", outputDir: "../../../test-results/jobs-current" });
