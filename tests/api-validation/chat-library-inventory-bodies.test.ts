import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch of SKAI-1161: chat, library and inventory write routes.
const ADOPTED_ROUTES = [
  "src/app/api/chat/attachments/route.ts",
  "src/app/api/chat/conversations/[id]/members/route.ts",
  "src/app/api/chat/conversations/[id]/messages/route.ts",
  "src/app/api/chat/conversations/[id]/route.ts",
  "src/app/api/chat/conversations/route.ts",
  "src/app/api/chat/messages/[id]/route.ts",
  "src/app/api/chat/settings/route.ts",
  "src/app/api/inventory/categories/route.ts",
  "src/app/api/inventory/items/route.ts",
  "src/app/api/inventory/stores/route.ts",
  "src/app/api/inventory/suppliers/route.ts",
  "src/app/api/inventory/transactions/route.ts",
  "src/app/api/library/books/route.ts",
  "src/app/api/library/categories/route.ts",
  "src/app/api/library/desk/route.ts",
  "src/app/api/library/issues/route.ts",
  "src/app/api/library/members/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

const statusOf = (promise: Promise<unknown>) =>
  promise.then(() => 200, (error) => errorResponse(error).status);

test("chat, library and inventory routes reject malformed JSON with 400, not 500", async () => {
  assert.equal(await statusOf(readJsonBody(post("{not json"))), 400);
  assert.equal(await statusOf(parseBody(post("[1,2]"), jsonObjectBody)), 400);
});

test("chat, library and inventory routes keep valid bodies intact", async () => {
  const body = { studentId: "stu_1", userId: "usr_1", note: "kept", extra: { nested: true } };
  assert.deepEqual(await parseBody(post(JSON.stringify(body)), jsonObjectBody), body);
});

test("chat, library and inventory id lookups report the missing field", async () => {
  const response = errorResponse(await parseBody(post("{\"userId\":\"\"}"), requiredIdBody("userId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { userId: ["userId required"] });
});

test("chat, library and inventory write routes read bodies through the shared helper", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)(?!\.catch)/, file);
    assert.match(source, /(parseBody|readJsonBody)\(/, file);
  }
});
