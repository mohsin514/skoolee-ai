import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1434: a reused idempotency key on a supplier return is compared with the stored return, not replayed blindly.
const service = readFileSync("src/lib/purchasing/service.ts", "utf8");
const body = service.slice(service.indexOf("export async function returnToSupplier"), service.indexOf("export async function recordInvoice"));

test("SKAI-1434: the idempotent replay runs after the request and line are resolved and compares the stored return", () => {
  const lookup = body.indexOf("purchaseRequest.findFirst");
  const replay = body.indexOf("itemTransaction.findFirst");
  assert.ok(lookup > -1 && replay > lookup, "request lookup must come before the replay check");
  assert.match(body, /already used for a different return\.", 409\)/);
  assert.match(body, /prior\.quantity === input\.quantity/);
  assert.match(body, /prior\.note === `\$\{r\.poNumber\} returned to supplier: \$\{input\.reason\}`/);
  assert.ok(body.indexOf("already used for a different return") < body.indexOf("You can only return what was received"), "replay check must precede the received-quantity check");
});
