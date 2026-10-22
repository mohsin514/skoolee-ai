import "server-only";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canOwnSubscription, isCampusOperator, isGroupConsole, isInstitutionAuthority, isStandaloneOwner, kindFor } from "@/lib/auth/institution";
import { getCampusSeats, type CampusSeats } from "@/lib/auth/seats";
import { studentScope } from "@/lib/auth/policy";
import { teacherClassIds } from "@/lib/chat/policy";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";
import { isCampusAdminRole, type UserRole } from "@/lib/roles";
import type { PermissionFlags } from "@/lib/permissions";
import { CAPABILITY_KEYS, type CapabilityKey } from "./capability-keys";

/**
 * Boolean capability keys for navigation (§1.4). Each is the same predicate that gates the matching API, so the
 * sidebar never offers what the server refuses. Presentation only — never an authorization snapshot.
 *
 * Cost: the role short-circuits before any query; one `getCampusSeats` call for campus staff; duty keys are
 * `count` queries only for roles that can hold the duty. A failing duty query hides that entry (fails closed)
 * instead of failing the whole navigation.
 */

const CAMPUS_STAFF: readonly UserRole[] = ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"];
/** Staff who can be named on a duty (trip attendant, activity staff, care member, service agent) without holding the operator seat. */
const DUTY_STAFF: readonly UserRole[] = ["PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"];
const RECORD_SEARCH: readonly UserRole[] = ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "RECEPTIONIST"];
const CORRECTION_ROLES: readonly UserRole[] = ["PARENT", "STUDENT", "TEACHER", "ACCOUNTANT", "SUPER_ADMIN", "PRINCIPAL"];
/** Open service-request statuses — the same list the service desk's queue uses (`service-desk/service.ts` OPEN). */
const OPEN_SERVICE_REQUEST = ["OPEN", "IN_PROGRESS", "BLOCKED"] as const;
const NO_SEATS: CampusSeats = { campusAdmin: false, principal: false, accountant: false, receptionist: false, librarian: false };
const ALL_SEATS: CampusSeats = { campusAdmin: true, principal: true, accountant: true, receptionist: true, librarian: true };

