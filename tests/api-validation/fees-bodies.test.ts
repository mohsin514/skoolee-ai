import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { errorResponse } from "../../src/lib/api/scope";
import { parseBody } from "../../src/lib/api/validate";
import { idBody, jsonObjectBody, requiredIdBody } from "../../src/lib/validators/route-bodies";

// Batch 1 (fees) of SKAI-1161.
const ADOPTED_ROUTES = [
  "src/app/api/fees/adjustments/route.ts",
  "src/app/api/fees/assignments/route.ts",
  "src/app/api/fees/carry-forwards/route.ts",
  "src/app/api/fees/collect/route.ts",
  "src/app/api/fees/discount-assignments/route.ts",
  "src/app/api/fees/discounts/route.ts",
  "src/app/api/fees/fine-rules/route.ts",
  "src/app/api/fees/generate-invoices/route.ts",
  "src/app/api/fees/groups/route.ts",
  "src/app/api/fees/invoices/[invoiceId]/route.ts",
  "src/app/api/fees/master-lines/route.ts",
  "src/app/api/fees/pay-online/route.ts",
  "src/app/api/fees/payment-plans/route.ts",
  "src/app/api/fees/payment/route.ts",
  "src/app/api/fees/reconciliations/route.ts",
  "src/app/api/fees/structure/[structureId]/route.ts",
  "src/app/api/fees/structure/route.ts",
  "src/app/api/fees/types/route.ts",
];

const post = (body: string) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return errorResponse(error).status;
  }
}

test("malformed and non-object bodies are rejected with 400", async () => {
  for (const raw of ["{not json", "[]", "null", "\"text\"", "42"]) {
    assert.equal(await statusOf(parseBody(post(raw), jsonObjectBody)), 400, raw);
  }
});

test("object bodies pass through with unknown keys intact", async () => {
  const body = await parseBody(post(JSON.stringify({ name: "Tuition", amount: "1200", nested: { a: 1 } })), jsonObjectBody);
  assert.deepEqual(body, { name: "Tuition", amount: "1200", nested: { a: 1 } });
});

test("id bodies require a non-empty id and report it by field", async () => {
  for (const raw of [{}, { id: "" }, { id: "   " }, { id: 7 }]) {
    const response = errorResponse(await parseBody(post(JSON.stringify(raw)), idBody).catch((e) => e));
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).details, { id: ["id required"] });
  }
  assert.deepEqual(await parseBody(post(JSON.stringify({ id: "fee_1", name: "x" })), idBody), { id: "fee_1", name: "x" });
});

test("named id bodies label the missing field", async () => {
  const response = errorResponse(await parseBody(post("{}"), requiredIdBody("invoiceId")).catch((e) => e));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).details, { invoiceId: ["invoiceId required"] });
});

test("fees write routes read their bodies through parseBody, not req.json()", () => {
  for (const file of ADOPTED_ROUTES) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /await (req|request)\.json\(\)/, file);
    assert.match(source, /parseBody\(/, file);
  }
});
