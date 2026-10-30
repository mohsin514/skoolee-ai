/**
 * SKAI-1038: connection budget for the runtime database URL.
 *
 * The app runs on Vercel serverless functions. Every warm function instance holds its own Prisma pool, and
 * Prisma's default pool size is `num_cpus * 2 + 1` connections. With dozens of instances (each server action,
 * route handler and long-lived SSE stream can land on its own instance) that multiplies past the Supabase
 * pooler's client limit (200 on dev), and every new request fails with EMAXCONN.
 *
 * So the runtime URL is normalised here, never trusting the env to carry the right flags:
 * - Supabase's transaction pooler (port 6543, or a `pooler.supabase.com` host) needs `pgbouncer=true`, otherwise
 *   Prisma's prepared statements break across pooled backends.
 * - `connection_limit` defaults to a small per-instance budget (`PRISMA_CONNECTION_LIMIT`, else 1 on serverless
 *   and 5 elsewhere). An explicit `connection_limit` already in the URL always wins.
 * - `pool_timeout` defaults so a request waits for a connection briefly instead of piling up.
 */
export function pooledDatabaseUrl(raw: string | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) return raw;

  const params = url.searchParams;
  const pooled = url.port === "6543" || /pooler\.supabase\.com$/i.test(url.hostname);
  if (pooled && !params.has("pgbouncer")) params.set("pgbouncer", "true");

  if (!params.has("connection_limit")) {
    const configured = Number.parseInt(env.PRISMA_CONNECTION_LIMIT ?? "", 10);
    const serverless = Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
    const limit = Number.isInteger(configured) && configured > 0 ? configured : serverless ? 1 : 5;
    params.set("connection_limit", String(limit));
  }
  if (!params.has("pool_timeout")) params.set("pool_timeout", "15");

  return url.toString();
}

/** Host and port only, for logs — never the credentials or query. */
export function describeDatabaseTarget(raw: string | undefined): string {
  try {
    const url = new URL(raw ?? "");
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "unset";
  }
}
