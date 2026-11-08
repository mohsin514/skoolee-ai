/**
 * SKO-500: the head of department's queue. Lists the syllabi and syllabus sources that members of the
 * departments this user heads have sent for review, and the Teaching Line jumps (one move across more
 * than one unit) recorded in the last 30 days. Approval runs the shared repository path as the head.
 */
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { membersHeadedBy } from "./department-heads";
import { updateWorkspaceRecordInTransaction } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { workspaceIdSchema } from "./schemas";

export interface DepartmentApprovalItem { id: string; kind: "SOURCE" | "CURRICULUM"; title: string; version: number; authorName: string; subjectName: string | null; className: string | null; submittedAt: string; outcomeCount: number | null }
export interface DepartmentLineJump { id: string; teacherName: string; className: string | null; unitsCrossed: number; written: number; backdated: boolean; at: string }
export interface DepartmentQueue { heads: boolean; approvals: DepartmentApprovalItem[]; jumps: DepartmentLineJump[] }

const JUMP_WINDOW_DAYS = 30;

export async function listDepartmentQueue(user: AuthUser, now = new Date()): Promise<DepartmentQueue> {
  return schoolAiTransaction(user, async tx => {
    const members = await membersHeadedBy(tx, user.schoolId, user.userId);
    if (!members.length) return { heads: false, approvals: [], jumps: [] };
    const campus = user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {};
    const records = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, ...campus, createdById: { in: members }, kind: { in: ["SOURCE", "CURRICULUM"] }, status: "IN_REVIEW" }, orderBy: { updatedAt: "asc" }, take: 50, select: { id: true, kind: true, title: true, version: true, createdById: true, subjectId: true, classId: true, updatedAt: true, data: true } });
    const events = await tx.auditLog.findMany({ where: { schoolId: user.schoolId, ...campus, tableName: "teaching_progress", userId: { in: members }, createdAt: { gte: new Date(now.getTime() - JUMP_WINDOW_DAYS * 86_400_000) }, newValue: { path: ["flagged"], equals: true } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, userId: true, recordId: true, createdAt: true, newValue: true } });
    const classIds = [...new Set([...records.map(row => row.classId), ...events.map(row => row.recordId.split(":")[1])].filter((id): id is string => Boolean(id)))];
    const subjectIds = [...new Set(records.map(row => row.subjectId).filter((id): id is string => Boolean(id)))];
    const [people, classes, subjects] = await Promise.all([
      tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set([...records.map(row => row.createdById), ...events.map(row => row.userId ?? "")])] } }, select: { id: true, fullName: true } }),
      tx.class.findMany({ where: { schoolId: user.schoolId, id: { in: classIds } }, select: { id: true, name: true, section: true } }),
      tx.subject.findMany({ where: { schoolId: user.schoolId, id: { in: subjectIds } }, select: { id: true, name: true } }),
    ]);
    const name = new Map(people.map(row => [row.id, row.fullName]));
    const className = new Map(classes.map(row => [row.id, row.section ? `${row.name} ${row.section}` : row.name]));
    const subjectName = new Map(subjects.map(row => [row.id, row.name]));
    return {
      heads: true,
      approvals: records.map(row => ({ id: row.id, kind: row.kind as "SOURCE" | "CURRICULUM", title: row.title, version: row.version, authorName: name.get(row.createdById) ?? "", subjectName: row.subjectId ? subjectName.get(row.subjectId) ?? null : null, className: row.classId ? className.get(row.classId) ?? null : null, submittedAt: row.updatedAt.toISOString(), outcomeCount: row.kind === "CURRICULUM" && Array.isArray((row.data as { outcomes?: unknown[] }).outcomes) ? (row.data as { outcomes: unknown[] }).outcomes.length : null })),
      jumps: events.map(row => { const value = (row.newValue ?? {}) as Record<string, unknown>; return { id: row.id, teacherName: name.get(row.userId ?? "") ?? "", className: className.get(row.recordId.split(":")[1] ?? "") ?? null, unitsCrossed: Number(value.unitsCrossed) || 0, written: Number(value.written) || 0, backdated: value.backdated === true, at: row.createdAt.toISOString() }; }),
    };
  });
}

export const departmentApproveInput = z.strictObject({ recordId: workspaceIdSchema, version: z.number().int().positive() });

export async function approveAsDepartmentHead(user: AuthUser, raw: unknown) {
  const input = departmentApproveInput.parse(raw);
  return schoolAiTransaction(user, tx => updateWorkspaceRecordInTransaction(user, input.recordId, { version: input.version, action: "approve" }, tx, undefined, { asDepartmentHead: true }));
}
