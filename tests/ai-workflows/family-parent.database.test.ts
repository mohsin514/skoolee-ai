import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { PARENT_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/family/parent";
import { resolveChild, type ChildRight } from "../../src/lib/ai-workflows/resolve/children";
import type { CapabilityContext, ExecEntry, HandoffEntry, Locale } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * PARENT entries, exercised directly (resolve → preview → execute / prepare) until the lead wires them
 * into the registry. Own-child scope through verified guardian links only, per right.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => PARENT_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const handoff = (key: string) => entry<HandoffEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;
const ALL_RIGHTS = { learningRecords: true, attendance: true, finances: true, communication: true, pickup: true };
const dayFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function fixture() {
  const schoolId = `parent-${randomUUID()}`, campusId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic family school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  const person = async (role: "ADMIN" | "TEACHER" | "PARENT", fullName: string) => {
    const id = randomUUID(), email = `${id}@example.invalid`;
    await db.user.create({ data: { id, schoolId, campusId, email, fullName, role, isActive: true, phone: role === "PARENT" ? "+923001234567" : null } });
    return { schoolId, campusId, userId: id, role, email, fullName, accessVersion: 0 } as AuthUser;
  };
  const admin = await person("ADMIN", "Synthetic admin"), classTeacher = await person("TEACHER", "Ayesha Khan"), mathsTeacher = await person("TEACHER", "Imran Ali");
  const parent = await person("PARENT", "Synthetic parent"), otherParent = await person("PARENT", "Other parent"), soloParent = await person("PARENT", "Solo parent"), pendingParent = await person("PARENT", "Pending parent");
  const klass = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: classTeacher.userId } });
  await db.subject.create({ data: { schoolId, campusId, classId: klass.id, name: "Mathematics", teacherId: mathsTeacher.userId } });
  const pupil = async (fullName: string, rollNo: string) => (await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName, rollNo, gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } })).id;
  const hamza = await pupil("Hamza Raza", "01"), sara = await pupil("Sara Raza", "02"), zain = await pupil("Zain Raza", "03"), bilal = await pupil("Bilal Raza", "04"), noor = await pupil("Noor Fatima", "05"), omar = await pupil("Omar Shah", "06"), lina = await pupil("Lina Shah", "07");
  const link = async (guardian: AuthUser, studentId: string, status: string, verified: boolean, permissions: Record<string, boolean> = ALL_RIGHTS) => {
    const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: guardian.userId, createdByUserId: admin.userId, fullName: guardian.fullName ?? "Guardian", email: guardian.email, relationship: "Parent", status, verifiedAt: verified ? new Date(Date.now() - 86_400_000) : null } });
    const version = await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin.userId, reason: "Synthetic family fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions } });
    return { relationship, version };
  };
  await link(parent, hamza, "ACTIVE", true);
  await link(parent, sara, "ACTIVE", true);
  await link(parent, zain, "INVITED", false); // invited, not yet verified
  await link(parent, lina, "REVIEW_REQUIRED", true);
  await link(otherParent, bilal, "ACTIVE", true); // a sibling linked only to the other guardian
  await link(otherParent, hamza, "ACTIVE", true);
  const solo = await link(soloParent, omar, "ACTIVE", true);
  await link(pendingParent, noor, "INVITED", false);
  return { schoolId, campusId, klass, admin, classTeacher, mathsTeacher, parent, otherParent, soloParent, pendingParent, solo, kids: { hamza, sara, zain, bilal, noor, omar, lina } };
}
const ctxFor = (user: AuthUser, locale: Locale = "en") => capabilityContext(user, user.campusId, locale);
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => {
  try { await work; return "OK"; } catch (error) {
    if (error instanceof WorkflowError) return error.params.reason ? `${error.code}:${error.params.reason}` : error.code;
    return error instanceof InputRequired ? `INPUT:${error.fields.map(field => `${field.pointer}=${field.promptKey}`).join(",")}` : `THROWN:${(error as Error).message}`;
  }
};

