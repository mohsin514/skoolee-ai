/**
 * Target selection for the logout suites.
 *
 * Every suite runs against exactly one "target": a base URL to drive over HTTP
 * plus the database behind it, so an assertion about a cookie and an assertion
 * about the LoginSession row it maps to are talking about the same system.
 *
 * Two profiles are supported, chosen with TEST_TARGET:
 *
 *   local  (default) — .env.test.local, falling back to .env
 *   remote           — .env.test.remote, and ONLY with ALLOW_REMOTE_TEST=1
 *
 * The remote gate is deliberately awkward. These suites sign in as real
 * accounts, mint sessions, and revoke them; pointed at a live deployment by
 * accident that is a mess someone has to clean up. Opting in has to be a
 * decision, not a default.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type TargetName = "local" | "remote";

export interface TestTarget {
  name: TargetName;
  /** Origin to drive, no trailing slash. */
  baseUrl: string;
  databaseUrl: string;
  isRemote: boolean;
  /** Drives the `Secure` cookie-attribute expectation. */
  https: boolean;
  /** Which files the values came from, for the banner the suites print. */
  sources: string[];
}

/**
 * The repo root, found by walking up from the working directory until a
 * package.json turns up.
 *
 * Not derived from `import.meta` on purpose: this package has no
 * `"type": "module"`, so tsx transpiles these files to CJS, where
 * `import.meta.dirname` is not dependably populated. When it came back
 * undefined the profile file was silently skipped and resolution fell through
 * to the app's own .env — which is how a "local" run ended up aimed at
 * production. A wrong root has to fail loudly, not default to something.
 */
function findRepoRoot(): string {
  let dir = process.cwd();

  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `Could not locate the repo root (no package.json at or above ${process.cwd()}).`
  );
}

const ROOT = findRepoRoot();

/**
 * Minimal dotenv parse. Deliberately not a dependency: it only needs to handle
 * KEY=value, optional quotes, comments and blank lines, which is all these
 * files contain. `export ` prefixes are tolerated because .env files copied
 * out of shell scripts often carry them.
 */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function normaliseBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

let cached: TestTarget | null = null;

export function resolveTarget(): TestTarget {
  if (cached) return cached;

  const name = (process.env.TEST_TARGET || "local").toLowerCase() as TargetName;
  if (name !== "local" && name !== "remote") {
    throw new Error(`TEST_TARGET must be "local" or "remote", got "${name}".`);
  }

  const sources: string[] = [];
  const layers: Record<string, string>[] = [];

  const profilePath = resolve(ROOT, `.env.test.${name}`);
  if (existsSync(profilePath)) {
    layers.push(parseEnvFile(profilePath));
    sources.push(`.env.test.${name}`);
  }

  // The local profile may lean on the app's own .env — it already names the
  // dev database and dev origin, and duplicating them just invites drift.
  // The remote profile never falls back: pointing production tests at
  // whatever happened to be in .env is exactly the accident to avoid.
  if (name === "local") {
    const appEnv = resolve(ROOT, ".env");
    if (existsSync(appEnv)) {
      layers.push(parseEnvFile(appEnv));
      sources.push(".env");
    }
  }

  const fromEnv = (key: string): string | undefined => {
    const value = process.env[key];
    return value && value.trim() ? value.trim() : undefined;
  };

  const fromFiles = (key: string): string | undefined => {
    for (const layer of layers) {
      const value = layer[key];
      if (value && value.trim()) return value.trim();
    }
    return undefined;
  };

  /**
   * Precedence, and the order matters more than it looks:
   *
   *   1. an explicit TEST_-prefixed environment variable
   *   2. the profile file for this target
   *   3. anything else in the environment
   *
   * The reason ambient process.env comes *last* rather than first is that it is
   * not trustworthy here. Importing `@prisma/client` loads the app's .env into
   * process.env as a side effect — so merely touching the database helper is
   * enough to inject the application's own configuration into this resolver.
   * With process.env winning, that is precisely what happened: .env sets
   * NEXT_PUBLIC_APP_URL twice, the second value being the production origin, so
   * a plain `npm run test:logout` resolved to https://app.skooleeai.com and was
   * stopped only by the remote gate below. An ordering that depends on which
   * modules happen to have been imported first is not an ordering.
   */
  const pick = (testKey: string, ...fallbackKeys: string[]): string | undefined => {
    return (
      fromEnv(testKey) ??
      fromFiles(testKey) ??
      fallbackKeys.reduce<string | undefined>(
        (found, key) => found ?? fromFiles(key) ?? fromEnv(key),
        undefined
      )
    );
  };

  // NEXT_PUBLIC_APP_URL is deliberately NOT a fallback. It is the app's
  // published address, not a test target, and treating it as one is what
  // pointed this suite at production. The target has to be stated.
  const rawBaseUrl = pick("TEST_BASE_URL", "BASE_URL");
  const databaseUrl = pick("TEST_DATABASE_URL", "DATABASE_URL");

  if (!rawBaseUrl) {
    throw new Error(
      `No base URL for target "${name}". Set TEST_BASE_URL in .env.test.${name} ` +
        `(or export it).`
    );
  }
  if (!databaseUrl) {
    throw new Error(
      `No database URL for target "${name}". Set TEST_DATABASE_URL in ` +
        `.env.test.${name} (or export it).`
    );
  }

  const baseUrl = normaliseBaseUrl(rawBaseUrl);
  const parsed = new URL(baseUrl);
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";

  // Two independent ways to be "remote": ask for the remote profile, or point
  // the local profile at something that is not loopback. The second case is
  // the dangerous one — a stray TEST_BASE_URL would otherwise sail through the
  // gate below — so host, not profile name, has the final say.
  const isRemote = name === "remote" || !loopback;

  if (isRemote && process.env.ALLOW_REMOTE_TEST !== "1") {
    throw new Error(
      `Refusing to run against a non-local target (${baseUrl}).\n` +
        `These suites create and revoke real sessions. If that is genuinely ` +
        `what you want, re-run with ALLOW_REMOTE_TEST=1.`
    );
  }

  cached = {
    name,
    baseUrl,
    databaseUrl,
    isRemote,
    https: parsed.protocol === "https:",
    sources,
  };

  return cached;
}

/** One-line banner so a failing run always says what it was pointed at. */
export function describeTarget(target = resolveTarget()): string {
  const db = (() => {
    try {
      const url = new URL(target.databaseUrl);
      return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
    } catch {
      return "<unparseable>";
    }
  })();

  return [
    `target=${target.name}`,
    `baseUrl=${target.baseUrl}`,
    `db=${db}`,
    `remote=${target.isRemote}`,
    target.sources.length ? `from=${target.sources.join("+")}` : "from=<env only>",
  ].join("  ");
}
