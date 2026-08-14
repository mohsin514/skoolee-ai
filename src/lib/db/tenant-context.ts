// ─────────────────────────────────────────────────────────────────
// Tenant context
//
// Holds the school the current unit of work belongs to, so the Prisma
// guard in ./prisma.ts can scope every query without each call site
// having to remember. The context lives in an AsyncLocalStorage store,
// so it follows the request through awaits without being passed around.
//
// The guard is fail-closed: a query against a tenant-owned model with
// no context in scope throws. That is deliberate. A missing context is
// a bug, and the safe response to "I don't know whose data this is" is
// to refuse, not to return everyone's.
// ─────────────────────────────────────────────────────────────────
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  schoolId: string;
  userId?: string;
  /**
   * Set only by runUnscoped(). While true the guard steps aside, so the
   * caller is responsible for scoping. Every use needs a stated reason.
   */
  unscoped?: boolean;
  /** Human-readable justification, surfaced in logs for unscoped work. */
  reason?: string;
  /**
   * True once the work is already running inside a transaction that has set
   * the `app.current_school_id` GUC for Postgres row-level security. Stops the
   * guard from opening a second, nested transaction per query.
   * Only meaningful when TENANT_RLS is enabled.
   */
  rlsSession?: boolean;
}

/**
 * Pinned to globalThis, and that is not optional.
 *
 * The Prisma client is cached on globalThis so hot reloads don't exhaust the
 * connection pool. Its tenant-guard closure captures whatever AsyncLocalStorage
 * instance existed when the client was built. If this module later reloads
 * (HMR in dev, or any duplicate copy of the module in a bundle) a *second*
 * store is created: entry points write context into the new store while the
 * cached guard still reads the old one, finds nothing, and refuses every query
 * with "No tenant context in scope" — which is what showed up on login.
 *
 * One process, one store. Kept in every environment, since bundlers can
 * duplicate modules in production too.
 */
declare global {
  var __skooleeTenantStorage: AsyncLocalStorage<TenantContext> | undefined;
}

const storage: AsyncLocalStorage<TenantContext> =
  globalThis.__skooleeTenantStorage ?? new AsyncLocalStorage<TenantContext>();

globalThis.__skooleeTenantStorage = storage;

export class TenantContextError extends Error {
  status = 500;

  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Binds the tenant context from this point on **within the calling frame**.
 *
 * IMPORTANT: `enterWith` only affects the caller's own execution context and
 * what it goes on to create. Calling it inside a function that the handler
 * `await`s does NOT bind anything for that handler — the caller resumes in its
 * own context and sees nothing. (Worse, it can surface a store left behind by
 * unrelated work.) So this is only safe when called directly in the body of the
 * entry point that will run the queries, which is how the server actions here
 * use it. Anything else should use runWithTenantContext().
 */
export function enterTenantContext(context: TenantContext) {
  storage.enterWith(context);
}

/**
 * Derives the tenant from the request's own session cookie.
 *
 * This is the fallback the Prisma guard uses when no context has been bound
 * explicitly, and it is what makes ordinary authenticated requests work without
 * every route handler having to wrap itself. It is reliable where `enterWith`
 * is not, because it reads Next's request store, which Next establishes with
 * `run()` and therefore propagates correctly through awaits.
 *
 * Returns null outside a request (background jobs, build-time prerender), where
 * the caller is expected to have bound context itself.
 */
export async function resolveTenantFromRequest(): Promise<TenantContext | null> {
  try {
    // Imported lazily so non-Next runtimes (BullMQ workers, scripts) never
    // pull in next/headers.
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get("skoolee_token")?.value;
    if (!token) return null;

    const { jwtVerify } = await import("jose");
    const { JWT_SECRET } = await import("@/lib/auth/secret");
    const { payload } = await jwtVerify(token, JWT_SECRET);

    const schoolId = typeof payload.schoolId === "string" ? payload.schoolId : "";
    if (!schoolId) return null;

    const userId = typeof payload.userId === "string" ? payload.userId : undefined;

    // The platform operator administers every school, so their requests are
    // legitimately cross-tenant. Authorization for those routes is still the
    // role check in requirePlatformOwner().
    if (payload.role === "APP_OWNER") {
      return { schoolId, userId, unscoped: true, reason: `platform owner ${userId}` };
    }

    return { schoolId, userId };
  } catch {
    return null;
  }
}

/**
 * Runs `fn` bound to a school. Use in background workers, cron jobs and
 * webhook handlers, which have no logged-in user to derive context from.
 */
export function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T>
): Promise<T> {
  // The `await` here is load-bearing, not a style choice. Prisma promises are
  // lazy: `prisma.x.findMany()` does not start until something awaits it. With
  // `storage.run(context, fn)` and a callback like `() => prisma.x.findMany()`,
  // run() would return the un-started promise, pop the context, and the query
  // would then execute with no tenant context — and the guard would refuse it.
  // Awaiting inside the store keeps execution within the scope.
  return storage.run(context, async () => await fn());
}

/**
 * Escape hatch for work that legitimately spans schools or runs before a
 * school is known: login, self-serve registration, platform-owner
 * dashboards, payment-gateway webhooks.
 *
 * Queries inside are NOT scoped — the callback must do its own filtering.
 * `reason` is required so every bypass is self-documenting and greppable.
 */
export function runUnscoped<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  // Awaited inside the store for the same lazy-promise reason as
  // runWithTenantContext above — without it the bypass would not be in effect
  // when the query actually runs.
  return storage.run({ schoolId: "", unscoped: true, reason }, async () => await fn());
}

/**
 * Same bypass as runUnscoped, but applied to the remainder of the current
 * async execution instead of a callback. Useful where wrapping would mean
 * restructuring a handler — notably the platform-owner routes, which check
 * the APP_OWNER role and then work across every school.
 */
export function enterUnscoped(reason: string) {
  storage.enterWith({ schoolId: "", unscoped: true, reason });
}

/**
 * The school the current work is bound to. Throws when there is none,
 * which is what makes the guard fail-closed.
 */
export const NO_CONTEXT_MESSAGE =
  "No tenant context in scope, and no signed-in session on the request to " +
  "derive one from. Background jobs must wrap their work in " +
  "runWithTenantContext(); genuinely cross-school work must declare " +
  "runUnscoped(reason) and filter by school itself.";

export function requireSchoolId(): string {
  const context = storage.getStore();

  if (!context || context.unscoped || !context.schoolId) {
    throw new TenantContextError(NO_CONTEXT_MESSAGE);
  }

  return context.schoolId;
}
