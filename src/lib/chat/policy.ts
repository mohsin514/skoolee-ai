// ─────────────────────────────────────────────────────────────────
// Who may talk to whom.
//
// A school is not a flat address book. A teacher may reach the guardians of
// the children they teach and no others; a guardian may reach that teacher
// back, but not the other thirty families in the class. Getting this wrong
// is not a UI bug — it is a child-safety and privacy failure — so the rule
// lives in one module, is enforced on every write path, and the directory
// endpoint is derived from the same functions rather than reimplementing them.
//
// Two independent gates apply before any of this:
//   1. the Prisma tenant guard, which makes cross-school contact impossible;
//   2. requireAuthUser(), which re-checks the account on every request.
// This module handles the third: intra-school reachability.
// ─────────────────────────────────────────────────────────────────
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { isCampusAdminRole, type UserRole } from "@/lib/roles";

/** School leadership. Reaches everyone inside its campus scope. */
export const LEADERSHIP_ROLES: UserRole[] = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"];

/** Non-teaching staff whose work brings them into contact with families. */
export const SUPPORT_ROLES: UserRole[] = ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"];

/** Everyone employed by the school. */
export const STAFF_ROLES: UserRole[] = [...LEADERSHIP_ROLES, "TEACHER", ...SUPPORT_ROLES];

export const FAMILY_ROLES: UserRole[] = ["PARENT", "STUDENT"];

export function isLeadership(role: UserRole) {
  return LEADERSHIP_ROLES.includes(role);
}

export function isStaff(role: UserRole) {
  return STAFF_ROLES.includes(role);
}

export function isFamily(role: UserRole) {
  return FAMILY_ROLES.includes(role);
}

/**
 * SUPER_ADMIN runs the whole school group, so campus never narrows them.
 * Everyone else — including families, who inherit their child's campus —
 * is confined to the campus they belong to.
 */
export function spansAllCampuses(role: UserRole) {
  return role === "SUPER_ADMIN" || role === "APP_OWNER";
}

export interface ChatSettings {
  studentToStudent: boolean;
  parentToParent: boolean;
  studentToSupport: boolean;
  parentToSupport: boolean;
  attachmentsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  studentToStudent: false,
  parentToParent: false,
  studentToSupport: true,
  parentToSupport: true,
  attachmentsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: "20:00",
  quietHoursEnd: "07:00",
};

/**
 * A school's messaging policy, falling back to the conservative defaults
 * when it has never opened the settings screen.
 */
