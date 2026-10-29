import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: password write routes.
const ADOPTED_ROUTES = [
  "src/app/api/auth/change-password/route.ts",
  "src/app/api/auth/first-password/route.ts",
  "src/app/api/auth/login/route.ts",
  "src/app/api/auth/signup-step2/route.ts",
  "src/app/api/super/users/[id]/password/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("password routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("password routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("password id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("password write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)(?!\.catch)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});

test("preserved password fields reach the handler byte-for-byte", async () => {
  const password = "  pa ss\tw​ord  ";
  const body = await parseBody(post(JSON.stringify({ email: "  a@b.co  ", password, nested: { password: " x " } })), jsonObjectBody, { preserve: ["password"] });
  assert.equal(body.password, password);
  assert.notEqual(body.email, "  a@b.co  ");
});

test("preserve never lets a non-string through unsanitised", async () => {
  const body = await parseBody(post(JSON.stringify({ password: { __proto__x: " y " } })), jsonObjectBody, { preserve: ["password"] });
  assert.equal(typeof body.password, "object");
});

test("login and first-password return the boundary's 400 instead of a generic 500", () => {
  for (const file of ["src/app/api/auth/login/route.ts", "src/app/api/auth/first-password/route.ts"]) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.match(source, /catch \(error\) \{\n\s*\/\/[^\n]*\n\s*if \(error instanceof ApiError\) return errorResponse\(error\);/, file);
  }
});
