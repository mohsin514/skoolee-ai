import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { teacherClassIds } from "@/lib/chat/policy";
import { objectiveLabels } from "@/lib/curriculum/service";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-427: the learning portfolio — evidence of how understanding changed, not another score page.
// - An entry points at immutable submission versions: an earlier attempt whose feedback was returned and,
//   optionally, a later revision. The learning goal is snapshotted from the assignment version, so later
//   edits never rewrite it. Only returned feedback appears; marks in moderation or unreleased never do.
// - The learner writes the reflection; editing it never changes feedback or the submitted work. The teacher
//   approves one exact reflection version and decides family visibility; families only ever see that
//   approved text and the teacher's comment, never staff notes.
// - Comparisons put criteria side by side only when both attempts used the same rubric version; otherwise
//   they say the rubric changed and show each attempt's criteria on its own.
// - Guardian sharing is a teacher-approved collection for one named guardian with an expiry. Every open and
//   every export rechecks the share, the guardian's current learning-record permission and each entry.

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
type Score = { criterionId: string; points: number | null; comment?: string };
type Criterion = { id: string; title: string; maxPoints: number };

async function studentFor(user: AuthUser, studentId: string | null, db: TxClient = prisma) {
  if (user.role === "STUDENT") {
    const own = await db.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true, classId: true, campusId: true, fullName: true } });
    if (!own || (studentId && studentId !== own.id)) throw new ApiError("Portfolio not found", 404);
    return { student: own, role: "LEARNER" as const };
  }
  if (user.role === "PARENT") throw new ApiError("Portfolio not found", 404);
  const student = studentId ? await db.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, classId: true, campusId: true, fullName: true } }) : null;
  if (!student) throw new ApiError("Portfolio not found", 404);
  const lead = canManageOperations(user) && (user.role === "SUPER_ADMIN" || user.campusId === student.campusId);
  if (!lead && !(user.role === "TEACHER" && student.classId && (await teacherClassIds(user.userId, db)).includes(student.classId))) throw new ApiError("Portfolio not found", 404);
  return { student, role: "TEACHER" as const };
}

/** Submission versions of the learner with the assignment version's goals, rubric and returned feedback. */
async function versionsOf(db: TxClient, user: AuthUser, studentId: string, ids?: string[]) {
  const rows = await db.assignmentSubmissionVersion.findMany({ where: { schoolId: user.schoolId, studentId, ...(ids ? { id: { in: ids } } : {}) }, include: { feedback: true }, orderBy: [{ assignmentId: "asc" }, { version: "asc" }] });
  const assignmentIds = [...new Set(rows.map(r => r.assignmentId))];
  const [versions, rubrics] = await Promise.all([
    assignmentIds.length ? db.assignmentVersion.findMany({ where: { schoolId: user.schoolId, assignmentId: { in: assignmentIds } }, select: { assignmentId: true, version: true, title: true, objectives: true } }) : [],
    assignmentIds.length ? db.assignmentRubricVersion.findMany({ where: { schoolId: user.schoolId, assignmentId: { in: assignmentIds } }, select: { assignmentId: true, version: true, criteria: true } }) : [],
  ]);
  return rows.map(r => {
    const av = versions.find(v => v.assignmentId === r.assignmentId && v.version === r.assignmentVersion);
    const rubric = (rubrics.find(x => x.assignmentId === r.assignmentId && x.version === r.rubricVersion)?.criteria ?? []) as Criterion[];
    const returned = r.feedback?.status === "RETURNED" && r.feedback.returnedAt ? r.feedback : null;
    return {
      id: r.id, assignmentId: r.assignmentId, title: av?.title ?? "", version: r.version, assignmentVersion: r.assignmentVersion, rubricVersion: r.rubricVersion, receiptCode: r.receiptCode, submittedAt: r.submittedAt, late: r.late,
      text: r.text, fileName: r.fileName, objectives: (av?.objectives ?? null) as { curriculumId: string; curriculumVersion: number; outcomeIds: string[] } | null,
      rubric: rubric.map(c => ({ id: c.id, title: c.title, maxPoints: c.maxPoints })),
      feedback: returned ? { comment: returned.comment, criteria: (returned.criteria ?? []) as Score[], totalPoints: returned.totalPoints, returnedAt: returned.returnedAt, rubricVersion: returned.rubricVersion } : null,
    };
  });
}
type SourceVersion = Awaited<ReturnType<typeof versionsOf>>[number];

