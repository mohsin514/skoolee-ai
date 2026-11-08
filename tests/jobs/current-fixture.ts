import { randomUUID } from "node:crypto";
import { PrismaClient, type ParentCommunication } from "@prisma/client";
import { SignJWT } from "jose";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { resolveCurrentPrincipal } from "../../src/lib/auth/principal";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { trackDeliveries } from "../../src/lib/jobs/service";
import { appendEvent } from "../../src/lib/queue/outbox";
import { jobsDestination } from "./local-destination.mjs";

export async function createCurrentFixture(db: PrismaClient, count = 100) {
  jobsDestination();
  const schoolId = `sko386-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), examId = randomUUID();
  const users = { PRINCIPAL: randomUUID(), TEACHER: randomUUID(), PARENT: randomUUID(), STUDENT: randomUUID(), CAMPUS_ADMIN: randomUUID() };
  await db.school.create({ data: { id: schoolId, name: "Synthetic recovery school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await db.campus.createMany({ data: [campusId, otherCampusId].map((id, index) => ({ id, schoolId, name: index ? "Other synthetic campus" : "Synthetic recovery campus", city: "Synthetic", regId: id })) });
  const cookies: Record<string, string> = {};
  for (const [role, id] of Object.entries(users)) {
    const selectedCampus = role === "CAMPUS_ADMIN" ? otherCampusId : campusId;
    await db.user.create({ data: { id, schoolId, campusId: selectedCampus, role: role as "PRINCIPAL", fullName: `Synthetic ${role}`, email: `${id}@example.invalid`, onboardingComplete: true, mfaEnabled: true } });
    if (process.env.AUTH_SECRET) {
      const token = await new SignJWT({ userId: id, schoolId, campusId: selectedCampus, role, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, onboardingComplete: true, mfaVerified: true }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("4h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
      await db.loginSession.create({ data: { schoolId, userId: id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 4 * 3600000) } });
      cookies[role] = `skoolee_token=${token}`;
    }
  }
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic current class", academicYear: 2026, classTeacherId: users.TEACHER } });
  await db.rolePermission.create({ data: { schoolId, role: "TEACHER", module: "reports", canView: true, canEdit: false } });
  await db.exam.create({ data: { id: examId, schoolId, campusId, classId, title: "Synthetic approved recovery", term: "Term 1", academicYear: 2026, status: "PUBLISHED", isLocked: true } });
  const pupilRows = Array.from({length: count}, (_, index) => ({ index, studentId: randomUUID(), reportId: randomUUID(), versionId: randomUUID(), guardianId: randomUUID(), relationshipId: randomUUID(), grantId: randomUUID(), phone: `+1555000${String(index).padStart(4,"0")}` }));
  await db.user.createMany({ data: pupilRows.map(row => ({ id: row.guardianId, schoolId, campusId, role: "PARENT", fullName: `Synthetic guardian ${row.index}`, email: `guardian-${row.guardianId}@example.invalid`, onboardingComplete: true })) });
  await db.student.createMany({ data: pupilRows.map(row => ({ id: row.studentId, schoolId, campusId, classId, fullName: `Synthetic pupil ${String(row.index).padStart(3,"0")}`, rollNo: `J386-${row.index}`, gender: "MALE", guardianEmail: "legacy-contact-must-not-authorize@example.invalid", guardianWhatsapp: row.phone })) });
  await db.guardianRelationship.createMany({ data: pupilRows.map(row => ({ id: row.relationshipId, schoolId, campusId, studentId: row.studentId, guardianUserId: row.guardianId, createdByUserId: users.PRINCIPAL, fullName: `Synthetic guardian ${row.index}`, email: `guardian-${row.guardianId}@example.invalid`, phone: row.phone, relationship: "guardian", status: "ACTIVE", validFrom: new Date(Date.now()-60000), verifiedAt: new Date() })) });
  await db.guardianAccessVersion.createMany({ data: pupilRows.map(row => ({ id: row.grantId, schoolId, relationshipId: row.relationshipId, permissions: { communication: true, learningRecords: true }, effectiveFrom: new Date(Date.now()-60000), reason: "Synthetic fixture grant", createdByUserId: users.PRINCIPAL })) });
  await db.guardianChannelPreference.createMany({ data: pupilRows.map(row => ({ schoolId, campusId, guardianUserId: row.guardianId, channel: "WHATSAPP", recipient: row.phone, enabled: true, verifiedAt: new Date(), consentAt: new Date(), evidence: "Synthetic verified consent", updatedById: users.PRINCIPAL })) });
  await db.reportCard.createMany({ data: pupilRows.map(row => ({ id: row.reportId, schoolId, campusId, examId, studentId: row.studentId, status: "PUBLISHED" })) });
  // Deliberately synthetic approved bytes: this suite checks identity/recovery, not PDF typography or grading correctness.
  await db.reportVersion.createMany({ data: pupilRows.map(row => ({ id: row.versionId, schoolId, reportCardId: row.reportId, number: 1, contentHash: `synthetic-${row.versionId}`, documentIdentity: randomUUID(), documentBytes: Buffer.from(`%PDF-1.4\nSynthetic approved artifact ${row.versionId}\n%%EOF`), snapshot: { fixture: true, version: row.versionId }, blockers: [], changedSections: [], approvedBy: users.PRINCIPAL, approvedAt: new Date(), publishedAt: new Date() })) });
  for (const row of pupilRows) await db.reportCard.update({ where: { id: row.reportId }, data: { currentVersionId: row.versionId, publishedVersionId: row.versionId } });
  const actor = (await resolveCurrentPrincipal({ schoolId, userId: users.PRINCIPAL }))!;
  const scoped = <T>(fn: () => Promise<T>) => runWithTenantContext(actor, fn);
  const exam = { id: examId, campusId, classId, title: "Synthetic approved recovery" };
  async function delivery(index: number, options: { channel?: string; status?: string; workflow?: boolean; guardian?: boolean } = {}) {
    const row = pupilRows[index];
    const channel = options.channel || "WHATSAPP";
    const communication = await db.parentCommunication.create({ data: { schoolId, campusId, studentId: row.studentId, parentUserId: options.guardian === false ? null : row.guardianId, channel, recipient: channel === "WHATSAPP" ? row.phone : `guardian-${row.guardianId}@example.invalid`, recipientName: `Synthetic family ${String(index).padStart(3,"0")}`, body: `Frozen approved content ${row.versionId}`, relatedId: row.reportId, relatedType: "REPORT_CARD", templateKey: "REPORT_CARD_PUBLISHED", metadata: { reportVersionId: row.versionId }, approvedData: true, idempotencyKey: `synthetic386:${randomUUID()}`, status: options.status || "PENDING" } });
    const eventId = options.workflow === false ? null : await db.$transaction(tx => appendEvent(tx, { schoolId, actorId: actor.userId, referenceId: communication.id, kind: "REPORT_DELIVERY", version: 1, identity: `report-delivery:${communication.idempotencyKey}` }));
    return { communication, eventId };
  }
  const track = (communications: ParentCommunication[], title = exam.title) => scoped(() => trackDeliveries(actor, { ...exam, title }, communications));
  return { schoolId, campusId, otherCampusId, classId, examId, users, cookies, pupilRows, actor, scoped, exam, delivery, track };
}
export type CurrentFixture = Awaited<ReturnType<typeof createCurrentFixture>>;