/** Resolve, preview and execute one exec entry the way a confirmed class-B step does. */
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown, idempotencyKey = KEY()) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  const bound = item.input.parse(resolved);
  const preview = item.preview ? await item.preview(ctx, bound) : null;
  const receipt = await item.execute(ctx, bound, { idempotencyKey });
  return { resolved: bound, preview, receipt };
}

test("parent entries define with their static classes, evidence and roles", () => {
  assert.deepEqual(PARENT_ENTRIES.map(item => [item.key, item.class]), [
    ["read.parent.child_attendance", "A"], ["read.parent.dues", "A"],
    ["parent.explain_absence", "B"], ["family.request_leave", "B"], ["family.meeting", "B"], ["canteen.set_spend_limit", "B"], ["canteen.record_dietary", "B"], ["family_activities.request_place", "B"],
    ["profile.change_phone", "C"], ["communications.set_guardian_channel_preference", "C"], ["chat.message_office", "C"], ["pickup.issue_authorization", "C"], ["fees.start_online_payment", "C"],
  ]);
  for (const item of PARENT_ENTRIES) assert.deepEqual(item.roles, ["PARENT"], item.key);
  for (const item of PARENT_ENTRIES.filter(row => row.class === "C")) assert.equal((item as { execute?: unknown }).execute, undefined, item.key);
  assert.equal(handoff("fees.start_online_payment").handoff.kind, "DEEP_LINK");
  assert.deepEqual(exec("parent.explain_absence").evidence, ["/date", "/reason"]);
  assert.ok(!PARENT_ENTRIES.some(item => ["parent.accept_invitation", "family.trip_consent", "personal.save_plan", "profile.update"].includes(item.key)), "native taps and existing entries are not duplicated");
});