/** What the learner (or teacher) can build entries from: attempts with returned feedback, and their revisions. */
export async function eligibleEvidence(user: AuthUser, studentId: string | null) {
  const { student } = await studentFor(user, studentId);
  const versions = await versionsOf(prisma, user, student.id);
  const goals = new Map<string, { id: string; code?: string; title: string }[]>();
  const wanted = new Map<string, Set<string>>();
  for (const v of versions) if (v.objectives?.outcomeIds.length) {
    const key = `${v.objectives.curriculumId}:${v.objectives.curriculumVersion}`;
    wanted.set(key, new Set([...(wanted.get(key) ?? []), ...v.objectives.outcomeIds]));
  }
  for (const [key, outcomeIds] of wanted) { const [curriculumId, version] = key.split(":"); goals.set(key, await objectiveLabels(prisma, user, curriculumId, Number(version), [...outcomeIds])); }
  return { studentId: student.id, studentName: student.fullName, attempts: versions.map(v => ({ id: v.id, assignmentId: v.assignmentId, title: v.title, version: v.version, submittedAt: v.submittedAt, hasFeedback: Boolean(v.feedback), goals: v.objectives ? (goals.get(`${v.objectives.curriculumId}:${v.objectives.curriculumVersion}`) ?? []).filter(g => v.objectives!.outcomeIds.includes(g.id)) : [] })) };
}

export async function createEntry(user: AuthUser, body: Record<string, unknown>) {
  const idempotencyKey = String(body.idempotencyKey ?? "");
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new ApiError("Missing request key.", 400);
  return schoolAiTransaction(user, async tx => {
    const { student } = await studentFor(user, body.studentId ? String(body.studentId) : null, tx);
    const repeated = await tx.portfolioEntry.findUnique({ where: { studentId_idempotencyKey: { studentId: student.id, idempotencyKey } } });
    if (repeated) return repeated;
    const earlierId = String(body.earlierVersionId ?? ""), laterId = body.laterVersionId ? String(body.laterVersionId) : null;
    if (earlierId === laterId) throw new ApiError("Choose two different pieces of work to compare.", 400);
    const found = await versionsOf(tx, user, student.id, [earlierId, ...(laterId ? [laterId] : [])]);
    const earlier = found.find(v => v.id === earlierId), later = laterId ? found.find(v => v.id === laterId) : null;
    if (!earlier || (laterId && !later)) throw new ApiError("Choose work this learner submitted.", 400);
    if (!earlier.feedback) throw new ApiError("Choose work whose feedback has been returned.", 409);
    if (later && +new Date(later.submittedAt) <= +new Date(earlier.submittedAt)) throw new ApiError("The later work must come after the earlier one.", 400);
    const outcomeId = body.outcomeId ? String(body.outcomeId) : null;
    let goal: Record<string, unknown> = {};
    if (earlier.objectives?.outcomeIds.length) {
      if (!outcomeId || !earlier.objectives.outcomeIds.includes(outcomeId)) throw new ApiError("Choose the learning goal this work shows.", 400);
      const [label] = await objectiveLabels(tx, user, earlier.objectives.curriculumId, earlier.objectives.curriculumVersion, [outcomeId]);
      goal = { curriculumId: earlier.objectives.curriculumId, curriculumVersion: earlier.objectives.curriculumVersion, outcomeId, code: label?.code ?? "", title: label?.title ?? "" };
    }
    const criterionIds = (Array.isArray(body.criterionIds) ? body.criterionIds.map(String) : []).filter(id => earlier.rubric.some(c => c.id === id)).slice(0, 20);
    return tx.portfolioEntry.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, classId: student.classId ?? "", goal: goal as Prisma.InputJsonValue, title: text(body.title, 160) || earlier.title, assignmentId: earlier.assignmentId, earlierVersionId: earlier.id, laterVersionId: later?.id ?? null, criterionIds, reflection: text(body.reflection, 3000), reflectionVersion: text(body.reflection, 3000) ? 1 : 0, idempotencyKey, createdById: user.userId } });
  });
}

async function entryFor(user: AuthUser, tx: TxClient, entryId: string, lock = true) {
  if (lock) await tx.$queryRaw`SELECT id FROM portfolio_entries WHERE id = ${entryId} AND school_id = ${user.schoolId} FOR UPDATE`;
  const entry = await tx.portfolioEntry.findFirst({ where: { id: entryId, schoolId: user.schoolId, removedAt: null } });
  if (!entry) throw new ApiError("Entry not found", 404);
  const { role } = await studentFor(user, entry.studentId, tx);
  return { entry, role };
}

