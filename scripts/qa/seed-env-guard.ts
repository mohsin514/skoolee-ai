/** Shared fail-closed env guard for the synthetic QA seeds (SKAI-999 / SKAI-1249). */
// ─── env guard (self-contained; mirrors prisma/seed-guard) ───────────────────
const HOSTED_MARKERS = ["supabase.com", "supabase.co", "rds.amazonaws.com", "neon.tech", "render.com", "railway.app"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];

function dbHost(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); }
  catch { const m = url.match(/@([^:/?]+)/); return m ? m[1].toLowerCase() : null; }
}

export function assertSeedAllowed() {
  const env = process.env;
  const name = (env.APP_ENV || env.VERCEL_ENV || env.ENVIRONMENT || env.NODE_ENV || "development").toLowerCase();
  if (["production", "prod", "staging", "qa", "preview"].includes(name)) {
    throw new Error(`[qa-seed] refusing: environment "${name}" is internet-facing (NFR-SEC-09)`);
  }
  const host = dbHost(env.DIRECT_URL || env.DATABASE_URL);
  const hosted = HOSTED_MARKERS.find((m) => host?.includes(m));
  if (hosted && env.ALLOW_HOSTED_SEED !== "1") {
    throw new Error(`[qa-seed] refusing: DB host "${host}" looks hosted; set ALLOW_HOSTED_SEED=1 for a deliberate dev seed`);
  }
  if (!hosted && host && !LOCAL_HOSTS.includes(host)) {
    throw new Error(`[qa-seed] refusing: DB host "${host}" is not a known local host (NFR-SEC-09)`);
  }
  return { name, host: host ?? "unknown" };
}

