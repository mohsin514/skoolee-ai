import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-81: contract checks on self-serve school registration (step 2 creates the tenant).
const lib = readFileSync(new URL("../../src/lib/auth/register.ts", import.meta.url), "utf8");
const step1 = readFileSync(new URL("../../src/app/api/auth/signup-step1/route.ts", import.meta.url), "utf8");
const step2 = readFileSync(new URL("../../src/app/api/auth/signup-step2/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/app/(auth)/register/page.tsx", import.meta.url), "utf8");

test("the tenant is created in one batched transaction, not an interactive one", () => {
  assert.match(lib, /prisma\.\$transaction\(\[/);
  assert.doesNotMatch(lib, /\$transaction\(async/);
  const batch = lib.slice(lib.indexOf("prisma.$transaction(["));
  for (const write of ["prisma.school.create", "prisma.user.create", "prisma.localePolicy.create", "prisma.pendingRegistration.delete"]) {
    assert.ok(batch.indexOf(write) > 0, write);
  }
  // Rows reference ids minted before the batch, never a value read back mid-transaction.
  assert.match(lib, /const schoolId = randomUUID\(\)/);
  assert.match(lib, /createdBy: user\.id/);
});

test("bcrypt and duplicate checks run before the transaction, email after it", () => {
  const tx = lib.indexOf("prisma.$transaction([");
  assert.ok(lib.indexOf("bcrypt.hash(valid.password") < tx);
  assert.ok(lib.indexOf("school.findUnique({ where: { regId") < tx);
  assert.ok(lib.indexOf("createVerificationToken(user.id)") > tx);
});

test("the server enforces the same password policy as the form checklist", () => {
  assert.match(lib, /resetPasswordProblem\(value\)/);
  assert.doesNotMatch(lib, /password: z\.string\(\)\.min\(8/);
});

test("an existing owner address reads exactly like a new one (no enumeration)", () => {
  assert.match(lib, /if \(existingSchoolByEmail\) return existingAddressOutcome\(valid\)/);
  assert.match(lib, /target\.includes\("contact_email"\)[^\n]*existingAddressOutcome/);
  assert.match(step2, /The account id is not returned/);
});

test("a Reg ID race is a coded duplicate, not a 500", () => {
  assert.match(lib, /target\.includes\("reg_id"\)[^\n]*code: "reg_id_taken"/);
});

test("both steps are rate limited per IP with a coded 429", () => {
  for (const route of [step1, step2]) {
    assert.match(route, /rateLimit\(`signup2?:\$\{ip\}`/);
    assert.match(route, /code: "rate_limited"[\s\S]*status: 429/);
  }
});

test("every server code is localized in EN, AR and UR", () => {
  for (const code of ["reg_id_taken", "rate_limited", "step1_missing", "duplicate"]) {
    assert.equal(page.split(`${code}: "`).length - 1, 3, code);
  }
  assert.match(page, /throw new Error\(serverError\(step2\)/);
});
