/**
 * SKAI-1038: one failing dashboard query must not blank the whole console. A widget read that fails is logged with
 * its cause (message and Prisma code only — never row data) and answers its fallback; the widget name is recorded in
 * `degraded` so the page can say which parts are unavailable.
 */
export async function loadWidget<T>(name: string, read: () => Promise<T>, fallback: T, degraded: string[], scope = "dashboard"): Promise<T> {
  try {
    return await read();
  } catch (error) {
    degraded.push(name);
    console.error(`[${scope}] widget "${name}" failed`, describeError(error));
    return fallback;
  }
}

/** Message and driver code of an error, safe to log. */
export function describeError(error: unknown): { error: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { error: error.message, ...(typeof code === "string" ? { code } : {}) };
  }
  return { error: String(error) };
}

/**
 * SKAI-1022/1031/1032/1024: the role consoles fired 20+ reads at once through `Promise.all`. On Vercel each function
 * instance holds a one-connection Prisma pool (SKAI-1038, `pool-url.ts`) with a 15 s `pool_timeout`, so the reads
 * queued inside Prisma and the ones still waiting after 15 s failed with P2024 ("Timed out fetching a new connection
 * from the connection pool"). One such failure rejected the whole server action, the client showed "The … console
 * could not be loaded", and Retry replayed the same pile-up. Larger campuses (more rows per read) failed every time.
 *
 * The loader runs reads at most `concurrency` at a time — matching the pool — so they wait in this queue (no timeout)
 * instead of the pool's, and each read is a named widget: a failed optional widget answers its fallback and is listed
 * in `degraded`; a failed required read (the console cannot render without it) is logged with its cause and rethrown.
 */
export type WidgetLoader = {
  /** Optional widget: failure logs, records `name` in `degraded` and answers `fallback`. */
  widget<T>(name: string, read: () => Promise<T>, fallback: T): Promise<T>;
  /** Required read: failure logs its cause and rethrows (the console cannot render without it). */
  required<T>(name: string, read: () => Promise<T>): Promise<T>;
  readonly degraded: string[];
};

export function createWidgetLoader(scope: string, concurrency = dashboardConcurrency()): WidgetLoader {
  const degraded: string[] = [];
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const waiting: (() => void)[] = [];

  async function run<T>(read: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await read();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  return {
    degraded,
    widget: (name, read, fallback) => loadWidget(name, () => run(read), fallback, degraded, scope),
    async required(name, read) {
      try {
        return await run(read);
      } catch (error) {
        console.error(`[${scope}] required read "${name}" failed`, describeError(error));
        throw error;
      }
    },
  };
}

/**
 * How many dashboard reads may be in flight per request: the per-instance Prisma pool size (`connection_limit` on the
 * runtime URL, else `PRISMA_CONNECTION_LIMIT`, else the `pool-url.ts` default of 1 on serverless and 5 elsewhere).
 */
export function dashboardConcurrency(env: Record<string, string | undefined> = process.env): number {
  try {
    const fromUrl = Number.parseInt(new URL(env.DATABASE_URL ?? "").searchParams.get("connection_limit") ?? "", 10);
    if (Number.isInteger(fromUrl) && fromUrl > 0) return fromUrl;
  } catch {
    // Not a URL: fall through to the configured budget.
  }
  const configured = Number.parseInt(env.PRISMA_CONNECTION_LIMIT ?? "", 10);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME ? 1 : 5;
}