/** Learner edits the reflection (and may send it for review). Feedback and the work itself never change. */
export async function editReflection(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const { entry, role } = await entryFor(user, tx, String(body.entryId ?? ""));
    if (role !== "LEARNER") throw new ApiError("Only the learner writes the reflection.", 403);
    if (Number(body.knownVersion) !== entry.version) throw new ApiError("This entry changed since you opened it. Review the latest version.", 409);
    const reflection = text(body.reflection, 3000), propose = body.propose === true;
    if (propose && !reflection) throw new ApiError("Write what you changed after the feedback before sending it.", 400);
    const changed = reflection !== entry.reflection;
    return tx.portfolioEntry.update({ where: { id: entry.id }, data: { reflection, reflectionVersion: changed ? { increment: 1 } : undefined, version: { increment: 1 }, status: propose ? "PROPOSED" : changed && entry.status === "APPROVED" ? "PROPOSED" : entry.status === "CHANGES_REQUESTED" && changed ? "DRAFT" : entry.status } });
  });
}

/** Teacher review: approve the exact reflection version (and family visibility), or ask for a revision. */
export async function reviewEntry(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const { entry, role } = await entryFor(user, tx, String(body.entryId ?? ""));
    if (role !== "TEACHER") throw new ApiError("Only the teaching team reviews entries.", 403);
    if (Number(body.knownVersion) !== entry.version) throw new ApiError("This entry changed since you opened it. Review the latest version.", 409);
    const decision = String(body.decision ?? "");
    const common = { teacherComment: text(body.teacherComment, 1000) || null, staffNote: text(body.staffNote, 2000) || null, reviewedById: user.userId, reviewedAt: new Date(), version: { increment: 1 } };
    if (decision === "approve") {
      if (!entry.reflection) throw new ApiError("The learner has not written a reflection yet.", 409);
      return tx.portfolioEntry.update({ where: { id: entry.id }, data: { ...common, status: "APPROVED", approvedReflection: entry.reflection, approvedVersion: entry.reflectionVersion, familyVisible: body.familyVisible === true } });
    }
    if (decision === "changes") {
      if (!common.teacherComment) throw new ApiError("Say what the learner should revise.", 400);
      return tx.portfolioEntry.update({ where: { id: entry.id }, data: { ...common, status: "CHANGES_REQUESTED", familyVisible: entry.approvedVersion !== null && entry.familyVisible } });
    }
    if (decision === "hide") return tx.portfolioEntry.update({ where: { id: entry.id }, data: { ...common, familyVisible: false } });
    throw new ApiError("Unknown decision", 400);
  });
}

