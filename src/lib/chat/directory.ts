// ─────────────────────────────────────────────────────────────────
// The contact directory.
//
// Derived from the same rules as src/lib/chat/policy.ts, but expressed as a
// Prisma predicate rather than a per-person decision: a directory built by
// fetching every user and asking canDirectMessage() about each one would be
// O(users) round trips on a school with thousands of accounts.
//
// The two must agree. canDirectMessage() remains the authority — it is what
// actually gates a send — so this file's job is to never *offer* someone the
// policy would refuse. Every branch here has a matching branch there.
// ─────────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { type UserRole } from "@/lib/roles";
import {
  LEADERSHIP_ROLES,
  STAFF_ROLES,
  SUPPORT_ROLES,
  type ChatSettings,
  isLeadership,
  isStaff,
  spansAllCampuses,
  teacherClassIds,
} from "./policy";

export interface DirectoryEntry {
  id: string;
  fullName: string;
  role: UserRole;
  campusId: string | null;
  /** Which campus they sit on. The one thing that reliably tells two
   *  same-titled colleagues apart in a school group. */
  campusName: string | null;
  /**
   * Only ever populated for staff viewers, who already see colleague addresses
   * throughout the admin UI. Families get relationship context instead — their
   * directory is small and unambiguous, and there is no reason to hand a
   * guardian a list of staff email addresses.
   */
  email: string | null;
  profileImageUrl: string | null;
  /** Why this person is reachable — "Class 5-B · Mathematics", "Your child". */
  context: string | null;
}

/** Roles that never appear in a school directory. */
const HIDDEN_ROLES: UserRole[] = ["APP_OWNER"];

/**
 * Narrows a query to the actor's campus. A group-level super admin sees every
 * campus; everyone else sees one. Accounts with no campus at all (a school
 * owner mid-setup) stay visible, otherwise they would be unreachable.
 */
function campusScope(user: AuthUser): Prisma.UserWhereInput {
  if (spansAllCampuses(user.role) || !user.campusId) return {};
  return { OR: [{ campusId: user.campusId }, { campusId: null }] };
}

/**
 * The set of user ids linked to a teacher's roster — the guardians and pupils
 * of the children they teach. Empty when they have no classes yet.
 */
async function familyIdsForTeacher(userId: string): Promise<string[]> {
  const classIds = await teacherClassIds(userId);
  if (classIds.length === 0) return [];

  const roster = await prisma.student.findMany({
    where: { classId: { in: classIds }, status: "active" },
    select: { parentUserId: true, studentUserId: true },
  });

  const ids = new Set<string>();
  for (const s of roster) {
    if (s.parentUserId) ids.add(s.parentUserId);
    if (s.studentUserId) ids.add(s.studentUserId);
  }
  return [...ids];
}

/**
 * The staff a family may reach, and the pupils/guardians on their own record.
 * Returns explicit id lists because a family's reach is a handful of people,
 * not a role-shaped slice of the school.
 */
async function familyReach(
  user: AuthUser,
  settings: ChatSettings
): Promise<{ teacherIds: string[]; ownIds: string[]; supportAllowed: boolean; peersAllowed: boolean }> {
  const isParent = user.role === "PARENT";

  const students = await prisma.student.findMany({
    where: isParent
      ? { parentUserId: user.userId, status: "active" }
      : { studentUserId: user.userId },
    select: { id: true, classId: true, parentUserId: true, studentUserId: true },
  });

  const classIds = students.map((s) => s.classId);

  // Their children's teachers: class teachers, subject teachers, and anyone
  // timetabled into those classes.
  const [classes, subjects, slots] = await Promise.all([
    classIds.length
      ? prisma.class.findMany({
          where: { id: { in: classIds }, classTeacherId: { not: null } },
          select: { classTeacherId: true },
        })
      : Promise.resolve([]),
    classIds.length
      ? prisma.subject.findMany({
          where: { classId: { in: classIds }, teacherId: { not: null } },
          select: { teacherId: true },
        })
      : Promise.resolve([]),
    classIds.length
      ? prisma.timetableSlot.findMany({
          where: { teacherId: { not: null }, timetable: { classId: { in: classIds } } },
          select: { teacherId: true },
        })
      : Promise.resolve([]),
  ]);

  const teacherIds = new Set<string>();
  for (const c of classes) if (c.classTeacherId) teacherIds.add(c.classTeacherId);
  for (const s of subjects) if (s.teacherId) teacherIds.add(s.teacherId);
  for (const s of slots) if (s.teacherId) teacherIds.add(s.teacherId);

  // The other half of their own family: a guardian sees their children's
  // logins, a pupil sees their guardian.
  const ownIds = new Set<string>();
  for (const s of students) {
    const other = isParent ? s.studentUserId : s.parentUserId;
    if (other) ownIds.add(other);
  }

  return {
    teacherIds: [...teacherIds],
    ownIds: [...ownIds],
    supportAllowed: isParent ? settings.parentToSupport : settings.studentToSupport,
    peersAllowed: isParent ? settings.parentToParent : settings.studentToStudent,
  };
}

/**
 * The Prisma predicate describing everyone `user` may start a thread with.
 * `null` means "nobody" — returned for the platform owner, who sits outside
 * school messaging entirely.
 */
