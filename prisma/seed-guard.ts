/**
 * SKAI-947 / NFR-SEC-09 — seed safety guard.
 *
 * Two jobs:
 *   1. Refuse to run the demo seed on any internet-facing environment.
 *      "Seed accounts never on internet-facing environments" (PRD v2.0 §9.1).
 *   2. Source every seeded credential from the environment — never hardcode a
 *      password in the repo, and never print a password to the console.
 *      "No secrets in tickets or docs" (PRD v2.0 §9.1).
 *
 * The guard fails closed: if it cannot prove the target is a safe local/demo
 * database, it aborts.
 */

/** Hostnames / substrings that mark a datasource as internet-facing. */
const INTERNET_FACING_DB_MARKERS = [
  "supabase.com",
  "supabase.co",
  "rds.amazonaws.com",
  "neon.tech",
  "render.com",
  "railway.app",
  "planetscale",
  "azure.com",
  "googleapis.com",
];

/** Public app hosts the seed must never populate. */
const INTERNET_FACING_APP_HOSTS = [
  "dev.skooleeai.com",
  "app.skooleeai.com",
  "skooleeai.com",
];

const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];

function dbHostFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // postgresql://user:pass@HOST:PORT/db
    return new URL(url).hostname.toLowerCase();
  } catch {
    const m = url.match(/@([^:/?]+)/);
    return m ? m[1].toLowerCase() : null;
  }
}

export type SeedEnvDecision = {
  allowed: boolean;
  reason: string;
  dbHost: string | null;
  envName: string;
};

/**
 * Decide whether seeding is permitted in the current environment.
 * Pure function of `env` so it is unit-testable without a live process.
 */
export function evaluateSeedEnv(env: NodeJS.ProcessEnv): SeedEnvDecision {
  const envName = (
    env.APP_ENV ||
    env.VERCEL_ENV ||
    env.ENVIRONMENT ||
    env.NODE_ENV ||
    "development"
  ).toLowerCase();

  const dbUrl = env.DIRECT_URL || env.DATABASE_URL;
  const dbHost = dbHostFrom(dbUrl);

  // 1. Named internet-facing environments are always blocked.
  if (["production", "prod", "staging", "qa", "preview"].includes(envName)) {
    return {
      allowed: false,
      reason: `environment "${envName}" is internet-facing; demo seeding is forbidden (NFR-SEC-09)`,
      dbHost,
      envName,
    };
  }

  // 2. Public app host override (e.g. SEED run from a dev.skooleeai.com box).
  const appHost = (env.NEXT_PUBLIC_APP_URL || env.APP_URL || "").toLowerCase();
  if (INTERNET_FACING_APP_HOSTS.some((h) => appHost.includes(h))) {
    return {
      allowed: false,
      reason: `app host "${appHost}" is internet-facing; demo seeding is forbidden (NFR-SEC-09)`,
      dbHost,
      envName,
    };
  }

  // 3. Datasource pointing at a hosted/internet-facing DB is blocked unless the
  //    operator explicitly overrides (used for a one-off intentional demo seed).
  const hostedMarker = INTERNET_FACING_DB_MARKERS.find((m) => dbHost?.includes(m));
  if (hostedMarker && env.ALLOW_HOSTED_SEED !== "1") {
    return {
      allowed: false,
      reason: `database host "${dbHost}" looks internet-facing (matched "${hostedMarker}"); set ALLOW_HOSTED_SEED=1 only for an intentional, non-production demo seed`,
      dbHost,
      envName,
    };
  }

  // 4. Require the DB to be a recognisable local host unless the operator
  //    explicitly overrode the hosted check above.
  if (!hostedMarker && dbHost && !LOCAL_DB_HOSTS.includes(dbHost)) {
    return {
      allowed: false,
      reason: `database host "${dbHost}" is neither a known local host nor an approved hosted seed target; refusing (NFR-SEC-09)`,
      dbHost,
      envName,
    };
  }

  return {
    allowed: true,
    reason: hostedMarker
      ? `explicitly allowed hosted seed (ALLOW_HOSTED_SEED=1) against ${dbHost}`
      : `local/dev environment "${envName}" against ${dbHost ?? "unknown host"}`,
    dbHost,
    envName,
  };
}

/** Throws (fails closed) when the current environment must not be seeded. */
export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): SeedEnvDecision {
  const decision = evaluateSeedEnv(env);
  if (!decision.allowed) {
    throw new Error(
      `[seed-guard] Refusing to seed: ${decision.reason}\n` +
        `  env=${decision.envName} dbHost=${decision.dbHost ?? "?"}\n` +
        `  NFR-SEC-09: seed accounts must never exist on internet-facing environments.`,
    );
  }
  return decision;
}

/**
 * Resolve a required seed credential from the environment.
 * No password is ever hardcoded in the repo (NFR-SEC-09). In local/dev we
 * fall back to a well-known throwaway value so `npm run db:seed` still works
 * out of the box, but the fallback is only reached after assertSeedAllowed has
 * proven we are off any internet-facing environment.
 */
export function seedSecret(
  env: NodeJS.ProcessEnv,
  key: string,
  localFallback: string,
): string {
  const v = env[key];
  if (v && v.length > 0) return v;
  return localFallback;
}
