// ─────────────────────────────────────────────────────────────────
// Prisma on a node-postgres pool that lets go of idle connections.
//
// On Vercel every warm function instance kept its own Prisma connection to the
// Supabase pooler open for as long as the instance lived, busy or not. With
// many instances that filled the pooler's 200 client slots (EMAXCONN) and dev
// failed at five users, again within a minute of a pooler restart (SKAI-1898
// load runs, 2026-11-13).
//
// Here Prisma runs on a `pg` Pool through @prisma/adapter-pg. The pool closes a
// connection after a few idle seconds, and on Vercel `attachDatabasePool` lets
// the platform close it before an instance is suspended, so connections follow
// real traffic instead of the number of warm instances.
//
// On by default on Vercel; PRISMA_PG_ADAPTER=on|off overrides it (off is the
// rollback). Elsewhere the Prisma engine's own pool is used, as before.
// ─────────────────────────────────────────────────────────────────
import { Pool, type PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { poolBudget } from "./pool-budget";

type Env = Record<string, string | undefined>;

export function pgAdapterEnabled(env: Env = process.env): boolean {
  const flag = env.PRISMA_PG_ADAPTER?.trim().toLowerCase();
  if (flag === "off" || flag === "false" || flag === "0") return false;
  if (flag === "on" || flag === "true" || flag === "1") return true;
  return Boolean(env.VERCEL);
}

/** Prisma-only URL parameters that `pg` must not see (it would treat them as session settings). */
const PRISMA_PARAMS = ["pgbouncer", "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout", "statement_cache_size", "schema", "sslmode", "sslaccept"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function pgPoolConfig(raw: string, env: Env = process.env): { pool: PoolConfig; schema?: string } {
  const url = new URL(raw);
  const params = url.searchParams;
  // Per-instance budget: pool-budget.ts explains the cap and its history (SKAI-1948, SKAI-1950).
  const max = poolBudget(raw, env);
  const idle = Number.parseInt(env.PG_IDLE_TIMEOUT_MS ?? "", 10);
  const sslmode = params.get("sslmode");
  const schema = params.get("schema") ?? undefined;
  for (const name of PRISMA_PARAMS) params.delete(name);

  // TLS as the Prisma engine did it (encrypted, certificate not verified), except where disabled or local.
  const ssl = sslmode === "disable" || (!sslmode && LOCAL_HOSTS.has(url.hostname)) ? false : { rejectUnauthorized: false };
  return {
    // 60 s idle: a busy instance reuses its one connection instead of reconnecting (each new connection is a TLS
    // handshake plus pooler authentication, the step that fails under bursts); attachDatabasePool still closes it
    // before Vercel suspends the instance.
    pool: { connectionString: url.toString(), max, idleTimeoutMillis: idle > 0 ? idle : 60_000, connectionTimeoutMillis: 10_000, ssl },
    ...(schema && schema !== "public" ? { schema } : {}),
  };
}

/** The adapter Prisma runs on, or null to keep the engine's own pool. */
export function createPgAdapter(raw: string | undefined, env: Env = process.env) {
  if (!raw || !pgAdapterEnabled(env)) return null;
  const { pool: config, schema } = pgPoolConfig(raw, env);
  const pool = new Pool(config);
  // An idle client dropped by the server must not crash the process; the pool replaces it.
  pool.on("error", (error) => console.warn("[db.pool] idle client error", error.message));
  if (env.VERCEL) attachDatabasePool(pool);
  return new PrismaPg(pool, schema ? { schema } : undefined);
}
