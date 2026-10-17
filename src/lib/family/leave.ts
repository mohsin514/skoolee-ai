import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canMarkAttendance } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-421: a guardian asks for a learner's future leave; the school decides. The decision is a record of
// its own and never marks the register — staff still mark the days, so the original register stays the
// only attendance truth. A request for days already requested is refused rather than duplicated.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 30;
const OPEN = ["PENDING", "CLARIFICATION"];
const day = (value: unknown, label: string) => {
  const text = String(value ?? "");
  if (!DAY.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) throw new ApiError(`Choose the ${label} date.`, 400);
  return text;
};
const words = (value: unknown, min: number, max: number) => {
  const text = String(value ?? "").trim();
  if (text.length < min) throw new ApiError("Give a short reason for the leave.", 400);
  return text.slice(0, max);
};

async function guardianChild(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can request a child's leave.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true, fullName: true } });
  if (!student || !(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "attendance" }))) throw new ApiError("Child not found", 404);
  return student;
}

export async function requestLeave(user: AuthUser, body: Record<string, unknown>) {
  const student = await guardianChild(user, String(body.studentId ?? ""));
  const from = day(body.fromDate, "first"), to = day(body.toDate ?? body.fromDate, "last");
  if (to < from) throw new ApiError("The last day cannot be before the first day.", 400);
  if ((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1 > MAX_DAYS) throw new ApiError(`Request at most ${MAX_DAYS} days at a time.`, 400);
  const locale = await getLocalePackage(user.schoolId, student.campusId);
  if (from < calendarDateIn(locale.timezone)) throw new ApiError("Leave is requested for today or later. Explain past absences from the attendance record.", 400);
  const reason = words(body.reason, 3, 1000);
  return schoolAiTransaction(user, async tx => {
    await tx.$queryRaw`SELECT id FROM students WHERE id = ${student.id} FOR UPDATE`;
    const overlap = await tx.learnerLeaveRequest.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, status: { in: [...OPEN, "APPROVED"] }, fromDate: { lte: new Date(`${to}T00:00:00Z`) }, toDate: { gte: new Date(`${from}T00:00:00Z`) } } });
    if (overlap) throw new ApiError("Leave has already been requested for some of these days.", 409);
    return tx.learnerLeaveRequest.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, requestedById: user.userId, fromDate: new Date(`${from}T00:00:00Z`), toDate: new Date(`${to}T00:00:00Z`), reason } });
  });
}

/** The guardian replies to a request for detail, or cancels a request the school has not decided. */
export async function updateOwnLeave(user: AuthUser, body: Record<string, unknown>) {
  const row = await prisma.learnerLeaveRequest.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!row) throw new ApiError("Leave request not found", 404);
  await guardianChild(user, row.studentId);
  if (!OPEN.includes(row.status)) throw new ApiError("The school has already decided this request.", 409);
  if (body.action === "cancel") return prisma.learnerLeaveRequest.update({ where: { id: row.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
  if (body.action === "reply") {
    if (row.status !== "CLARIFICATION") throw new ApiError("The school has not asked for more detail.", 409);
    return prisma.learnerLeaveRequest.update({ where: { id: row.id }, data: { status: "PENDING", reason: `${row.reason}\n\n${words(body.reason, 3, 1000)}`.slice(0, 2000), version: { increment: 1 } } });
  }
  throw new ApiError("Unknown action", 400);
}

export async function guardianLeave(user: AuthUser, studentId: string) {
  const student = await guardianChild(user, studentId);
  return prisma.learnerLeaveRequest.findMany({ where: { schoolId: user.schoolId, studentId: student.id }, orderBy: { fromDate: "desc" }, take: 20, select: { id: true, fromDate: true, toDate: true, reason: true, status: true, reviewNote: true, reviewedAt: true, requestedById: true, version: true } });
}

export async function staffLeaveQueue(user: AuthUser, campusId: string) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot review learner leave.", 403);
  const rows = await prisma.learnerLeaveRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: OPEN } }, orderBy: { fromDate: "asc" }, take: 100 });
  const students = new Map((await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(r => r.studentId) } }, select: { id: true, fullName: true, class: { select: { name: true, section: true } } } })).map(s => [s.id, s]));
  return rows.map(row => ({ ...row, studentName: students.get(row.studentId)?.fullName ?? "", className: [students.get(row.studentId)?.class?.name, students.get(row.studentId)?.class?.section].filter(Boolean).join(" ") }));
}

/** Staff decide. Approval records the decision only; the register is marked separately by staff. */
export async function reviewLeave(user: AuthUser, body: Record<string, unknown>) {
  if (!canMarkAttendance(user) || user.role === "TEACHER") throw new ApiError("Only school leaders can decide learner leave.", 403);
  await assertPermission(user, "attendance", "edit");
  const action = String(body.action ?? ""), note = String(body.note ?? "").trim().slice(0, 500) || null;
  if (!["approve", "decline", "clarify"].includes(action)) throw new ApiError("Unknown action", 400);
  if (action !== "approve" && !note) throw new ApiError(action === "decline" ? "Say why the leave is declined." : "Say what the family needs to add.", 400);
  return schoolAiTransaction(user, async tx => {
    const id = String(body.id ?? "");
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM learner_leave_requests WHERE id = ${id} AND school_id = ${user.schoolId} FOR UPDATE`;
    const row = locked ? await tx.learnerLeaveRequest.findUnique({ where: { id } }) : null;
    if (!row || (user.role !== "SUPER_ADMIN" && row.campusId !== user.campusId)) throw new ApiError("Leave request not found", 404);
    if (!OPEN.includes(row.status)) throw new ApiError("This request has already been decided or cancelled.", 409);
    if (body.knownVersion !== undefined && Number(body.knownVersion) !== row.version) throw new ApiError("The family changed this request since you opened it. Review it again.", 409);
    const status = action === "approve" ? "APPROVED" : action === "decline" ? "DECLINED" : "CLARIFICATION";
    const updated = await tx.learnerLeaveRequest.update({ where: { id }, data: { status, reviewNote: note, reviewedById: user.userId, reviewedAt: new Date(), version: { increment: 1 } } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: row.campusId, tableName: "learner_leave_requests", recordId: id, userId: user.userId, oldValue: { status: row.status }, newValue: { status, note } } });
    return updated;
  });
}
