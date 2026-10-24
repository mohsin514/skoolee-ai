import { redis } from "../../src/lib/queue/connection";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { CLASS_A_ALLOWLIST } from "../../src/lib/ai-workflows/registry/floors";
import { createEnquiry } from "../../src/lib/admissions/enquiries";
import { starterDefinition } from "../../src/lib/admissions/form-rules";
import { logCall } from "../../src/lib/front-desk/phone-calls";
import type { CapabilityContext, CapabilityEntry, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
/**
 * front_desk.postal_log runs at A and needs its CLASS_A_ALLOWLIST line, which the lead adds to floors.ts when wiring
 * the desk. Until then the test supplies the same reviewed reason before the entries are defined.
 */
const POSTAL_REASON = "Append-only post and parcel register entry keyed by the request; the domain refuses a second open item with the same courier reference; handover, dispatch and delivery are separate steps a person records.";
let FRONT_DESK_ENTRIES: readonly CapabilityEntry[] = [];
before(async () => {
  if (!CLASS_A_ALLOWLIST["front_desk.postal_log"]) (CLASS_A_ALLOWLIST as Record<string, string>)["front_desk.postal_log"] = POSTAL_REASON;
  ({ FRONT_DESK_ENTRIES } = await import("../../src/lib/ai-workflows/registry/domains/desk/front-desk"));
});
after(async () => {
  for (const id of schools) {
    // Published versions restrict deleting their form/template directly; the school cascade removes them in order.
    await db.$executeRaw`DELETE FROM certificate_issues WHERE school_id = ${id}`.catch(() => undefined);
    await db.school.deleteMany({ where: { id } }).catch(() => undefined);
  }
  await db.$disconnect(); await prisma.$disconnect(); redis.disconnect();
});

/**
 * The receptionist's desk, exercised directly (resolve → preview → execute, or prepare for class C) until the
 * lead wires the entries into the registry.
 */
const exec = (key: string) => FRONT_DESK_ENTRIES.find(item => item.key === key) as ExecEntry<any>;
const handoff = (key: string) => FRONT_DESK_ENTRIES.find(item => item.key === key) as HandoffEntry<any>;
const KEY = () => `wf-test-${randomUUID()}`;
const C_KEYS = ["front_desk.certificate_issue", "front_desk.complaint_assign", "pickup.gate_release", "front_desk.request_template_approval"];

async function fixture(role: AuthUser["role"] = "RECEPTIONIST") {
  const schoolId = `desk-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic desk school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", country: "PK", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: userId, financeReviewedBy: userId } });
  const user = await person(schoolId, campusId, role, "Synthetic desk", userId);
  return { user, schoolId, campusId, otherCampusId };
}
async function person(schoolId: string, campusId: string, role: AuthUser["role"], fullName: string, id = randomUUID()): Promise<AuthUser> {
  await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName, role, isActive: true } });
  return { schoolId, campusId, userId: id, role, email: `${id}@example.invalid`, fullName, accessVersion: 0 };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };
const fields = async (work: Promise<unknown>) => { try { await work; return null; } catch (error) { if (error instanceof InputRequired) return error.fields; throw error; } };

async function bind(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  return item.input.parse(resolved);
}
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown, idempotencyKey = KEY()) {
  const item = exec(key);
  const bound = await bind(ctx, key, input);
  const preview = item.preview ? await item.preview(ctx, bound) : null;
  const receipt = await item.execute(ctx, bound, { idempotencyKey });
  return { bound, preview, receipt };
}

async function pupils(schoolId: string, campusId: string) {
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE" } });
  const hamza = await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName: "Hamza Ali", rollNo: "21", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  return { klass, hamza };
}
async function approvedTemplate(schoolId: string, campusId: string, approverId: string, name = "Enrolment certificate") {
  const body = "This is to certify that {{studentName}} studies in class {{className}}.";
  const template = await db.certificateTemplate.create({ data: { schoolId, campusId, kind: "STUDENT_CERTIFICATE", name, language: "en", pageSize: "A4", requiresApproval: true, currentVersion: 1, layoutJson: { version: 1, title: "Enrolment certificate", body } } });
  await db.certificateTemplateVersion.create({ data: { schoolId, campusId, templateId: template.id, version: 1, kind: "STUDENT_CERTIFICATE", title: "Enrolment certificate", body, language: "en", pageSize: "A4", approvedById: approverId } });
  return template;
}
async function publishedForm(schoolId: string, campusId: string, publisherId: string) {
  const definition = starterDefinition();
  const form = await db.admissionForm.create({ data: { schoolId, campusId, name: "Admissions 2027", draft: definition, currentVersion: 1, publicToken: randomBytes(20).toString("base64url") } });
  await db.admissionFormVersion.create({ data: { schoolId, campusId, formId: form.id, version: 1, definition, publishedById: publisherId } });
  return form;
}
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test("front-desk entries define with their static classes, the receptionist seat gate and the A allow-list reason", () => {
  assert.deepEqual(FRONT_DESK_ENTRIES.map(item => [item.key, item.class]), [
    ["front_desk.postal_log", "A"], ["front_desk.certificate_preview", "A"],
    ["front_desk.visitor_check_in", "B"], ["front_desk.visitor_check_out", "B"], ["front_desk.callback_complete", "B"], ["front_desk.callback_reschedule", "B"],
    ["enquiries.create", "B"], ["enquiries.update", "B"], ["admissions.start_application", "B"], ["admissions.save_answers", "B"], ["front_desk.complaint_intake", "B"], ["front_desk.certificate_template_save", "B"],
    ["front_desk.certificate_issue", "C"], ["front_desk.complaint_assign", "C"], ["pickup.gate_release", "C"], ["front_desk.request_template_approval", "C"],
  ]);
  for (const item of FRONT_DESK_ENTRIES) {
    assert.deepEqual([...item.roles], ["RECEPTIONIST", "ADMIN", "CAMPUS_ADMIN"], item.key);
    assert.ok(item.gates.some(gate => gate.id === "seat:receptionist"), `${item.key} carries the receptionist seat gate`);
    assert.ok(item.gates.some(gate => gate.id === "scope:own-campus"), `${item.key} is own-campus`);
  }
  assert.ok((exec("front_desk.postal_log") as ExecEntry).classOverride);
  for (const key of C_KEYS) assert.equal("execute" in handoff(key) && handoff(key).execute !== undefined, false, `${key} cannot execute`);
});

test("visitor check-in is created once; a namesake on site is a choice question, never a second admission", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = { name: "Ahmed Khan", purpose: "Admission enquiry for his son", toMeet: "Principal" };
    const key = KEY();
    const first = await confirmRun(ctx, "front_desk.visitor_check_in", input, key);
    assert.equal(first.receipt.counts.visitors, 1);
    assert.equal(first.receipt.link, "/receptionist?view=visitors");
    // The same step replayed with its key: the domain returns the same visit.
    const replay = await exec("front_desk.visitor_check_in").execute(ctx, first.bound, { idempotencyKey: key });
    assert.equal(replay.entities[0].id, first.receipt.entities[0].id);
    assert.equal(replay.counts.visitors, 0);
    assert.equal(await db.visitorLog.count({ where: { campusId } }), 1);

    // Another "Ahmed Khan" with nothing to tell them apart: a choice listing who is on site.
    const asked = await fields(bind(ctx, "front_desk.visitor_check_in", { name: "ahmed  khan", purpose: "Delivery", toMeet: "Accounts" }));
    assert.equal(asked?.[0].pointer, "/reference");
    assert.equal(asked?.[0].promptKey, "VISITOR_NAMESAKE");
    assert.equal(asked?.[0].options?.length, 1);
    assert.match(asked![0].options![0].label, /Ahmed Khan · — · Principal/);
    // Picking the one on site means it is the same person: refused, nothing written.
    assert.equal(await code(bind(ctx, "front_desk.visitor_check_in", { name: "Ahmed Khan", purpose: "Delivery", toMeet: "Accounts", reference: asked![0].options![0].value })), "DOMAIN_REFUSED");
    // A reference that tells them apart admits the second person.
    const second = await confirmRun(ctx, "front_desk.visitor_check_in", { name: "Ahmed Khan", purpose: "Delivery", toMeet: "Accounts", reference: "TCS courier" });
    assert.equal(second.receipt.counts.visitors, 1);
    assert.equal(await db.visitorLog.count({ where: { campusId, status: "ON_SITE" } }), 2);

    // Check-out by name now asks which Ahmed Khan; the narrowed answer binds one.
    const which = await fields(bind(ctx, "front_desk.visitor_check_out", { visitor: "Ahmed Khan" }));
    assert.equal(which?.[0].promptKey, "VISITOR_AMBIGUOUS");
    const out = await confirmRun(ctx, "front_desk.visitor_check_out", { visitor: "Ahmed Khan (TCS courier)" });
    assert.equal(out.bound.visitId, second.receipt.entities[0].id);
    assert.equal(out.receipt.counts.checkedOut, 1);
    const again = await exec("front_desk.visitor_check_out").execute(ctx, out.bound, { idempotencyKey: KEY() });
    assert.equal(again.counts.checkedOut, 0, "a repeated check-out changes nothing");
    assert.equal((await db.visitorLog.findUniqueOrThrow({ where: { id: second.receipt.entities[0].id } })).status, "LEFT");
    assert.equal(await db.visitorLog.count({ where: { schoolId } }), 2);
  });
});

test("enquiry kill test: a crash after the write reconciles, and a reconcile never matches another receptionist's enquiry", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { klass } = await pupils(schoolId, campusId);
  const colleague = await person(schoolId, campusId, "RECEPTIONIST", "Other receptionist");
  const input = { name: "Farah Khan", phone: "0321-5550101", classId: klass.id, note: "Daughter, Grade 3, walk-in" };
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const key = KEY();
    const first = await confirmRun(ctx, "enquiries.create", input, key);
    assert.equal(first.receipt.counts.created, 1);
    const row = await db.admissionQuery.findUniqueOrThrow({ where: { id: first.receipt.entities[0].id } });
    assert.deepEqual([row.schoolId, row.campusId, row.status, row.classInterestedId], [schoolId, campusId, "ACTIVE", klass.id]);
    // Crash between the domain write and the intent commit: the engine runs the step again.
    const replay = await exec("enquiries.create").execute(ctx, first.bound, { idempotencyKey: key });
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true, "RECONCILED");
    assert.equal(replay.entities[0].id, row.id);
    assert.equal(await db.admissionQuery.count({ where: { campusId } }), 1, "no second enquiry");
    // Same family, phone written differently: still this actor's own row.
    const respelt = await exec("enquiries.create").execute(ctx, await bind(ctx, "enquiries.create", { ...input, name: "farah khan", phone: "03215550101" }), { idempotencyKey: KEY() });
    assert.equal((respelt.detail as { reconciled?: boolean }).reconciled, true);
  });
  // A colleague recorded the same family: that is their row, never this actor's replay.
  const other = await createEnquiry(colleague, { name: "Sana Malik", phone: "0300-1112223", source: "PHONE" });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const mine = await confirmRun(ctx, "enquiries.create", { name: "Sana Malik", phone: "0300-1112223", source: "PHONE" });
    assert.equal(mine.receipt.counts.created, 1, "not reconciled with the colleague's enquiry");
    assert.notEqual(mine.receipt.entities[0].id, other.id);
    assert.equal(await db.admissionQuery.count({ where: { campusId, name: "Sana Malik" } }), 2);
    assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "admission_queries", userId: colleague.userId } }), 1, "the command records who took each enquiry");

    // Update: a follow-up once, then a replay reconciles; a namesake asks which family.
    const update = { enquiry: "Farah Khan", followUpNote: "Called, she will visit on Saturday", nextFollowUp: "2026-10-30" };
    const updated = await confirmRun(ctx, "enquiries.update", update);
    assert.deepEqual(updated.receipt.counts, { updated: 1, followUps: 1 });
    const enquiry = await db.admissionQuery.findUniqueOrThrow({ where: { id: updated.bound.enquiryId } });
    assert.deepEqual([enquiry.status, enquiry.nextFollowUp?.toISOString().slice(0, 10)], ["FOLLOW_UP", "2026-10-30"]);
    const again = await exec("enquiries.update").execute(ctx, updated.bound, { idempotencyKey: KEY() });
    assert.equal((again.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.admissionQueryFollowUp.count({ where: { queryId: enquiry.id } }), 1);
    const which = await fields(bind(ctx, "enquiries.update", { enquiry: "Sana Malik", status: "LOST" }));
    assert.equal(which?.[0].promptKey, "ENQUIRY_AMBIGUOUS");
    assert.equal(which?.[0].options?.length, 2);
  });
});

test("applications start from an enquiry once and take the family's answers into the staff draft", async () => {
  const { user, schoolId, campusId } = await fixture();
  await publishedForm(schoolId, campusId, user.userId);
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    await confirmRun(ctx, "enquiries.create", { name: "Farah Khan", phone: "0321-5550101" });
    const started = await confirmRun(ctx, "admissions.start_application", { enquiry: "Farah Khan" });
    assert.equal(started.receipt.counts.created, 1);
    const application = await db.admissionApplication.findUniqueOrThrow({ where: { id: started.receipt.entities[0].id } });
    assert.deepEqual([application.status, application.channel, application.ownerId], ["DRAFT", "STAFF", user.userId]);
    assert.equal((application.answers as Record<string, string>).guardianPhone, "0321-5550101", "prefilled from the enquiry");
    const replay = await exec("admissions.start_application").execute(ctx, started.bound, { idempotencyKey: KEY() });
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.admissionApplication.count({ where: { schoolId } }), 1);

    const answers = { application: "Farah Khan", answers: [{ field: "childName", value: "Zara Khan", said: "Zara Khan" }, { field: "gender", value: "FEMALE", said: "daughter" }, { field: "dateOfBirth", value: "2019-03-03", said: "3 March 2019" }] };
    const saved = await confirmRun(ctx, "admissions.save_answers", answers);
    assert.equal(saved.receipt.counts.answers, 3);
    const after = await db.admissionApplication.findUniqueOrThrow({ where: { id: application.id } });
    assert.deepEqual([after.childName, (after.answers as Record<string, string>).guardianPhone, (after.answers as Record<string, string>).dateOfBirth], ["Zara Khan", "0321-5550101", "2019-03-03"], "merged, nothing lost");
    const again = await confirmRun(ctx, "admissions.save_answers", { ...answers, application: "Zara Khan" });
    assert.equal((again.receipt.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.student.count({ where: { schoolId } }), 0, "an applicant is never a pupil");
  });
});

test("post, callbacks and certificate drafts each write once", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { hamza } = await pupils(schoolId, campusId);
  const template = await approvedTemplate(schoolId, campusId, user.userId);
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const key = KEY();
    const post = await confirmRun(ctx, "front_desk.postal_log", { direction: "RECEIVE", toName: "Branch principal", courier: "Aramex", referenceNo: "55120", owner: "Synthetic desk" }, key);
    assert.equal(post.receipt.counts.items, 1);
    assert.equal(post.bound.ownerId, user.userId);
    const replay = await exec("front_desk.postal_log").execute(ctx, post.bound, { idempotencyKey: key });
    assert.equal(replay.counts.items, 0);
    assert.equal(await db.postalRecord.count({ where: { campusId } }), 1);
    // A questionnaire-scoped key longer than the domain allows is hashed, still deterministic.
    const long = `wf-setup-${randomUUID()}-${"a".repeat(40)}`;
    const longRun = await confirmRun(ctx, "front_desk.postal_log", { direction: "DISPATCH", toName: "Board office" }, long);
    assert.equal((await exec("front_desk.postal_log").execute(ctx, longRun.bound, { idempotencyKey: long })).entities[0].id, longRun.receipt.entities[0].id);

    await logCall(user, campusId, { name: "Mrs Siddiqui", phone: "0300 1234567", direction: "IN", date: `${yesterday()}T10:00`, purpose: "Leave for her son", callbackDue: `${yesterday()}T14:00` });
    const moved = await confirmRun(ctx, "front_desk.callback_reschedule", { caller: "Mrs Siddiqui", dueAt: "2026-12-01T10:00" });
    assert.equal(moved.receipt.counts.rescheduled, 1);
    assert.equal((await exec("front_desk.callback_reschedule").execute(ctx, moved.bound, { idempotencyKey: KEY() }) as { detail?: { reconciled?: boolean } }).detail?.reconciled, true);
    const done = await confirmRun(ctx, "front_desk.callback_complete", { caller: "Siddiqui", outcome: "Spoke to her, leave approved by class teacher", nextDue: "2026-12-07" });
    assert.deepEqual(done.receipt.counts, { completed: 1, nextCallbacks: 1 });
    const killed = await exec("front_desk.callback_complete").execute(ctx, done.bound, { idempotencyKey: KEY() });
    assert.equal((killed.detail as { reconciled?: boolean }).reconciled, true, "the earlier completion is reconciled");
    assert.equal(await db.phoneCallback.count({ where: { campusId } }), 2, "one completed, one follow-up; no third");

    const draft = { name: "Leaving certificate", kind: "STUDENT_CERTIFICATE", title: "School leaving certificate", body: "{{studentName}} of class {{className}} has left the school." };
    const saved = await confirmRun(ctx, "front_desk.certificate_template_save", draft);
    assert.equal(saved.receipt.kind, "draft");
    assert.equal((await confirmRun(ctx, "front_desk.certificate_template_save", draft)).receipt.counts.created, 0);
    assert.equal(await db.certificateTemplate.count({ where: { campusId } }), 2);
    assert.equal((await db.certificateTemplate.findFirstOrThrow({ where: { campusId, name: "Leaving certificate" } })).currentVersion, 0, "a draft only; approval is the campus admin's");
    assert.equal(await code(bind(ctx, "front_desk.certificate_template_save", { ...draft, body: "{{studentName}} owes {{feeBalance}} rupees." })), "DOMAIN_REFUSED");

    const checked = await confirmRun(ctx, "front_desk.certificate_preview", { template: "enrolment certificate", student: "Hamza Ali" });
    assert.equal(checked.receipt.kind, "read");
    assert.deepEqual([checked.bound.templateId, checked.bound.studentId], [template.id, hamza.id]);
    assert.ok(!JSON.stringify(checked.receipt).includes("Hamza"), "the rendered pupil text stays on the screen");
    assert.equal(await db.certificateIssue.count({ where: { campusId } }), 0);
  });
});

test("a confidential complaint's receipt carries the reference code only; a care concern is never taken", async () => {
  const { user, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = { complainant: "Mrs Rubina Aslam", type: "Staff conduct", description: "She says a staff member spoke rudely to her at the gate on Monday.", phone: "0333 7654321", confidential: true };
    const key = KEY();
    const run = await confirmRun(ctx, "front_desk.complaint_intake", input, key);
    const text = JSON.stringify(run.receipt);
    for (const word of ["Rubina", "Aslam", "rudely", "7654321", "Staff conduct"]) assert.ok(!text.includes(word), `the receipt does not carry "${word}"`);
    assert.deepEqual(run.receipt.entities, []);
    assert.match(String((run.receipt.detail as { referenceCode?: string }).referenceCode), /^CMP-[0-9A-F]{8}$/);
    assert.deepEqual(Object.keys(run.receipt.detail ?? {}).sort(), ["confidential", "referenceCode"]);
    assert.ok(!JSON.stringify(run.preview).includes("Rubina"), "the preview does not repeat the names either");
    const replay = await exec("front_desk.complaint_intake").execute(ctx, run.bound, { idempotencyKey: key });
    assert.equal(replay.counts.complaints, 0);
    assert.equal(await db.complaint.count({ where: { campusId } }), 1);

    const open = await confirmRun(ctx, "front_desk.complaint_intake", { complainant: "A parent", type: "Canteen", description: "The canteen food was cold at lunch today." });
    assert.equal(open.receipt.entities.length, 1);
    assert.equal(await code(bind(ctx, "front_desk.complaint_intake", { complainant: "A parent", type: "Bullying", description: "A child said she is being hurt at home and is scared." })), "CARE_REFERRAL");
    assert.equal(await db.complaint.count({ where: { campusId } }), 2);
  });
});

test("class C entries hand off and write nothing", async () => {
  const { user, schoolId, campusId } = await fixture();
  await pupils(schoolId, campusId);
  await approvedTemplate(schoolId, campusId, user.userId);
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    await confirmRun(ctx, "front_desk.complaint_intake", { complainant: "A parent", type: "Canteen", description: "The canteen food was cold at lunch today." });
    const before = await Promise.all([db.certificateIssue.count({ where: { schoolId } }), db.certificateTemplateVersion.count({ where: { schoolId } }), db.complaintEvent.count({ where: { schoolId } }), db.pickupCheck.count({ where: { schoolId } }), db.pickupEvent.count({ where: { schoolId } })]);
    const cases: Record<string, unknown> = {
      "front_desk.certificate_issue": { template: "Enrolment certificate", student: "Hamza Ali" },
      "front_desk.complaint_assign": { complaint: "Canteen", owner: "Synthetic desk", dueDate: "2026-10-31" },
      "pickup.gate_release": {},
      "front_desk.request_template_approval": { template: "Enrolment certificate" },
    };
    for (const [key, raw] of Object.entries(cases)) {
      const item = handoff(key);
      const parsed = item.input.parse(raw);
      const bound = item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
      const prepared = await item.handoff.prepare(ctx, bound, { idempotencyKey: KEY() });
      assert.ok(prepared.link.startsWith("/"), key);
      if (key === "pickup.gate_release") assert.deepEqual(prepared.prefill, {}, "nothing about the child or a code is carried");
      if (key === "front_desk.request_template_approval") assert.deepEqual([...prepared.targetRoles], ["CAMPUS_ADMIN", "ADMIN"]);
    }
    const after = await Promise.all([db.certificateIssue.count({ where: { schoolId } }), db.certificateTemplateVersion.count({ where: { schoolId } }), db.complaintEvent.count({ where: { schoolId } }), db.pickupCheck.count({ where: { schoolId } }), db.pickupEvent.count({ where: { schoolId } })]);
    assert.deepEqual(after, before);
    assert.equal((await db.complaint.findFirstOrThrow({ where: { schoolId } })).ownerId, null, "the hand-off assigns nothing");
  });
});

test("a foreign campus is SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const { klass } = await pupils(schoolId, campusId);
  await approvedTemplate(schoolId, campusId, user.userId);
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    for (const item of FRONT_DESK_ENTRIES) assert.equal((await runGates(ctx, item.gates) as { code?: string }).code, "SCOPE", item.key);
    const inputs: Record<string, unknown> = {
      "front_desk.postal_log": { direction: "RECEIVE", toName: "Principal" },
      "front_desk.certificate_preview": { template: "Enrolment certificate", student: "Hamza Ali" },
      "front_desk.visitor_check_in": { name: "Ahmed Khan", purpose: "Meeting", toMeet: "Principal" },
      "front_desk.visitor_check_out": { visitor: "Ahmed Khan" },
      "front_desk.callback_complete": { caller: "Mrs Siddiqui", outcome: "Spoke to her already" },
      "front_desk.callback_reschedule": { caller: "Mrs Siddiqui", dueAt: "2026-12-01" },
      "enquiries.create": { name: "Farah Khan", phone: "0321-5550101", classId: klass.id },
      "enquiries.update": { enquiry: "Farah Khan", status: "LOST" },
      "admissions.start_application": { enquiry: "Farah Khan" },
      "admissions.save_answers": { application: "Zara Khan", answers: [{ field: "childName", value: "Zara Khan", said: "Zara Khan" }] },
      "front_desk.complaint_intake": { complainant: "A parent", type: "Canteen", description: "The canteen food was cold at lunch today." },
      "front_desk.certificate_template_save": { name: "Leaving certificate", kind: "STUDENT_CERTIFICATE", title: "Leaving", body: "{{studentName}} has left the school." },
    };
    for (const [key, input] of Object.entries(inputs)) {
      const item = exec(key);
      const parsed = item.input.parse(input);
      assert.equal(await code(item.resolve ? item.resolve(ctx, parsed) : Promise.reject(new WorkflowError("SCOPE_DENIED"))), "SCOPE_DENIED", `${key} resolve`);
      assert.equal(await code(item.execute(ctx, parsed, { idempotencyKey: KEY() })), "SCOPE_DENIED", `${key} execute`);
    }
    for (const key of C_KEYS) {
      const item = handoff(key);
      const raw = key === "pickup.gate_release" ? {} : key === "front_desk.complaint_assign" ? { complaint: "Canteen" } : key === "front_desk.certificate_issue" ? { template: "Enrolment certificate", student: "Hamza Ali" } : { template: "Enrolment certificate" };
      assert.equal(await code(item.handoff.prepare(ctx, item.input.parse(raw), { idempotencyKey: KEY() })), "SCOPE_DENIED", key);
    }
  });
  const rows = await Promise.all([
    db.postalRecord.count({ where: { schoolId } }), db.visitorLog.count({ where: { schoolId } }), db.admissionQuery.count({ where: { schoolId } }), db.admissionApplication.count({ where: { schoolId } }),
    db.complaint.count({ where: { schoolId } }), db.certificateTemplate.count({ where: { schoolId } }), db.certificateIssue.count({ where: { schoolId } }),
  ]);
  assert.deepEqual(rows, [0, 0, 0, 0, 0, 1, 0], "only the fixture's own template exists");
});

test("an operator with a receptionist in post gets SEAT on every entry", async () => {
  const { user, schoolId, campusId } = await fixture("ADMIN");
  await within(user, async () => {
    const vacant = await ctxFor(user, campusId);
    for (const item of FRONT_DESK_ENTRIES) assert.deepEqual(await runGates(vacant, item.gates), { ok: true }, `${item.key} open while the desk is empty`);
  });
  const receptionist = await person(schoolId, campusId, "RECEPTIONIST", "Synthetic receptionist");
  await within(user, async () => {
    const held = await ctxFor(user, campusId);
    for (const item of FRONT_DESK_ENTRIES) {
      const result = await runGates(held, item.gates);
      assert.deepEqual(result.ok ? null : [result.code, result.whoCan], ["SEAT", ["RECEPTIONIST"]], item.key);
    }
  });
  await within(receptionist, async () => { for (const item of FRONT_DESK_ENTRIES) assert.deepEqual(await runGates(await ctxFor(receptionist, campusId), item.gates), { ok: true }, item.key); });
  // The principal passes canManageFrontDesk's operations check but never holds this desk.
  const principal = await person(schoolId, campusId, "PRINCIPAL", "Synthetic principal");
  await within(principal, async () => { for (const item of FRONT_DESK_ENTRIES) assert.equal((await runGates(await ctxFor(principal, campusId), item.gates) as { code?: string }).code, "ROLE", item.key); });
});
