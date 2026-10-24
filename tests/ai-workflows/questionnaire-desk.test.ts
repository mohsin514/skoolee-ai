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

test("the principal's answers compile to teacher assignments by name, a weekly cap and a grading draft the registry accepts", async () => {
  const { compilePrincipal } = await import("../../src/lib/ai-workflows/questionnaire/roles/principal");
  const prefill = { language: null, cycleStatus: "ACTIVE", classes: [{ id: "c1", label: "7 B", classTeacherId: null }], subjects: [{ id: "s1", label: "Maths · 7 B", teacherId: null }], teachers: [{ id: "t1", name: "Noor Fatima" }] };
  const steps = compilePrincipal({ firstPriority: ["TEACHERS"], classTeachers: { c1: "t1" }, subjectTeachers: { s1: "t1", ghost: "t1" }, teacherWeeklyCap: 28, gradingDraft: "YES" }, prefill);
  assert.deepEqual(steps.map(step => step.capabilityKey), ["personal.save_plan", "academic.class.assign_teacher", "academic.subject.assign_teacher", "staff.set_workload_capacity", "academic.model.create_draft"]);
  for (const step of steps) assert.ok(capability(step.capabilityKey)!.input.safeParse(step.input).success, `${step.capabilityKey} ${JSON.stringify(step.input)}`);
  assert.ok(!steps.some(step => /period|room|holiday|publish|activate/.test(step.capabilityKey)), "periods, rooms, publishing and activation are never compiled for the principal");
});

test("the group sheet creates campuses only within the plan, and the rest becomes a plan-change task", async () => {
  const { compileGroup, GROUP_QUESTIONNAIRE } = await import("../../src/lib/ai-workflows/questionnaire/roles/group");
  const prefill = { language: null, campuses: [{ id: "c1", name: "Main", city: "Lahore" }], maxCampuses: 2 };
  const answers = { newCampuses: [{ name: "Gulberg", city: "Lahore" }, { name: "DHA", city: "Lahore" }, { name: "Main", city: "Lahore" }] };
  const steps = compileGroup(answers, prefill);
  assert.deepEqual(steps.map(step => (step.input as { name: string }).name), ["Gulberg"], "one free place on the plan; an existing campus is never re-created");
  assert.ok(GROUP_QUESTIONNAIRE.remains(answers, prefill).some(task => /bigger plan/.test(task.title.en)));
});

test("the owner sheet never compiles pricing, capacity, provisioning or payments", async () => {
  const { compileOwner } = await import("../../src/lib/ai-workflows/questionnaire/roles/owner");
  const steps = compileOwner({ language: "ur", focusAreas: ["PAYMENTS", "CAPACITY"], institutionFixes: { s1: "Karachi", ghost: "X" } }, { language: "en", missingCity: [{ id: "s1", name: "Al-Noor" }] });
  assert.deepEqual(steps.map(step => step.capabilityKey), ["profile.update", "personal.save_plan", "platform.update_institution"]);
  assert.ok(!steps.some(step => /pricing|capacity|provision|payment|plan_status|session/.test(step.capabilityKey)));
});
