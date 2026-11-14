import { test } from "node:test";
import assert from "node:assert/strict";
import { isDatabaseUnavailable, ServiceUnavailableError, sqlState, unavailableReason } from "../../src/lib/db/availability";
import { checkRevocationStrict, worthRetrying, type SessionLookup } from "../../src/lib/auth/session-revocation";
import { examUnavailableHeaders, examUnavailablePage, wantsExamUnavailablePage } from "../../src/lib/school-ai/exam-boundary-unavailable";
import { engineFailureIsOutage } from "../../src/lib/auth";
import { errorResponse, ApiError } from "../../src/lib/api/scope";

const prismaError = (code: string, message = "x") => Object.assign(new Error(message), { name: "PrismaClientKnownRequestError", code });

test("connection failures are classified as the database being unavailable", () => {
  for (const code of ["P1001", "P1002", "P1008", "P1017", "P2024"]) assert.equal(isDatabaseUnavailable(prismaError(code)), true, code);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("init"), { name: "PrismaClientInitializationError" })), true);
  assert.equal(isDatabaseUnavailable(new Error("FATAL: (EMAXCONN) max client connections reached, limit: 200")), true);
  assert.equal(isDatabaseUnavailable(new Error("Timed out fetching a new connection from the connection pool")), true);
  // pg driver adapter (SKAI-1910): raw queries fail as P2010 carrying the driver's message.
  assert.equal(isDatabaseUnavailable(Object.assign(prismaError("P2010", "Raw query failed. Code: `N/A`."), { meta: { code: "N/A", message: "Database not reachable: 127.0.0.1:55699" } })), true);
  assert.equal(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect")), true);
});

test("data and query errors are not outages", () => {
  assert.equal(isDatabaseUnavailable(prismaError("P2002", "Unique constraint failed")), false);
  assert.equal(isDatabaseUnavailable(prismaError("P2025", "Record not found")), false);
  assert.equal(isDatabaseUnavailable(new Error("JWSSignatureVerificationFailed")), false);
  assert.equal(isDatabaseUnavailable(null), false);
  assert.equal(isDatabaseUnavailable("EMAXCONN"), false);
});

test("an outage answers 503 with Retry-After, never 401 or a generic 500", async () => {
  for (const error of [new ServiceUnavailableError(), prismaError("P1001", "Can't reach database server")]) {
    const res = errorResponse(error, "Request failed");
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "5");
    assert.deepEqual(await res.json(), { error: "The service is busy. Please try again in a moment.", code: "SERVICE_UNAVAILABLE" });
  }
});

test("other errors keep their existing responses", async () => {
  assert.equal(errorResponse(new ApiError("Unauthorized", 401)).status, 401);
  assert.equal(errorResponse(new Error("boom")).status, 500);
  assert.equal(errorResponse(prismaError("P2002")).status, 500);
});

test("the outage reason is named for logs and the x-db-unavailable header", () => {
  assert.equal(unavailableReason(new Error("FATAL: (EMAXCONN) max client connections reached, limit: 200")), "max-clients");
  assert.equal(unavailableReason(new Error("timeout exceeded when trying to connect")), "connect-timeout");
  assert.equal(unavailableReason(Object.assign(prismaError("P2010", "Raw query failed"), { meta: { message: "Database not reachable: 1.2.3.4:6543" } })), "unreachable");
  assert.equal(unavailableReason(new Error("Connection terminated unexpectedly")), "terminated");
  assert.equal(unavailableReason(new ServiceUnavailableError(5, undefined, "max-clients")), "max-clients");
  const res = errorResponse(new Error("timeout exceeded when trying to connect"));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("x-db-unavailable"), "connect-timeout");
});

// SKAI-1962: saturation errors seen on the private DB (statement_timeout=1ms, role NOLOGIN) were read as sign-outs.
const statementTimeoutEngine = Object.assign(new Error("Invalid `prisma.authAttempt.upsert()` invocation:\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: \"57014\", message: \"canceling statement due to statement timeout\", severity: \"ERROR\" }), transient: false })"), { name: "PrismaClientUnknownRequestError" });

test("saturation errors are outages, by SQLSTATE and by Prisma code", () => {
  assert.equal(isDatabaseUnavailable(statementTimeoutEngine), true);
  assert.equal(sqlState(statementTimeoutEngine), "57014");
  assert.equal(isDatabaseUnavailable(Object.assign(prismaError("P2010", "Raw query failed. Code: `57014`."), { meta: { code: "57014", message: "canceling statement due to statement timeout" } })), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("sorry, too many clients already"), { code: "53300" })), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("x"), { meta: { driverAdapterError: { cause: { originalCode: "57P03" } } } })), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("x"), { code: "08006" })), true);
  assert.equal(isDatabaseUnavailable(prismaError("P1010", "User was denied access on the database `(not available)`")), true);
  assert.equal(isDatabaseUnavailable(prismaError("P2028", "Unable to start a transaction in the given time.")), true);
  assert.equal(isDatabaseUnavailable(new Error("FATAL: Tenant or user not found")), true);
  assert.equal(isDatabaseUnavailable(new Error("FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute")), true);
});

