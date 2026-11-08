/**
 * SKAI-229: whether the reader may correct a submitted register. `check` is the attendance.edit permission
 * assertion; a refusal (any error carrying status 403 — `assertPermission` throws a plain Error with
 * `status = 403`, `ApiError` uses the same field) means "no" and the register is shown locked. Anything else is a
 * real failure and is rethrown.
 */
export async function canCorrectRegister(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch (error) {
    if ((error as { status?: unknown } | null)?.status === 403) return false;
    throw error;
  }
}
