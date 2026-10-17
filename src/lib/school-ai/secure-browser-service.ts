import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { SchoolAiError, isSchoolAiManager } from "./access";
import { schoolAiTransaction } from "./transaction";
import { approvalIssues, currentSebEvidence, profileInput, sebConfig, verifySeb } from "./secure-browser";

// SKO-449: profile lifecycle, admission and the audited supervised alternative.

const requireManager = (user: AuthUser) => { if (!isSchoolAiManager(user)) throw new ApiError("Only an exam coordinator can manage secure browser profiles.", 403); };
const campusWhere = (user: AuthUser) => user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" };
const audit = (tx: TxClient, user: AuthUser, campusId: string, table: string, recordId: string, newValue: Record<string, unknown>) =>
  tx.auditLog.create({ data: { schoolId: user.schoolId, campusId, tableName: table, recordId, userId: user.userId, newValue: newValue as never } });

export async function listProfiles(user: AuthUser) {
  requireManager(user);
  return schoolAiTransaction(user, async tx => {
    const rows = await tx.secureBrowserProfile.findMany({ where: { schoolId: user.schoolId, ...campusWhere(user) }, orderBy: [{ profileKey: "asc" }, { version: "desc" }] });
    const now = new Date();
    return rows.map(row => ({ ...row, approvalIssues: row.status === "DRAFT" ? approvalIssues(row, now) : [] }));
  });
}

/** Every change is a new DRAFT version; approved versions pinned to exams never change. */
export async function saveProfile(user: AuthUser, raw: unknown) {
  requireManager(user);
  const input = profileInput.parse(raw);
  if (!user.campusId && user.role !== "SUPER_ADMIN") throw new ApiError("Choose a campus first.", 400);
  return schoolAiTransaction(user, async tx => {
    const profileKey = input.profileKey ?? randomUUID();
    const latest = await tx.secureBrowserProfile.findFirst({ where: { schoolId: user.schoolId, profileKey }, orderBy: { version: "desc" } });
    if ((latest?.version ?? 0) !== input.expectedVersion) throw new ApiError("This profile changed meanwhile. Refresh and review it again.", 409);
    const campusId = latest?.campusId ?? user.campusId!;
    const row = await tx.secureBrowserProfile.create({ data: { schoolId: user.schoolId, campusId, profileKey, version: (latest?.version ?? 0) + 1, name: input.name, minClientVersion: input.minClientVersion, configKeys: input.configKeys, browserExamKeys: input.browserExamKeys, allowedResources: input.allowedResources, testedDevices: input.testedDevices, createdById: user.userId } });
    await audit(tx, user, campusId, "secure_browser_profiles", row.id, { profileKey, version: row.version, status: "DRAFT" });
    return row;
  });
}

export async function setProfileStatus(user: AuthUser, id: string, raw: unknown) {
  requireManager(user);
  const { status } = z.object({ status: z.enum(["APPROVED", "RETIRED"]) }).strict().parse(raw);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.secureBrowserProfile.findFirst({ where: { id, schoolId: user.schoolId, ...campusWhere(user) } });
    if (!row) throw new ApiError("Profile not found.", 404);
    if (status === "APPROVED") {
      if (row.status !== "DRAFT") throw new ApiError("Only a draft version can be approved.", 409);
      const issues = approvalIssues(row, new Date());
      if (issues.length) throw new ApiError(issues.join(" "), 400);
    } else if (row.status === "RETIRED") throw new ApiError("This version is already retired.", 409);
    const updated = await tx.secureBrowserProfile.update({ where: { id }, data: status === "APPROVED" ? { status, approvedById: user.userId, approvedAt: new Date() } : { status } });
    await audit(tx, user, row.campusId, "secure_browser_profiles", row.id, { status });
    return updated;
  });
}

/** The pinned, approved profile for a new SECURE_BROWSER exam. */
export async function approvedProfileFor(tx: TxClient, user: AuthUser, campusId: string, profileId: string) {
  const row = await tx.secureBrowserProfile.findFirst({ where: { id: profileId, schoolId: user.schoolId, campusId, status: "APPROVED" } });
  if (!row) throw new ApiError("Choose an approved secure browser profile from this campus.", 409);
  return row;
}

