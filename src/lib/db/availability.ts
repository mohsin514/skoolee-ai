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

/**
 * Which kind of outage, for logs and the `x-db-unavailable` response header (no secrets, no hosts): the pooler
 * refusing clients, a connection that took too long to open, an unreachable server, or a dropped connection.
 */
export type UnavailableReason = "max-clients" | "connect-timeout" | "unreachable" | "terminated" | "other";

export function unavailableReason(error: unknown): UnavailableReason {
  const e = (error ?? {}) as { message?: unknown; code?: unknown; meta?: { message?: unknown }; reason?: unknown };
  if (typeof e.reason === "string") return e.reason as UnavailableReason;
  const text = `${String(e.message ?? "")} ${String(e.meta?.message ?? "")} ${String(e.code ?? "")}`;
  if (/EMAXCONN|max client connections|too many (clients|connections)/i.test(text)) return "max-clients";
  if (/timeout exceeded when trying to connect|timed out fetching a new connection|P2024|ETIMEDOUT|P1002|P1008/i.test(text)) return "connect-timeout";
  if (/database not reachable|can't reach database server|ECONNREFUSED|P1001/i.test(text)) return "unreachable";
  if (/connection terminated|terminating connection|ECONNRESET|P1017/i.test(text)) return "terminated";
  return "other";
}

/** A temporary outage of a dependency. Answered as 503 with Retry-After; never as 401. */
export class ServiceUnavailableError extends Error {
  readonly status = 503;
  readonly code = "SERVICE_UNAVAILABLE";
  constructor(readonly retryAfterSeconds = 5, message = "The service is busy. Please try again in a moment.", readonly reason: UnavailableReason = "other") {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}
