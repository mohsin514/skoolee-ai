import type { AuthUser } from "@/lib/auth";
import { canConfigureCampus } from "./setup-role";
import { SchoolAiError, resolveWorkspaceCampus, assertWorkspacePermission } from "./access";
import { assertConversationActor } from "./conversation-service";
import { schoolAiTransaction } from "./transaction";
import { getWorkspaceRecordInTransaction } from "./repository";
import { onboardingDataSchema } from "./schemas";
import { setupJourney } from "./setup-journey";

export async function getSetupJourney(user: AuthUser, recordId: string) {
 if (!canConfigureCampus(user.role)) throw new SchoolAiError("Campus setup belongs to a campus administrator.", 403);
 return schoolAiTransaction(user, async tx => {
  const permissions = await assertConversationActor(user, tx, "view");
  const record = await getWorkspaceRecordInTransaction(user, recordId, tx, permissions);
  if (record.kind !== "ONBOARDING" || record.status === "ARCHIVED") throw new SchoolAiError("Choose an active questionnaire.", 404);
  const campusId = await resolveWorkspaceCampus(user, record.campusId, tx);
  if (!campusId) throw new SchoolAiError("Choose a campus.", 422);
  const outcome = onboardingDataSchema.parse(record.data).answers.firstOutcome ?? "complete";
  // Counts must obey the same module grants as the underlying consoles.
  for (const moduleName of ["students", "staff", "exams", "timetable"] as const) await assertWorkspacePermission(user, moduleName, "view", permissions);
  const scope = { schoolId: user.schoolId, campusId };
  const cycles = await tx.academicCycle.findMany({ where: { ...scope, status: "ACTIVE" }, select: { academicYear: true } });
  const classes = await tx.class.findMany({ where: { ...scope, status: "ACTIVE", archivedAt: null, academicYear: { in: cycles.map(cycle => cycle.academicYear) } }, select: { id: true } });
  const classIds = classes.map(item => item.id), classScope = { ...scope, classId: { in: classIds } };
  const [teachers, students, subjects, rooms, periods, timetables] = await Promise.all([
   tx.user.count({ where: { ...scope, role: "TEACHER", isActive: true } }),
   tx.student.count({ where: { ...classScope, archivedAt: null, status: "active" } }),
   tx.subject.findMany({ where: classScope, select: { id: true, classId: true, teacher: { select: { isActive: true, campusId: true, role: true } }, _count: { select: { syllabusTopics: true } } } }),
   tx.classRoom.count({ where: scope }), tx.periodDefinition.count({ where: { ...scope, timeType: "CLASS" } }),
   tx.timetable.findMany({ where: { ...classScope, status: "PUBLISHED", academicYear: { in: cycles.map(cycle => cycle.academicYear) } }, select: { classId: true } }),
  ]);
  const canViewFees = Boolean(permissions.get("fees")?.canView);
  const fees = canViewFees ? await tx.feeStructure.findMany({ where: { ...classScope, activeFrom: { lte: new Date() }, OR: [{ activeTo: null }, { activeTo: { gte: new Date() } }] }, select: { classId: true } }) : [];
  const facts = { classes: classes.length, activeCycles: cycles.length, teachers, students, subjects: subjects.length,
   classesWithSubjects: new Set(subjects.map(item => item.classId)).size,
   assignedSubjects: subjects.filter(item => item.teacher?.isActive && item.teacher.campusId === campusId && item.teacher.role === "TEACHER").length,
   subjectsWithTopics: subjects.filter(item => item._count.syllabusTopics > 0).length, rooms, periods,
   classesWithPublishedTimetable: new Set(timetables.map(item => item.classId)).size, classesWithFees: new Set(fees.map(item => item.classId)).size };
  return { campusId, recordId, version: record.version, checkedAt: new Date().toISOString(), steps: setupJourney(facts, outcome).map(step => ({ ...step, restricted: step.key === "fees" && !canViewFees })) };
 });
}
