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
  "P1010", // user was denied access: the pooler refusing a tenant/login under load (SKAI-1962)
  "P1011", // error opening a TLS connection
  "P1017", // server closed the connection
  "P2024", // timed out fetching a connection from the pool
  "P2028", // transaction API error: could not start a transaction in time
]);

const UNAVAILABLE_MESSAGE = /EMAXCONN|max client connections|too many (clients|connections)|remaining connection slots|can't reach database server|connection pool|database not reachable|timeout exceeded when trying to connect|connection terminated|terminating connection|statement timeout|canceling statement due to|Tenant or user not found|denied access on the database|is not permitted to log in|password authentication failed|Unable to start a transaction in the given time|Transaction already closed|ECHECKOUTTIMEOUT|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i;

/**
 * SQLSTATEs that mean "the server cannot serve this right now", not "this query is wrong": class 08 (connection),
 * class 53 (insufficient resources, e.g. 53300 too_many_connections), 57P01-03 (shutdown, cannot connect now) and
 * 57014 (query_canceled, which is what statement_timeout raises). Class 28 (invalid authorization: the app's own
 * database role refused, e.g. "role ... is not permitted to log in") is the server refusing the app, never the
 * signed-in user's fault, so it is an outage too (SKAI-1962). Constraint and syntax classes stay errors.
 */
const UNAVAILABLE_SQLSTATE = /^(08[0-9A-Z]{3}|28[0-9A-Z]{3}|53[0-9A-Z]{3}|57P0[123]|57014)$/;

/**
 * The Postgres SQLSTATE, wherever this error carries it: the pg driver's `code`, P2010's `meta.code`, the driver
 * adapter's cause, or the engine's message text (`PostgresError { code: "57014", ... }`, "Code: `57014`").
 */
export function sqlState(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: unknown; message?: unknown; cause?: { code?: unknown; originalCode?: unknown }; meta?: { code?: unknown; message?: unknown; driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } } };
  const adapter = e.meta?.driverAdapterError?.cause;
  for (const value of [e.code, e.meta?.code, adapter?.originalCode, adapter?.code, e.cause?.originalCode, e.cause?.code]) {
    if (typeof value === "string" && /^[0-9A-Z]{5}$/.test(value) && !/^P\d{4}$/.test(value)) return value;
  }
  const text = `${String(e.message ?? "")} ${String(e.meta?.message ?? "")}`;
  return /code: "([0-9A-Z]{5})"|Code: `([0-9A-Z]{5})`/.exec(text)?.slice(1).find(Boolean) ?? null;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  if (name === "PrismaClientInitializationError") return true;
  if (typeof code === "string" && UNAVAILABLE_CODES.has(code)) return true;
  const state = sqlState(error);
  if (state && UNAVAILABLE_SQLSTATE.test(state)) return true;
  // Raw queries through the pg driver adapter fail as P2010 with the driver's text in meta.message.
  const metaMessage = (error as { meta?: { message?: unknown } }).meta?.message;
  return (typeof message === "string" && UNAVAILABLE_MESSAGE.test(message)) || (typeof metaMessage === "string" && UNAVAILABLE_MESSAGE.test(metaMessage));
}

/**
 * Which kind of outage, for logs and the `x-db-unavailable` response header (no secrets, no hosts): the pooler
 * refusing clients, a connection that took too long to open, a statement cancelled by statement_timeout, the
 * pooler denying the login, an unreachable server, or a dropped connection.
 */
export type UnavailableReason = "max-clients" | "connect-timeout" | "statement-timeout" | "refused" | "unreachable" | "terminated" | "other";

export function unavailableReason(error: unknown): UnavailableReason {
  const e = (error ?? {}) as { message?: unknown; code?: unknown; meta?: { message?: unknown }; reason?: unknown };
  if (typeof e.reason === "string") return e.reason as UnavailableReason;
  const state = sqlState(error) ?? "";
  const text = `${String(e.message ?? "")} ${String(e.meta?.message ?? "")} ${String(e.code ?? "")} ${state}`;
  if (/EMAXCONN|max client connections|too many (clients|connections)|remaining connection slots|\b53300\b/i.test(text)) return "max-clients";
  if (/statement timeout|canceling statement due to|\b57014\b/i.test(text)) return "statement-timeout";
  if (/timeout exceeded when trying to connect|timed out fetching a new connection|Unable to start a transaction in the given time|ECHECKOUTTIMEOUT|P2024|P2028|ETIMEDOUT|P1002|P1008/i.test(text)) return "connect-timeout";
  if (/Tenant or user not found|denied access on the database|is not permitted to log in|password authentication failed|P1010|\b28(000|P01)\b/i.test(text)) return "refused";
  if (/database not reachable|can't reach database server|ECONNREFUSED|P1001/i.test(text)) return "unreachable";
  if (/connection terminated|terminating connection|ECONNRESET|P1017|\b57P0[123]\b|\b08\d{3}\b/i.test(text)) return "terminated";
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
