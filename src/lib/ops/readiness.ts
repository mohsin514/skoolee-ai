/** SKAI-733: helpers for the /api/public/ready probe. */
export const READY_TIMEOUT_MS = 3_000;

/** Short build id for the response; never the full environment. */
export function buildId(env: Record<string, string | undefined> = process.env) {
  return (env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || "unknown").slice(0, 12);
}

/** Resolves true when the check answers in time, false on error or timeout. */
export async function checkWithin(check: () => Promise<unknown>, ms = READY_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([check().then(() => true as const, () => false as const), late]);
  } finally {
    clearTimeout(timer);
  }
}
