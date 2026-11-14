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
// 7–10 s while Postgres showed 0–1 active backends: requests queue on the instance's single connection. Raising the
// cap to 3 (SKAI-1950) filled the pooler's client slots within a minute at the same 300 users (max-clients 503s,
// 16.9% errors), so the cap stays at 1: on the smallest Supabase compute the pooler's client slots, not Postgres, are
// the limit, and fewer queries per page (not more connections) is the way to faster pages.
// An explicit PRISMA_CONNECTION_LIMIT is an operator's choice and wins.
// ─────────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

export const SERVERLESS_POOL_MAX = 1;
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
