// ─────────────────────────────────────────────────────────────────
// "The database is unreachable" is not "you are signed out".
//
// When the pooler runs out of client slots (Supabase EMAXCONN), a connection
// times out, or the pool is exhausted, every query fails. Auth used to swallow
// those failures: the principal lookup returned null and the revocation check
// failed closed as "revoked", so each request answered 401 "session no longer
// valid" and the browser tore its cookie down. A load test on dev showed a
// pooler outage signing every user out (SKAI-1898 baseline run, 2026-11-13).
//
// Auth now raises ServiceUnavailableError for these failures instead. It is
// still fail-closed — nothing is authorized — but the client hears 503 "try
// again" and keeps its session.
// ─────────────────────────────────────────────────────────────────

/** Prisma codes for "could not get a working connection" (not query or data errors). */
const UNAVAILABLE_CODES = new Set([
  "P1001", // can't reach database server
  "P1002", // database server reached but timed out
  "P1008", // operations timed out
  "P1017", // server closed the connection
  "P2024", // timed out fetching a connection from the pool
]);

const UNAVAILABLE_MESSAGE = /EMAXCONN|max client connections|too many (clients|connections)|can't reach database server|connection pool|database not reachable|timeout exceeded when trying to connect|connection terminated|terminating connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i;

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  if (name === "PrismaClientInitializationError") return true;
  if (typeof code === "string" && UNAVAILABLE_CODES.has(code)) return true;
  // Raw queries through the pg driver adapter fail as P2010 with the driver's text in meta.message.
  const metaMessage = (error as { meta?: { message?: unknown } }).meta?.message;
  return (typeof message === "string" && UNAVAILABLE_MESSAGE.test(message)) || (typeof metaMessage === "string" && UNAVAILABLE_MESSAGE.test(metaMessage));
}

/** A temporary outage of a dependency. Answered as 503 with Retry-After; never as 401. */
export class ServiceUnavailableError extends Error {
  readonly status = 503;
  readonly code = "SERVICE_UNAVAILABLE";
  constructor(readonly retryAfterSeconds = 5, message = "The service is busy. Please try again in a moment.") {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}
