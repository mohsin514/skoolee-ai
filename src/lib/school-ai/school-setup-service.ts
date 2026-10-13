import { assertAcademicSetupAccess, previewAcademicSetup, applyAcademicSetupRow } from "./school-setup-academics";
import { lockSchoolMemberships } from "@/lib/staff/invitation-write";
import { randomUUID } from "node:crypto";
import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { normalizePlan } from "@/config/plans";
import { parseGuardianPermissions } from "@/lib/parent/guardian-permissions";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { applyEnrollment, applyWithdrawal } from "@/lib/students/enrollment";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { assertFinanceOperationsAccess } from "./finance-operations-service";
import { previewMigrationCutover, previewSetupEnrollment } from "./school-setup-lifecycle";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { schoolSetupProposalSchema, type SchoolSetupPreview, type SchoolSetupResult, type SchoolSetupOptions, type SchoolSetupProposal, type SetupProvenance } from "./school-setup";
type RecordWithCampus = SchoolAiRecord & { campusId: string };
const fail = (code: string) => { throw new SchoolAiError("Review the setup identities and existing school records.", 409, code); };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const rights = (row: Extract<SchoolSetupProposal, { action: "GUARDIANS" }>["rows"][number]) => parseGuardianPermissions({ ...row, consents: { medicalTreatment: row.medicalTreatment, fieldTrips: row.fieldTrips, mediaPublication: row.mediaPublication, offsiteTravel: row.offsiteTravel } });
export async function assertSchoolSetupAccess(user: AuthUser, db: TxClient = prisma) {
  assertApprovalRole(user);
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true, isInstitutionOwner: true, canManageMemberships: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your account access changed.", 403, "PERMISSION_DENIED");
  const grants = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "view", grants); await assertSchoolAiAccess(user, "edit", grants);
  for (const moduleName of ["timetable", "staff", "students"] as const) { await assertWorkspacePermission(user, moduleName, "view", grants); await assertWorkspacePermission(user, moduleName, moduleName === "students" ? "edit" : "add", grants); }
  await assertSchoolOperational(user.schoolId, db); return actor;
}
export async function assertSchoolSetupRecordAccess(user: AuthUser, recordId: string, db: TxClient = prisma, originalVersion?: number) {
  await assertSchoolSetupAccess(user, db);
  const record = await db.schoolAiRecord.findFirst({ where: { id: recordId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { data: true } });
  if (!record) throw new SchoolAiError("Setup plan not found.", 404);
  const revision = originalVersion === undefined ? null : await db.schoolAiRevision.findFirst({ where: { recordId, schoolId: user.schoolId, version: originalVersion }, select: { data: true } });
  if (originalVersion !== undefined && !revision) throw new SchoolAiError("Saved setup version not found.", 404);
  for (const item of [record, revision]) if (item) await assertAcademicSetupAccess(user, (item.data as { proposal?: { action?: string; rows?: unknown[] } }).proposal ?? {}, db);
  if ([record, revision].some(item => item && (item.data as { proposal?: { action?: string } }).proposal?.action === "MIGRATION_CUTOVER")) await assertFinanceOperationsAccess(user, db);
}
export async function getSchoolSetupOptions(user: AuthUser, requestedCampusId?: string | null): Promise<SchoolSetupOptions> {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () => {
    const actor = await assertSchoolSetupAccess(user), campusId = await resolveWorkspaceCampus(user, requestedCampusId); if (!campusId) throw new SchoolAiError("Choose a campus.", 400, "CAMPUS_REQUIRED");
    const grants = await loadWorkspacePermissionSnapshot(user, prisma), canViewSubjects = user.role === "SUPER_ADMIN" || grants.get("exams")?.canView;
    const [students, classes, sources, subjects, teachers, cycles, holidays] = await Promise.all([
      prisma.student.findMany({ where: { schoolId: user.schoolId, campusId, archivedAt: null, status: "active" }, select: { id: true, fullName: true, admissionNo: true, rollNo: true }, orderBy: { id: "asc" }, take: 501 }),
      prisma.class.findMany({ where: { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId }), status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true, campusId: true, classTeacherId: true, teachingMode: true, campus: { select: { name: true } } }, orderBy: { id: "asc" }, take: 501 }),
      prisma.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId, kind: "SOURCE", status: "APPROVED" }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 101 }),
      canViewSubjects ? prisma.subject.findMany({ where: { schoolId: user.schoolId, campusId, class: { campusId, status: "ACTIVE", archivedAt: null } }, select: { id: true, name: true, classId: true, teacherId: true, class: { select: { name: true, section: true, academicYear: true } } }, orderBy: { name: "asc" }, take: 1001 }) : Promise.resolve([]),
      prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, role: "TEACHER", isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 501 }),
      prisma.academicCycle.findMany({ where: { schoolId: user.schoolId, campusId, status: "ACTIVE" }, select: { academicYear: true, label: true }, orderBy: { academicYear: "asc" }, take: 101 }),
      prisma.holiday.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { fromDate: "asc" }, take: 501 }),
    ]);
    return { campusId, students: students.slice(0, 500).map(row => ({ id: row.id, label: `${row.fullName} · ${row.admissionNo || row.rollNo}` })), classes: classes.slice(0, 500).map(row => ({ id: row.id, campusId: row.campusId, teacherId: row.classTeacherId, teacherName: teachers.find(teacher => teacher.id === row.classTeacherId)?.fullName ?? null, teachingMode: row.teachingMode, label: `${row.campus.name} · ${row.name} ${row.section || ""} · ${row.academicYear}` })), subjects: subjects.slice(0, 1000).map(row => ({ id: row.id, label: `${row.name} · ${row.class.name} ${row.class.section || ""} · ${row.class.academicYear}`, classId: row.classId, teacherId: row.teacherId, teacherName: teachers.find(teacher => teacher.id === row.teacherId)?.fullName ?? null })), teachers: teachers.slice(0, 500).map(row => ({ id: row.id, label: row.fullName })), academicYears: cycles.slice(0, 100).map(row => ({ id: String(row.academicYear), label: `${row.label} · ${row.academicYear}` })), holidays: holidays.slice(0, 500).map(row => ({ id: row.id, label: `${row.name} · ${row.fromDate.toISOString().slice(0,10)}–${row.toDate.toISOString().slice(0,10)}`, name: row.name, fromDate: row.fromDate.toISOString().slice(0,10), toDate: row.toDate.toISOString().slice(0,10) })), sources: sources.slice(0, 100).map(row => ({ id: row.id, label: row.title })), canInviteStaff: actor.isInstitutionOwner || actor.canManageMemberships, truncated: students.length > 500 || classes.length > 500 || sources.length > 100 || subjects.length > 1000 || teachers.length > 500 || cycles.length > 100 || holidays.length > 500 };
  });
}
export async function previewSchoolSetup(user: AuthUser, record: RecordWithCampus, db: TxClient): Promise<SchoolSetupPreview> {
  const actor = await assertSchoolSetupAccess(user, db); await resolveWorkspaceCampus(user, record.campusId, db);
  const parsed = schoolSetupProposalSchema.safeParse((record.data as { proposal?: unknown }).proposal); if (!parsed.success) return fail("SETUP_PROPOSAL");
  const proposal = parsed.data, where = { schoolId: user.schoolId, campusId: record.campusId }, rows: SchoolSetupPreview["rows"] = []; let facts: unknown, provenance: SetupProvenance | undefined;
  if (proposal.action === "ROOMS") {
    const existing = await db.classRoom.findMany({ where, orderBy: { id: "asc" }, take: 1001 }); if (existing.length > 1000) return fail("SETUP_SCOPE_LIMIT");
    for (const [index, row] of proposal.rows.entries()) {
      const matches = existing.filter(item => normalize(item.roomNumber) === normalize(row.roomNumber)), match = matches[0], capacity = roomCapacity({ ...row, capacity: row.rows * row.benchesPerRow * row.seatsPerBench });
      if (matches.length > 1 || match && (match.roomType !== row.roomType || match.rows !== row.rows || match.benchesPerRow !== row.benchesPerRow || match.seatsPerBench !== row.seatsPerBench || match.examSeatsPerBench !== row.examSeatsPerBench || (match.building || "") !== row.building)) return fail("SETUP_EXISTING_CONFLICT");
      rows.push({ index, label: row.roomNumber, disposition: match ? "KEEP" : "CREATE", ...(match ? { existingId: match.id } : {}), teachingCapacity: capacity.teaching, examCapacity: capacity.exam });
    } facts = existing;
  } else if (proposal.action === "PERIODS") {
    const existing = await db.periodDefinition.findMany({ where, orderBy: { id: "asc" }, take: 501 }); if (existing.length > 500) return fail("SETUP_SCOPE_LIMIT");
    for (const [index, row] of proposal.rows.entries()) {
      const match = existing.find(item => item.timeType === row.timeType && item.periodNumber === row.periodNumber);
      if (match && (match.startTime !== row.startTime || match.endTime !== row.endTime) || existing.some(item => item.id !== match?.id && item.timeType === row.timeType && item.startTime < row.endTime && row.startTime < item.endTime)) return fail("SETUP_PERIOD_CONFLICT");
      rows.push({ index, label: `${row.timeType} ${row.periodNumber} · ${row.startTime}–${row.endTime}`, disposition: match ? "KEEP" : "CREATE", ...(match ? { existingId: match.id } : {}) });
    } facts = existing;
  } else if (proposal.action === "STAFF") {
    if (!actor.isInstitutionOwner && !actor.canManageMemberships) throw new SchoolAiError("Only authorized membership managers can prepare staff invitations.", 403, "SETUP_MEMBERSHIP_REQUIRED");
    // Invitation capacity and identities belong to the school, including when
    // two different campus administrators prepare batches at the same time.
    await lockSchoolMemberships(db, user.schoolId);
    // School-level identity comparison deliberately projects only the submitted
    // email identities, never an unrestricted staff directory across campuses.
    const emails = proposal.rows.map(row => row.email);
    const existing = await db.$queryRaw<Array<{ id: string; email: string; fullName: string; campusId: string | null; role: string; isActive: boolean; phone: string | null }>>(Prisma.sql`SELECT id,email,full_name AS "fullName",campus_id AS "campusId",role,is_active AS "isActive",phone FROM users WHERE school_id=${user.schoolId} AND lower(email) IN (${Prisma.join(emails)}) ORDER BY id`);
    const invitations = await db.$queryRaw<Array<{ id: string; email: string; campusId: string; role: string; expiresAt: Date; profile: unknown }>>(Prisma.sql`SELECT id,email,campus_id AS "campusId",role,expires_at AS "expiresAt",profile FROM staff_invitations WHERE school_id=${user.schoolId} AND status='pending' AND lower(email) IN (${Prisma.join(emails)}) ORDER BY id`);
    for (const [index, row] of proposal.rows.entries()) {
      const identities = existing.filter(item => normalize(item.email) === row.email), invites = invitations.filter(item => normalize(item.email) === row.email), identity = identities[0], invite = invites[0];
      if (identities.length > 1 || invites.length > 1 || identity && (!identity.isActive || identity.role !== row.role || identity.campusId !== record.campusId || normalize(identity.fullName) !== normalize(row.fullName) || (identity.phone || "") !== row.phone) || invite && (invite.role !== row.role || invite.campusId !== record.campusId || invite.expiresAt <= new Date() || normalize(String((invite.profile as { fullName?: string } | null)?.fullName || "")) !== normalize(row.fullName) || String((invite.profile as { phone?: string } | null)?.phone || "") !== row.phone)) return fail("SETUP_IDENTITY_CONFLICT");
      const match = identity || invite; rows.push({ index, label: `${row.fullName} · ${row.email}`, disposition: match ? "KEEP" : "CREATE", ...(match ? { existingId: match.id } : {}) });
    }
    const school = await db.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { plan: true, commercialContract: true } }), contract = getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract);
    const [usage] = await db.$queryRaw<Array<{ count: bigint }>>`SELECT ((SELECT count(*) FROM users WHERE school_id=${user.schoolId} AND role='TEACHER' AND is_active=true) + (SELECT count(*) FROM staff_invitations WHERE school_id=${user.schoolId} AND role='TEACHER' AND status='pending')) AS count`;
    const added = rows.filter(item => item.disposition === "CREATE" && proposal.rows[item.index].role === "TEACHER").length;
    if (contract.maxTeachers >= 0 && Number(usage.count) + added > contract.maxTeachers) return fail("SETUP_TEACHER_LIMIT");
    facts = { existing, invitations, school, teacherCount: Number(usage.count), membership: { owner: actor.isInstitutionOwner, delegated: actor.canManageMemberships } };
  } else if (proposal.action === "GUARDIANS") {
    const studentIds = [...new Set(proposal.rows.map(row => row.studentId))], students = await db.student.findMany({ where: { ...where, id: { in: studentIds }, archivedAt: null }, select: { id: true, fullName: true } });
    if (students.length !== studentIds.length) return fail("SETUP_STUDENT_UNAVAILABLE");
    const relationships = await db.guardianRelationship.findMany({ where: { ...where, studentId: { in: studentIds }, status: { not: "REVOKED" } }, include: { accessVersions: { orderBy: { effectiveFrom: "desc" } } }, orderBy: { id: "asc" }, take: 1001 }); if (relationships.length > 1000) return fail("SETUP_SCOPE_LIMIT");
    for (const [index, row] of proposal.rows.entries()) {
      const matches = relationships.filter(item => item.studentId === row.studentId && normalize(item.email) === row.email), match = matches[0], permissions = rights(row);
      if (matches.length > 1 || match && (normalize(match.fullName) !== normalize(row.fullName) || (match.phone || "") !== row.phone || match.validUntil !== null || match.status === "INVITED" && (!match.invitationExpiresAt || match.invitationExpiresAt <= new Date()) || match.relationship !== row.relationship || !["ACTIVE", "INVITED"].includes(match.status) || match.validFrom.toISOString().slice(0, 10) !== row.effectiveFrom || match.accessVersions.length !== 1 || match.accessVersions[0].effectiveUntil !== null || match.accessVersions[0].effectiveFrom.toISOString().slice(0, 10) !== row.effectiveFrom || workspaceRequestHash(parseGuardianPermissions(match.accessVersions[0].permissions)) !== workspaceRequestHash(permissions))) return fail("SETUP_IDENTITY_CONFLICT");
      const studentName = students.find(item => item.id === row.studentId)!.fullName; rows.push({ index, label: `${row.fullName} · ${row.email}`, studentName, disposition: match ? "KEEP" : "CREATE", ...(match ? { existingId: match.id } : {}) });
    } facts = { students, relationships };
  } else if (proposal.action === "SUBJECTS" || proposal.action === "TEACHER_ALLOCATIONS" || proposal.action === "HOLIDAYS" || proposal.action === "WEEKENDS") {
    const result = await previewAcademicSetup(user, record.campusId, proposal, db); rows.push(...result.rows); facts = result.facts;
  } else if (proposal.action === "TRANSFERS" || proposal.action === "WITHDRAWALS") {
    const result = await previewSetupEnrollment(user, record.campusId, proposal, db); rows.push(...result.rows); facts = result.facts;
  } else {
    const result = await previewMigrationCutover(user, record.campusId, proposal, db); rows.push(...result.rows); facts = result.facts; provenance = { sources: result.facts.sources.map(({ id, version, title }) => ({ id, version, title })), imports: result.facts.imports.map(({ id, fingerprint, sourceName, state }) => ({ id, fingerprint, sourceName, state })) };
  }
  const value = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, action: proposal.action, sourceReference: proposal.sourceReference, rows, createdCount: rows.filter(row => row.disposition === "CREATE").length, keptCount: rows.filter(row => row.disposition === "KEEP").length, proposal, ...(provenance ? { provenance } : {}) };
  return { ...value, previewHash: workspaceRequestHash(json({ value, facts })) };
}
/** Common executor supplies a reviewed saved version, current preview and campus fence. */
export async function applySchoolSetup(user: AuthUser, record: RecordWithCampus, preview: SchoolSetupPreview, db: TxClient): Promise<SchoolSetupResult> {
  await assertSchoolSetupRecordAccess(user, record.id, db); const p = preview.proposal, scope = { schoolId: user.schoolId, campusId: record.campusId }, rows: SchoolSetupResult["rows"] = [];
  if (p.action === "MIGRATION_CUTOVER" && preview.rows.some(row => !row.reconciliation?.matches)) return fail("SETUP_MIGRATION_MISMATCH");
  if (p.action === "TRANSFERS") { const targets = await db.class.findMany({ where: { schoolId: user.schoolId, id: { in: p.rows.map(row => row.targetClassId) } }, select: { campusId: true } }); for (const id of [...new Set(targets.map(row => row.campusId))].sort()) if (id !== record.campusId) await lockTimetableCampus(db, user.schoolId, id); }
  for (const item of preview.rows) {
    if (item.disposition === "KEEP") { rows.push({ ...item, id: item.existingId! }); continue; }
    let id: string;
    if (p.action === "ROOMS") { const row = p.rows[item.index]; id = (await db.classRoom.create({ data: { ...scope, ...row, building: row.building || null, capacity: row.rows * row.benchesPerRow * row.seatsPerBench } })).id; }
    else if (p.action === "PERIODS") id = (await db.periodDefinition.create({ data: { ...scope, ...p.rows[item.index] } })).id;
    else if (p.action === "STAFF") { const row = p.rows[item.index]; id = (await db.staffInvitation.create({ data: { ...scope, email: row.email, role: row.role, token: randomUUID(), expiresAt: new Date(Date.now() + 48 * 3600000), profile: { fullName: row.fullName, phone: row.phone }, invitedBy: user.fullName || user.email, deliveryStatus: "pending", canManageMemberships: false, canPurchaseSubscription: false } })).id; }
    else if (p.action === "GUARDIANS") {
      const row = p.rows[item.index], effectiveFrom = new Date(row.effectiveFrom + "T00:00:00.000Z"), permissions = rights(row);
      id = (await db.guardianRelationship.create({ data: { ...scope, studentId: row.studentId, fullName: row.fullName, email: row.email, phone: row.phone || null, relationship: row.relationship, status: "INVITED", createdByUserId: user.userId, validFrom: effectiveFrom, invitationExpiresAt: new Date(Date.now() + 14 * 86400000) } })).id;
      await db.guardianAccessVersion.create({ data: { schoolId: user.schoolId, relationshipId: id, permissions, effectiveFrom, reason: p.sourceReference, createdByUserId: user.userId } });
      await db.guardianAccessEvent.create({ data: { schoolId: user.schoolId, relationshipId: id, actorUserId: user.userId, action: "INVITED", reason: p.sourceReference, beforeState: Prisma.DbNull, afterState: { status: "INVITED", permissions, effectiveFrom: effectiveFrom.toISOString(), workspaceId: record.id, version: record.version }, effectiveAt: effectiveFrom } });
    } else if (p.action === "SUBJECTS" || p.action === "TEACHER_ALLOCATIONS" || p.action === "HOLIDAYS" || p.action === "WEEKENDS") { id = await applyAcademicSetupRow(user, record.campusId, p, item, db);
    } else if (p.action === "TRANSFERS") {
      const row = p.rows[item.index], result = await applyEnrollment(db, { studentId: row.studentId, fromId: item.currentEnrollmentId!, targetClassId: row.targetClassId, effectiveDate: new Date(row.effectiveFrom + "T00:00:00Z"), rollNo: row.rollNo, actorId: user.userId, reason: p.sourceReference }); id = result.enrollment.id;
    } else if (p.action === "WITHDRAWALS") {
      const row = p.rows[item.index], result = await applyWithdrawal(db, { studentId: row.studentId, effectiveDate: new Date(row.effectiveFrom + "T00:00:00Z"), actorId: user.userId, reason: p.sourceReference }); id = result.from.id;
    } else { id = record.id;
    }
    rows.push({ ...item, id });
  }
  const result: SchoolSetupResult = { action: p.action, createdCount: preview.createdCount, keptCount: preview.keptCount, rows, sourceReference: p.sourceReference, ...(preview.provenance ? { provenance: preview.provenance } : {}), nextStep: p.action === "STAFF" ? "STAFF_DELIVERY" : p.action === "GUARDIANS" ? "GUARDIAN_ACCEPTANCE" : p.action === "TRANSFERS" || p.action === "WITHDRAWALS" ? "ENROLLMENT_UPDATED" : p.action === "MIGRATION_CUTOVER" ? "MIGRATION_ACCEPTED" : "READY" };
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_setup", recordId: record.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { action: p.action, version: record.version, previewHash: preview.previewHash, createdIds: rows.filter(row => row.disposition === "CREATE").map(row => row.id), sourceReference: p.sourceReference } } });
  return result;
}
