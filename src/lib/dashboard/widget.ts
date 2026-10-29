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