test("own-child scope: each right is checked on the verified link", async () => {
  const { soloParent, solo, kids } = await fixture();
  const RIGHT: Record<ChildRight, string> = { attendance: "attendance", fees: "finances", communication: "communication", pickup: "pickup", results: "learningRecords" };
  for (const right of Object.keys(RIGHT) as ChildRight[]) {
    await db.guardianAccessVersion.update({ where: { id: solo.version.id }, data: { permissions: { ...Object.fromEntries(Object.values(RIGHT).map(key => [key, false])), [RIGHT[right]]: true } } });
    await within(soloParent, async () => {
      const ctx = await ctxFor(soloParent);
      assert.equal((await resolveChild(ctx, undefined, right)).id, kids.omar, `${right} granted`);
      assert.equal((await resolveChild(ctx, "Omar", right)).id, kids.omar);
      for (const other of (Object.keys(RIGHT) as ChildRight[]).filter(item => item !== right)) {
        assert.equal(await code(resolveChild(ctx, undefined, other)), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING", `${other} without the right`);
        assert.equal(await code(resolveChild(ctx, "Omar", other)), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
      }
    });
  }
  // Each entry asks for its own right: with only "results", none of the family writes bind the child.
  await db.guardianAccessVersion.update({ where: { id: solo.version.id }, data: { permissions: { learningRecords: true } } });
  await within(soloParent, async () => {
    const ctx = await ctxFor(soloParent);
    assert.equal(await code(exec("parent.explain_absence").resolve!(ctx, exec("parent.explain_absence").input.parse({ date: dayFromNow(-1), reason: "He had fever" }))), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
    assert.equal(await code(exec("family.meeting").resolve!(ctx, exec("family.meeting").input.parse({}))), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
    assert.equal(await code(exec("canteen.set_spend_limit").resolve!(ctx, { dailyLimit: 300 })), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
    assert.equal(await code(handoff("pickup.issue_authorization").resolve!(ctx, { date: dayFromNow(1), from: "13:00", until: "14:00" })), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
    assert.equal(await code(exec("read.parent.dues").execute(ctx, {}, { idempotencyKey: KEY() })), "SCOPE_DENIED:GUARDIAN_RIGHT_MISSING");
  });
});

test("unverified links are SCOPE_DENIED (ask the office); several children ask which; another family's child is SCOPE_DENIED", async () => {
  const { parent, pendingParent, kids } = await fixture();
  await within(pendingParent, async () => {
    const ctx = await ctxFor(pendingParent);
    assert.equal(await code(resolveChild(ctx, undefined, "attendance")), "SCOPE_DENIED:ASK_SCHOOL_OFFICE", "an INVITED link is never a usable child");
    assert.equal(await code(resolveChild(ctx, "Noor", "attendance")), "SCOPE_DENIED:ASK_SCHOOL_OFFICE");
    assert.equal(await code(exec("read.parent.child_attendance").execute(ctx, {}, { idempotencyKey: KEY() })), "SCOPE_DENIED:ASK_SCHOOL_OFFICE");
  });
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    const asked = await resolveChild(ctx, undefined, "attendance").catch(error => error);
    assert.ok(asked instanceof InputRequired);
    assert.equal(asked.fields[0].pointer, "/child");
    assert.equal(asked.fields[0].promptKey, "CHILD_CHOICE");
    assert.deepEqual(asked.fields[0].options?.map((option: { value: string }) => option.value).sort(), ["Hamza Raza", "Sara Raza"], "only verified own children are offered");
    assert.equal((await resolveChild(ctx, "hamza", "attendance")).id, kids.hamza);
    assert.equal((await resolveChild(ctx, asked.fields[0].options![1].value, "attendance")).id, kids.sara, "the chosen option binds");
    assert.equal(await code(resolveChild(ctx, "Raza", "attendance")), "INPUT:/child=CHILD_AMBIGUOUS");
    assert.equal(await code(resolveChild(ctx, "Zain", "attendance")), "SCOPE_DENIED:ASK_SCHOOL_OFFICE", "INVITED");
    assert.equal(await code(resolveChild(ctx, "Lina", "attendance")), "SCOPE_DENIED:ASK_SCHOOL_OFFICE", "REVIEW_REQUIRED");
    assert.equal(await code(resolveChild(ctx, "Bilal", "attendance")), "SCOPE_DENIED:CHILD_NOT_LINKED", "a sibling linked only to the other guardian");
    assert.equal(await code(resolveChild(ctx, "Noor", "attendance")), "SCOPE_DENIED:CHILD_NOT_LINKED", "another family's child");
  });
});

test("a sibling's or another family's child is SCOPE_DENIED at resolve and execute, with zero rows written", async () => {
  const { schoolId, campusId, klass, parent, kids } = await fixture();
  const yesterday = dayFromNow(-1);
  const absences = await Promise.all([kids.bilal, kids.noor].map(studentId => db.attendance.create({ data: { schoolId, campusId, classId: klass.id, studentId, date: new Date(`${yesterday}T00:00:00Z`), status: "ABSENT" } })));
  await db.meetingWindow.create({ data: { schoolId, campusId, teacherId: (await db.class.findUniqueOrThrow({ where: { id: klass.id } })).classTeacherId!, localDate: dayFromNow(4), startTime: "14:00", endTime: "15:00", timezone: "Asia/Karachi", slotMinutes: 15, location: "Room 5", cancellationPolicy: "Up to 2 hours before", createdById: parent.userId } });
  const window = await db.meetingWindow.findFirstOrThrow({ where: { schoolId } });
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    for (const [name, studentId, attendance] of [["Bilal", kids.bilal, absences[0]], ["Noor", kids.noor, absences[1]]] as const) {
      const explain = exec("parent.explain_absence");
      assert.equal(await code(explain.resolve!(ctx, explain.input.parse({ child: name, date: yesterday, reason: "He had fever all night" }))), "SCOPE_DENIED:CHILD_NOT_LINKED");
      assert.equal(await code(explain.execute(ctx, explain.input.parse({ child: name, date: yesterday, reason: "He had fever all night", studentId, attendanceId: attendance.id }), { idempotencyKey: KEY() })), "SCOPE_DENIED:CHILD_NOT_LINKED");
      const leave = exec("family.request_leave");
      assert.equal(await code(leave.execute(ctx, leave.input.parse({ from: dayFromNow(2), reason: "Wedding", studentId }), { idempotencyKey: KEY() })), "SCOPE_DENIED:CHILD_NOT_LINKED");
      const meeting = exec("family.meeting");
      assert.equal(await code(meeting.execute(ctx, meeting.input.parse({ studentId, windowId: window.id, startsAt: new Date().toISOString() }), { idempotencyKey: KEY() })), "SCOPE_DENIED:CHILD_NOT_LINKED");
      assert.equal(await code(exec("read.parent.child_attendance").execute(ctx, { child: name }, { idempotencyKey: KEY() })), "SCOPE_DENIED:CHILD_NOT_LINKED");
      assert.equal(await code(handoff("fees.start_online_payment").resolve!(ctx, { child: name })), "SCOPE_DENIED:CHILD_NOT_LINKED");
    }
  });
  assert.equal(await db.attendanceExplanation.count({ where: { schoolId } }), 0);
  assert.equal(await db.learnerLeaveRequest.count({ where: { schoolId } }), 0);
  assert.equal(await db.meetingBooking.count({ where: { schoolId } }), 0);
});

test("absence note: created once as pending school review, replay reconciles, a missing day is asked", async () => {
  const { schoolId, campusId, klass, parent, kids } = await fixture();
  const yesterday = dayFromNow(-1);
  const absence = await db.attendance.create({ data: { schoolId, campusId, classId: klass.id, studentId: kids.sara, date: new Date(`${yesterday}T00:00:00Z`), status: "ABSENT" } });
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    const input = { child: "Sara", date: yesterday, reason: "She had fever" };
    const first = await confirmRun(ctx, "parent.explain_absence", input);
    assert.equal(first.resolved.studentId, kids.sara);
    assert.equal(first.resolved.attendanceId, absence.id);
    assert.ok(first.preview!.lines.some(line => /pending school review/i.test(line.value)));
    assert.equal(first.receipt.counts.explanations, 1);
    assert.match(String((first.receipt.detail as { statusText?: string }).statusText), /pending school review/i);
    assert.equal(first.receipt.link, `/parent/attendance?student=${kids.sara}`);

    const replay = await confirmRun(ctx, "parent.explain_absence", input);
    assert.equal(replay.receipt.entities[0].id, first.receipt.entities[0].id);
    assert.equal((replay.receipt.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(replay.receipt.counts.explanations, 0);
    // A second, different note while one is pending is refused rather than duplicated.
    assert.equal(await code(exec("parent.explain_absence").resolve!(ctx, exec("parent.explain_absence").input.parse({ child: "Sara", date: yesterday, reason: "Family wedding out of town" }))), "DOMAIN_REFUSED:EXPLANATION_ALREADY_PENDING");
    const missing = await exec("parent.explain_absence").resolve!(ctx, exec("parent.explain_absence").input.parse({ child: "Hamza", date: yesterday, reason: "He was unwell" })).catch(error => error);
    assert.ok(missing instanceof InputRequired);
    assert.equal(missing.fields[0].pointer, "/date");

    const read = await exec("read.parent.child_attendance").execute(ctx, { child: "Sara" }, { idempotencyKey: KEY() });
    assert.equal(read.kind, "read");
    assert.match(String((read.detail as { text?: string }).text), /Sara Raza: 1 absent and 0 late.*1 pending school review/);
    const urdu = await exec("read.parent.child_attendance").execute(await ctxFor(parent, "ur"), { child: "Sara" }, { idempotencyKey: KEY() });
    assert.match(String((urdu.detail as { text?: string }).text), /غیر حاضری/);
  });
  const rows = await db.attendanceExplanation.findMany({ where: { schoolId } });
  assert.equal(rows.length, 1, "created once");
  assert.equal(rows[0].status, "PENDING");
  assert.equal((await db.attendance.findUniqueOrThrow({ where: { id: absence.id } })).status, "ABSENT", "the register is unchanged");
});

test("meeting: bound to the child's teacher and first free slot, booked once, replay reconciles", async () => {
  const { schoolId, campusId, parent, classTeacher, mathsTeacher } = await fixture();
  const date = dayFromNow(4);
  for (const teacher of [classTeacher, mathsTeacher]) await db.meetingWindow.create({ data: { schoolId, campusId, teacherId: teacher.userId, localDate: date, startTime: "14:00", endTime: "15:00", timezone: "Asia/Karachi", slotMinutes: 15, location: "Room 5", cancellationPolicy: "Up to 2 hours before", createdById: teacher.userId } });
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    const meeting = exec("family.meeting");
    assert.equal(await code(meeting.resolve!(ctx, meeting.input.parse({ child: "Hamza" }))), "INPUT:/teacher=TEACHER_CHOICE", "two teachers with slots: asked");
    assert.equal(await code(meeting.resolve!(ctx, meeting.input.parse({ child: "Hamza", teacher: "maths teacher", date, time: "09:00" }))), "INPUT:/time=MEETING_TIME_UNAVAILABLE");
    const key = KEY();
    const first = await confirmRun(ctx, "family.meeting", { child: "Hamza", teacher: "maths teacher", date, partOfDay: "AFTERNOON", agenda: "Homework" }, key);
    assert.equal(first.resolved.teacherId, mathsTeacher.userId);
    assert.equal(first.resolved.time, "14:00");
    assert.equal(first.receipt.counts.bookings, 1);
    const replay = await meeting.execute(ctx, first.resolved, { idempotencyKey: key });
    assert.equal(replay.entities[0].id, first.receipt.entities[0].id);
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(replay.counts.bookings, 0);
    const classTeacherMeeting = await confirmRun(ctx, "family.meeting", { child: "Hamza", teacher: "class teacher" });
    assert.equal(classTeacherMeeting.resolved.teacherId, classTeacher.userId);
  });
  assert.equal(await db.meetingBooking.count({ where: { schoolId, teacherId: mathsTeacher.userId } }), 1, "booked once");
  assert.equal(await db.meetingBooking.count({ where: { schoolId } }), 2);
});

