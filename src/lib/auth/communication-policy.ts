import { prisma } from "@/lib/db/prisma";
import { announcementChannelSchema, contactForChannel, validChannelContact } from "@/lib/school-ai/announcement-channel-contract";
import { AccessDenied } from "./policy";

type CommunicationTarget = { schoolId: string; campusId?: string | null; studentId?: string | null; parentUserId?: string | null; recipient?: string | null };
type CommunicationPermission = "communication" | "learningRecords" | "attendance" | "finances";

/** The latest effective grant wins; historical allow rows never override a later denial. */
export async function authorizedGuardianCommunicationTargets(target: CommunicationTarget, channel: string, permission: CommunicationPermission = "communication") {
  const parsed = announcementChannelSchema.safeParse(channel);
  if (!target.studentId || !parsed.success) return [];
  const student = await findInScopeStudent(target);
  if (!student) return [];
  const now = new Date(), relationships = await prisma.guardianRelationship.findMany({
    where: { schoolId: target.schoolId, campusId: student.campusId, studentId: student.id, guardianUserId: target.parentUserId || { not: null }, status: "ACTIVE", verifiedAt: { not: null }, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }], guardian: { schoolId: target.schoolId, isActive: true, role: "PARENT" } },
    select: { email: true, phone: true, fullName: true, guardianUserId: true, accessVersions: { where: { effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1, select: { permissions: true } } }, orderBy: { id: "asc" }, take: 101,
  });
  if (relationships.length > 100) throw new AccessDenied("communication", "scope");
  const preferences = await prisma.guardianChannelPreference.findMany({ where: { schoolId: target.schoolId, campusId: student.campusId, channel, guardianUserId: { in: relationships.flatMap(row => row.guardianUserId ? [row.guardianUserId] : []) } } });
  const expected = target.recipient ? contactForChannel(parsed.data, target.recipient) : null;
  return relationships.flatMap(row => {
    const rights = row.accessVersions[0]?.permissions as Record<string, unknown> | undefined;
    const recipient = contactForChannel(parsed.data, channel === "EMAIL" ? row.email : row.phone), preference = preferences.find(item => item.guardianUserId === row.guardianUserId);
    if (!row.guardianUserId || rights?.communication !== true || rights[permission] !== true || !validChannelContact(parsed.data, recipient) || expected && expected !== recipient) return [];
    if (preference ? !preference.enabled || !preference.verifiedAt || !preference.consentAt || preference.recipient !== recipient : channel !== "EMAIL") return [];
    return [{ guardianUserId: row.guardianUserId, fullName: row.fullName, recipient, campusId: student.campusId }];
  });
}

/**
 * A pupil-scoped target is resolvable only while that pupil is active, unarchived and
 * inside the requested school/campus scope. The pupil's own campus is what scopes the
 * guardian lookup, so the caller's campus is treated as a narrowing filter.
 */
async function findInScopeStudent(target: CommunicationTarget) {
  if (!target.studentId) return null;
  return prisma.student.findFirst({ where: { id: target.studentId, schoolId: target.schoolId, ...(target.campusId ? { campusId: target.campusId } : {}), archivedAt: null, status: { equals: "active", mode: "insensitive" }, campus: { archivedAt: null } }, select: { id: true, campusId: true } });
}

/**
 * An institution-only notice may address one known account directly, without a pupil:
 * the account must be an active PARENT of the same school. This is a school-membership
 * check, never a pupil/guardian permission grant.
 */
async function isActiveSchoolParent(target: CommunicationTarget) {
  if (!target.parentUserId) return false;
  const parent = await prisma.user.findFirst({ where: { id: target.parentUserId, schoolId: target.schoolId, role: "PARENT", isActive: true }, select: { id: true } });
  return Boolean(parent);
}

/** Used both when queuing and immediately before a provider effect. */
export async function assertCommunicationTarget(target: CommunicationTarget, channel: string, permission: CommunicationPermission = "communication") {
  if (!target.studentId && !target.parentUserId) return; // Institution-only notices contain no pupil records.
  if (!target.studentId) {
    // Without a pupil the message is an institution-only notice. Pupil-record dispatches
    // (report cards, invoices) are meaningless here and must keep the pupil-scoped grant.
    if (permission !== "communication") throw new AccessDenied("communication", "send");
    if (await isActiveSchoolParent(target)) return;
    throw new AccessDenied("communication", "send");
  }
  if (!target.parentUserId && !target.recipient) {
    // No recipient is ever resolved, so nothing is delivered (status NO_RECIPIENT); only
    // the pupil's live school/campus scope is required to frame the locale snapshot.
    if (await findInScopeStudent(target)) return;
    throw new AccessDenied("communication", "send");
  }
  if (!(await authorizedGuardianCommunicationTargets(target, channel, permission)).length) throw new AccessDenied("communication", "send");
}

export async function assertPublishedCommunicationReport(reportId: string, studentId?: string | null) {
  const { getPublishedVersion } = await import("@/lib/academic/report-versions");
  const report = await prisma.reportCard.findFirst({ where: { id: reportId, ...(studentId ? { studentId } : {}) }, select: { id: true } });
  if (!report) throw new AccessDenied("report", "send");
  await getPublishedVersion(report.id);
}
