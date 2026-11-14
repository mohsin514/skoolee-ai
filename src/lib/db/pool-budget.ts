// ─────────────────────────────────────────────────────────────────
// SKAI-1950: one rule for how many database connections an instance may hold.
//
// The pg pool (pg-pool.ts) and the dashboard's read fan-out (dashboard/widget.ts) both use it, so a page never starts
// more parallel reads than its instance has connections.
//
// On serverless a limit that only comes from the URL is capped. Dev's DATABASE_URL carries connection_limit=20; at 20
// per instance ten warm instances filled the pooler's 200 client slots (2026-11-13), and at 5 the many instances of a
// page view (~10 shell GETs each on its own function) did the same under load (SKAI-1919). The cap then went to 1
// (SKAI-1948). Since SKAI-1949 sends a page's shell GETs as one /api/shell call, far fewer instances run, but each
// carries many concurrent requests. At 1 connection, 300 realistic users saw no errors, yet /api/shell p95 reached
// 7–10 s while Postgres showed 0–1 active backends: the requests were queueing on the instance's single connection.
// 3 lets an instance overlap its round trips and keeps instances × 3 within the pooler's client slots.
// An explicit PRISMA_CONNECTION_LIMIT is an operator's choice and wins (set it to 1 to roll back).
// ─────────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

export const SERVERLESS_POOL_MAX = 3;
const LOCAL_DEFAULT = 5;

/** Connections one instance may hold for the database at `url` (connection_limit in the URL, if any). */
export function poolBudget(url: string | undefined, env: Env = process.env): number {
  const fromEnv = Number.parseInt(env.PRISMA_CONNECTION_LIMIT ?? "", 10);
  if (fromEnv > 0) return fromEnv;
  let fromUrl = Number.NaN;
  try {
    fromUrl = Number.parseInt(new URL(url ?? "").searchParams.get("connection_limit") ?? "", 10);
  } catch {
    // Not a URL: use the defaults.
  }
  const serverless = Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
  if (serverless) return Math.min(fromUrl > 0 ? fromUrl : SERVERLESS_POOL_MAX, SERVERLESS_POOL_MAX);
  return fromUrl > 0 ? fromUrl : LOCAL_DEFAULT;
}
