import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { addResourceVersion, aiEligibleResources, changeAudience, confirmResourceUpload, createResource, listResources, publishResource, resolveDownload, retireResource } from "../../src/lib/resources/service";

// SKO-400 rules against the isolated database: audience, versions, retirement and scope.
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });

const present = async () => new ReadableStream({ start: controller => controller.close() });
const missing = async (): Promise<ReadableStream> => { throw new Error("NoSuchKey"); };
const link = (n = 1) => ({ link: `https://example.invalid/synthetic-${n}.pdf` });
const pdf = { fileName: "Fractions handout.pdf", contentType: "application/pdf" as const, sizeBytes: 2048 };

async function school() {
  const schoolId = `res400-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID(), farClassId = randomUUID();
  schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic library school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusId, otherCampusId]) await db.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  const person = async (role: AuthUser["role"], campus: string | null = campusId): Promise<AuthUser> => {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, password: "x", fullName: `Synthetic ${role}`, role, schoolId, campusId: campus, isActive: true, onboardingComplete: true } });
    return { userId, email, role, schoolId, campusId: campus, accessVersion: 0, isInstitutionOwner: false };
  };
  const admin = await person("ADMIN"), teacher = await person("TEACHER"), otherTeacher = await person("TEACHER"), farAdmin = await person("ADMIN", otherCampusId);
  const learner = await person("STUDENT"), outsider = await person("STUDENT"), guardian = await person("PARENT");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 5", academicYear: 2026, classTeacherId: teacher.userId } });
  await db.class.create({ data: { id: otherClassId, schoolId, campusId, name: "Grade 6", academicYear: 2026, classTeacherId: otherTeacher.userId } });
  await db.class.create({ data: { id: farClassId, schoolId, campusId: otherCampusId, name: "Grade 5 far", academicYear: 2026 } });
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic pupil", rollNo: "1", gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
  await db.student.create({ data: { schoolId, campusId, classId: otherClassId, studentUserId: outsider.userId, fullName: "Synthetic other pupil", rollNo: "2", gender: "MALE", enrollmentDate: new Date("2026-09-01Z") } });
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: guardian.userId, createdByUserId: admin.userId, fullName: "Synthetic guardian", email: guardian.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin.userId, reason: "Synthetic library fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  return { schoolId, campusId, classId, otherClassId, farClassId, admin, teacher, otherTeacher, farAdmin, learner, outsider, guardian };
}
type School = Awaited<ReturnType<typeof school>>;
const base = (s: School, extra: Record<string, unknown> = {}) => ({ classId: s.classId, title: "Fractions handout", kind: "HANDOUT", audience: "CLASS", sourceRights: "Written by the synthetic maths team", description: "Worked examples on adding fractions.", content: link(), ...extra });
async function published(s: School, extra: Record<string, unknown> = {}, author = s.teacher) {
  const { resource } = await createResource(author, base(s, extra));
  await publishResource(author, resource.id, { version: 1 });
  return resource.id;
}
const titles = async (user: AuthUser, input: Record<string, unknown> = {}) => (await listResources(user, input)).resources.map(row => row.title).sort();

test("answer keys stay staff-only: excluded from learner and family lists, search, direct download and AI", async () => {
  const s = await school();
  await assert.rejects(() => createResource(s.teacher, base(s, { kind: "ANSWER_KEY", audience: "CLASS" })), /answer key/i, "the API refuses a learner-facing answer key");
  const keyId = await published(s, { title: "Fractions answer key", kind: "ANSWER_KEY", audience: "STAFF" });
  await published(s);
  await assert.rejects(() => db.learningResource.update({ where: { id: keyId }, data: { audience: "CLASS" } }), /answer_key_staff_only/, "the database refuses it too");
  await assert.rejects(() => changeAudience(s.teacher, keyId, { audience: "CLASS_AND_GUARDIANS" }), { status: 400 });
  assert.deepEqual(await titles(s.learner), ["Fractions handout"]);
  assert.deepEqual(await titles(s.learner, { q: "answer" }), [], "search does not reveal restricted titles");
  await assert.rejects(() => resolveDownload(s.learner, keyId), { status: 404 });
  await assert.rejects(() => resolveDownload(s.guardian, keyId), { status: 404 });
  const ai = await aiEligibleResources(db as never, s.schoolId, s.classId);
  assert.deepEqual(ai.map(row => row.title), ["Fractions handout"]);
  assert.ok((await resolveDownload(s.teacher, keyId)).link, "staff can still open it");
});

test("families see only CLASS_AND_GUARDIANS; learners see class material; preview matches exactly", async () => {
  const s = await school();
  await published(s, { title: "Class notes" });
  await published(s, { title: "Family routine", kind: "ROUTINE", audience: "CLASS_AND_GUARDIANS" });
  await published(s, { title: "Staff planning", kind: "NOTES", audience: "STAFF" });
  await createResource(s.teacher, base(s, { title: "Unpublished draft" }));
  assert.deepEqual(await titles(s.learner), ["Class notes", "Family routine"]);
  assert.deepEqual(await titles(s.guardian), ["Family routine"]);
  assert.deepEqual(await titles(s.outsider), [], "another class sees nothing");
  assert.deepEqual(await titles(s.teacher, { viewAs: "CLASS" }), await titles(s.learner));
  assert.deepEqual(await titles(s.teacher, { viewAs: "GUARDIANS" }), await titles(s.guardian));
  assert.deepEqual(await titles(s.teacher), ["Class notes", "Family routine", "Staff planning", "Unpublished draft"]);
});

test("replacing content adds a version; the published one stays served and older versions stay reproducible", async () => {
  const s = await school();
  const id = await published(s);
  await assert.rejects(() => addResourceVersion(s.teacher, id, { description: "Second edition with answers removed.", content: link(2), expectedLatest: 2 }), { status: 409 }, "stale editors cannot overwrite");
  assert.equal((await addResourceVersion(s.teacher, id, { description: "Second edition with answers removed.", content: link(2), expectedLatest: 1 })).version, 2);
  assert.equal((await resolveDownload(s.learner, id)).link, link(1).link, "learners keep the published version until v2 is published");
  await assert.rejects(() => resolveDownload(s.learner, id, 2), { status: 404 }, "learners cannot reach an unpublished version");
  await publishResource(s.teacher, id, { version: 2 });
  assert.equal((await resolveDownload(s.learner, id)).link, link(2).link);
  assert.equal((await resolveDownload(s.teacher, id, 1)).link, link(1).link, "pinned staff references still open v1");
  await assert.rejects(() => db.learningResourceVersion.updateMany({ where: { resourceId: id, version: 1 }, data: { linkUrl: "https://example.invalid/changed" } }), /immutable|cannot/i);
  assert.ok(await db.auditLog.count({ where: { schoolId: s.schoolId, tableName: "learning_resources", recordId: id } }) >= 4, "create, publishes and downloads are audited");
});

test("an unfinished upload keeps a draft that cannot be published; confirmation needs the stored object", async () => {
  const s = await school();
  const { resource, uploadUrl } = await createResource(s.teacher, base(s, { content: pdf }));
  assert.match(uploadUrl!, /^\/api\/uploads\/file\?intent=/);
  await assert.rejects(() => publishResource(s.teacher, resource.id, { version: 1 }), { status: 409 });
  await assert.rejects(() => confirmResourceUpload(s.teacher, resource.id, 1, missing), { status: 409 });
  assert.equal((await db.learningResource.findUniqueOrThrow({ where: { id: resource.id } })).status, "DRAFT");
  await confirmResourceUpload(s.teacher, resource.id, 1, present);
  await publishResource(s.teacher, resource.id, { version: 1 });
  assert.equal((await resolveDownload(s.learner, resource.id)).storageKey?.startsWith(`resources/${s.campusId}/${resource.id}/`), true);
  const noRights = await createResource(s.teacher, base(s, { sourceRights: "" }));
  await assert.rejects(() => publishResource(s.teacher, noRights.resource.id, { version: 1 }), { status: 400 }, "source and sharing rights are required to publish");
});

test("retiring or narrowing the audience denies access on the next request", async () => {
  const s = await school();
  const family = await published(s, { title: "Family routine", audience: "CLASS_AND_GUARDIANS" });
  assert.ok(await resolveDownload(s.guardian, family));
  await changeAudience(s.teacher, family, { audience: "CLASS" });
  await assert.rejects(() => resolveDownload(s.guardian, family), { status: 404 });
  assert.ok(await resolveDownload(s.learner, family));
  await retireResource(s.teacher, family);
  await assert.rejects(() => resolveDownload(s.learner, family), { status: 404 });
  assert.deepEqual(await titles(s.learner), []);
  await assert.rejects(() => publishResource(s.teacher, family, { version: 1 }), { status: 409 });
});

test("teachers author only their classes; managers only their campus", async () => {
  const s = await school();
  await assert.rejects(() => createResource(s.teacher, base(s, { classId: s.otherClassId })), { status: 403 });
  const id = await published(s);
  await assert.rejects(() => retireResource(s.otherTeacher, id), { status: 403 });
  await assert.rejects(() => resolveDownload(s.otherTeacher, id), { status: 404 }, "another teacher cannot open it either");
  await assert.rejects(() => listResources(s.teacher, { classId: s.otherClassId }), { status: 403 });
  assert.ok(await published(s, { classId: s.otherClassId }, s.admin), "a campus manager authors for any class in the campus");
  await assert.rejects(() => createResource(s.farAdmin, base(s)), { status: 404 }, "but not in another campus (invisible, not just forbidden)");
});
