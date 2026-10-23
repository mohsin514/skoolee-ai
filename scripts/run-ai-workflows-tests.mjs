import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { aiWorkflowsDestination } from "../tests/ai-workflows/support/destination.mjs";
const database = process.argv.includes("--database");
if (process.argv.slice(2).some(value => value !== "--database")) throw new Error("Use --database or no arguments.");
// No .env is loaded: database suites run only against a known disposable loopback database.
if (database) aiWorkflowsDestination();
// tests/automation holds the current engine's suites until the cutover (Slice 1h); tests/ai-workflows holds the new engine's.
const dirs = ["tests/automation", "tests/ai-workflows"];
const files = dirs.filter(dir => existsSync(new URL(`../${dir}/`, import.meta.url))).flatMap(dir => readdirSync(new URL(`../${dir}/`, import.meta.url))
  .filter(name => name.endsWith(".test.ts") && !name.endsWith(".browser.test.ts") && name.endsWith(".database.test.ts") === database)
  .sort().map(name => `${dir}/${name}`));
if (!files.length) throw new Error("No AI Workflows test files found.");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files], { cwd: new URL("..", import.meta.url), stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