export async function reachableWhere(
  user: AuthUser,
  settings: ChatSettings
): Promise<Prisma.UserWhereInput | null> {
  if (user.role === "APP_OWNER") return null;

  const base: Prisma.UserWhereInput = {
    isActive: true,
    id: { not: user.userId },
    role: { notIn: HIDDEN_ROLES },
  };

  // Leadership reaches everyone in scope, which is the whole point of the role.
  if (isLeadership(user.role)) {
    return { ...base, ...campusScope(user) };
  }

  if (user.role === "TEACHER") {
    const familyIds = await familyIdsForTeacher(user.userId);
    return {
      ...base,
      OR: [
        // Colleagues, campus-scoped.
        { role: { in: STAFF_ROLES }, ...campusScope(user) },
        // Only the families they actually teach.
        ...(familyIds.length ? [{ id: { in: familyIds } }] : []),
      ],
    };
  }

  // Support staff: colleagues always, families only while the school allows it.
  if (isStaff(user.role)) {
    const familyRoles: UserRole[] = [
      ...(settings.parentToSupport ? (["PARENT"] as UserRole[]) : []),
      ...(settings.studentToSupport ? (["STUDENT"] as UserRole[]) : []),
    ];

    return {
      ...base,
      ...campusScope(user),
      role: { in: [...STAFF_ROLES, ...familyRoles] },
    };
  }

  // Families.
  const { teacherIds, ownIds, supportAllowed, peersAllowed } = await familyReach(user, settings);
  const peerRole: UserRole = user.role === "PARENT" ? "PARENT" : "STUDENT";

  const branches: Prisma.UserWhereInput[] = [
    { role: { in: LEADERSHIP_ROLES }, ...campusScope(user) },
    ...(teacherIds.length ? [{ id: { in: teacherIds } }] : []),
    ...(ownIds.length ? [{ id: { in: ownIds } }] : []),
    ...(supportAllowed ? [{ role: { in: SUPPORT_ROLES }, ...campusScope(user) }] : []),
    ...(peersAllowed ? [{ role: peerRole, ...campusScope(user) }] : []),
  ];

  return { ...base, OR: branches };
}

/**
 * The directory page: everyone reachable, newest-relevant first, optionally
 * filtered by a search term or a role.
 */
export async function listDirectory(
  user: AuthUser,
  settings: ChatSettings,
  options: { query?: string; role?: UserRole; limit?: number } = {}
): Promise<DirectoryEntry[]> {
  const where = await reachableWhere(user, settings);
  if (!where) return [];

  const q = options.query?.trim();
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);

  const filters: Prisma.UserWhereInput[] = [where];
  if (q) {
    filters.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (options.role) filters.push({ role: options.role });

  const users = await prisma.user.findMany({
    where: { AND: filters },
    select: {
      id: true,
      fullName: true,
      role: true,
      campusId: true,
      email: true,
      profileImageUrl: true,
      campus: { select: { name: true } },
    },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    take: limit,
  });

  const contexts = await describeContexts(
    user,
    users.map((u) => u.id)
  );

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    role: u.role as UserRole,
    campusId: u.campusId,
    campusName: u.campus?.name ?? null,
    email: isStaff(user.role) ? u.email : null,
    profileImageUrl: u.profileImageUrl,
    context: contexts.get(u.id) ?? null,
  }));
}

/**
 * A one-line reason each person is in the actor's directory — "Class 5-B",
 * "Your child", "Guardian of Ayesha". Without it a teacher sees forty
 * identically-labelled "Parent" rows and cannot tell whose guardian is whose.
 */
async function describeContexts(user: AuthUser, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  if (user.role === "TEACHER") {
    const classIds = await teacherClassIds(user.userId);
    if (classIds.length === 0) return out;

    const roster = await prisma.student.findMany({
      where: {
        classId: { in: classIds },
        OR: [{ parentUserId: { in: ids } }, { studentUserId: { in: ids } }],
      },
      select: {
        fullName: true,
        parentUserId: true,
        studentUserId: true,
        class: { select: { name: true, section: true } },
      },
    });

    for (const s of roster) {
      const label = s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "";
      if (s.studentUserId && ids.includes(s.studentUserId)) {
        out.set(s.studentUserId, label || "Your student");
      }
      if (s.parentUserId && ids.includes(s.parentUserId)) {
        out.set(s.parentUserId, `Guardian of ${s.fullName}${label ? ` · ${label}` : ""}`);
      }
    }
    return out;
  }

  if (user.role === "PARENT" || user.role === "STUDENT") {
    const isParent = user.role === "PARENT";
    const students = await prisma.student.findMany({
      where: isParent
        ? { parentUserId: user.userId, status: "active" }
        : { studentUserId: user.userId },
      select: {
        fullName: true,
        classId: true,
        parentUserId: true,
        studentUserId: true,
        class: { select: { name: true, section: true, classTeacherId: true } },
      },
    });

    for (const s of students) {
      const own = isParent ? s.studentUserId : s.parentUserId;
      if (own && ids.includes(own)) {
        out.set(own, isParent ? `Your child · ${s.fullName}` : "Your guardian");
      }
      if (s.class?.classTeacherId && ids.includes(s.class.classTeacherId)) {
        const label = `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}`;
        out.set(s.class.classTeacherId, `Class teacher · ${label}`);
      }
    }

    // Subject teachers, labelled with what they actually teach.
    const classIds = students.map((s) => s.classId);
    if (classIds.length) {
      const subjects = await prisma.subject.findMany({
        where: { classId: { in: classIds }, teacherId: { in: ids } },
        select: { name: true, teacherId: true },
      });
      for (const subject of subjects) {
        if (subject.teacherId && !out.has(subject.teacherId)) {
          out.set(subject.teacherId, `Teaches ${subject.name}`);
        }
      }
    }
  }

  return out;
}
