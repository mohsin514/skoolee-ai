import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { compileReceptionist } from "../../src/lib/ai-workflows/questionnaire/roles/receptionist";
import { compileLibrarian } from "../../src/lib/ai-workflows/questionnaire/roles/librarian";
import { capability } from "../../src/lib/ai-workflows/registry";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

test("the receptionist's paper desk compiles to call, post and enquiry steps whose inputs the registry accepts", () => {
  const steps = compileReceptionist({
    openCallbacks: [{ name: "Mr Ahmed", phone: "0300 1234567", purpose: "Fee query" }, { name: "x" }],
    openPost: [{ addressee: "Principal", sender: "Board office", kind: "LETTER" }],
    openEnquiries: [{ parentName: "Mrs Khan", phone: "0300 7654321", childName: "Zara", grade: "Grade 1" }],
    deskRoutine: ["Return keys"],
  }, { language: "en", today: "2026-10-26" });
  assert.deepEqual(steps.map(step => step.capabilityKey), ["front_desk.call_log", "front_desk.postal_log", "enquiries.create", "personal.save_plan"]);
  for (const step of steps) assert.ok(capability(step.capabilityKey)!.input.safeParse(step.input).success, `${step.capabilityKey} ${JSON.stringify(step.input)}`);
});

test("the librarian's sheet never sets money: fines go to the administrator as a proposal", () => {
  const prefill = { rules: { loanDays: 14, maxLoans: 3, maxRenewals: 2, holdDays: 3, finePerDay: 0, lostCharge: 0, currency: "PKR" }, categories: ["Fiction"], subjects: [], books: 0 };
  const steps = compileLibrarian({ loanRules: { loanDays: 21, maxLoans: 3, maxRenewals: 2, holdDays: 3 }, lateFines: { charge: "YES", perDay: 10 }, sections: ["Fiction", "Reference"], firstTitles: [{ title: "Atlas", isbn: "978", copies: "2" }] }, prefill);
  const rules = steps.find(step => step.capabilityKey === "library.desk_save_rules")!;
  assert.ok(!JSON.stringify(rules.input).includes("fine"), "loan rules carry no money");
  assert.ok(steps.some(step => step.capabilityKey === "library.desk_save_rules_money"));
  assert.equal(steps.filter(step => step.capabilityKey === "library.category_create").length, 1, "existing sections are kept");
});
