import { z } from "zod";
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const examPlanDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Choose a real calendar date.");
export const examSessionPlanProposalSchema = z.strictObject({
  operation: z.literal("exams.create_session_plan"),
  title: z.string().trim().min(1).max(160), term: z.string().trim().min(1).max(60),
  academicYear: z.number().int().min(2000).max(2100), examType: z.enum(["MID_TERM", "FINAL"]),
  papers: z.array(z.strictObject({ id, classId: id, subjectId: id, date: examPlanDate, periodDefinitionId: id,
    rooms: z.array(z.strictObject({ roomId: id, invigilatorId: id })).min(1).max(6),
  })).min(1).max(40),
}).superRefine((value, ctx) => {
  const papers = new Set<string>(), ids = new Set<string>();
  for (const [index, paper] of value.papers.entries()) {
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["papers", index], message });
    if (ids.has(paper.id) || papers.has(`${paper.classId}:${paper.subjectId}`)) issue("Each class subject and paper ID must appear once.");
    ids.add(paper.id); papers.add(`${paper.classId}:${paper.subjectId}`);
    if (new Set(paper.rooms.map(room => room.roomId)).size !== paper.rooms.length) issue("Choose each room once per paper.");
    if (new Set(paper.rooms.map(room => room.invigilatorId)).size !== paper.rooms.length) issue("Assign a different invigilator to each room.");
  }
  if (new Set(value.papers.map(paper => paper.classId)).size > 10) ctx.addIssue({ code: "custom", path: ["papers"], message: "Plan up to ten classes at a time." });
});
export type ExamSessionPlanProposal = z.infer<typeof examSessionPlanProposalSchema>;
export interface ExamSessionPlanOptions {
  campusId: string;
  classes: Array<{ id: string; name: string; section: string | null; academicYear: number; studentCount: number }>;
  subjects: Array<{ id: string; name: string; classId: string; totalMarks: number }>;
  rooms: Array<{ id: string; roomNumber: string; capacity: number; hasLayout: boolean }>;
  teachers: Array<{ id: string; fullName: string }>;
  periods: Array<{ id: string; periodNumber: number; startTime: string; endTime: string }>;
}
export interface ExamPlanSeat { studentId: string; fullName: string; rollNo: string; seatNumber: number; rowNo: number; benchNo: number; seatOnBench: number; label: string }
export interface ExamSessionPlanPreview {
  operation: "exams.create_session_plan"; recordId: string; version: number; campusId: string;
  title: string; term: string; academicYear: number; examType: "MID_TERM" | "FINAL";
  startDate: string; endDate: string; candidateSeatCount: number;
  papers: Array<{ academicModelVersionId: string | null; id: string; classId: string; className: string; subjectId: string; subjectName: string; totalMarks: number;
    date: string; periodDefinitionId: string; periodNumber: number; startTime: string; endTime: string;
    rooms: Array<{ roomId: string; roomNumber: string; invigilatorId: string; invigilatorName: string; capacity: number; hasLayout: boolean; seats: ExamPlanSeat[] }>;
  }>;
  warnings: Array<{ code: "EXAM_LAYOUT_INFERRED"; roomNumber: string }>;
  previewHash: string;
}
export interface ExamSessionPlanExecutionReceipt {
  id: string; operation: "exams.create_session_plan"; recordId: string; version: number; status: "COMPLETED";
  sessionId: string; examIds: string[]; scheduleIds: string[]; seatCount: number; invigilationCount: number;
  sessionStatus: "PLANNING"; examStatus: "DRAFT"; completedAt: string;
}
