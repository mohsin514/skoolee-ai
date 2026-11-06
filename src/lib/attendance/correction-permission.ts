import { ApiError } from "@/lib/api/scope";

/**
 * SKAI-229: whether the reader may correct a submitted register. `check` is the attendance.edit permission
 * assertion; a 403 means "no" (the register is shown locked), anything else is a real failure and is rethrown.
 */
export async function canCorrectRegister(check: () => Promise<unknown>): Promise<boolean> {
  try {
    await check();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return false;
    throw error;
  }
}
