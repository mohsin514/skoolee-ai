import assert from "node:assert/strict";
import { test } from "node:test";
import { VERIFY_LIMIT, verifyCertificate, type VerifyRow } from "../../src/lib/certificates/verify";

// SKAI-529: the public certificate check answers only by an exact token, reveals only the printed face,
// reads unissued documents as unknown and stops a client that keeps guessing.
const token = "A".repeat(24);
const row = (over: Partial<VerifyRow> = {}): VerifyRow => ({ serial: "QA-CERT-0001", title: "Leaving certificate", status: "ISSUED", issuedAt: new Date("2026-10-01T09:00:00Z"), revokedAt: null, school: { name: "QA Alpha School" }, successors: [], ...over });
let client = 0;
const fresh = () => `test-${++client}`;

test("a valid issued document returns only the printed face", async () => {
  const outcome = await verifyCertificate(token, fresh(), async value => (value === token ? row() : null));
  assert.deepEqual(outcome, { kind: "found", data: { serial: "QA-CERT-0001", title: "Leaving certificate", school: "QA Alpha School", issuedOn: "2026-10-01", state: "VALID" } });
});

test("revoked and superseded documents say so with their date or replacement", async () => {
  const revoked = await verifyCertificate(token, fresh(), async () => row({ status: "REVOKED", revokedAt: new Date("2026-10-20T00:00:00Z") }));
  assert.equal(revoked.kind === "found" && revoked.data.state, "REVOKED");
  assert.equal(revoked.kind === "found" && revoked.data.revokedOn, "2026-10-20");
  const replaced = await verifyCertificate(token, fresh(), async () => row({ status: "SUPERSEDED", successors: [{ serial: "QA-CERT-0002" }] }));
  assert.equal(replaced.kind === "found" && replaced.data.replacedBy, "QA-CERT-0002");
});

test("pending, rejected, unissued and unknown documents are indistinguishable", async () => {
  for (const issue of [row({ status: "PENDING_APPROVAL" }), row({ status: "REJECTED" }), row({ issuedAt: null }), null]) {
    assert.deepEqual(await verifyCertificate(token, fresh(), async () => issue), { kind: "unknown" });
  }
});

test("a malformed token never reaches the database", async () => {
  let looked = false;
  for (const bad of ["", "short", "x".repeat(41), `${"a".repeat(20)}' OR 1=1`]) {
    assert.deepEqual(await verifyCertificate(bad, fresh(), async () => { looked = true; return row(); }), { kind: "unknown" });
  }
  assert.equal(looked, false);
});

test("one client is limited after the per-minute budget; another client is not", async () => {
  const guesser = fresh();
  for (let index = 0; index < VERIFY_LIMIT; index++) assert.equal((await verifyCertificate(token, guesser, async () => null)).kind, "unknown");
  assert.deepEqual(await verifyCertificate(token, guesser, async () => row()), { kind: "limited" });
  assert.equal((await verifyCertificate(token, fresh(), async () => row())).kind, "found");
});

test("two schools' certificates never leak into each other's answers", async () => {
  const alphaToken = "B".repeat(24), betaToken = "C".repeat(24);
  const store: Record<string, VerifyRow> = { [alphaToken]: row({ serial: "QA-A-0001", school: { name: "QA Alpha School" } }), [betaToken]: row({ serial: "QA-B-0001", school: { name: "QA Beta School" } }) };
  const lookup = async (value: string) => store[value] ?? null;
  const alpha = await verifyCertificate(alphaToken, fresh(), lookup);
  const beta = await verifyCertificate(betaToken, fresh(), lookup);
  assert.equal(alpha.kind === "found" && `${alpha.data.serial}|${alpha.data.school}`, "QA-A-0001|QA Alpha School");
  assert.equal(beta.kind === "found" && `${beta.data.serial}|${beta.data.school}`, "QA-B-0001|QA Beta School");
});
