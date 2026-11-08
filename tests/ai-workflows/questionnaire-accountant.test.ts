import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { ACCOUNTANT_QUESTIONNAIRE, compileAccountant, type AccountantPrefill } from "../../src/lib/ai-workflows/questionnaire/roles/accountant";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });
const prefill = (overrides: Partial<AccountantPrefill> = {}): AccountantPrefill => ({ currency: "PKR", feeTypes: ["Admission fee"], feeGroups: [], grades: [{ name: "Grade 1", band: "PRIMARY" }, { name: "Grade 6", band: "MIDDLE" }], hasInvoices: false, ...overrides });

test("fee heads from the school's setup are kept; the grid ties group, line and class assignment together by name", () => {
  const steps = compileAccountant({ feeHeads: ["Admission fee", "Tuition fee"], classFeeGrid: { PRIMARY: 4500 }, paymentMethods: ["CASH"] }, prefill());
  const keys = steps.map(step => step.capabilityKey);
  assert.equal(keys.filter(key => key === "fees.create_fee_type").length, 1, "Admission fee already exists");
  const line = steps.find(step => step.capabilityKey === "fees.create_master_line")!;
  assert.deepEqual(line.input, { group: "Primary (1–5) fees", feeType: "Tuition fee", amount: 4500 });
  assert.equal(line.dependsOn?.length, 2, "waits for its group and fee head");
  assert.deepEqual((steps.find(step => step.capabilityKey === "fees.assign_fee_group")!.input as { grades: string[] }).grades, ["Grade 1"]);
  assert.ok(!keys.some(key => /invoice|collect|payment_plan/.test(key)), "no invoice, collection or charge is ever compiled");
});

test("bank accounts are names only: a number in the name is refused", () => {
  const question = ACCOUNTANT_QUESTIONNAIRE.questions.find(item => item.key === "collectionAccounts")!;
  assert.ok(question.answer(prefill()).safeParse(["Meezan Bank – Fees"]).success);
  assert.ok(!question.answer(prefill()).safeParse(["Meezan 0101-2345678-9"]).success);
});

test("late fee and discounts compile only when set", () => {
  const none = compileAccountant({ lateFeeRule: { type: "NONE" }, discountTypes: { SIBLING: 0 } }, prefill());
  assert.equal(none.length, 0);
  const some = compileAccountant({ lateFeeRule: { type: "PER_DAY", amount: 50 }, discountTypes: { SIBLING: 10, MERIT: 25 } }, prefill());
  assert.deepEqual(some.map(step => step.capabilityKey), ["fees.create_fine_rule", "fees.create_discount", "fees.create_discount"]);
});
