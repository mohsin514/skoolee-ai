import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import type { Paper } from "@/lib/academic/datesheet-publication";

/**
 * SKO-505 Family Exam Brief. A republished date sheet asks only the families whose child's papers changed
 * (added, removed, moved or re-roomed — not an invigilator swap) to acknowledge that version. Every
 * statement comes from the published diff and the published snapshots; nothing reads the office's draft.
 */
export type BriefKind = "ADDED" | "REMOVED" | "MOVED" | "ROOMS_CHANGED";
export interface BriefItem { scheduleId: string; kind: BriefKind; subject: string; date: string | null; previousDate: string | null }
type Change = { scheduleId: string; kind: string };
const FAMILY_KINDS: readonly string[] = ["ADDED", "REMOVED", "MOVED", "ROOMS_CHANGED"];

/** The changes in one published version that touch a class, newest snapshot first for where it is now. */
export function briefItemsFor(changes: readonly Change[], after: readonly Paper[], before: readonly Paper[], classId: string): BriefItem[] {
  return changes.filter(change => FAMILY_KINDS.includes(change.kind)).flatMap(change => {
    const now = after.find(paper => paper.scheduleId === change.scheduleId), then = before.find(paper => paper.scheduleId === change.scheduleId);
    const paper = now ?? then;
    if (!paper || paper.classId !== classId) return [];
    return [{ scheduleId: change.scheduleId, kind: change.kind as BriefKind, subject: paper.subjectName, date: now?.date ?? null, previousDate: then?.date ?? null }];
  });
}

const BRIEF_WINDOW_DAYS = 45;

/** Republished versions (2 and later) of the child's sessions that changed the child's papers, with this guardian's receipt. */
export async function familyExamBrief(schoolId: string, student: { id: string; classId: string }, guardianUserId: string, now = new Date()) {
  const sessionIds = [...new Set((await prisma.exam.findMany({ where: { schoolId, classId: student.classId, sessionId: { not: null } }, select: { sessionId: true } })).map(row => row.sessionId!))];
  if (!sessionIds.length) return [];
  const versions = await prisma.examDatesheetVersion.findMany({ where: { schoolId, sessionId: { in: sessionIds }, version: { gt: 1 }, publishedAt: { gte: new Date(now.getTime() - BRIEF_WINDOW_DAYS * 86_400_000) } }, orderBy: [{ publishedAt: "desc" }], select: { id: true, sessionId: true, version: true, publishedAt: true, snapshot: true, changes: true, campusId: true } });
  if (!versions.length) return [];
  const priors = await prisma.examDatesheetVersion.findMany({ where: { schoolId, OR: versions.map(row => ({ sessionId: row.sessionId, version: row.version - 1 })) }, select: { sessionId: true, version: true, snapshot: true } });
  const receipts = await prisma.examBriefReceipt.findMany({ where: { schoolId, studentId: student.id, guardianUserId, versionId: { in: versions.map(row => row.id) } }, select: { versionId: true, acknowledgedAt: true } });
  return versions.flatMap(version => {
    const prior = priors.find(row => row.sessionId === version.sessionId && row.version === version.version - 1);
    const items = briefItemsFor((version.changes as Change[] | null) ?? [], (version.snapshot as { papers: Paper[] }).papers, (prior?.snapshot as { papers: Paper[] } | undefined)?.papers ?? [], student.classId);
    if (!items.length) return [];
    return [{ versionId: version.id, version: version.version, campusId: version.campusId, publishedAt: version.publishedAt, items, acknowledgedAt: receipts.find(row => row.versionId === version.id)?.acknowledgedAt ?? null }];
  });
}

/** One acknowledgement per guardian, child and version; repeating it returns the first receipt. */
export async function acknowledgeExamBrief(schoolId: string, student: { id: string; classId: string }, guardianUserId: string, versionId: string) {
  const brief = (await familyExamBrief(schoolId, student, guardianUserId)).find(row => row.versionId === versionId);
  if (!brief) throw new ApiError("This date-sheet change does not concern this child.", 404);
  const receipt = await prisma.examBriefReceipt.upsert({ where: { versionId_studentId_guardianUserId: { versionId, studentId: student.id, guardianUserId } }, update: {}, create: { schoolId, campusId: brief.campusId, versionId, studentId: student.id, guardianUserId } });
  return { versionId, acknowledgedAt: receipt.acknowledgedAt };
}