async function duty(name: string, user: AuthUser, query: () => Promise<boolean>): Promise<boolean> {
  try {
    return await query();
  } catch (error) {
    console.warn("[navigation] capability unavailable", { capability: name, role: user.role, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function careMember(user: AuthUser) {
  const rows = await prisma.confidentialMember.count({
    where: { schoolId: user.schoolId, userId: user.userId, revokedAt: null, ...(user.campusId ? { campusId: user.campusId } : {}) },
  });
  return rows > 0;
}

async function serviceAgent(user: AuthUser) {
  const departments = await prisma.departmentMember.findMany({ where: { schoolId: user.schoolId, userId: user.userId }, select: { departmentId: true } });
  const categories = await prisma.serviceCategory.count({
    where: {
      schoolId: user.schoolId,
      active: true,
      OR: [
        { defaultOwnerId: user.userId },
        { escalationId: user.userId },
        ...(departments.length ? [{ departmentId: { in: departments.map((row) => row.departmentId) } }] : []),
      ],
    },
  });
  if (categories > 0) return true;
  // Someone who owns an open request works the queue too; a request they once owned and closed does not keep the entry.
  const owned = await prisma.serviceRequest.count({ where: { schoolId: user.schoolId, ownerId: user.userId, status: { in: [...OPEN_SERVICE_REQUEST] } } });
  return owned > 0;
}

async function tripToday(user: AuthUser) {
  if (!user.campusId) return false;
  const serviceDate = calendarDateIn((await getLocalePackage(user.schoolId, user.campusId)).timezone, new Date());
  const trips = await prisma.transportTrip.count({ where: { schoolId: user.schoolId, attendantId: user.userId, serviceDate } });
  return trips > 0;
}

async function activityStaff(user: AuthUser) {
  const activities = await prisma.activity.count({
    where: {
      schoolId: user.schoolId,
      status: "PUBLISHED",
      endsAt: { gte: new Date() },
      OR: [{ coordinatorId: user.userId }, { staffIds: { has: user.userId } }],
    },
  });
  return activities > 0;
}

async function accessPlans(user: AuthUser) {
  if (user.role === "TEACHER") {
    const classIds = await teacherClassIds(user.userId);
    if (!classIds.length) return false;
    const plans = await prisma.accommodationPlan.count({
      where: { schoolId: user.schoolId, status: "ACTIVE", studentId: { in: (await prisma.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, classId: { in: classIds } }, select: { id: true } })).map((row) => row.id) } },
    });
    return plans > 0;
  }
  const children = await prisma.student.findMany({ where: { AND: [studentScope(user, "learningRecords"), { archivedAt: null }] }, select: { id: true } });
  if (!children.length) return false;
  const plans = await prisma.accommodationPlan.count({ where: { schoolId: user.schoolId, status: "ACTIVE", studentId: { in: children.map((row) => row.id) } } });
  return plans > 0;
}

async function pkgCanteen(user: AuthUser) {
  if (user.role === "PARENT") {
    const children = await prisma.student.findMany({ where: { AND: [studentScope(user, "any"), { archivedAt: null }] }, select: { campusId: true } });
    const campusIds = [...new Set(children.map((row) => row.campusId).filter(Boolean))];
    if (!campusIds.length) return false;
    // Families order only from a canteen that is running.
    const enabled = await prisma.campusPackage.count({ where: { schoolId: user.schoolId, campusId: { in: campusIds }, package: "CANTEEN", status: "ENABLED" } });
    return enabled > 0;
  }
  if (!user.campusId) return false;
  // Same rule as the package navigation: enabled, or disabled with history still to read.
  const present = await prisma.campusPackage.count({ where: { schoolId: user.schoolId, campusId: user.campusId, package: "CANTEEN", status: { in: ["ENABLED", "DISABLED"] } } });
  return present > 0;
}

async function guardianChildren(user: AuthUser, permission: "pickup" | "any") {
  return prisma.student.count({ where: { AND: [studentScope(user, permission), { archivedAt: null }] } });
}

export async function capabilitiesFor(user: AuthUser, permissions: Map<string, PermissionFlags>): Promise<Record<CapabilityKey, boolean>> {
  const caps = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false])) as Record<CapabilityKey, boolean>;
  const role = user.role;
  const operator = isCampusOperator(user);
  const kind = kindFor(user);

  // Institution and identity — pure, no queries.
  caps.institutionAuthority = isInstitutionAuthority(user);
  caps.billing = canOwnSubscription(user);
  caps.groupConsole = isGroupConsole(user);
  caps.standaloneOwner = isStandaloneOwner(user);
  caps.campusOps = operator;
  caps.groupCampus = kind === "GROUP" && operator;
  caps.memberships = caps.institutionAuthority || user.canManageMemberships === true;
  caps.inviteLeaders = caps.institutionAuthority;
  caps.mfaVerified = user.mfaVerified === true;
  caps.standaloneDeputy = kind === "STANDALONE" && role === "CAMPUS_ADMIN";
  caps.improvementLead = role === "PRINCIPAL" || operator;
  caps.recordSearch = RECORD_SEARCH.includes(role);
  // Flagship 1 — AI Workflows (`/ai`): the School AI workspace gate (`assertSchoolAiAccess(user, "view")`).
  caps.schoolAi = (SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(role) && permissions.get("ai")?.canView === true;
  // Flagship 2 — Exam Studio (`/ai/studio`) for the academic roles, set below once the academic-lead seat is known;
  // a student's `schoolAiExams` is secure exam delivery ("My online exams", `/ai/exams`).
  caps.schoolAiExams = role === "STUDENT";
  // SKO-482: offer Record corrections only to roles with a correction domain they can use (mirrors corrections/service permit).
  caps.corrections = CORRECTION_ROLES.includes(role) || isCampusAdminRole(role);

  // Seats — one groupBy for campus staff; the group admin, families and the platform operator hold none.
  // When the seat lookup fails, assume every seat is held: operators then hold no fallback desk (fail closed).
  const campusStaff = CAMPUS_STAFF.includes(role) && Boolean(user.campusId);
  const seats = campusStaff
    ? await getCampusSeats(user.schoolId, user.campusId).catch((error: unknown) => {
      console.warn("[navigation] campus seats unavailable", { role, error: error instanceof Error ? error.message : String(error) });
      return ALL_SEATS;
    })
    : NO_SEATS;
  caps.hasCampusAdmin = seats.campusAdmin;
  caps.hasPrincipal = seats.principal;
  caps.hasAccountant = seats.accountant;
  caps.hasReceptionist = seats.receptionist;
  caps.hasLibrarian = seats.librarian;
  // A fallback desk exists only on a known campus: canLeadAcademics refuses an operator with no target campus
  // (scope.ts), so an unpinned operator holds no desk here either (§1.4 "same predicate that gates the API").
  const fallbackDesk = operator && campusStaff;
  caps.academicLead = role === "PRINCIPAL" || (fallbackDesk && !seats.principal);
  caps.financeDesk = role === "ACCOUNTANT" || (fallbackDesk && !seats.accountant);
  caps.frontDesk = role === "RECEPTIONIST" || (fallbackDesk && !seats.receptionist);
  caps.libraryDesk = role === "LIBRARIAN" || (fallbackDesk && !seats.librarian);
  // Exam Studio (addendum 2026-10-22): the principal and teachers, and a campus operator only while it is the academic
  // lead (no principal on the campus). Same gate as the page: School AI view and exams view.
  const examStudioSeat = role === "PRINCIPAL" || role === "TEACHER" || (operator && caps.academicLead);
  if (examStudioSeat) caps.schoolAiExams = caps.schoolAi && permissions.get("exams")?.canView === true;

  // Duties — operators run them on their campus; named staff only while the duty exists.
  const dutyStaff = DUTY_STAFF.includes(role);
  const [care, agent, trip, activity, plans, canteen, pickup, children] = await Promise.all([
    operator ? true : dutyStaff ? duty("careMember", user, () => careMember(user)) : false,
    operator ? true : dutyStaff ? duty("serviceAgent", user, () => serviceAgent(user)) : false,
    operator ? true : dutyStaff ? duty("tripToday", user, () => tripToday(user)) : false,
    operator ? true : dutyStaff ? duty("activityStaff", user, () => activityStaff(user)) : false,
    role === "TEACHER" || role === "STUDENT" || role === "PARENT" ? duty("accessPlans", user, () => accessPlans(user)) : false,
    CAMPUS_STAFF.includes(role) || role === "PARENT" || role === "STUDENT" ? duty("pkgCanteen", user, () => pkgCanteen(user)) : false,
    role === "PARENT" ? duty("pickupGuardian", user, async () => (await guardianChildren(user, "pickup")) > 0) : false,
    role === "PARENT" ? duty("multiChild", user, async () => (await guardianChildren(user, "any")) >= 2) : false,
  ]);
  caps.careMember = care;
  caps.serviceAgent = agent;
  caps.tripToday = trip;
  caps.activityStaff = activity;
  caps.accessPlans = plans;
  caps.pkgCanteen = canteen;
  caps.pickupGuardian = pickup;
  caps.multiChild = children;

  return caps;
}