test("leave, canteen and activity requests: written once, replays reconcile", async () => {
  const { schoolId, campusId, admin, parent, kids } = await fixture();
  await db.campusPackage.create({ data: { schoolId, campusId, package: "CANTEEN", status: "ENABLED" } });
  await db.activity.create({ data: { schoolId, campusId, kind: "CLUB", title: "Football Club", description: "After school football", location: "Field", startsAt: new Date(Date.now() + 7 * 86_400_000), endsAt: new Date(Date.now() + 60 * 86_400_000), capacity: 10, cancellationTerms: "Any time", coordinatorId: admin.userId } });
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    const leave = { child: "Hamza", from: dayFromNow(2), reason: "Dentist appointment" };
    const firstLeave = await confirmRun(ctx, "family.request_leave", leave);
    assert.equal(firstLeave.receipt.counts.requests, 1);
    assert.equal((await confirmRun(ctx, "family.request_leave", leave)).receipt.counts.requests, 0);
    assert.equal(await code(exec("family.request_leave").resolve!(ctx, exec("family.request_leave").input.parse({ child: "Hamza", from: dayFromNow(-3), reason: "Was ill" }))), "INPUT:/from=LEAVE_IN_PAST_EXPLAIN_INSTEAD");

    const limit = await confirmRun(ctx, "canteen.set_spend_limit", { child: "Sara", dailyLimit: 300 });
    assert.equal((limit.receipt.detail as { dailyLimit?: number }).dailyLimit, 30000, "saved in minor units of the school currency");
    const diet = { child: "Sara", allergens: ["PEANUTS", "EGGS"] };
    const firstDiet = await confirmRun(ctx, "canteen.record_dietary", diet);
    assert.equal((firstDiet.receipt.detail as { status?: string }).status, "NEEDS_CONFIRMATION");
    const againDiet = await confirmRun(ctx, "canteen.record_dietary", diet);
    assert.equal((againDiet.receipt.detail as { reconciled?: boolean }).reconciled, true);

    const place = await confirmRun(ctx, "family_activities.request_place", { child: "Hamza", activity: "football" });
    assert.ok(["RESERVED", "CONFIRMED"].includes(String((place.receipt.detail as { status?: string }).status)), "a free place is taken, not waitlisted");
    assert.equal((await confirmRun(ctx, "family_activities.request_place", { child: "Hamza", activity: "football" })).receipt.counts.requests, 0);
    assert.equal(await code(exec("family_activities.request_place").resolve!(ctx, { child: "Hamza", activity: "chess" })), "INPUT:/activity=ACTIVITY_NOT_FOUND");

    const dues = await exec("read.parent.dues").execute(ctx, {}, { idempotencyKey: KEY() });
    assert.equal(dues.counts.children, 2, "both children when none is named");
    assert.match(String((dues.detail as { text?: string }).text), /Hamza Raza: nothing outstanding/);
  });
  assert.equal(await db.learnerLeaveRequest.count({ where: { schoolId, studentId: kids.hamza } }), 1);
  assert.equal(await db.dietaryRecord.count({ where: { schoolId } }), 1);
  assert.equal(((await db.dietaryRecord.findFirstOrThrow({ where: { schoolId } })).history as unknown[]).length, 1, "the replay added no history entry");
  assert.equal(await db.activityPlace.count({ where: { schoolId } }), 1);
});

