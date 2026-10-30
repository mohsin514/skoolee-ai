import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const database = process.argv.includes("--database");
if (process.argv.slice(2).some(value => value !== "--database")) throw new Error("Use --database or no arguments.");
if (database) {
  const url = process.env.DATABASE_URL;
  if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Database acceptance needs identical explicit DATABASE_URL and DIRECT_URL pointing to a disposable loopback database. No .env is loaded.");
}
// SKAI-1014: since SKAI-1035 a non-production process dials redis://localhost:6379 by default; that open socket
// kept database test files (e.g. assessment-repair) alive after their last test, hanging the serial suite.
// Realtime push is not under test here, so Redis is off unless the caller opts in.
// Browser acceptance files need a running app and their own isolated fixtures.
// They are not part of the provider-free unit suite or the database suite.
const files = readdirSync(new URL("../tests/school-ai/", import.meta.url)).filter(name => name.endsWith(".test.ts") && !name.endsWith(".browser.test.ts") && name.endsWith(".database.test.ts") === database).sort().map(name => `tests/school-ai/${name}`);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files], { cwd: new URL("..", import.meta.url), stdio: "inherit", env: { ...process.env, REDIS_ENABLED: process.env.REDIS_ENABLED ?? "false" } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
