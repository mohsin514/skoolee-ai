import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { startAutomaticJob, advanceAutomaticJob } from "../../src/lib/automation/service";
import { automaticCatalog } from "../../src/lib/automation/catalog";
import { executeRoleAction } from "../../src/lib/automation/role-action-service";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { aiWorkflowsDestination } from "../ai-workflows/support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });
async function fixture(role: AuthUser["role"] = "CAMPUS_ADMIN") {
 const schoolId = `automatic-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
 await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic automatic school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
 await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
 await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic tester", role, isActive: true } });
 const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
 const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 };
 return { user, schoolId, campusId, cycle };
}
const reply = (decision: unknown): typeof generateAIDraft => async ({ system }) => {
 const value = decision as { type: string; action?: { tool: string; data: { proposal?: { operation: string } } } };
 const output = system.startsWith("Choose only") && value.type === "act" ? { type: "select", tool: value.action!.tool, ...(value.action!.data.proposal ? { operation: value.action!.data.proposal.operation } : {}) } : decision;
 return { text: JSON.stringify(output), model: "synthetic:test", tokensUsed: 20, promptVersion: "test" };
};
const scoped = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
test("automatic request creates five real classes, persists progress, and replays without duplicates", async () => {
 const f = await fixture(), message = "Create five classes", input = { message, campusId: f.campusId, language: "en", idempotencyKey: randomUUID() };
 let job = await startAutomaticJob(f.user, input);
 assert.equal((await startAutomaticJob(f.user, input)).id, job.id);
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "act", evidenceQuote: message, action: { tool: "school.execute", title: "Create five classes", data: { goal: message, sourceIds: [], missingInformation: [], steps: [{ id: "classes", title: message, status: "ready", module: "academics" }], proposal: { operation: "academics.setup_year", existingCycleId: f.cycle.id, academicYear: 2026, label: "2026", startDate: null, endDate: null, classes: Array.from({ length: 5 }, (_, n) => ({ id: `class-${n}`, name: `Grade ${n+1}`, section: "A", teachingMode: "SUBJECT" })) } } } }));
 assert.equal(job.status, "RUNNING", job.error ?? ""); assert.ok(job.pending);
 const version = job.version;
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version });
 assert.equal(job.status, "RUNNING", job.error ?? ""); assert.equal(job.steps.length, 1);
 assert.equal(await db.class.count({ where: { schoolId: f.schoolId } }), 5);
 await assert.rejects(() => advanceAutomaticJob(f.user, job.id, { action: "advance", version }), { status: 409 });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "complete", summary: "Five classes created." }));
 assert.equal(job.status, "COMPLETED"); assert.equal(await db.class.count({ where: { schoolId: f.schoolId } }), 5);
});
test("missing detail waits and resumes; changed access blocks execution", async () => {
 const f = await fixture(); let job = await startAutomaticJob(f.user, { message: "Create classes", campusId: f.campusId, language: "en", idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "ask", question: "Which names and sections?" }));
 assert.equal(job.status, "WAITING_INPUT");
 job = await advanceAutomaticJob(f.user, job.id, { action: "answer", version: job.version, answer: "Grade 1 A" }); assert.equal(job.status, "RUNNING");
 await db.user.update({ where: { id: f.user.userId }, data: { accessVersion: 1 } });
 await assert.rejects(() => advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }), { status: 403 });
});
test("all role catalogues exclude unrelated operational tools", async () => {
 for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "PARENT", "STUDENT", "APP_OWNER"] as const) {
  const f = await fixture(role), catalog = await scoped(f.user, () => automaticCatalog(f.user, f.campusId));
  assert.equal("students.create" in catalog.tools, role === "ADMIN" || role === "CAMPUS_ADMIN", role);
  assert.equal("campus.create" in catalog.tools, role === "SUPER_ADMIN", role);
  assert.equal("library.create_books" in catalog.tools, ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN"].includes(role), role);
  assert.equal("front_desk.log_call" in catalog.tools, ["RECEPTIONIST", "ADMIN", "CAMPUS_ADMIN"].includes(role), role);
  assert.equal(catalog.operations.includes("academics.setup_year"), role === "ADMIN" || role === "CAMPUS_ADMIN", role);
  if (role === "ACCOUNTANT") assert.deepEqual(catalog.operations.sort(), ["fees.generate_invoices", "finance.apply_operation"]);
 }
});
test("library creation has atomic replay and cannot cross roles", async () => {
 const f = await fixture("LIBRARIAN"), key = randomUUID(); const action = { tool: "library.create_books" as const, title: "Add book", data: { books: [{ title: "Synthetic mathematics", copiesTotal: 3 }] } };
 await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
 await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
 assert.equal(await db.book.count({ where: { schoolId: f.schoolId } }), 1);
 await assert.rejects(() => scoped(f.user, () => executeRoleAction({ ...f.user, role: "TEACHER" }, f.campusId, randomUUID(), action)), { status: 403 });
});
test("students use native roster commit once without sending account invitations", async () => {
 const f = await fixture(); const cls = await db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Grade 1", academicYear: 2026, status: "ACTIVE" } });
 const action = { tool: "students.create" as const, title: "Add student", data: { students: [{ fullName: "Synthetic pupil", classId: cls.id, rollNo: "QA-1", gender: "OTHER" as const, guardianPhone: "+15555550123", guardianEmail: "guardian@example.invalid", address: "Synthetic street", city: "Test", medicalNotes: "None reported in this synthetic fixture" }] } }, key = randomUUID();
 await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
 await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
 assert.equal(await db.student.count({ where: { schoolId: f.schoolId } }), 1);
 assert.equal(await db.user.count({ where: { schoolId: f.schoolId, role: "PARENT" } }), 0);
 assert.equal((await db.student.findFirstOrThrow({ where: { schoolId: f.schoolId } })).guardianEmail, "guardian@example.invalid");
});
test("worker advances saved work without a browser and rechecks revoked access", async () => {
 const { sweepAutomaticJobs } = await import("../../src/lib/automation/worker");
 const f = await fixture(); const job = await startAutomaticJob(f.user, { message: "Set up my workspace", intent: "setup", campusId: f.campusId, language: "en", idempotencyKey: randomUUID() });
 await sweepAutomaticJobs(db, 4, reply({ type: "ask", question: "Which class names should I create?" }));
 const saved = JSON.parse((await db.schoolAiRequest.findUniqueOrThrow({ where: { id: job.id } })).reply!);
 assert.equal(saved.status, "WAITING_INPUT");
 await advanceAutomaticJob(f.user, job.id, { action: "answer", answer: "Grade 3", version: saved.version });
 await db.user.update({ where: { id: f.user.userId }, data: { accessVersion: 1 } });
 await sweepAutomaticJobs(db, 4, async () => { throw new Error("Revoked access must never reach the provider"); });
 assert.equal(JSON.parse((await db.schoolAiRequest.findUniqueOrThrow({ where: { id: job.id } })).reply!).status, "FAILED");
});
test("family plans stay private; a student cannot create campus records", async () => {
 const f = await fixture("STUDENT"), key = randomUUID();
 const action = { tool: "personal.save_plan" as const, title: "Study plan", data: { title: "Study plan", goal: "Practice fractions", steps: [{ title: "Practice", detail: "Ten minutes of fractions", dueDate: null }] } };
 const first = await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
 assert.equal(first?.visibility, "PRIVATE");
 const second = await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action)); assert.deepEqual(first, second);
 await assert.rejects(() => scoped(f.user, () => executeRoleAction(f.user, f.campusId, randomUUID(), { tool: "campus.create", title: "Invalid campus", data: { name: "Denied", city: "Test" } })), { status: 403 });
});
test("group campus creation and platform profile updates are role scoped and replay safe", async () => {
 const group = await fixture("SUPER_ADMIN"), key = randomUUID();
 const action = { tool: "campus.create" as const, title: "Create campus", data: { name: "Second campus", city: "Test" } };
 await scoped(group.user, () => executeRoleAction(group.user, null, key, action));
 await scoped(group.user, () => executeRoleAction(group.user, null, key, action));
 assert.equal(await db.campus.count({ where: { schoolId: group.schoolId } }), 2);
 const owner = await fixture("APP_OWNER"), ownerKey = randomUUID();
 const update = { tool: "platform.update_institution" as const, title: "Correct institution name", data: { schoolId: group.schoolId, name: "Corrected synthetic school" } };
 await scoped(owner.user, () => executeRoleAction(owner.user, null, ownerKey, update));
 await scoped(owner.user, () => executeRoleAction(owner.user, null, ownerKey, update));
 assert.equal((await db.school.findUniqueOrThrow({ where: { id: group.schoolId } })).name, "Corrected synthetic school");
 await assert.rejects(() => scoped(group.user, () => executeRoleAction(group.user, null, randomUUID(), update)), { status: 403 });
});
test("concurrent starts share one job and unsupported quoted actions never execute", async () => {
 const f = await fixture(), input = { message: "Create a class", language: "en", campusId: f.campusId, idempotencyKey: randomUUID() };
 const [first, second] = await Promise.all([startAutomaticJob(f.user, input), startAutomaticJob(f.user, input)]); assert.equal(first.id, second.id);
 const replay = await startAutomaticJob(f.user, { ...input, language: "ar" }); assert.equal(replay.id, first.id);
 const job = await advanceAutomaticJob(f.user, first.id, { version: first.version, action: "advance" }, reply({ type: "act", evidenceQuote: "Change my profile", action: { tool: "profile.update", title: "Unrequested change", data: { fullName: "Unrequested name" } } }));
 assert.equal(job.status, "FAILED"); assert.equal(job.pending, null);
 assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.user.userId } })).fullName, "Synthetic tester");
});
test("a questionnaire changed after planning cannot execute the pending action", async () => {
 const { createWorkspaceRecord, updateWorkspaceRecord } = await import("../../src/lib/school-ai/repository");
 const f = await fixture();
 const questionnaire = await createWorkspaceRecord(f.user, { kind: "ONBOARDING", title: "Synthetic questionnaire", campusId: f.campusId, idempotencyKey: randomUUID(), data: { path: "new", step: "review", confirmedKeys: ["resources"], answers: { resources: "Change my preferred language to Urdu" } } });
 let job = await startAutomaticJob(f.user, { message: "Set up my campus", questionnaire: { id: questionnaire.id, version: questionnaire.version }, language: "en", campusId: f.campusId, idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { version: job.version, action: "advance" }, reply({ type: "act", evidenceQuote: "Change my preferred language to Urdu", action: { tool: "profile.update", title: "Set language", data: { preferredLanguage: "ur" } } }));
 assert.ok(job.pending);
 await updateWorkspaceRecord(f.user, questionnaire.id, { version: questionnaire.version, action: "save", title: "Changed questionnaire" });
 job = await advanceAutomaticJob(f.user, job.id, { version: job.version, action: "advance" }); assert.equal(job.status, "FAILED");
 assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: f.user.userId } })).preferredLanguage, "ur");
});
test("unsupported work is blocked explicitly and can be clarified without fake completion", async () => {
 const f = await fixture("STUDENT"); let job = await startAutomaticJob(f.user, { message: "Submit a leave request", language: "en", idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "unsupported", reason: "Leave submission is not connected to automation. Use the leave page." }));
 assert.equal(job.status, "BLOCKED"); assert.equal(job.steps.length, 0);
 job = await advanceAutomaticJob(f.user, job.id, { action: "answer", version: job.version, answer: "Save a private reminder instead" });
 assert.equal(job.status, "RUNNING"); assert.equal(job.conversation?.[0].answer, "Save a private reminder instead");
});
test("saved plans cannot masquerade as executed operations; explicit plan completion works", async () => {
 const f = await fixture("PARENT"), message = "Save a family plan";
 let job = await startAutomaticJob(f.user, { message, language: "en", idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "act", evidenceQuote: message, action: { tool: "personal.save_plan", title: "Family plan", data: { title: "Family plan", goal: "Read together", steps: [{ title: "Read together", detail: "Read each evening", dueDate: null }] } } }));
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "complete", outcome: "executed", summary: "Everything created" }));
 assert.equal(job.status, "FAILED"); assert.match(job.error!, /saved plan/);
 job = await advanceAutomaticJob(f.user, job.id, { action: "resume", version: job.version });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "complete", outcome: "plan_saved", summary: "Private family plan saved" }));
 assert.equal(job.status, "COMPLETED"); assert.equal(job.outcome, "plan_saved");
});
test("informational answers finish without demanding unrelated writes", async () => {
 const f = await fixture("STUDENT"); let job = await startAutomaticJob(f.user, { message: "What is a fraction?", language: "en", idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "complete", outcome: "answered", summary: "A fraction represents a part of a whole." }));
 assert.equal(job.status, "COMPLETED"); assert.equal(job.outcome, "answered"); assert.equal(job.steps.length, 0);
});
test("the parameter generation call cannot switch the selected tool", async () => {
 const f = await fixture("SUPER_ADMIN"), message = "Create a campus";
 let job = await startAutomaticJob(f.user, { message, language: "en", idempotencyKey: randomUUID() });
 const generate: typeof generateAIDraft = async ({ system }) => ({ text: JSON.stringify(system.startsWith("Choose only") ? { type: "select", tool: "campus.create" } : { type: "act", evidenceQuote: message, action: { tool: "profile.update", title: "Wrong action", data: { fullName: "Unrequested edit" } } }), tokensUsed: 1, model: "synthetic:test", promptVersion: "test" });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, generate);
 assert.equal(job.status, "FAILED"); assert.equal(job.pending, null);
 assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.user.userId } })).fullName, "Synthetic tester");
});
test("campus operators can create library records; permission removal blocks pending writes", async () => {
 const f = await fixture(), message = "Add a library book", action = { tool: "library.create_books" as const, title: "Add book", data: { books: [{ title: "Synthetic book", copiesTotal: 2 }] } };
 await scoped(f.user, () => executeRoleAction(f.user, f.campusId, randomUUID(), action));
 assert.equal(await db.book.count({ where: { schoolId: f.schoolId } }), 1);
 let job = await startAutomaticJob(f.user, { message, campusId: f.campusId, language: "en", idempotencyKey: randomUUID() });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "act", evidenceQuote: message, action }));
 assert.ok(job.pending);
 await db.rolePermission.create({ data: { schoolId: f.schoolId, role: f.user.role, module: "library", canView: true, canAdd: false } });
 job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version });
 assert.equal(job.status, "FAILED"); assert.equal(await db.book.count({ where: { schoolId: f.schoolId } }), 1);
});
test("every role rejects a tool outside its catalogue before saving an executable action", async () => {
 for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "PARENT", "STUDENT", "APP_OWNER"] as const) {
  const f = await fixture(role), message = "Do this requested change";
  const action = role === "APP_OWNER" ? { tool: "campus.create", title: "Denied campus", data: { name: "Denied", city: "Test" } } : { tool: "platform.update_institution", title: "Denied institution change", data: { schoolId: f.schoolId, name: "Denied" } };
  let job = await startAutomaticJob(f.user, { message, language: "en", idempotencyKey: randomUUID() });
  job = await advanceAutomaticJob(f.user, job.id, { action: "advance", version: job.version }, reply({ type: "act", evidenceQuote: message, action }));
  assert.equal(job.status, "FAILED", role); assert.equal(job.pending, null, role);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: f.schoolId } })).name, "Synthetic automatic school", role);
 }
});
test("foreign campus selection and foreign actor job access are rejected", async () => {
 const f = await fixture(), other = await fixture();
 await assert.rejects(() => startAutomaticJob(f.user, { message: "Set up classes", campusId: other.campusId, language: "en", idempotencyKey: randomUUID() }), { status: 403 });
 const job = await startAutomaticJob(f.user, { message: "Set up classes", language: "en", idempotencyKey: randomUUID() });
 await assert.rejects(() => advanceAutomaticJob(other.user, job.id, { action: "advance", version: job.version }), { status: 404 });
});
test("receptionist and campus operator call logging uses native replay and campus scope", async () => {
 for (const role of ["RECEPTIONIST", "CAMPUS_ADMIN"] as const) {
  const f = await fixture(role), key = randomUUID();
  const action = { tool: "front_desk.log_call" as const, title: "Record synthetic call", data: { name: "Synthetic caller", phone: "+15555550123", direction: "IN" as const, date: "2026-01-01T09:00", purpose: "Synthetic QA enquiry", sensitive: false } };
  await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
  await scoped(f.user, () => executeRoleAction(f.user, f.campusId, key, action));
  assert.equal(await db.phoneCallLog.count({ where: { schoolId: f.schoolId } }), 1);
  await assert.rejects(() => scoped(f.user, () => executeRoleAction(f.user, randomUUID(), randomUUID(), action)), { status: 403 });
 }
});