test("hand-offs prepare the parent's own screen and write nothing; identity fields are never prefilled", async () => {
  const { schoolId, parent, kids } = await fixture();
  const counts = () => Promise.all([
    db.attendanceExplanation.count({ where: { schoolId } }), db.learnerLeaveRequest.count({ where: { schoolId } }), db.meetingBooking.count({ where: { schoolId } }),
    db.pickupAuthorization.count({ where: { schoolId } }), db.guardianChannelPreference.count({ where: { schoolId } }), db.chatMessage.count({ where: { schoolId } }),
    db.onlinePaymentOrder.count({ where: { schoolId } }), db.notification.count({ where: { schoolId } }), db.user.findUniqueOrThrow({ where: { id: parent.userId }, select: { phone: true, preferredLanguage: true } }),
  ]);
  const before = await counts();
  await within(parent, async () => {
    const ctx = await ctxFor(parent);
    const run = async (key: string, input: unknown) => {
      const item = handoff(key);
      assert.deepEqual(await runGates(ctx, item.gates), { ok: true });
      const parsed = item.input.parse(input);
      return item.handoff.prepare(ctx, item.resolve ? await item.resolve(ctx, parsed) : parsed, { idempotencyKey: KEY() });
    };
    const phone = await run("profile.change_phone", {});
    assert.equal(phone.kind, "DOMAIN_SCREEN");
    assert.match(phone.link, /settings=profile/);
    assert.ok(!("phone" in phone.prefill));
    const channel = await run("communications.set_guardian_channel_preference", { channel: "WHATSAPP" });
    assert.equal(channel.prefill.intent, "OPT_OUT");
    const office = await run("chat.message_office", { message: "My son's name is spelled wrong on his card" });
    assert.equal(office.prefill.draft, "My son's name is spelled wrong on his card");
    assert.equal((office.detail as { sends?: boolean }).sends, false);
    const pickup = await run("pickup.issue_authorization", { child: "Hamza", date: dayFromNow(1), from: "13:00", until: "14:30" });
    assert.equal(pickup.prefill.studentId, kids.hamza);
    for (const field of ["recipientName", "recipientRelation", "idMethod", "idLast4", "phone"]) assert.ok(!(field in pickup.prefill), `${field} is never prefilled (RT11)`);
    assert.equal(await code(run("pickup.issue_authorization", { child: "Hamza", date: dayFromNow(1), from: "07:00", until: "20:00" })), "INPUT:/until=PICKUP_WINDOW_TOO_LONG");
    assert.equal(await code(run("pickup.issue_authorization", { child: "Hamza", date: dayFromNow(20), from: "13:00", until: "14:00" })), "INPUT:/date=PICKUP_TOO_FAR_AHEAD");
    assert.equal(await code(run("fees.start_online_payment", { child: "Hamza" })), "DOMAIN_REFUSED:NOTHING_DUE");
  });
  assert.deepEqual(await counts(), before, "no hand-off writes, sends or pays anything");
});
