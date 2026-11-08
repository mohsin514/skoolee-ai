import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { outboxDestination } from "./local-destination.mjs";
// Explicit disposable destination. Never load .env or accept arbitrary database names.
const target = outboxDestination();
if (process.env.OUTBOX_ALLOW_RESET !== "synthetic-only") throw new Error("Explicit synthetic fixture reset acknowledgement required");
const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: target.host, PGPORT: target.port, PGUSER: target.user, PGCONNECT_TIMEOUT: "5", DATABASE_URL: target.url, DIRECT_URL: target.url };
execFileSync("dropdb", ["--if-exists", target.database], { env, stdio: "inherit" });
execFileSync("createdb", [target.database], { env, stdio: "inherit" });
const execution = mkdtempSync(join(tmpdir(), "sko382-outbox-migrations-"));
mkdirSync(join(execution, "prisma"));
cpSync("prisma/schema.prisma", join(execution, "prisma/schema.prisma"));
cpSync("prisma/migrations", join(execution, "prisma/migrations"), { recursive: true });
execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "deploy", "--schema", join(execution, "prisma/schema.prisma")], { cwd: execution, env, stdio: "inherit" });
execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", target.database, "-f", resolve("scripts/recovery/fixtures.sql")], { cwd: execution, env, stdio: "inherit" });
