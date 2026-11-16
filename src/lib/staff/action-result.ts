/**
 * SKAI-2015: Next.js replaces the message of an error thrown from a server action in production builds, so the
 * staff actions also come in a `*Result` form that returns the refusal as data. The screens unwrap it here,
 * which restores a normal Error (with the machine code, for example MFA_REQUIRED) on the client.
 */
export type ActionFailure = { success: false; error: string; status?: number; code?: string };

export function failureFrom(error: unknown): ActionFailure | null {
  if (!error || typeof error !== "object" || !("status" in error) || typeof (error as { message?: unknown }).message !== "string") return null;
  const { message, status, code } = error as { message: string; status: unknown; code?: unknown };
  if (typeof status !== "number") return null;
  return { success: false, error: message, status, ...(typeof code === "string" ? { code } : {}) };
}

export function unwrapActionResult<T extends { success: boolean }>(result: T | ActionFailure): Exclude<T, ActionFailure> {
  if (result.success === false) {
    const failure = result as ActionFailure;
    throw Object.assign(new Error(failure.error), { status: failure.status, ...(failure.code ? { code: failure.code } : {}) });
  }
  return result as Exclude<T, ActionFailure>;
}
