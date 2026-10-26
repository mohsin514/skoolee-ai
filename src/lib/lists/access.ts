import { authRateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";

/** Shared database-backed budget, scoped to the authenticated user and list family. */
export async function assertListBudget(user: AuthUser, family: string) {
  const budget = await authRateLimit(`list:${user.schoolId}:${user.userId}:${family}`, { limit: 120, windowMs: 60_000 });
  if (!budget.ok) throw new ApiError("Too many list requests. Your filters are kept. Wait a minute and retry.", 429);
}