/** Remove an entry from the portfolio; the assignment, its versions and feedback are untouched. */
export async function removeEntry(user: AuthUser, entryId: string) {
  return schoolAiTransaction(user, async tx => {
    const { entry } = await entryFor(user, tx, entryId);
    return tx.portfolioEntry.update({ where: { id: entry.id }, data: { removedAt: new Date(), familyVisible: false, version: { increment: 1 } } });
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────

function comparison(earlier: SourceVersion, later: SourceVersion | null, criterionIds: string[]) {
  if (!later) return null;
  const comparable = earlier.rubricVersion === later.rubricVersion && earlier.assignmentId === later.assignmentId;
  const pick = (v: SourceVersion) => v.rubric.filter(c => !criterionIds.length || criterionIds.includes(c.id)).map(c => ({ id: c.id, title: c.title, maxPoints: c.maxPoints, points: v.feedback?.criteria.find(s => s.criterionId === c.id)?.points ?? null }));
  return comparable
    ? { comparable: true, rows: pick(earlier).map(row => ({ ...row, before: row.points, after: pick(later).find(x => x.id === row.id)?.points ?? null })) }
    : { comparable: false, warning: "RUBRIC_CHANGED", earlier: pick(earlier), later: pick(later) };
}

const sourceView = (v: SourceVersion, audience: "LEARNER" | "TEACHER" | "FAMILY") => ({
  id: v.id, assignmentId: v.assignmentId, title: v.title, version: v.version, assignmentVersion: v.assignmentVersion, rubricVersion: v.rubricVersion, receiptCode: v.receiptCode, submittedAt: v.submittedAt, late: v.late,
  text: v.text, file: v.fileName ? { name: v.fileName, href: audience === "FAMILY" ? null : `/student/assignments?open=${encodeURIComponent(v.assignmentId)}` } : null,
  feedback: v.feedback ? { comment: v.feedback.comment, totalPoints: v.feedback.totalPoints, returnedAt: v.feedback.returnedAt, criteria: v.rubric.map(c => ({ id: c.id, title: c.title, maxPoints: c.maxPoints, points: v.feedback!.criteria.find(s => s.criterionId === c.id)?.points ?? null, comment: v.feedback!.criteria.find(s => s.criterionId === c.id)?.comment ?? "" })) } : null,
});

async function entryViews(user: AuthUser, entries: Prisma.PortfolioEntryGetPayload<object>[], audience: "LEARNER" | "TEACHER" | "FAMILY", studentId: string) {
  const ids = entries.flatMap(e => [e.earlierVersionId, ...(e.laterVersionId ? [e.laterVersionId] : [])]);
  const versions = ids.length ? await versionsOf(prisma, user.role === "PARENT" ? { ...user } : user, studentId, ids) : [];
  return entries.map(e => {
    const earlier = versions.find(v => v.id === e.earlierVersionId), later = e.laterVersionId ? versions.find(v => v.id === e.laterVersionId) ?? null : null;
    return {
      id: e.id, version: e.version, title: e.title, goal: e.goal, status: e.status, createdAt: e.createdAt,
      reflection: audience === "FAMILY" ? e.approvedReflection : e.reflection, reflectionVersion: audience === "FAMILY" ? e.approvedVersion : e.reflectionVersion, approvedVersion: e.approvedVersion,
      approvedReflection: audience === "FAMILY" ? undefined : e.approvedReflection,
      teacherComment: audience === "FAMILY" && e.status !== "APPROVED" ? null : e.teacherComment, familyVisible: audience === "FAMILY" ? undefined : e.familyVisible,
      ...(audience === "TEACHER" ? { staffNote: e.staffNote } : {}),
      // A source that is no longer readable is shown as missing, never silently dropped.
      earlier: earlier ? sourceView(earlier, audience) : null, later: later ? sourceView(later, audience) : e.laterVersionId ? null : undefined,
      missing: !earlier || (e.laterVersionId !== null && !later),
      comparison: earlier ? comparison(earlier, later, e.criterionIds) : null,
    };
  });
}

export async function portfolio(user: AuthUser, studentId: string | null) {
  const { student, role } = await studentFor(user, studentId);
  const entries = await prisma.portfolioEntry.findMany({ where: { schoolId: user.schoolId, studentId: student.id, removedAt: null }, orderBy: { createdAt: "asc" } });
  const shares = role === "TEACHER" ? await prisma.portfolioShare.findMany({ where: { schoolId: user.schoolId, studentId: student.id }, orderBy: { createdAt: "desc" } }) : [];
  const guardians = role === "TEACHER" ? await prisma.guardianRelationship.findMany({ where: { schoolId: user.schoolId, studentId: student.id, status: "ACTIVE", guardianUserId: { not: null } }, select: { guardianUserId: true, fullName: true } }) : [];
  return { student: { id: student.id, name: student.fullName }, role, entries: await entryViews(user, entries, role, student.id),
    shares: shares.map(s => ({ id: s.id, title: s.title, guardianUserId: s.guardianUserId, guardian: guardians.find(g => g.guardianUserId === s.guardianUserId)?.fullName ?? "", entryIds: s.entryIds, expiresAt: s.expiresAt, revokedAt: s.revokedAt, active: !s.revokedAt && s.expiresAt > new Date() })),
    guardians: guardians.map(g => ({ id: g.guardianUserId!, name: g.fullName })) };
}

export async function createShare(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const { student, role } = await studentFor(user, String(body.studentId ?? ""), tx);
    if (role !== "TEACHER") throw new ApiError("Only the teaching team shares a collection.", 403);
    const guardianUserId = String(body.guardianUserId ?? "");
    if (!await guardianHasAccess({ schoolId: user.schoolId, studentId: student.id, guardianUserId, permission: "learningRecords" })) throw new ApiError("This guardian cannot currently see this learner's learning records.", 409);
    const entryIds = [...new Set((Array.isArray(body.entryIds) ? body.entryIds : []).map(String))];
    if (!entryIds.length) throw new ApiError("Choose at least one approved entry.", 400);
    const ok = await tx.portfolioEntry.count({ where: { schoolId: user.schoolId, studentId: student.id, id: { in: entryIds }, approvedVersion: { not: null }, familyVisible: true, removedAt: null } });
    if (ok !== entryIds.length) throw new ApiError("Only entries approved for families can be shared.", 409);
    const days = Number(body.days ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 180) throw new ApiError("Share for 1 to 180 days.", 400);
    return tx.portfolioShare.create({ data: { schoolId: user.schoolId, studentId: student.id, guardianUserId, title: text(body.title, 120) || "Learning progress", entryIds, expiresAt: new Date(Date.now() + days * 86_400_000), createdById: user.userId } });
  });
}

export async function revokeShare(user: AuthUser, shareId: string) {
  return schoolAiTransaction(user, async tx => {
    const share = await tx.portfolioShare.findFirst({ where: { id: shareId, schoolId: user.schoolId } });
    if (!share) throw new ApiError("Share not found", 404);
    const { role } = await studentFor(user, share.studentId, tx);
    if (role !== "TEACHER") throw new ApiError("Share not found", 404);
    if (share.revokedAt) return share;
    return tx.portfolioShare.update({ where: { id: share.id }, data: { revokedAt: new Date(), revokedById: user.userId } });
  });
}

/** A guardian's shared collections: only live shares to them, only while their permission lasts. */
export async function guardianShares(user: AuthUser, studentId: string | null) {
  if (user.role !== "PARENT") throw new ApiError("Portfolio not found", 404);
  const now = new Date();
  const shares = await prisma.portfolioShare.findMany({ where: { schoolId: user.schoolId, guardianUserId: user.userId, revokedAt: null, expiresAt: { gt: now }, ...(studentId ? { studentId } : {}) }, orderBy: { createdAt: "desc" } });
  const out = [];
  for (const s of shares) if (await guardianHasAccess({ schoolId: user.schoolId, studentId: s.studentId, guardianUserId: user.userId, permission: "learningRecords" })) out.push({ id: s.id, title: s.title, studentId: s.studentId, expiresAt: s.expiresAt });
  return out;
}

export async function sharedCollection(user: AuthUser, shareId: string) {
  if (user.role !== "PARENT") throw new ApiError("This collection is not shared with your account.", 404);
  const share = await prisma.portfolioShare.findFirst({ where: { id: shareId, schoolId: user.schoolId, guardianUserId: user.userId } });
  if (!share || share.revokedAt || share.expiresAt <= new Date() || !await guardianHasAccess({ schoolId: user.schoolId, studentId: share.studentId, guardianUserId: user.userId, permission: "learningRecords" })) throw new ApiError("This collection is not shared with your account.", 404);
  const entries = await prisma.portfolioEntry.findMany({ where: { schoolId: user.schoolId, studentId: share.studentId, id: { in: share.entryIds }, approvedVersion: { not: null }, familyVisible: true, removedAt: null }, orderBy: { createdAt: "asc" } });
  const student = await prisma.student.findFirst({ where: { id: share.studentId, schoolId: user.schoolId }, select: { fullName: true } });
  return { id: share.id, title: share.title, student: student?.fullName ?? "", expiresAt: share.expiresAt, entries: await entryViews(user, entries, "FAMILY", share.studentId), withdrawn: share.entryIds.length - entries.length };
}

/** Learners whose portfolios this teacher may open (their classes; leaders: their campus). */
export async function teachingLearners(user: AuthUser) {
  if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Portfolio not found", 404);
  const lead = canManageOperations(user);
  const classIds = lead ? null : await teacherClassIds(user.userId);
  const rows = await prisma.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(lead ? (user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) : { classId: { in: classIds ?? [] } }) }, select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } }, orderBy: [{ fullName: "asc" }], take: 400 });
  const counts = rows.length ? await prisma.portfolioEntry.groupBy({ by: ["studentId", "status"], where: { schoolId: user.schoolId, studentId: { in: rows.map(r => r.id) }, removedAt: null }, _count: { _all: true } }) : [];
  return rows.map(r => ({ id: r.id, name: r.fullName, rollNo: r.rollNo, className: [r.class?.name, r.class?.section].filter(Boolean).join(" "), toReview: counts.filter(c => c.studentId === r.id && c.status === "PROPOSED").reduce((n, c) => n + c._count._all, 0) }));
}
