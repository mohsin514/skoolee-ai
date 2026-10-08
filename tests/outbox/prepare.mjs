import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
// Explicit disposable destination. Never load .env or accept arbitrary database names.
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55420/sko220_test") throw new Error("Only the disposable local sko220_test database is allowed");
const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: "127.0.0.1", PGPORT: "55420", PGUSER: "postgres", PGCONNECT_TIMEOUT: "5" };
execFileSync("dropdb", ["--if-exists", "sko220_test"], { env, stdio: "inherit" });
execFileSync("createdb", ["sko220_test"], { env, stdio: "inherit" });
const args = ["-X", "-v", "ON_ERROR_STOP=1", "-d", "sko220_test"];
for (const name of readdirSync("prisma/migrations").filter(x => /^\d/.test(x)).sort()) args.push("-f", `prisma/migrations/${name}/migration.sql`);
args.push("-f", "scripts/recovery/fixtures.sql");
execFileSync("psql", args, { env, stdio: "inherit" });
