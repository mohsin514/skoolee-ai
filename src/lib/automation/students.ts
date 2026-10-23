import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { studentSchema } from "@/lib/validators/schemas";
import { assertRosterPermission } from "@/lib/imports/roster-access";
import { importReviewToken } from "@/lib/imports/review-token";
import { createStudentRecords } from "@/lib/students/create";
import { SchoolAiError } from "@/lib/school-ai/access";
import { studentsCreateSchema } from "./role-actions";
/** Reuse the ordinary roster commit, including its atomic receipt and identity checks. */
export async function createAutomaticStudents(user: AuthUser, campusId: string | null, key: string, raw: unknown) {
 if (!["ADMIN", "CAMPUS_ADMIN"].includes(user.role) || !campusId || user.campusId !== campusId) throw new SchoolAiError("Student creation belongs to the campus administrator.", 403);
 await assertRosterPermission(user, "add");
 const input = studentsCreateSchema.parse(raw);
 const rows = input.students.map((item, index) => ({ rowNumber: index + 1, state: "ACCEPTED", selected: true, proposal: studentSchema.parse(item), errors: [] }));
 const fingerprint = createHash("sha256").update(key).digest("hex");
 const targetScope = `automatic:${user.userId}`;
 const batch = await prisma.importBatch.upsert({ where: { schoolId_campusId_kind_fingerprint_targetScope: { schoolId: user.schoolId, campusId, kind: "STUDENT_ROSTER", fingerprint, targetScope } }, update: {}, create: { schoolId: user.schoolId, campusId, kind: "STUDENT_ROSTER", fingerprint, targetScope, sourceName: "Automatic setup request", createdById: user.userId, expiresAt: new Date(Date.now() + 7 * 86400000), data: { rows } as Prisma.InputJsonValue } });
 const request = new NextRequest(`http://localhost/api/students?campusId=${encodeURIComponent(campusId)}`, { method: "POST", body: JSON.stringify({ _importBatchId: batch.id, _reviewToken: importReviewToken(batch) }), headers: { "Content-Type": "application/json" } });
 const result = await createStudentRecords(user, request, { inviteAccounts: false });
 const body = await result.json();
 if (!result.ok) throw new SchoolAiError(body.error || "Student records could not be saved.", result.status);
 return { id: batch.id, operation: "students.create", createdCount: rows.length, receipt: body.receipt, accountInvitationsSent: false };
}
