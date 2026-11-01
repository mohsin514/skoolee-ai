import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/library/desk.ts", "utf8");
const renew = source.slice(source.indexOf("export async function renewLoan"), source.indexOf("export async function reserveTitle"));

test("SKAI-1643: a renewal claims the renewal count it read and refuses a lost race with 409", () => {
  assert.match(renew, /updateMany\(\{ where: \{ id: loan\.id, schoolId: user\.schoolId, returnedAt: null, renewals: loan\.renewals \}/);
  assert.match(renew, /renewals: loan\.renewals \+ 1/);
  assert.match(renew, /claimed\.count !== 1\) throw new ApiError\([^)]*, 409\)/);
  assert.doesNotMatch(renew, /increment: 1/);
});

test("SKAI-1643: the limit and waiting-reservation checks still run before the claim", () => {
  const claim = renew.indexOf("updateMany(");
  assert.ok(renew.indexOf("loan.renewals >= rules.maxRenewals") < claim);
  assert.ok(renew.indexOf('status: "WAITING"') < claim);
});