export type SecureAdmission = { required: false } | { required: true; admitted: boolean; via: "SEB" | "SUPERVISED_ALTERNATIVE" | null; reason: string | null; profile: { name: string; minClientVersion: string; version: number } };
/** Admission for one learner: a verified SEB request, or a recorded supervised alternative. */
export async function secureAdmission(db: TxClient, assignment: { id: string; schoolId: string; mode: string; secureProfileId: string | null; secureProfileVersion: number | null }, studentId: string): Promise<SecureAdmission> {
  if (assignment.mode !== "SECURE_BROWSER") return { required: false };
  const profile = await db.secureBrowserProfile.findFirst({ where: { id: assignment.secureProfileId ?? "", schoolId: assignment.schoolId, version: assignment.secureProfileVersion ?? -1 } });
  if (!profile) return { required: true, admitted: false, via: null, reason: "CONFIG_MISMATCH", profile: { name: "", minClientVersion: "", version: 0 } };
  const summary = { name: profile.name, minClientVersion: profile.minClientVersion, version: profile.version };
  const exception = await db.secureBrowserException.findFirst({ where: { schoolId: assignment.schoolId, assignmentId: assignment.id, studentId }, select: { id: true } });
  if (exception) return { required: true, admitted: true, via: "SUPERVISED_ALTERNATIVE", reason: null, profile: summary };
  const decision = verifySeb(currentSebEvidence(), profile);
  return decision.admitted ? { required: true, admitted: true, via: "SEB", reason: null, profile: summary } : { required: true, admitted: false, via: null, reason: decision.reason, profile: summary };
}
export async function assertSecureAdmission(db: TxClient, assignment: Parameters<typeof secureAdmission>[1], studentId: string) {
  const admission = await secureAdmission(db, assignment, studentId);
  if (admission.required && !admission.admitted) throw new SchoolAiError("This exam must be opened in Safe Exam Browser with the school's approved configuration. No timer has started.", 403, `SEB_${admission.reason}`);
}

/** An audited supervised alternative for one learner (unsupported device or assistive tool). Never a silent downgrade. */
export async function grantSupervisedAlternative(user: AuthUser, assignmentId: string, raw: unknown) {
  requireManager(user);
  const input = z.object({ studentId: z.string().min(1), reason: z.string().trim().min(5).max(300) }).strict().parse(raw);
  return schoolAiTransaction(user, async tx => {
    const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, ...campusWhere(user), mode: "SECURE_BROWSER" } });
    if (!assignment) throw new ApiError("Secure browser exam not found.", 404);
    if (!Array.isArray(assignment.studentIds) || !assignment.studentIds.includes(input.studentId)) throw new ApiError("This learner is not assigned to the exam.", 404);
    const existing = await tx.secureBrowserException.findFirst({ where: { schoolId: user.schoolId, assignmentId, studentId: input.studentId } });
    if (existing) return existing;
    const row = await tx.secureBrowserException.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, studentId: input.studentId, reason: input.reason, approvedById: user.userId } });
    await audit(tx, user, assignment.campusId, "secure_browser_exceptions", row.id, { assignmentId, studentId: input.studentId });
    return row;
  });
}
export async function supervisedAlternatives(db: TxClient, schoolId: string, assignmentId: string) {
  return db.secureBrowserException.findMany({ where: { schoolId, assignmentId }, select: { studentId: true, reason: true, createdAt: true } });
}

/** Starting configuration for the exam's pinned profile; any learner or coordinator who can see the exam may download it. */
export async function configFile(db: TxClient, assignment: { id: string; schoolId: string; secureProfileId: string | null; secureProfileVersion: number | null }, origin: string) {
  const profile = await db.secureBrowserProfile.findFirst({ where: { id: assignment.secureProfileId ?? "", schoolId: assignment.schoolId, version: assignment.secureProfileVersion ?? -1 } });
  if (!profile) throw new ApiError("This exam has no secure browser profile.", 404);
  const exam = `${origin}/ai/exams/${encodeURIComponent(assignment.id)}`;
  return sebConfig({ startUrl: exam, quitUrl: `${exam}?seb=quit`, allowedResources: profile.allowedResources });
}
