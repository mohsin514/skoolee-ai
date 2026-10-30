import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission } from "@/lib/api/scope";
import { isFamily, studentScope } from "@/lib/auth/policy";

// SKAI-166 — the one read model for a pupil's life-cycle timeline.
//
// Events are append-only (no update/delete path exists), so an event id is its
// immutable identity. Reads are ordered newest first with id as tie-breaker and
// paged by a keyset cursor, so a page never repeats or skips an event when new
// ones are appended between requests.

/** Life-cycle milestones a guardian or the pupil may see. Everything else (staff notes, document uploads) is staff-only. */
export const FAMILY_TIMELINE_KINDS = ["ADMITTED", "PROMOTED", "ENROLLMENT_TRANSITION", "ARCHIVED"] as const;
/** Kinds staff may append by hand; the rest are written by the workflows that own them. */
export const MANUAL_TIMELINE_KINDS = ["NOTE"] as const;
export const TIMELINE_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
export const TIMELINE_TITLE_MAX = 200;
export const TIMELINE_DETAIL_MAX = 2000;

export type TimelineEvent = {
  id: string;
  kind: string;
  title: string;
  /** Free-text change detail; null when there is none or the reader may not see it. */
  detail: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
};

export type TimelinePage = {
  events: TimelineEvent[];
  nextCursor: string | null;
  /** Entries that exist but are withheld from this reader — lets the UI say "restricted" instead of "nothing here". */
  restrictedCount: number;
  canAddNote: boolean;
};

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) throw new ApiError("Invalid cursor", 400);
  return { createdAt, id };
}

/**
 * Resolves the pupil inside the reader's scope: same school, the reader's
 * campus for campus-bound staff, a verified guardian relationship for parents,
 * the pupil's own record for students. Anything else is the same 404, so a
 * caller cannot tell "another school's pupil" from "no such pupil".
 */
export async function scopedTimelineStudent(user: AuthUser, studentId: string) {
  if (!studentId) throw new ApiError("studentId required", 400);
  if (!isFamily(user)) await assertPermission(user, "students", "view");
  const student = await prisma.student.findFirst({ where: { id: studentId, ...studentScope(user) }, select: { id: true, campusId: true } });
  if (!student) throw new ApiError("Student not found", 404);
  return student;
}

async function canEditStudents(user: AuthUser) {
  if (isFamily(user)) return false;
  try { await assertPermission(user, "students", "edit"); return true; } catch { return false; }
}

export async function readStudentTimeline(user: AuthUser, studentId: string, options: { cursor?: string | null; limit?: number | null; kind?: string | null } = {}): Promise<TimelinePage> {
  const student = await scopedTimelineStudent(user, studentId);
  const family = isFamily(user);
  const limit = Math.min(Math.max(Math.trunc(Number(options.limit) || TIMELINE_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const kind = options.kind ? options.kind.toUpperCase() : null;
  if (kind && !/^[A-Z_]{2,40}$/.test(kind)) throw new ApiError("Invalid kind", 400);

  const visibleKinds: string[] | null = family ? [...FAMILY_TIMELINE_KINDS] : null;
  const kindWhere = kind
    ? (visibleKinds && !visibleKinds.includes(kind) ? { in: [] as string[] } : { equals: kind })
    : (visibleKinds ? { in: visibleKinds } : undefined);
  const base = { studentId: student.id, ...(kindWhere ? { kind: kindWhere } : {}) };
  const after = options.cursor ? decodeCursor(options.cursor) : null;

  const [rows, restrictedCount, canAddNote] = await Promise.all([
    prisma.studentTimelineEvent.findMany({
      where: after ? { ...base, OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : base,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, kind: true, title: true, detail: true, actorId: true, createdAt: true },
    }),
    visibleKinds ? prisma.studentTimelineEvent.count({ where: { studentId: student.id, kind: { notIn: visibleKinds } } }) : Promise.resolve(0),
    canEditStudents(user),
  ]);

  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map(row => row.actorId).filter((id): id is string => !!id))];
  // Families see who acted only as "school staff": staff names are not theirs to collect.
  const actors = family || !actorIds.length ? [] : await prisma.user.findMany({ where: { id: { in: actorIds }, schoolId: user.schoolId }, select: { id: true, fullName: true } });
  const names = new Map(actors.map(actor => [actor.id, actor.fullName]));
  const last = page.at(-1);

  return {
    events: page.map(row => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      detail: family ? null : row.detail,
      actor: row.actorId && names.has(row.actorId) ? { id: row.actorId, name: names.get(row.actorId)! } : null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    restrictedCount,
    canAddNote,
  };
}