export async function getChatSettings(schoolId: string): Promise<ChatSettings> {
  const row = await prisma.chatSetting.findUnique({ where: { schoolId } });
  if (!row) return { ...DEFAULT_CHAT_SETTINGS };
  return {
    studentToStudent: row.studentToStudent,
    parentToParent: row.parentToParent,
    studentToSupport: row.studentToSupport,
    parentToSupport: row.parentToSupport,
    attachmentsEnabled: row.attachmentsEnabled,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

/** The fields of the counterparty this module needs to make a decision. */
export interface ChatPeer {
  id: string;
  role: UserRole;
  campusId: string | null;
  isActive: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  /** Shown to the person who tried, so a refusal explains itself. */
  reason?: string;
}

const ALLOW: PolicyDecision = { allowed: true };

function deny(reason: string): PolicyDecision {
  return { allowed: false, reason };
}

// ─── Relationship lookups ────────────────────────────────────────

/**
 * Every class a teacher is attached to: as class teacher, as a subject
 * teacher, or through a published timetable slot. All three appear in the
 * product as "my classes", so all three grant contact with those families.
 */
export async function teacherClassIds(userId: string): Promise<string[]> {
  const [led, subjects, slots] = await Promise.all([
    prisma.class.findMany({ where: { classTeacherId: userId }, select: { id: true } }),
    prisma.subject.findMany({ where: { teacherId: userId }, select: { classId: true } }),
    prisma.timetableSlot.findMany({
      where: { teacherId: userId },
      select: { timetable: { select: { classId: true } } },
    }),
  ]);

  const ids = new Set<string>();
  for (const c of led) ids.add(c.id);
  for (const s of subjects) ids.add(s.classId);
  for (const s of slots) if (s.timetable?.classId) ids.add(s.timetable.classId);
  return [...ids];
}

/**
 * True when a teacher and a family account meet over at least one child.
 * One query, not one per class: the join is done in the database.
 */
async function teacherSharesStudent(teacherId: string, family: ChatPeer): Promise<boolean> {
  const classIds = await teacherClassIds(teacherId);
  if (classIds.length === 0) return false;

  const link = await prisma.student.findFirst({
    where: {
      classId: { in: classIds },
      status: "active",
      ...(family.role === "PARENT"
        ? { parentUserId: family.id }
        : { studentUserId: family.id }),
    },
    select: { id: true },
  });

  return link !== null;
}

/** A guardian and a pupil who belong to the same student record. */
async function sharesStudentRecord(a: ChatPeer, b: ChatPeer): Promise<boolean> {
  const parent = a.role === "PARENT" ? a : b;
  const student = a.role === "STUDENT" ? a : b;

  const link = await prisma.student.findFirst({
    where: { parentUserId: parent.id, studentUserId: student.id },
    select: { id: true },
  });

  return link !== null;
}

// ─── The decision ────────────────────────────────────────────────

/**
 * May `actor` open (or continue) a direct thread with `target`?
 *
 * Called on conversation creation, on every send, and to build the contact
 * directory — a relationship that lapses (a teacher losing a class, a pupil
 * changing section) closes the thread to new messages rather than leaving a
 * permanent back door.
 */
export async function canDirectMessage(
  actor: AuthUser,
  target: ChatPeer,
  settings: ChatSettings
): Promise<PolicyDecision> {
  if (actor.userId === target.id) {
    return deny("You cannot start a conversation with yourself");
  }

  if (!target.isActive) {
    return deny("That account is no longer active");
  }

  // The platform owner administers every tenant from outside; they hold no
  // place in any single school's staffroom, and no school user should be
  // able to reach across the tenant boundary to find them.
  if (actor.role === "APP_OWNER" || target.role === "APP_OWNER") {
    return deny("Platform owner accounts are outside school messaging");
  }

  const actorRole = actor.role;
  const targetRole = target.role;
  const actorAsPeer: ChatPeer = {
    id: actor.userId,
    role: actorRole,
    campusId: actor.campusId,
    isActive: true,
  };

  const actorIsStaff = isStaff(actorRole);
  const targetIsStaff = isStaff(targetRole);

  // ── Relationship-first ─────────────────────────────────────────
  //
  // These two pairs are settled by a shared student record, and that is
  // stronger evidence than any column: it is the school's own statement that
  // these two people have business with each other. It is checked BEFORE
  // campus scoping deliberately — a guardian whose account sits on the wrong
  // campus (or on none, which is common for accounts created before a second
  // campus existed) must still reach their own child's teacher. Campus is a
  // way of narrowing a role-shaped slice of the school; it is not a reason to
  // cut a teacher off from a family on their own register.

  // Teacher ↔ family. Normalised so one branch covers both directions: the
  // rule is a property of the pair, not of who typed first.
  if (actorIsStaff !== targetIsStaff) {
    const staffRole = actorIsStaff ? actorRole : targetRole;

    if (staffRole === "TEACHER") {
      const teacherId = actorIsStaff ? actor.userId : target.id;
      const familyPeer = actorIsStaff ? target : actorAsPeer;

      if (await teacherSharesStudent(teacherId, familyPeer)) return ALLOW;

      return deny(
        actorIsStaff
          ? "You can only message the families of students you teach"
          : "You can only message your own child's teachers"
      );
    }
  }

  // Guardian ↔ their own pupil.
  if (!actorIsStaff && !targetIsStaff && actorRole !== targetRole) {
    if (await sharesStudentRecord(actorAsPeer, target)) return ALLOW;

    return deny(
      actorRole === "PARENT"
        ? "You can only message your own children"
        : "You can only message your own guardian"
    );
  }

  // ── Campus-scoped ──────────────────────────────────────────────
  //
  // What remains is reachability by role rather than by relationship, and
  // that is where campus is the right boundary: a Lahore guardian has no
  // business with a Karachi accountant. A group-level super admin spans every
  // campus, which is the whole point of the role.
  if (!spansAllCampuses(actorRole) && !spansAllCampuses(targetRole)) {
    if (actor.campusId && target.campusId && actor.campusId !== target.campusId) {
      return deny("That person belongs to a different campus");
    }
  }

  // Colleagues. Every member of staff can reach every other member of staff
  // in scope — the staffroom is the one part of this that should be open.
  if (actorIsStaff && targetIsStaff) return ALLOW;

  if (actorIsStaff !== targetIsStaff) {
    const staffRole = actorIsStaff ? actorRole : targetRole;
    const familyRole = actorIsStaff ? targetRole : actorRole;

    // The office is always reachable, by anyone, in either direction.
    if (isLeadership(staffRole)) return ALLOW;

    // Support staff: reachable by families only while the school leaves that
    // channel open.
    const enabled = familyRole === "PARENT" ? settings.parentToSupport : settings.studentToSupport;
    if (!enabled) {
      return deny("Your school has not enabled messaging with this department");
    }
    return ALLOW;
  }

  // Peer channels, both closed unless a school consciously opens them.
  if (actorRole === "PARENT") {
    return settings.parentToParent
      ? ALLOW
      : deny("Your school has not enabled guardian-to-guardian messaging");
  }

  return settings.studentToStudent
    ? ALLOW
    : deny("Your school has not enabled student-to-student messaging");
}

/**
 * Who may create a group or class channel.
 *
 * Families are excluded: a group is a broadcast surface, and one built by a
 * guardian would expose the other members' presence to each other, which is
 * exactly what parentToParent is there to control.
 */
export function canCreateGroup(role: UserRole) {
  return isStaff(role);
}

/** Only leadership addresses the whole school. */
export function canCreateAnnouncement(role: UserRole) {
  return isLeadership(role);
}

/** Who may change the school-wide messaging policy. */
export function canManageChatSettings(role: UserRole) {
  return role === "SUPER_ADMIN" || isCampusAdminRole(role) || role === "PRINCIPAL";
}

/**
 * Moderation reach: leadership may remove any message in their school.
 * Everyone else may only withdraw their own.
 */
export function canModerate(role: UserRole) {
  return isLeadership(role);
}

/**
 * True while the clock is inside the school's quiet window. Used to hold back
 * notifications — never to hold back the message itself, which always lands.
 *
 * Handles a window that crosses midnight ("20:00"–"07:00") by testing the two
 * halves separately.
 */
export function isWithinQuietHours(settings: ChatSettings, now: Date, timeZone: string): boolean {
  if (!settings.quietHoursEnabled) return false;

  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [start, end] = [settings.quietHoursStart, settings.quietHoursEnd];
  if (start === end) return false;

  return start < end ? local >= start && local < end : local >= start || local < end;
}
