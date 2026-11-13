import { test } from "node:test";
import assert from "node:assert/strict";
import { isDatabaseUnavailable, ServiceUnavailableError } from "../../src/lib/db/availability";
import { errorResponse, ApiError } from "../../src/lib/api/scope";

const prismaError = (code: string, message = "x") => Object.assign(new Error(message), { name: "PrismaClientKnownRequestError", code });

test("connection failures are classified as the database being unavailable", () => {
  for (const code of ["P1001", "P1002", "P1008", "P1017", "P2024"]) assert.equal(isDatabaseUnavailable(prismaError(code)), true, code);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error("init"), { name: "PrismaClientInitializationError" })), true);
  assert.equal(isDatabaseUnavailable(new Error("FATAL: (EMAXCONN) max client connections reached, limit: 200")), true);
  assert.equal(isDatabaseUnavailable(new Error("Timed out fetching a new connection from the connection pool")), true);
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