test("query, constraint and programming errors stay non-outages", () => {
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" })), false);
  assert.equal(isDatabaseUnavailable(Object.assign(prismaError("P2010", "Raw query failed. Code: `42601`."), { meta: { code: "42601", message: "syntax error" } })), false);
  assert.equal(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(sqlState(prismaError("P2002")), null);
});

test("saturation reasons are named, and the API answers 503 for them", async () => {
  assert.equal(unavailableReason(statementTimeoutEngine), "statement-timeout");
  assert.equal(unavailableReason(Object.assign(new Error("sorry, too many clients already"), { code: "53300" })), "max-clients");
  assert.equal(unavailableReason(new Error("remaining connection slots are reserved")), "max-clients");
  assert.equal(unavailableReason(prismaError("P1010", "User was denied access on the database")), "refused");
  assert.equal(unavailableReason(prismaError("P2028", "Unable to start a transaction in the given time.")), "connect-timeout");
  const res = errorResponse(statementTimeoutEngine, "Request failed");
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("retry-after"), "5");
  assert.equal(res.headers.get("x-db-unavailable"), "statement-timeout");
});

test("an engine failure in the session or principal read is an outage; other errors pass through", async () => {
  const panic = Object.assign(new Error("engine panicked"), { name: "PrismaClientRustPanicError" });
  await assert.rejects(engineFailureIsOutage(async () => { throw panic; }), (error: unknown) => error instanceof ServiceUnavailableError);
  const guard = new Error("Tenant guard: query on Student without schoolId");
  await assert.rejects(engineFailureIsOutage(async () => { throw guard; }), (error: unknown) => error === guard);
  assert.equal(await engineFailureIsOutage(async () => "principal"), "principal");
});

test("the strict revocation check retries a dropped connection but not a saturated database", async () => {
  for (const error of [prismaError("P2024", "Timed out fetching a new connection from the connection pool"), statementTimeoutEngine, new Error("FATAL: (EMAXCONN) max client connections reached"), new Error("connect ECONNREFUSED 127.0.0.1:5432")]) {
    let calls = 0;
    const lookup: SessionLookup = async () => { calls++; throw error; };
    await assert.rejects(checkRevocationStrict("h", lookup), (thrown: unknown) => thrown === error);
    assert.equal(calls, 1, error.message);
    assert.equal(worthRetrying(error), false);
  }
  let calls = 0;
  const dropped: SessionLookup = async () => { calls++; if (calls === 1) throw new Error("read ECONNRESET"); return [{ isActive: true }]; };
  assert.equal(await checkRevocationStrict("h", dropped), false);
  assert.equal(calls, 2);
  // The retry may use a separate, uncached lookup (isSessionRevokedStrict's fresh read).
  let fresh = 0;
  assert.equal(await checkRevocationStrict("h", async () => { throw new Error("Connection terminated unexpectedly"); }, async () => { fresh++; return []; }), true);
  assert.equal(fresh, 1);
});

test("the exam-boundary 503 carries Retry-After and gives navigations a localized page", () => {
  assert.deepEqual(examUnavailableHeaders(statementTimeoutEngine), { "Cache-Control": "private, no-store", "Retry-After": "5", "x-db-unavailable": "statement-timeout" });
  assert.equal(examUnavailableHeaders(new TypeError("bug"))["x-db-unavailable"], "other");
  assert.equal(wantsExamUnavailablePage("/student", "GET"), true);
  assert.equal(wantsExamUnavailablePage("/student", "HEAD"), true);
  assert.equal(wantsExamUnavailablePage("/api/student/today", "GET"), false);
  assert.equal(wantsExamUnavailablePage("/student", "POST"), false);
  assert.match(examUnavailablePage(undefined), /<html lang="en" dir="ltr">/);
  assert.match(examUnavailablePage("ar"), /<html lang="ar" dir="rtl">/);
  assert.match(examUnavailablePage("ur"), /<html lang="ur" dir="rtl">/);
  assert.match(examUnavailablePage("<script>"), /<html lang="en"/);
  assert.doesNotMatch(examUnavailablePage("en"), /<script|http-equiv|style=/);
});

// SKAI-1962 follow-up: the auth prefetch is a raw query, so a role the server refuses arrives as P2010 with SQLSTATE
// 28000 and the driver text in meta.message. That must be an outage (503, keep the cookie), not a sign-out.
test("a refused database role on the raw auth read is an outage named refused", () => {
  const refused = Object.assign(prismaError("P2010", "Raw query failed. Code: `28000`. Message: `role \"perf_role\" is not permitted to log in`"), { meta: { code: "28000", message: 'role "perf_role" is not permitted to log in' } });
  assert.equal(sqlState(refused), "28000");
  assert.equal(isDatabaseUnavailable(refused), true);
  assert.equal(unavailableReason(refused), "refused");
  const badPassword = Object.assign(new Error('password authentication failed for user "app"'), { code: "28P01" });
  assert.equal(isDatabaseUnavailable(badPassword), true);
  assert.equal(unavailableReason(badPassword), "refused");
  // A unique violation through the same raw path is still a normal error.
  assert.equal(isDatabaseUnavailable(Object.assign(prismaError("P2010", "Raw query failed. Code: `23505`."), { meta: { code: "23505", message: "duplicate key" } })), false);
});
