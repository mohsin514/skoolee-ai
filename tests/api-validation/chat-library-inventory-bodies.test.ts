import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody, readJsonBody } from "../../src/lib/api/validate";
import { jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";
import { parseWith } from "../../src/lib/api/validate";
import { bookPatchSchema, bookSchema } from "../../src/lib/validators/operations";

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

// SKAI-2153: the books API validates server-side, not only in the form.
const rejected = (schema: Parameters<typeof parseWith>[0], value: unknown) => {
  try { parseWith(schema, value); return null; } catch (error) { const r = errorResponse(error); return r.status; }
};

test("book create rejects a bad ISBN, an oversized title, fractional or huge copies and non-string titles with 400", () => {
  assert.equal(rejected(bookSchema, { title: "t", isbn: "abc-not-an-isbn!!", copiesTotal: 2 }), 400);
  assert.equal(rejected(bookSchema, { title: "x".repeat(5021), copiesTotal: 1 }), 400);
  assert.equal(rejected(bookSchema, { title: "t", copiesTotal: 1.5 }), 400);
  assert.equal(rejected(bookSchema, { title: "t", copiesTotal: 3_000_000_000 }), 400);
  assert.equal(rejected(bookSchema, { title: "t", author: "a".repeat(3000), copiesTotal: 1 }), 400);
  assert.equal(rejected(bookSchema, { title: { a: 1 }, copiesTotal: 1 }), 400);
  assert.equal(rejected(bookSchema, { title: "   ", copiesTotal: 1 }), 400);
  assert.deepEqual(parseWith(bookSchema, { title: "Dune", isbn: "978-0-306-40615-7", copiesTotal: "3" }), { title: "Dune", isbn: "9780306406157", copiesTotal: 3 });
});

test("book patch rejects a blank or non-string title and out-of-range copies, keeps clears and partial updates", () => {
  assert.equal(rejected(bookPatchSchema, { id: "b1", title: "" }), 400);
  assert.equal(rejected(bookPatchSchema, { id: "b1", title: 12345 }), 400);
  assert.equal(rejected(bookPatchSchema, { id: "b1", isbn: "12345" }), 400);
  assert.equal(rejected(bookPatchSchema, { id: "b1", copiesTotal: 99_999_999_999 }), 400);
  assert.equal(rejected(bookPatchSchema, { title: "no id" }), 400);
  assert.deepEqual(parseWith(bookPatchSchema, { id: "b1", copiesTotal: 4 }), { id: "b1", copiesTotal: 4 });
  const cleared = parseWith(bookPatchSchema, { id: "b1", author: "", categoryId: "", isbn: null });
  assert.deepEqual(cleared, { id: "b1", author: null, categoryId: null, isbn: null });
});
