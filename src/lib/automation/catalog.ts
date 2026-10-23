import { isCampusOperator } from "@/lib/auth/institution";
import { campusCreateSchema, libraryCreateSchema, phoneCallSchema, personalPlanSchema, studentsCreateSchema, platformInspectSchema, platformUpdateSchema } from "./role-actions";
import { loadWorkspacePermissionSnapshot } from "@/lib/school-ai/access";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { assertSchoolAiAccess, getWorkspaceCapabilities, SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";
import { aiOutputSchema } from "@/lib/ai/output-schema";
import { academicSetupProposalSchema } from "@/lib/school-ai/academic-setup";
import { schoolSetupProposalSchema } from "@/lib/school-ai/school-setup";
import { schoolOperationsProposalSchema } from "@/lib/school-ai/school-operations";
import { financeOperationProposalSchema } from "@/lib/school-ai/finance-operations";
import { timetableSetupProposalSchema } from "@/lib/school-ai/timetable-setup";
import { curriculumDataSchema } from "@/lib/school-ai/assessment";
import { profileActionSchema } from "./schema";
export const ROLE_PURPOSE: Record<string, string> = {
 APP_OWNER: "Platform owner: manage the application and institutions. Never assume tenant access; support access must be audited.",
 SUPER_ADMIN: "Group administrator: campuses, governance, delegation and group readiness. Campus classes and students belong to campus operators.",
 ADMIN: "School administrator: operational setup within current campus and delegated academic/finance authority.",
 CAMPUS_ADMIN: "Campus administrator: classes, students, staff and campus operations within current authority.",
 PRINCIPAL: "Academic lead: curriculum, timetable, assessment and academic approvals. No campus admissions or group governance.",
 TEACHER: "Teacher: own professional profile, assigned subjects and teaching preparation. Never create campus classes or change another teacher's records.",
 ACCOUNTANT: "Accountant: campus financial work and own profile. Never manage classes or academic outcomes.",
 LIBRARIAN: "Librarian: library preparation and own profile. Never manage campus academics or admissions.",
 RECEPTIONIST: "Receptionist: admissions/front-desk preparation and own profile. Never make academic or financial decisions.",
 STUDENT: "Student: own learning and personal preferences only; never change school structure or other users.",
 PARENT: "Parent: own preferences and children's authorized information only; never create or edit school records.",
};
export async function automaticCatalog(user: AuthUser, campusId: string | null) {
 const tools: Record<string, unknown> = { "profile.update": aiOutputSchema(profileActionSchema) };
 if (user.role === "APP_OWNER") { tools["platform.inspect"] = aiOutputSchema(platformInspectSchema); tools["platform.update_institution"] = aiOutputSchema(platformUpdateSchema); }
 const permissions = await loadWorkspacePermissionSnapshot(user);
 if (["ADMIN", "CAMPUS_ADMIN"].includes(user.role) && permissions.get("students")?.canAdd) tools["students.create"] = { description: "Create student records. Saves guardian email as contact only; does not invite accounts or grant guardian access.", schema: aiOutputSchema(studentsCreateSchema) };
 if (user.role === "SUPER_ADMIN") tools["campus.create"] = aiOutputSchema(campusCreateSchema);
 if ((user.role === "LIBRARIAN" || isCampusOperator(user)) && permissions.get("library")?.canAdd) tools["library.create_books"] = aiOutputSchema(libraryCreateSchema);
 if ((user.role === "RECEPTIONIST" || isCampusOperator(user)) && permissions.get("front-desk")?.canAdd) tools["front_desk.log_call"] = aiOutputSchema(phoneCallSchema);
 tools["personal.save_plan"] = { description: "Save a private personal plan, study schedule or family checklist. This never creates school records or shares it with others.", schema: aiOutputSchema(personalPlanSchema) };
 const profile = await prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { fullName: true, preferredLanguage: true, qualification: true, specialization: true, subjectSpecialties: true, experience: true, city: true } });
 if (!(SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role)) return { tools, operations: [] as string[], context: { profile, today: new Date().toISOString().slice(0, 10) }, purpose: ROLE_PURPOSE[user.role] };
 await assertSchoolAiAccess(user, "view");
 const caps = await getWorkspaceCapabilities(user);
 const operations = (caps.tools ?? []).map(tool => tool.operation);
 if (caps.canCreate && caps.kinds.includes("WORKFLOW")) tools["work.save"] = { description: "Save a requested work or teaching plan. This creates a saved plan, not operational records. Never use it to pretend a requested record was created." };
 if (operations.length) tools["school.inspect"] = { description: "Read current named records and options for an allowed operation. Use this before asking for internal IDs. Optional classId/date narrows the query." };
 if (operations.length) tools["school.execute"] = { allowedOperations: operations, proposals: [academicSetupProposalSchema, schoolSetupProposalSchema, schoolOperationsProposalSchema, financeOperationProposalSchema, timetableSetupProposalSchema].map(schema => aiOutputSchema(schema)) };
 if (operations.includes("curriculum.import_topics")) tools["curriculum.create"] = aiOutputSchema(curriculumDataSchema);
 const scope = { schoolId: user.schoolId, campusId: campusId ?? "" };
 const canReadAcademics = caps.kinds.includes("CURRICULUM"), canReadSetup = operations.includes("setup.apply_changes");
 const [cycles, classes, subjects, teachers, rooms, periods] = await Promise.all([
 operations.some(operation => operation.startsWith("academics.")) ? prisma.academicCycle.findMany({ where: scope, select: { id: true, academicYear: true, label: true, startDate: true, endDate: true, status: true }, take: 20 }) : [],
 operations.length ? prisma.class.findMany({ where: { ...scope, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true, academicYear: true, teachingMode: true, classTeacherId: true }, take: 200 }) : [],
 canReadAcademics ? caps.subjects : [],
 canReadSetup ? prisma.user.findMany({ where: { ...scope, role: "TEACHER", isActive: true }, select: { id: true, fullName: true }, take: 200 }) : [],
 operations.some(op => op.startsWith("timetable.")) || canReadSetup ? prisma.classRoom.findMany({ where: scope, select: { id: true, roomNumber: true, roomType: true, rows: true, benchesPerRow: true, seatsPerBench: true }, take: 200 }) : [],
 operations.some(op => op.startsWith("timetable.")) || canReadSetup ? prisma.periodDefinition.findMany({ where: scope, select: { id: true, periodNumber: true, timeType: true, startTime: true, endTime: true }, take: 100 }) : [],
 ]);
 return { tools, operations, context: { profile, today: new Date().toISOString().slice(0, 10), cycles: cycles.map(cycle => ({ ...cycle, startDate: cycle.startDate?.toISOString().slice(0, 10) ?? null, endDate: cycle.endDate?.toISOString().slice(0, 10) ?? null })), classes, subjects, teachers, rooms, periods, catalogLimits: { classes: 200, teachers: 200, rooms: 200, periods: 100, cycles: 20 } }, purpose: ROLE_PURPOSE[user.role] };
}
