import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const database = process.argv.includes("--database");
if (process.argv.slice(2).some(value => value !== "--database")) throw new Error("Use --database or no arguments.");
if (database) {
  const url = process.env.DATABASE_URL;
  if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Database acceptance needs identical explicit DATABASE_URL and DIRECT_URL pointing to a disposable loopback database. No .env is loaded.");
}
const files = readdirSync(new URL("../tests/school-ai/", import.meta.url)).filter(name => name.endsWith(".test.ts") && name.endsWith(".database.test.ts") === database).sort().map(name => `tests/school-ai/${name}`);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files], { cwd: new URL("..", import.meta.url), stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
