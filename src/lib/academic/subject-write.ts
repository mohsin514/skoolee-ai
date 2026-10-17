import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { moduleFlags } from "@/lib/permissions";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { effectiveDate, recordTeachingAssignment } from "./structure";
type SubjectInput = { classId: string; campusId?: string | null; name: string; teacherId?: string | null; totalMarks: number; applyToAllSections?: boolean };
export async function assertSubjectWrite(tx: TxClient, user: AuthUser, action: "add" | "edit") {
  if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Your account access changed. Sign in again.", 403);
  const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } }), flags = moduleFlags(grants, user.role, "exams");
  if (!flags.canView || !flags[action === "add" ? "canAdd" : "canEdit"]) throw new ApiError(`Insufficient permissions: exams.${action}`, 403);
  await assertSchoolOperational(user.schoolId, tx);
}
/** Same campus fence as reviewed setup and teacher/schedule updates. No notifications in a retry. */
export async function createCampusSubjects(user: AuthUser, input: SubjectInput) {
  const scope = { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? input.campusId ? { campusId: input.campusId } : {} : { campusId: user.campusId ?? "" }) };
  const located = await prisma.class.findFirst({ where: { id: input.classId, ...scope }, select: { campusId: true } }); if (!located) throw new ApiError("Class not found", 404);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, located.campusId); await assertSubjectWrite(tx, user, "add");
    const cls = await tx.class.findFirst({ where: { id: input.classId, ...scope, campusId: located.campusId, archivedAt: null, status: "ACTIVE" }, select: { id: true, campusId: true, name: true, academicYear: true } }); if (!cls) throw new ApiError("Choose an active class.", 409);
    const name = input.name.trim(), totalMarks = input.totalMarks, teacherId = input.teacherId || null;
    if (!name || name.length > 120 || !Number.isInteger(totalMarks) || totalMarks < 1 || totalMarks > 1000) throw new ApiError("Check the subject name and maximum marks.", 400);
    if (teacherId && !await tx.user.findFirst({ where: { id: teacherId, schoolId: user.schoolId, campusId: cls.campusId, role: "TEACHER", isActive: true }, select: { id: true } })) throw new ApiError("Teacher is not active in this campus", 400);
    const targets = input.applyToAllSections ? await tx.class.findMany({ where: { schoolId: user.schoolId, campusId: cls.campusId, name: cls.name, academicYear: cls.academicYear, archivedAt: null, status: "ACTIVE" }, select: { id: true } }) : [{ id: cls.id }];
    const existing = await tx.subject.findMany({ where: { schoolId: user.schoolId, campusId: cls.campusId, classId: { in: targets.map(row => row.id) } }, select: { name: true, classId: true } }), normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase(), create = targets.filter(target => !existing.some(row => row.classId === target.id && normalize(row.name) === normalize(name)));
    if (!create.length) throw new ApiError("This subject already exists in the selected sections.", 409);
    const created = [];
    for (const target of create) created.push(await tx.subject.create({ data: { schoolId: user.schoolId, campusId: cls.campusId, classId: target.id, name, totalMarks, teacherId }, include: { class: { select: { id: true, name: true, section: true } }, teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } } }));
    if (teacherId) for (const row of created) await recordTeachingAssignment(tx, user, { campusId: cls.campusId, classId: row.classId, subjectId: row.id, teacherId, from: effectiveDate(undefined) });
    const subject = created.find(row => row.classId === cls.id) ?? created[0]; await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "subject", recordId: subject.id, newValue: { name, totalMarks, createdIds: created.map(row => row.id) }, userId: user.userId } }); return { subject, cls, createdCount: created.length };
  });
}
