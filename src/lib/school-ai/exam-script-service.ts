import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "./transaction";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { getWorkspaceRecordInTransaction } from "./repository";
import { loadWorkspacePermissionSnapshot } from "./access";
import { sourceDataSchema } from "./schemas";
import { responsesSchema, scoreObjectiveResponses, validateResponses, displayExamResponse } from "./exam";
const id = z.string().min(1).max(120);
const issueSchema = z.object({ studentId: id }).strict();
const verifySchema = z.object({ token: z.string().min(1).max(3000) }).strict();
const importSchema = verifySchema.extend({ sourceId: id, sourceVersion: z.number().int().positive(), responses: responsesSchema, idempotencyKey: z.string().uuid(), pagesConfirmed: z.literal(true) }).strict();
function secret() { const value = process.env.AUTH_SECRET; if (!value || value.length < 24) throw new ApiError("Script identification is not configured.", 503); return new TextEncoder().encode(value); }
const tokenSchema = z.object({ schoolId: id, campusId: id, assignmentId: id, paperId: id, paperVersion: z.number().int().positive(), studentId: id, userId: id });
async function decode(token: string) { try { const value = await jwtVerify(token, secret(), { algorithms: ["HS256"], issuer: "skoolee-script", audience: "school-ai-script" }); return tokenSchema.parse(value.payload); } catch { throw new ApiError("This script matching code is invalid or expired.", 422); } }

export async function issueExamScript(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = issueSchema.parse(raw);
 const details = await schoolAiTransaction(user, async tx => {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx); await staffExamAccess(user, assignment, "edit", tx);
  if (!Array.isArray(assignment.studentIds) || !assignment.studentIds.includes(input.studentId)) throw new ApiError("Choose an assigned student.", 404);
  const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, status: "active", archivedAt: null, studentUserId: { not: null } }, select: { id: true, studentUserId: true, fullName: true, rollNo: true } });
  if (!student?.studentUserId) throw new ApiError("The assigned student is unavailable.", 404);
  return { assignment, paper, student };
 });
 const token = await new SignJWT({ schoolId: user.schoolId, campusId: details.assignment.campusId, assignmentId, paperId: details.assignment.paperId, paperVersion: details.assignment.paperVersion, studentId: details.student.id, userId: details.student.studentUserId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer("skoolee-script").setAudience("school-ai-script").setIssuedAt().setExpirationTime("14d").sign(secret());
 return { token, qrSvg: await QRCode.toString(token, { type: "svg", margin: 2, errorCorrectionLevel: "M" }), title: details.assignment.title, student: { id: details.student.id, fullName: details.student.fullName, rollNo: details.student.rollNo }, paperVersion: details.assignment.paperVersion };
}
export async function verifyExamScript(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = verifySchema.parse(raw), identity = await decode(input.token);
 return schoolAiTransaction(user, async tx => {
  const { assignment } = await scopedAssignment(user, assignmentId, tx); await staffExamAccess(user, assignment, "edit", tx);
  if (identity.schoolId !== user.schoolId || identity.campusId !== assignment.campusId || identity.assignmentId !== assignmentId || identity.paperId !== assignment.paperId || identity.paperVersion !== assignment.paperVersion || !Array.isArray(assignment.studentIds) || !assignment.studentIds.includes(identity.studentId)) throw new ApiError("The script does not match this exam and paper version.", 409);
  const student = await tx.student.findFirst({ where: { id: identity.studentId, studentUserId: identity.userId, schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true } });
  if (!student) throw new ApiError("The script’s current student assignment could not be verified.", 409);
  return { student, paperVersion: assignment.paperVersion, title: assignment.title };
 });
}
export async function importExamScript(user: AuthUser, assignmentId: string, raw: unknown) {
 const input = importSchema.parse(raw), identity = await decode(input.token);
 return schoolAiTransaction(user, async tx => {
  const { assignment, paper } = await scopedAssignment(user, assignmentId, tx); await staffExamAccess(user, assignment, "edit", tx);
  if (identity.schoolId !== user.schoolId || identity.campusId !== assignment.campusId || identity.assignmentId !== assignmentId || identity.paperId !== assignment.paperId || identity.paperVersion !== assignment.paperVersion || !Array.isArray(assignment.studentIds) || !assignment.studentIds.includes(identity.studentId)) throw new ApiError("The script does not match this exam and paper version.", 409);
  const student = await tx.student.findFirst({ where: { id: identity.studentId, studentUserId: identity.userId, schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, status: "active", archivedAt: null }, select: { id: true } });
  if (!student) throw new ApiError("The student assignment changed.", 409);
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  const source = await getWorkspaceRecordInTransaction(user, input.sourceId, tx, permissions);
  const data = sourceDataSchema.safeParse(source.data);
  if (source.kind !== "SOURCE" || source.status !== "APPROVED" || source.version !== input.sourceVersion || source.campusId !== assignment.campusId || !data.success || data.data.documentKind !== "answer_script" || data.data.subjectId !== paper.subjectId || data.data.classId !== paper.classId) throw new ApiError("Choose the current approved answer-script source for this subject and class.", 409);
  const issues = validateResponses(paper, input.responses); if (issues.length) throw new ApiError(issues.join(" "), 422);
  if (!Object.values(input.responses).some(response => response.trim())) throw new ApiError("Confirm at least one transcribed answer.", 422);
  for (const question of paper.questions) { const response = input.responses[question.id]; if (!response?.trim()) continue; const candidates = question.type === "MULTIPLE_CHOICE" ? displayExamResponse(question, response).split("; ") : [displayExamResponse(question, response)]; if (candidates.some(answer => !data.data.extractedText.includes(answer))) throw new ApiError("Every transcribed answer must appear in the reviewed source text. Correct the source or response before importing.", 422); }
  const hash = createHash("sha256").update(JSON.stringify({ sourceId: source.id, sourceVersion: source.version, responses: Object.entries(input.responses).sort(), studentId: student.id })).digest("hex");
  const existing = await tx.schoolAiExamAttempt.findUnique({ where: { assignmentId_userId: { assignmentId, userId: identity.userId } } });
  if (existing) {
   const prior = existing.scoreProposal as Record<string, unknown> | null;
   if (prior?.scriptImportKey === input.idempotencyKey && prior?.scriptEvidenceHash === hash && existing.schoolId === user.schoolId) return { id: existing.id, status: existing.status };
   throw new ApiError("This student already has an attempt. A scanned script cannot overwrite saved online answers or an earlier script.", 409);
  }
  const now = new Date();
  const attempt = await tx.schoolAiExamAttempt.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, studentId: student.id, userId: identity.userId, startedAt: now, deadlineAt: now, submittedAt: now, sequence: 1, status: "SUBMITTED", responses: input.responses as Prisma.InputJsonValue, scoreProposal: { ...scoreObjectiveResponses(paper, input.responses), scriptImportKey: input.idempotencyKey, scriptEvidenceHash: hash, sourceId: source.id, sourceVersion: source.version, matchedById: user.userId, pagesConfirmed: true } as Prisma.InputJsonValue } });
  await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_exam_attempts", recordId: attempt.id, userId: user.userId, oldValue: Prisma.JsonNull, newValue: { action: "MATCHED_SCRIPT_IMPORTED", assignmentId, sourceId: source.id, sourceVersion: source.version, evidenceHash: hash } } });
  return { id: attempt.id, status: attempt.status };
 });
}
