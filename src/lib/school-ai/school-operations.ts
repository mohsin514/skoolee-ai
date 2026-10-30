import { publishTimetablesProposalSchema, type PublishTimetablesPreview } from "./school-operations-publish";
import { z } from "zod";
import { riskDecisionProposalSchema, type RiskDecisionPreview } from "./school-operations-risk";
import { timetableSetupProposalSchema, type TimetableSetupPreview } from "./timetable-setup";
import { timetableSolveInputSchema } from "./timetable-solver";
import { academicLifecycleProposalSchema, promotionProposalSchema, type AcademicLifecyclePreview, type PromotionPreview } from "./school-operations-lifecycle";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const operationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Choose a real calendar date.");
const { campusId: _campus, ...classSolveShape } = timetableSolveInputSchema.shape;
export const schoolTimetableSolveSchema = z.strictObject({ campusId: id, classes: z.array(z.strictObject(classSolveShape)).min(1).max(24) }).superRefine((value, ctx) => {
  value.classes.forEach((cls, index) => { const parsed = timetableSolveInputSchema.safeParse({ ...cls, campusId: value.campusId }); if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: ["classes", index, ...issue.path], message: issue.message }); });
  if (new Set(value.classes.map(cls => cls.classId)).size !== value.classes.length) ctx.addIssue({ code: "custom", message: "Choose each class once." });
  if (new Set(value.classes.map(cls => cls.term)).size !== 1) ctx.addIssue({ code: "custom", message: "Use one term for this school plan." });
  if (value.classes.flatMap(cls => cls.requirements).reduce((sum, row) => sum + row.periodsPerWeek, 0) > 400) ctx.addIssue({ code: "custom", message: "Plan at most 400 lessons at once." });
});
export const schoolTimetableProposalSchema = z.strictObject({ operation: z.literal("timetable.create_school_drafts"), timetables: z.array(timetableSetupProposalSchema).min(1).max(24) }).superRefine((value, ctx) => {
  if (new Set(value.timetables.map(cls => cls.classId)).size !== value.timetables.length) ctx.addIssue({ code: "custom", message: "Choose each class once." });
  if (new Set(value.timetables.map(cls => `${cls.academicYear}:${cls.term}`)).size !== 1) ctx.addIssue({ code: "custom", message: "Use the same year and term for every class." });
  if (value.timetables.reduce((sum, row) => sum + row.slots.length, 0) > 400) ctx.addIssue({ code: "custom", message: "Plan at most 400 lessons at once." });
});
export const attendanceProposalSchema = z.strictObject({ operation: z.literal("attendance.record_register"), classId: id, date: operationDate, entries: z.array(z.strictObject({ studentId: id, status: z.enum(["PRESENT", "ABSENT", "LEAVE"]), note: z.string().trim().max(500).default("") })).min(1).max(250), observationConfirmed: z.literal(true) }).superRefine((value, ctx) => { if (new Set(value.entries.map(row => row.studentId)).size !== value.entries.length) ctx.addIssue({ code: "custom", message: "Each student needs one observed status." }); });
export const substituteProposalSchema = z.strictObject({ operation: z.literal("timetable.assign_substitutes"), date: operationDate, duties: z.array(z.strictObject({ slotId: id, teacherId: id.nullable(), reason: z.string().trim().min(3).max(1000) })).min(1).max(100) }).superRefine((value, ctx) => { if (new Set(value.duties.map(row => row.slotId)).size !== value.duties.length) ctx.addIssue({ code: "custom", message: "Review each lesson once." }); });
export const schoolOperationsProposalSchema = z.union([schoolTimetableProposalSchema, attendanceProposalSchema, substituteProposalSchema, academicLifecycleProposalSchema, promotionProposalSchema, riskDecisionProposalSchema, publishTimetablesProposalSchema]);
export type SchoolOperationsProposal = z.infer<typeof schoolOperationsProposalSchema>;
export type SchoolOperationsOperation = SchoolOperationsProposal["operation"];
export const schoolOperations = ["timetable.create_school_drafts", "attendance.record_register", "timetable.assign_substitutes", "academics.transition_year", "students.promote_enrollment", "operations.record_risk_decision", "timetable.publish_reviewed"] as const;
export function isSchoolOperationsOperation(value: string): value is SchoolOperationsOperation { return (schoolOperations as readonly string[]).includes(value); }
type BasePreview = { recordId: string; version: number; campusId: string; previewHash: string };
export type SchoolTimetablePreview = BasePreview & { operation: "timetable.create_school_drafts"; timetables: TimetableSetupPreview[] };
export type AttendancePreview = BasePreview & { operation: "attendance.record_register"; classId: string; className: string; date: string; entries: Array<{ studentId: string; name: string; rollNo: string; enrollmentId: string; status: "PRESENT" | "ABSENT" | "LEAVE"; previousStatus: string | null; attendanceId: string | null; note: string }> };
export type SubstitutePreview = BasePreview & { operation: "timetable.assign_substitutes"; date: string; duties: Array<{ slotId: string; classId: string; academicYear: number; term: string; dayOfWeek: number; periodNumber: number; roomNumber: string | null; className: string; subjectName: string; startTime: string; endTime: string; originalTeacherId: string; originalTeacherName: string; teacherId: string | null; teacherName: string | null; previousTeacherId: string | null; previousVersion: number | null; reason: string }> };
export type SchoolOperationsPreview = SchoolTimetablePreview | AttendancePreview | SubstitutePreview | AcademicLifecyclePreview | PromotionPreview | RiskDecisionPreview | PublishTimetablesPreview;
export type SchoolOperationsResult = { operation: SchoolOperationsOperation; ids: string[]; count: number };
export type SchoolOperationsReceipt = SchoolOperationsResult & { id: string; recordId: string; version: number; completedAt: string; status: "COMPLETED" };
export interface SchoolOperationsOptions { campusId: string; classes: Array<{ id: string; name: string; section: string | null; academicYear: number }>; students: Array<{ id: string; fullName: string; rollNo: string; previousStatus: string | null }>; teachers: Array<{ id: string; fullName: string }>; lessons: Array<{ id: string; className: string; subjectName: string; teacherName: string; startTime: string; endTime: string; substituteId: string | null; substituteName: string | null; availableTeacherIds: string[] }> }
