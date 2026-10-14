import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { normalizePlan } from "@/config/plans";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { announcementChannelCapabilities, configuredAnnouncementTemplates, exactAnnouncementTemplate } from "./announcement-channels";
import { contactForChannel, validChannelContact } from "./announcement-channel-contract";
import { appendEvent } from "@/lib/queue/outbox";
import { workspaceRequestHash, getWorkspaceRecord } from "./repository";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { announcementLanguageSchema, announcementProposalSchema, type AnnouncementPreview, type AnnouncementOptions, type AnnouncementRecipient, type AnnouncementDeliveryList, type AnnouncementDelivery } from "./announcements";

export function announcementEmailReady() { return announcementChannelCapabilities().find(item => item.channel === "EMAIL")!.configured; }
export async function assertAnnouncementAccess(user: AuthUser, db: TxClient = prisma) {
  assertApprovalRole(user);
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your account access changed. Sign in again.", 403, "PERMISSION_DENIED");
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "edit", permissions);
  await assertWorkspacePermission(user, "students", "view", permissions);
  await assertWorkspacePermission(user, "students", "edit", permissions);
  await assertSchoolOperational(user.schoolId, db);
}
function context<T>(user: AuthUser, run: () => Promise<T>) { return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, run); }
export async function getAnnouncementOptions(user: AuthUser, requestedCampusId?: string | null): Promise<AnnouncementOptions> {
  return context(user, async () => {
    await assertAnnouncementAccess(user);
    const campusId = await resolveWorkspaceCampus(user, requestedCampusId);
    if (!campusId) throw new SchoolAiError("Choose a campus for this announcement.", 400, "CAMPUS_REQUIRED");
    const classes = await prisma.class.findMany({ where: { schoolId: user.schoolId, campusId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { id: "asc" }], take: 501 });
    if (classes.length > 500) throw new SchoolAiError("Narrow the campus class scope before creating an announcement.", 422, "ANNOUNCEMENT_SCOPE_LIMIT");
    return { campusId, classes, providerReady: announcementEmailReady(), channels: announcementChannelCapabilities(), templates: configuredAnnouncementTemplates() };
  });
}
type Proof = { relationshipId: string; accessVersionId: string; studentId: string; classId: string; relationshipUpdatedAt: string; preferenceId?: string | null; preferenceVersion?: number | null };
type Target = AnnouncementRecipient & { proofs: Proof[] };
export async function buildAnnouncementPreview(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient): Promise<{ preview: AnnouncementPreview; targets: Target[] }> {
  const parsed = announcementProposalSchema.safeParse((record.data as { proposal?: unknown }).proposal);
  if (!parsed.success) throw new SchoolAiError("Save a complete announcement proposal first.", 422, "ANNOUNCEMENT_PROPOSAL_REQUIRED");
  const proposal = parsed.data;
  const campus = await db.campus.findFirst({ where: { id: record.campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } });
  const classes = await db.class.findMany({ where: { id: { in: proposal.classIds }, schoolId: user.schoolId, campusId: record.campusId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: { id: "asc" } });
  if (!campus || classes.length !== proposal.classIds.length) throw new SchoolAiError("A selected class or campus is no longer active.", 409, "ANNOUNCEMENT_SCOPE");
  const students = await db.student.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, classId: { in: proposal.classIds }, archivedAt: null, status: { equals: "active", mode: "insensitive" } }, select: { id: true, fullName: true, classId: true }, orderBy: { id: "asc" }, take: 201 });
  if (students.length > 200) throw new SchoolAiError("Select at most 200 active students in one announcement.", 422, "ANNOUNCEMENT_SCOPE_LIMIT");
  const now = new Date();
  const relationships = await db.guardianRelationship.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, studentId: { in: students.map(student => student.id) }, status: "ACTIVE", verifiedAt: { not: null }, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }], guardian: { schoolId: user.schoolId, role: "PARENT", isActive: true } }, select: { id: true, studentId: true, guardianUserId: true, fullName: true, email: true, phone: true, updatedAt: true, guardian: { select: { preferredLanguage: true } }, accessVersions: { where: { effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, permissions: true } } }, orderBy: { id: "asc" }, take: 1001 });
  if (relationships.length > 1000) throw new SchoolAiError("The selected guardian scope is too large.", 422, "ANNOUNCEMENT_SCOPE_LIMIT");
  const preferences = await db.guardianChannelPreference.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, channel: proposal.channel, guardianUserId: { in: relationships.flatMap(row => row.guardianUserId ? [row.guardianUserId] : []) } }, orderBy: { id: "asc" } });
  const targets = new Map<string, Target>();
  const skipped: AnnouncementPreview["skipped"] = [];
  const blockers = new Set<AnnouncementPreview["blockers"][number]>();
  if (!announcementChannelCapabilities().find(item => item.channel === proposal.channel)?.configured) blockers.add("ANNOUNCEMENT_PROVIDER_UNAVAILABLE");
  if (proposal.channel === "WHATSAPP") {
    const school = await db.school.findUnique({ where: { id: user.schoolId }, select: { plan: true, commercialContract: true } });
    if (!school || !getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract).whatsappEnabled) blockers.add("ANNOUNCEMENT_CHANNEL_PLAN");
    for (const [language, message] of Object.entries(proposal.messages)) if (message && !exactAnnouncementTemplate(proposal.templateIds?.[language as "en" | "ar" | "ur"], language, message.subject, message.body)) blockers.add("ANNOUNCEMENT_TEMPLATE_REQUIRED");
  }
  for (const student of students) {
    const relations = relationships.filter(relation => relation.studentId === student.id);
    if (!relations.length) { skipped.push({ studentId: student.id, studentName: student.fullName, reason: "NO_VERIFIED_GUARDIAN" }); continue; }
    let hasContactCandidate = false;
    let missingAuthorizedContact = false; let missingChannelConsent = false;
    for (const relation of relations) {
      const rights = relation.accessVersions[0];
      if (!rights || (rights.permissions as { communication?: unknown })?.communication !== true) continue;
      const recipient = contactForChannel(proposal.channel, proposal.channel === "EMAIL" ? relation.email : relation.phone), preference = preferences.find(item => item.guardianUserId === relation.guardianUserId);
      if (preference && (!preference.enabled || !preference.verifiedAt || !preference.consentAt || preference.recipient !== recipient) || proposal.channel !== "EMAIL" && !preference) { missingChannelConsent = true; continue; }
      if (!validChannelContact(proposal.channel, recipient)) { missingAuthorizedContact = true; continue; }
      hasContactCandidate = true;
      const preferred = announcementLanguageSchema.safeParse(relation.guardian?.preferredLanguage);
      const language = preferred.success && proposal.messages[preferred.data] ? preferred.data : proposal.fallbackLanguage;
      if (!language || !proposal.messages[language]) { blockers.add("ANNOUNCEMENT_MISSING_LANGUAGE"); continue; }
      const proof = { relationshipId: relation.id, accessVersionId: rights.id, studentId: student.id, classId: student.classId!, relationshipUpdatedAt: relation.updatedAt.toISOString(), preferenceId: preference?.id ?? null, preferenceVersion: preference?.version ?? null };
      const prior = targets.get(relation.guardianUserId!);
      if (prior && (prior.recipient !== recipient || prior.language !== language)) { blockers.add("ANNOUNCEMENT_CONTACT_CONFLICT"); continue; }
      if (prior) { prior.proofs.push(proof); if (!prior.studentNames.includes(student.fullName)) prior.studentNames.push(student.fullName); }
      else targets.set(relation.guardianUserId!, { guardianUserId: relation.guardianUserId!, name: relation.fullName, recipient, language, studentNames: [student.fullName], proofs: [proof] });
    }
    // Exclusions describe students, not each denied guardian relationship.
    // Translation/contact conflicts remain blockers for the entire preview.
    if (!hasContactCandidate) skipped.push({ studentId: student.id, studentName: student.fullName, reason: missingChannelConsent ? "CHANNEL_NOT_CONSENTED" : missingAuthorizedContact ? "MISSING_CONTACT" : "NO_COMMUNICATION_PERMISSION" });
  }
  const audience = [...targets.values()].sort((a, b) => a.guardianUserId.localeCompare(b.guardianUserId));
  if (audience.length > 100) throw new SchoolAiError("Select at most 100 guardian recipients in one announcement.", 422, "ANNOUNCEMENT_SCOPE_LIMIT");
  if (!audience.length) blockers.add("ANNOUNCEMENT_EMPTY_AUDIENCE");
  // A shared contact across separate guardian accounts is ambiguous. Do not
  // silently merge account identities or send duplicate copies to that address.
  if (new Set(audience.map(target => target.recipient)).size !== audience.length) blockers.add("ANNOUNCEMENT_CONTACT_CONFLICT");
  const value = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, channel: proposal.channel, ...(proposal.templateIds ? { templateIds: proposal.templateIds } : {}), classes: classes.map(cls => ({ id: cls.id, name: [cls.name, cls.section, cls.academicYear].filter(Boolean).join(" · ") })), messages: proposal.messages, fallbackLanguage: proposal.fallbackLanguage, recipients: audience.map(({ proofs: _, ...target }) => target), skipped, blockers: [...blockers].sort() };
  return { preview: { ...value, previewHash: workspaceRequestHash({ preview: value, audience, students }) }, targets: audience };
}
export async function queueAnnouncement(user: AuthUser, record: SchoolAiRecord & { campusId: string }, prepared: Awaited<ReturnType<typeof buildAnnouncementPreview>>, db: TxClient) {
  const { preview, targets } = prepared;
  if (preview.blockers.length) throw new SchoolAiError("Resolve the announcement preview blockers before queuing messages.", 409, preview.blockers[0]);
  const communicationIds: string[] = [];
  for (const target of targets) {
    const message = preview.messages[target.language]!;
    const idempotencyKey = `school-ai-announcement:${record.id}:${record.version}:${target.guardianUserId}`;
    const communication = await db.parentCommunication.create({ data: { schoolId: user.schoolId, campusId: record.campusId, studentId: target.proofs[0].studentId, parentUserId: target.guardianUserId, createdById: user.userId, templateKey: "SCHOOL_AI_ANNOUNCEMENT", channel: preview.channel, recipientName: target.name, recipient: target.recipient, subject: message.subject, body: message.body, relatedType: "SCHOOL_AI_ANNOUNCEMENT", relatedId: record.id, status: "PENDING", approvedData: true, idempotencyKey, metadata: { recordId: record.id, recordVersion: record.version, previewHash: preview.previewHash, language: target.language, proofs: target.proofs } } });
    await appendEvent(db, { schoolId: user.schoolId, actorId: user.userId, referenceId: communication.id, kind: "SCHOOL_AI_ANNOUNCEMENT", version: 1, identity: idempotencyKey });
    communicationIds.push(communication.id);
  }
  return { queuedCount: communicationIds.length, communicationIds };
}

export async function listAnnouncementDeliveries(user: AuthUser, recordId: string, executionId: string): Promise<AnnouncementDeliveryList> {
  return context(user, async () => {
    await assertAnnouncementAccess(user);
    await getWorkspaceRecord(user, recordId);
    const execution = await prisma.schoolAiExecution.findFirst({ where: { id: executionId, schoolId: user.schoolId, recordId, operation: "communications.queue_announcement", ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { receipt: true } });
    if (!execution) throw new SchoolAiError("Announcement receipt not found.", 404, "WORKSPACE_NOT_FOUND");
    const ids = (execution.receipt as { communicationIds: string[] }).communicationIds;
    const rows = await prisma.parentCommunication.findMany({ where: { id: { in: ids }, schoolId: user.schoolId, relatedType: "SCHOOL_AI_ANNOUNCEMENT", relatedId: recordId }, include: { deliveryReceipts: { select: { state: true } } }, orderBy: { id: "asc" } });
    const jobs = await prisma.$queryRaw<Array<{ referenceId: string; state: string; reason: string | null; uncertain: boolean }>>`SELECT e.reference_id AS "referenceId",j.state,j.reason,EXISTS(SELECT 1 FROM workflow_effects f WHERE f.school_id=e.school_id AND f.job_id=e.id AND f.state='uncertain') AS uncertain FROM workflow_events e JOIN workflow_jobs j ON j.id=e.id AND j.school_id=e.school_id WHERE e.school_id=${user.schoolId} AND e.kind='SCHOOL_AI_ANNOUNCEMENT' AND e.reference_id=ANY(${ids}::text[])`;
    const counts: AnnouncementDeliveryList["counts"] = { QUEUED: 0, ACCEPTED: 0, DELIVERED: 0, READ: 0, FAILED: 0, UNCERTAIN: 0, CANCELLED: 0 };
    const deliveries = rows.map(row => {
      const job = jobs.find(item => item.referenceId === row.id);
      const states = row.deliveryReceipts.map(item => item.state);
      const status: AnnouncementDelivery["status"] = job?.uncertain ? "UNCERTAIN" : states.includes("read") ? "READ" : states.includes("delivered") ? "DELIVERED" : states.includes("failed") ? "FAILED" : row.status === "SENT" ? "ACCEPTED" : job?.state === "cancelled" ? "CANCELLED" : job?.state === "failed" || ["BLOCKED", "FAILED"].includes(row.status) ? "FAILED" : "QUEUED";
      counts[status]++;
      return { id: row.id, recipient: row.recipient, language: announcementLanguageSchema.parse((row.metadata as { language: string }).language), status, ...(job?.reason ? { reason: job.reason } : {}) };
    });
    return { deliveries, counts };
  });
}
