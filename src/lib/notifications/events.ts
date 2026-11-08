import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@prisma/client";
import { getInstitutionAuthorities, getSubscriptionOwners } from "@/lib/auth/institution-server";
import { defaultLocale, formatInstantDate, formatMoney, type LocalePackage } from "@/lib/locale/package";
import { getLocalePackage } from "@/lib/locale/store";

export interface NotificationEventPayload {
  schoolId: string;
  campusId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  [key: string]: unknown;
}

interface NotificationEventDef {
  title: (ctx: Record<string, unknown>) => string;
  message: (ctx: Record<string, unknown>) => string;
  icon: string;
  /**
   * Stored with the row for its most likely reader. Readers never follow it blindly: every list and open resolves
   * the link for that reader through `notificationHref` (src/lib/notifications/links.ts, G41b).
   */
  link?: string;
  recipients: (ctx: NotificationEventPayload) => Promise<string[]>;
  /** SKO-416: ACTION items need work in the source workflow; MENTION items are addressed to the reader. */
  category?: "UPDATE" | "MENTION" | "ACTION";
  /** The record the notification is about, so access is rechecked on open and the source can resolve it. */
  source?: (ctx: Record<string, unknown>) => { type: string; id: string } | null;
  dueAt?: (ctx: Record<string, unknown>) => Date | null;
}

// ─── Recipient directory (G41) ───────────────────────────
//
// Campus events go to the seat that acts on them, never to every leader: the group admin no longer hears about
// every class, mark and payment on every campus. Seats (§1.2, §2.6):
//   campus ops     = active CAMPUS_ADMIN / ADMIN pinned to the campus
//   academic lead  = the campus PRINCIPAL, else campus ops
//   finance desk   = the campus ACCOUNTANT, else campus ops
//   authority      = authorityRoleFor(kind) users (group admin / school admin), from institution-server.ts
//   payers         = getSubscriptionOwners (owner flag or authority-role purchase delegate)
// When a campus has no campus operator at all, the event reaches the institution authority as one
// de-duplicated "No campus admin at {campus}" notice instead (R-B3).
//
// The directory is injectable so the routing rules are unit-tested without a database (tests/notifications).

export interface RecipientDirectory {
  /** Active users with one of `roles` pinned to the campus. */
  campusUsers(schoolId: string, campusId: string, roles: UserRole[]): Promise<string[]>;
  /** Active users with one of `roles` anywhere in the school. */
  schoolUsers(schoolId: string, roles: UserRole[]): Promise<string[]>;
  authorities(schoolId: string): Promise<string[]>;
  subscriptionOwners(schoolId: string): Promise<string[]>;
  classTeachers(classId: string): Promise<string[]>;
  teachersOfClass(classId: string): Promise<string[]>;
  userRole(userId: string): Promise<string | null>;
  userName(userId: string): Promise<string | null>;
  campusName(schoolId: string, campusId: string): Promise<string | null>;
  /**
   * P9-02: before a new vacancy notice is sent, reopen this campus's vacancy rows that were resolved when an operator
   * was last appointed. Without it the (userId, dedupeKey) unique row stays resolved and the bump, which only touches
   * unresolved rows, drops every later vacancy on that campus. Optional so test directories can omit it.
   */
  reopenResolvedVacancy?(schoolId: string, campusId: string): Promise<void>;
  /** The effective locale package (currency, timezone) of a campus or, with no campus, the school (R7 money/dates). */
  localePackage?(schoolId: string, campusId: string | null): Promise<LocalePackage>;
}

const prismaDirectory: RecipientDirectory = {
  async campusUsers(schoolId, campusId, roles) {
    const users = await prisma.user.findMany({ where: { schoolId, campusId, isActive: true, role: { in: roles } }, select: { id: true } });
    return users.map((u) => u.id);
  },
  async schoolUsers(schoolId, roles) {
    const users = await prisma.user.findMany({ where: { schoolId, isActive: true, role: { in: roles } }, select: { id: true } });
    return users.map((u) => u.id);
  },
  async authorities(schoolId) {
    return (await getInstitutionAuthorities(schoolId)).map((u) => u.id);
  },
  async subscriptionOwners(schoolId) {
    return (await getSubscriptionOwners(schoolId)).map((u) => u.id);
  },
  async classTeachers(classId) {
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } });
    return cls?.classTeacherId ? [cls.classTeacherId] : [];
  },
  async teachersOfClass(classId) {
    const subjects = await prisma.subject.findMany({ where: { classId, teacherId: { not: null } }, select: { teacherId: true } });
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } });
    const ids = new Set<string>();
    for (const subject of subjects) if (subject.teacherId) ids.add(subject.teacherId);
    if (cls?.classTeacherId) ids.add(cls.classTeacherId);
    return Array.from(ids);
  },
  async userRole(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role ?? null;
  },
  async userName(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    return user?.fullName ?? null;
  },
  async campusName(schoolId, campusId) {
    const campus = await prisma.campus.findFirst({ where: { id: campusId, schoolId }, select: { name: true } });
    return campus?.name ?? null;
  },
  async reopenResolvedVacancy(schoolId, campusId) {
    await prisma.notification.updateMany({
      where: { schoolId, type: "CAMPUS_OPS_VACANT", sourceType: "campus", sourceId: campusId, resolvedAt: { not: null } },
      data: { resolvedAt: null, resolution: null },
    });
  },
  async localePackage(schoolId, campusId) {
    return getLocalePackage(schoolId, campusId);
  },
};

let directory: RecipientDirectory = prismaDirectory;

/** Delivers a follow-on notice (vacancy, paused plan) as its own event. Loaded lazily: in-app.ts imports this module. */
export type NoticeSender = (kind: string, payload: NotificationEventPayload) => Promise<void>;
let sendNotice: NoticeSender = async (kind, payload) => {
  const { deliverNotification } = await import("./in-app");
  await deliverNotification(kind, payload);
};

/** Test seam: swap the directory (and the follow-on notice sender); returns a restore function. */
export function useRecipientDirectory(next: RecipientDirectory, onNotice?: NoticeSender): () => void {
  const previous = directory;
  const previousNotice = sendNotice;
  directory = next;
  if (onNotice) sendNotice = onNotice;
  return () => { directory = previous; sendNotice = previousNotice; };
}

export const CAMPUS_OPERATOR_ROLES: UserRole[] = ["CAMPUS_ADMIN", "ADMIN"];
/** Leadership appointments the institution authority hears about (staff events for other roles stay on campus). */
export const LEADERSHIP_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]);
/** Roles whose leave the academic lead decides; everyone else's leave goes to the campus operator (§2.5). */
const TEACHING_ROLES = new Set(["TEACHER"]);

export type Seat = "ops" | "academic" | "finance";

const unique = (...lists: string[][]) => [...new Set(lists.flat())];

/** Active campus operators; an empty list on a known campus is a vacancy (§2.6). */
export async function getCampusOps(schoolId: string, campusId: string | null | undefined): Promise<string[]> {
  if (!campusId) return [];
  return directory.campusUsers(schoolId, campusId, CAMPUS_OPERATOR_ROLES);
}
/** PRINCIPAL on the campus, else campus ops. */
export async function getAcademicLead(schoolId: string, campusId: string | null | undefined): Promise<string[]> {
  if (!campusId) return [];
  const principals = await directory.campusUsers(schoolId, campusId, ["PRINCIPAL"]);
  return principals.length ? principals : getCampusOps(schoolId, campusId);
}
/** ACCOUNTANT on the campus, else campus ops. */
export async function getFinanceDesk(schoolId: string, campusId: string | null | undefined): Promise<string[]> {
  if (!campusId) return [];
  const accountants = await directory.campusUsers(schoolId, campusId, ["ACCOUNTANT"]);
  return accountants.length ? accountants : getCampusOps(schoolId, campusId);
}
/** The institution authority (group admin in a GROUP, school admin in a STANDALONE school). */
export async function getInstitutionAuthority(schoolId: string): Promise<string[]> {
  return directory.authorities(schoolId);
}
/** Payers only (canOwnSubscription). Empty when the school has no payer. */
export async function getPayers(schoolId: string): Promise<string[]> {
  return directory.subscriptionOwners(schoolId);
}

const SEATS: Record<Seat, (schoolId: string, campusId: string | null | undefined) => Promise<string[]>> = {
  ops: getCampusOps,
  academic: getAcademicLead,
  finance: getFinanceDesk,
};

/**
 * The seat for a campus event. An event with no campus is school-level and goes to the authority. A campus with
 * nobody in the seat (and no operator to fall back to) sends the authority one vacancy notice and returns [].
 */
async function seat(kind: string, which: Seat, c: NotificationEventPayload): Promise<string[]> {
  if (!c.campusId) return getInstitutionAuthority(c.schoolId);
  const ids = await SEATS[which](c.schoolId, c.campusId);
  if (ids.length) return ids;
  const def = NOTIFICATION_EVENTS[kind];
  const eventTitle = def ? def.title(c) : kind;
  try {
    const campusName = await directory.campusName(c.schoolId, c.campusId);
    // A new vacancy after an appointment reopens the campus's old row, so the notice is never swallowed (P9-02).
    await directory.reopenResolvedVacancy?.(c.schoolId, c.campusId);
    await sendNotice("CAMPUS_OPS_VACANT", { schoolId: c.schoolId, campusId: c.campusId, actorId: c.actorId ?? null, campusName, eventKind: kind, eventTitle });
  } catch (error) {
    console.error(`[notify] vacancy notice for ${kind} failed:`, error);
  }
  return [];
}

async function classTeachers(classId: unknown): Promise<string[]> {
  return typeof classId === "string" && classId ? directory.classTeachers(classId) : [];
}
async function teachersOfClass(classId: unknown): Promise<string[]> {
  return typeof classId === "string" && classId ? directory.teachersOfClass(classId) : [];
}

/** Academic lead + the class's teachers (class, subject, timetable, exam, marks and report events). */
const academic = (kind: string, teachers: "class" | "all" | "none" = "all") => async (c: NotificationEventPayload) => unique(
  await seat(kind, "academic", c),
  teachers === "class" ? await classTeachers(c.classId) : teachers === "all" ? await teachersOfClass(c.classId) : [],
);
/** Campus operations (+ class teachers): student records, promotion, check-in records, certificates. */
const operations = (kind: string, withClassTeachers = false) => async (c: NotificationEventPayload) => unique(
  await seat(kind, "ops", c),
  withClassTeachers ? await classTeachers(c.classId) : [],
);
/** The finance desk: fee setup, invoices and payments. */
const finance = (kind: string) => (c: NotificationEventPayload) => seat(kind, "finance", c);
/**
 * The role of the person a staffing event is about: `roleName`/`role` when the caller passed it, otherwise looked up
 * from the person's id (`staffId`, `userId` or `targetUserId`) — STAFF_REMOVED callers send only the name (P9-07).
 */
async function staffRoleOf(c: NotificationEventPayload): Promise<string | null> {
  if (typeof c.roleName === "string" && c.roleName) return c.roleName;
  if (typeof c.role === "string" && c.role) return c.role;
  const id = [c.staffId, c.userId, c.targetUserId].find((value): value is string => typeof value === "string" && value.length > 0);
  if (!id) return null;
  try { return await directory.userRole(id); } catch { return null; }
}
/** Campus ops, plus the authority only when the person is a campus leader (G41). */
const staffing = (kind: string) => async (c: NotificationEventPayload) => {
  const role = await staffRoleOf(c);
  return unique(await seat(kind, "ops", c), role && LEADERSHIP_ROLES.has(role) ? await getInstitutionAuthority(c.schoolId) : []);
};

// ─── Money and dates in stored copy (R7) ──────────────────
// Notification text is stored once, in English, and shown as stored (fixed sentences are translated on read). Money
// is never a raw minor-unit number and dates are never ISO timestamps: both go through the locale package. The
// currency and timezone come from the payload when the caller sends them, else from the campus/school locale package;
// deliverNotification builds the stored text from the payload after `recipients` resolves, so the lookup lives there.

async function withLocale(c: NotificationEventPayload): Promise<void> {
  if (typeof c.currency === "string" && typeof c.timezone === "string") return;
  try {
    const policy = await directory.localePackage?.(c.schoolId, c.campusId ?? null);
    if (!policy) return;
    if (typeof c.currency !== "string") c.currency = policy.currency;
    if (typeof c.timezone !== "string") c.timezone = policy.timezone;
  } catch (error) {
    console.error("[notify] locale lookup failed:", error);
  }
}
/** "PKR 5,000.00" from minor units and a currency; null when either is missing (the copy then omits the amount). */
export function moneyText(c: Record<string, unknown>): string | null {
  if (typeof c.amountLabel === "string" && c.amountLabel) return c.amountLabel;
  const minor = Number(c.amount);
  if (typeof c.currency !== "string" || c.amount === undefined || c.amount === null || !Number.isSafeInteger(minor)) return null;
  try { return formatMoney({ minor, currency: c.currency }, { ...defaultLocale, currency: c.currency as LocalePackage["currency"] }); } catch { return null; }
}
/** "22 October 2026" in the school's timezone; the raw value only when it is not a date. */
export function dateText(value: unknown, timezone: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  try {
    return formatInstantDate(value as string | Date, { ...defaultLocale, timezone: typeof timezone === "string" && timezone ? timezone : "UTC" });
  } catch {
    return String(value);
  }
}
/**
 * SUBSCRIPTION_SUSPENDED side notice: one plain, link-less line to every campus operator who is not a payer
 * (de-duplicated per user by its source key), so they know why actions are paused without a Billing link they
 * cannot use (R-I2).
 */
async function sendPausedNotice(c: NotificationEventPayload, payers: string[]): Promise<void> {
  try {
    const operators = await directory.schoolUsers(c.schoolId, CAMPUS_OPERATOR_ROLES);
    const paying = new Set(payers);
    const recipientIds = operators.filter((id) => !paying.has(id));
    if (recipientIds.length) await sendNotice("SUBSCRIPTION_PAUSED_NOTICE", { schoolId: c.schoolId, recipientIds });
  } catch (error) {
    console.error("[notify] paused-plan notice failed:", error);
  }
}

/** Every staff member on the campus (year and cycle changes). The group admin is not campus staff. */
async function campusStaff(c: NotificationEventPayload): Promise<string[]> {
  const roles: UserRole[] = ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"];
  return c.campusId ? directory.campusUsers(c.schoolId, c.campusId, roles) : directory.schoolUsers(c.schoolId, roles);
}

function s(val: unknown) {
  return String(val ?? "");
}

// ─── Event Registry ──────────────────────────────────────

export const NOTIFICATION_EVENTS: Record<string, NotificationEventDef> = {
  // ── Class Management ───────────────────────────────────
  CLASS_CREATED: {
    title: (c) => "New class created",
    message: (c) => `${s(c.actorName)} created class ${s(c.className)}${c.section ? ` - ${s(c.section)}` : ""}`,
    icon: "BookOpen",
    link: "/principal?view=classes",
    recipients: academic("CLASS_CREATED", "none"),
  },
  CLASS_UPDATED: {
    title: (c) => "Class updated",
    message: (c) => `${s(c.actorName)} updated class ${s(c.className)}`,
    icon: "BookOpen",
    link: "/principal?view=classes",
    recipients: academic("CLASS_UPDATED", "class"),
  },
  CLASS_DELETED: {
    title: (c) => "Class archived",
    message: (c) => `${s(c.actorName)} archived class ${s(c.className)}; its history is preserved`,
    icon: "BookOpen",
    link: "/principal?view=classes",
    recipients: academic("CLASS_DELETED", "none"),
  },

  // ── Student Management ─────────────────────────────────
  STUDENT_ADMITTED: {
    title: (c) => "New student enrolled",
    message: (c) => `${s(c.actorName)} enrolled ${s(c.studentName)} in ${s(c.className)}`,
    icon: "GraduationCap",
    link: "/admin?view=students",
    recipients: operations("STUDENT_ADMITTED", true),
  },
  STUDENT_TRANSFERRED: {
    title: (c) => "Student transferred",
    message: (c) => `${s(c.studentName)} transferred to ${s(c.newClassName)}`,
    icon: "GraduationCap",
    link: "/admin?view=students",
    recipients: async (c) => unique(
      await seat("STUDENT_TRANSFERRED", "ops", c),
      await classTeachers(c.oldClassId),
      await classTeachers(c.newClassId),
    ),
  },
  STUDENT_DELETED: {
    title: (c) => "Student archived",
    message: (c) => `${s(c.actorName)} archived student ${s(c.studentName)}; their history is preserved`,
    icon: "GraduationCap",
    link: "/admin?view=students",
    recipients: operations("STUDENT_DELETED", true),
  },

  // ── Teacher & Staff ────────────────────────────────────
  TEACHER_ADDED: {
    title: (c) => "New teacher added",
    message: (c) => `${s(c.actorName)} added teacher ${s(c.teacherName)}`,
    icon: "UserCheck",
    link: "/admin?view=teachers",
    recipients: staffing("TEACHER_ADDED"),
  },
  STAFF_ADDED: {
    title: (c) => "New staff added",
    message: (c) => `${s(c.actorName)} added ${s(c.roleName)} ${s(c.staffName)}`,
    icon: "UserCheck",
    link: "/admin?view=leadership",
    recipients: staffing("STAFF_ADDED"),
  },
  STAFF_INVITED: {
    title: (c) => "Staff invitation sent",
    message: (c) => `${s(c.actorName)} invited ${s(c.email)} as ${s(c.roleName)}`,
    icon: "Mail",
    link: "/admin?view=leadership",
    recipients: staffing("STAFF_INVITED"),
  },
  STAFF_REMOVED: {
    title: (c) => "Staff removed",
    message: (c) => `${s(c.actorName)} removed ${s(c.staffName)}`,
    icon: "UserCheck",
    link: "/admin?view=leadership",
    recipients: staffing("STAFF_REMOVED"),
  },
  INVITE_ACCEPTED: {
    title: (c) => "Invitation accepted",
    message: (c) => `${s(c.staffName)} accepted invitation as ${s(c.roleName)}`,
    icon: "UserCheck",
    link: "/admin?view=leadership",
    recipients: staffing("INVITE_ACCEPTED"),
  },

  // ── Attendance ─────────────────────────────────────────
  ATTENDANCE_SUBMITTED: {
    title: (c) => "Attendance submitted",
    message: (c) => `${s(c.actorName)} submitted attendance for ${s(c.className)} on ${s(c.date)}`,
    icon: "CalendarCheck",
    link: "/principal?view=attendance",
    recipients: academic("ATTENDANCE_SUBMITTED", "none"),
  },
  // SKO-405: one notice to guardians with attendance access when a recorded absence is corrected.
  ATTENDANCE_CORRECTED: {
    title: () => "Attendance corrected",
    message: (c) => `The school corrected ${s(c.studentName)}'s attendance for ${s(c.date)} to ${({ PRESENT: "present", LATE: "late", PARTIAL: "part day", EXCUSED: "excused absence", LEAVE: "leave", ABSENT: "absent" } as Record<string, string>)[String(c.status)] ?? s(c.status)}`,
    icon: "CalendarCheck",
    link: "/parent",
    recipients: async (c) => (Array.isArray(c.guardianIds) ? c.guardianIds.map(String) : []),
  },
  TEACHER_ATTENDANCE_MARKED: {
    title: (c) => "Teacher attendance marked",
    message: (c) => `Teacher attendance marked for ${s(c.date)}`,
    icon: "CalendarCheck",
    link: "/admin?view=attendance",
    recipients: operations("TEACHER_ATTENDANCE_MARKED"),
  },

  // ── Exams & Marks ──────────────────────────────────────
  EXAM_CREATED: {
    title: (c) => "New exam created",
    message: (c) => `${s(c.actorName)} created exam "${s(c.examTitle)}" for ${s(c.className)}`,
    icon: "FileText",
    link: "/principal?view=exam-cycles",
    recipients: academic("EXAM_CREATED"),
  },
  EXAM_STATUS_CHANGED: {
    title: (c) => "Exam status updated",
    message: (c) => `Exam "${s(c.examTitle)}" status changed to ${s(c.status)}`,
    icon: "FileText",
    link: "/principal?view=exam-cycles",
    recipients: academic("EXAM_STATUS_CHANGED"),
  },
  MARKS_ENTERED: {
    title: (c) => "Marks entered",
    message: (c) => `${s(c.actorName)} entered marks for ${s(c.examTitle)} — ${s(c.className)}`,
    icon: "Award",
    link: "/principal?view=exam-cycles",
    recipients: academic("MARKS_ENTERED", "class"),
  },
  EXAM_LOCKED: {
    title: (c) => "Exam locked",
    message: (c) => `${s(c.actorName)} locked exam "${s(c.examTitle)}" and generated report cards`,
    icon: "FileText",
    link: "/principal?view=exam-cycles",
    recipients: academic("EXAM_LOCKED"),
  },

  MARKS_REJECTED: {
    title: (c) => "Marks sent back for correction",
    message: (c) =>
      `${s(c.actorName)} returned the marks for "${s(c.examTitle)}" — ${s(c.className)}. Reason: ${s(c.reason)}`,
    icon: "AlertTriangle",
    link: "/teacher/marks",
    recipients: academic("MARKS_REJECTED"),
  },

  // ── Report Cards ───────────────────────────────────────
  REPORT_CARDS_GENERATED: {
    title: (c) => "Report cards generated",
    message: (c) => `Report cards generated for "${s(c.examTitle)}"`,
    icon: "FileText",
    link: "/principal?view=report-cards",
    recipients: academic("REPORT_CARDS_GENERATED", "none"),
  },
  REPORT_CARDS_REVIEWED: {
    title: (c) => "Report cards reviewed",
    message: (c) => `Report cards reviewed for "${s(c.examTitle)}"`,
    icon: "FileText",
    link: "/principal?view=report-cards",
    recipients: academic("REPORT_CARDS_REVIEWED", "class"),
  },
  REPORT_CARDS_PUBLISHED: {
    title: (c) => "Report cards published",
    message: (c) => `Report cards for "${s(c.examTitle)}" have been published`,
    icon: "Award",
    link: "/principal?view=report-cards",
    recipients: academic("REPORT_CARDS_PUBLISHED"),
  },

  // ── Fees ───────────────────────────────────────────────
  FEE_STRUCTURE_CREATED: {
    title: (c) => "Fee structure created",
    message: (c) => `${s(c.actorName)} created fee structure for ${s(c.className)}`,
    icon: "Receipt",
    link: "/accountant?view=fee-structures",
    recipients: finance("FEE_STRUCTURE_CREATED"),
  },
  FEE_STRUCTURE_UPDATED: {
    title: (c) => "Fee structure updated",
    message: (c) => `${s(c.actorName)} updated fee structure for ${s(c.className)}`,
    icon: "Receipt",
    link: "/accountant?view=fee-structures",
    recipients: finance("FEE_STRUCTURE_UPDATED"),
  },
  INVOICES_GENERATED: {
    title: (c) => "Invoices generated",
    message: (c) => `${s(c.count)} invoice${Number(c.count) !== 1 ? "s" : ""} generated for ${s(c.className)}`,
    icon: "Receipt",
    link: "/accountant?view=invoices",
    recipients: finance("INVOICES_GENERATED"),
  },
  PAYMENT_RECORDED: {
    title: (c) => "Payment recorded",
    // `amount` is in minor units (Payment.amount); never print it raw (R7, P9-11).
    message: (c) => {
      const amount = moneyText(c);
      return amount ? `Payment of ${amount} recorded for ${s(c.studentName)}` : `Payment recorded for ${s(c.studentName)}`;
    },
    icon: "Receipt",
    link: "/accountant?view=payments",
    recipients: async (c) => { await withLocale(c); return finance("PAYMENT_RECORDED")(c); },
  },

  // ── Timetable ──────────────────────────────────────────
  TIMETABLE_CREATED: {
    title: (c) => "Timetable created",
    message: (c) => `${s(c.actorName)} created timetable for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/principal?view=timetable",
    recipients: academic("TIMETABLE_CREATED", "none"),
  },
  // SKO-423: no evidence in the notice; the update is read after sign-in.
  FAMILY_DIGEST_READY: {
    title: () => "Weekly update ready",
    message: () => "Your child's weekly school update is ready to read.",
    icon: "Mail",
    link: "/parent",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-440: activity notices name no child; the activities card has the detail.
  ACTIVITY_PLACE_OFFERED: {
    title: () => "A place is available",
    message: () => "A waitlisted activity place is now offered to your child. Accept it before the offer expires.",
    icon: "Ticket",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  ACTIVITY_CANCELLED: {
    title: () => "Activity cancelled",
    message: () => "An activity your child had a place in was cancelled by the school.",
    icon: "CalendarX",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-438: pickup notices name no child or recipient; the pickup page has the detail.
  PICKUP_RELEASED: {
    title: () => "Pickup completed",
    message: () => "Your child was collected under a pickup authorization you issued.",
    icon: "ShieldCheck",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  PICKUP_EXCEPTION_REQUESTED: {
    title: () => "Pickup needs a lead decision",
    message: () => "A pickup could not be verified at the gate. The student is being kept supervised.",
    icon: "ShieldAlert",
    link: "/admin?view=pickup",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-428: a learner asked for teacher help with a study question; the question stays on the study desk.
  STUDY_HELP_REQUESTED: {
    title: () => "A learner asked for help",
    message: () => "A learner asked for your help with a study question.",
    icon: "HelpCircle",
    link: "/teacher/resources",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-441: service-desk notices name the reference only.
  SERVICE_REQUEST_ASSIGNED: {
    title: (c) => `Request assigned to you ${String(c.reference ?? "")}`.trim(),
    message: () => "A service request is now yours to handle.",
    icon: "Wrench",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_REQUEST_UPDATED: {
    title: (c) => `Request update ${String(c.reference ?? "")}`.trim(),
    message: () => "There is an update on a request you follow.",
    icon: "MessageSquare",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_REQUEST_RESOLVED: {
    title: (c) => `Request resolved ${String(c.reference ?? "")}`.trim(),
    message: () => "The work is done. Confirm it or reopen the request.",
    icon: "CheckCircle",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_REQUEST_REOPENED: {
    title: (c) => `Request reopened ${String(c.reference ?? "")}`.trim(),
    message: () => "A resolved request was reopened.",
    icon: "RotateCcw",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_REQUEST_COMMENT: {
    title: (c) => `Requester message ${String(c.reference ?? "")}`.trim(),
    message: () => "The requester added a message.",
    icon: "MessageSquare",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_REQUEST_ESCALATED: {
    title: (c) => `Request overdue ${String(c.reference ?? "")}`.trim(),
    message: () => "A service request passed its due time.",
    icon: "AlertTriangle",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SERVICE_SAFETY_REPORTED: {
    title: (c) => `Safety report ${String(c.reference ?? "")}`.trim(),
    message: () => "A safety concern was reported. Follow the school's escalation procedure.",
    icon: "ShieldAlert",
    link: "/service-desk",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-442: only the confirmed substitute hears about a handover; the class's teacher owns a recovery.
  COVER_HANDOVER_READY: {
    title: () => "Cover handover ready",
    message: () => "The lesson you are covering has a handover with its objective and resources.",
    icon: "ClipboardList",
    link: "/teacher/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  LESSON_RECOVERY_NEEDED: {
    title: () => "Missed learning to follow up",
    message: () => "A covered or uncovered lesson needs a catch-up decision.",
    icon: "RotateCcw",
    link: "/teacher/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-420: meeting notices carry no agenda, notes or child detail — the meeting page has those.
  MEETING_BOOKED: {
    title: () => "Meeting booked",
    message: () => "A family booked a meeting with you.",
    icon: "CalendarCheck",
    link: "/teacher/calendar",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_MOVED: {
    title: () => "Meeting moved",
    message: () => "A parent–teacher meeting has a new time.",
    icon: "CalendarClock",
    link: "/teacher/calendar",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_CANCELLED: {
    title: () => "Meeting cancelled",
    message: () => "A parent–teacher meeting was cancelled.",
    icon: "CalendarX",
    link: "/teacher/calendar",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_NEEDS_RESCHEDULE: {
    title: () => "Meeting needs a new time",
    message: () => "The teacher is no longer free at the booked time. A new time is needed.",
    icon: "CalendarX",
    link: "/teacher/calendar",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_REMINDER: {
    title: () => "Meeting soon",
    message: () => "You have a parent–teacher meeting within the next day.",
    icon: "Bell",
    link: "/teacher/calendar",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_MOVED_FAMILY: {
    title: () => "Meeting moved",
    message: () => "A parent–teacher meeting has a new time.",
    icon: "CalendarClock",
    link: "/parent/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_CANCELLED_FAMILY: {
    title: () => "Meeting cancelled",
    message: () => "A parent–teacher meeting was cancelled.",
    icon: "CalendarX",
    link: "/parent/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_NEEDS_RESCHEDULE_FAMILY: {
    title: () => "Meeting needs a new time",
    message: () => "The teacher is no longer free at the booked time. A new time is needed.",
    icon: "CalendarX",
    link: "/parent/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_REMINDER_FAMILY: {
    title: () => "Meeting soon",
    message: () => "You have a parent–teacher meeting within the next day.",
    icon: "Bell",
    link: "/parent/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  MEETING_FOLLOW_UP_SHARED: {
    title: () => "Meeting follow-up shared",
    message: () => "The teacher shared the meeting summary and agreed actions.",
    icon: "ListChecks",
    link: "/parent/timetable",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-437: names no child; the trip page shows the exception to its owner.
  TRANSPORT_EXCEPTION: {
    title: () => "Transport exception to resolve",
    message: () => "A trip has an exception assigned to you.",
    icon: "Bus",
    link: "/transport",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-439: confidential notices carry no student, case reference or narrative.
  SAFEGUARDING_CONCERN_RECEIVED: {
    title: () => "New concern to triage",
    message: () => "A safeguarding concern was recorded at your campus.",
    icon: "ShieldAlert",
    link: "/care",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SAFEGUARDING_CASE_ASSIGNED: {
    title: () => "Case assigned to you",
    message: () => "You are now the owner of a safeguarding case.",
    icon: "ShieldCheck",
    link: "/care",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  SAFEGUARDING_DISCLOSURE_REVIEW: {
    title: () => "Disclosure awaiting review",
    message: () => "A proposed disclosure needs a second lead's review.",
    icon: "ShieldQuestion",
    link: "/care",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  CONFIDENTIAL_EMERGENCY_ACCESS: {
    title: () => "Emergency access opened",
    message: () => "Emergency access to a confidential record was opened and needs your review.",
    icon: "ShieldAlert",
    link: "/care",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  CARE_MESSAGE_STAFF: {
    title: () => "Message from the school",
    message: () => "The school shared a message with you.",
    icon: "Mail",
    link: "/care",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  CARE_MESSAGE_FAMILY: {
    title: () => "Message from the school",
    message: () => "The school shared a message with you.",
    icon: "Mail",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-421: the family hears the outcome only; the reason and any note stay inside the request.
  LEARNER_LEAVE_DECIDED: {
    title: () => "Leave request answered",
    message: (c) => c.status === "APPROVED" ? "The school approved a leave request." : c.status === "DECLINED" ? "The school declined a leave request." : "The school asked for more detail on a leave request.",
    icon: "CalendarCheck",
    link: "/parent/attendance",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-403: sent once per published version, only to affected teachers and the class's families.
  TIMETABLE_CHANGED: {
    title: () => "Timetable updated",
    message: (c) => `The timetable for ${s(c.className)} changes from ${s(c.effectiveFrom)} (version ${s(c.version)}, ${s(c.changeCount)} lesson changes)`,
    icon: "LayoutGrid",
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-413: one notice per published datesheet version, to the affected classes' families and invigilators.
  EXAM_DATESHEET_PUBLISHED: {
    title: (c) => (c.first ? "Exam datesheet published" : "Exam datesheet changed"),
    message: (c) => c.first ? `${s(c.sessionTitle)} datesheet is published (version ${s(c.version)}).` : `${s(c.sessionTitle)} datesheet changed in version ${s(c.version)} (${s(c.changeCount)} change(s)).`,
    icon: "CalendarClock",
    source: (c) => ({ type: "datesheet-version", id: s(c.versionId) }),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  // SKO-500: the exam chain. Each names the paper (subject and grade) and its date, never a pupil.
  EXAM_SESSION_SCHEDULED: {
    title: () => "Exam session scheduled",
    message: (c) => `${s(c.sessionTitle)}: your subjects are on the date sheet. Papers will be requested by the exam office.`,
    icon: "CalendarClock",
    link: "/ai/studio",
    source: (c) => ({ type: "exam-session", id: s(c.sessionId) }),
    recipients: async (c) => [...new Set((await Promise.all((Array.isArray(c.classIds) ? c.classIds : []).map(teachersOfClass))).flat())],
  },
  EXAM_PAPER_REQUESTED: {
    title: (c) => `Paper requested: ${s(c.subjectName)} ${s(c.gradeName)}`,
    message: (c) => `${s(c.sessionTitle)}. Due ${s(c.dueOn)}. The brief is filled in from the office's request.`,
    icon: "FileText",
    link: "/ai/studio#space=brief",
    category: "ACTION",
    source: (c) => ({ type: "paper-slot", id: s(c.slotId) }),
    dueAt: (c) => (typeof c.dueOn === "string" ? new Date(`${c.dueOn}T23:59:59Z`) : null),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  EXAM_PAPER_DUE_SOON: {
    title: (c) => `Paper due ${s(c.dueOn)}: ${s(c.subjectName)} ${s(c.gradeName)}`,
    message: (c) => `The exam office is waiting for this paper for ${s(c.sessionTitle)}.`,
    icon: "CalendarClock",
    link: "/ai/studio#space=brief",
    category: "ACTION",
    source: (c) => ({ type: "paper-slot", id: s(c.slotId) }),
    dueAt: (c) => (typeof c.dueOn === "string" ? new Date(`${c.dueOn}T23:59:59Z`) : null),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  EXAM_PAPER_SUBMITTED: {
    title: (c) => `Paper to moderate: ${s(c.subjectName)} ${s(c.gradeName)}`,
    message: (c) => `${s(c.authorName)} sent the ${s(c.sessionTitle)} paper for review.`,
    icon: "FileText",
    link: "/ai/studio#space=brief",
    category: "ACTION",
    source: (c) => ({ type: "paper-slot", id: s(c.slotId) }),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  EXAM_PAPER_MODERATED: {
    title: (c) => `Paper moderated: ${s(c.subjectName)} ${s(c.gradeName)}`,
    message: (c) => `${s(c.moderatorName)} reviewed your ${s(c.sessionTitle)} paper.`,
    icon: "FileText",
    link: "/ai/studio#space=brief",
    source: (c) => ({ type: "paper-slot", id: s(c.slotId) }),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },
  TIMETABLE_PUBLISHED: {
    title: (c) => "Timetable published",
    message: (c) => `Timetable published for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/principal?view=timetable",
    recipients: academic("TIMETABLE_PUBLISHED"),
  },
  TIMETABLE_DELETED: {
    title: (c) => "Timetable deleted",
    message: (c) => `${s(c.actorName)} deleted timetable for ${s(c.className)}`,
    icon: "LayoutGrid",
    link: "/principal?view=timetable",
    recipients: academic("TIMETABLE_DELETED", "none"),
  },

  // ── Academic Year ──────────────────────────────────────
  ACADEMIC_YEAR_CLOSED: {
    title: (c) => "Academic year closed",
    message: (c) => `Academic year ${s(c.year)} has been closed`,
    icon: "Calendar",
    link: "/principal?view=year-cycle",
    recipients: campusStaff,
  },
  STUDENTS_PROMOTED: {
    title: (c) => "Students promoted",
    message: (c) => `${s(c.count)} student${Number(c.count) !== 1 ? "s" : ""} promoted to ${s(c.className)}`,
    icon: "GraduationCap",
    link: "/admin?view=promote-archive",
    recipients: operations("STUDENTS_PROMOTED", true),
  },
  ACADEMIC_CYCLE_CHANGED: {
    title: (c) => "Academic cycle updated",
    message: (c) => `Academic cycle "${s(c.label)}" is now ${s(c.status)}`,
    icon: "Calendar",
    link: "/principal?view=year-cycle",
    recipients: campusStaff,
  },

  // ── Subjects ───────────────────────────────────────────
  SUBJECT_CREATED: {
    title: (c) => "New subject created",
    message: (c) => `${s(c.actorName)} created subject "${s(c.subjectName)}" for ${s(c.className)}`,
    icon: "BookOpen",
    link: "/principal?view=classes",
    recipients: async (c) => unique(
      await academic("SUBJECT_CREATED", "class")(c),
      typeof c.teacherId === "string" && c.teacherId ? [c.teacherId] : [],
    ),
  },
  // ── Front desk ─────────────────────────────────────────
  // SKO-465: the callback owner is told once per callback; the note never travels in the notification.
  PHONE_CALLBACK_ASSIGNED: {
    title: () => "Callback assigned to you",
    message: (c) => `Return the call from ${s(c.callerName)} (assigned by ${s(c.actorName)})`,
    icon: "PhoneCall",
    link: "/receptionist?view=phone-calls",
    category: "ACTION",
    source: (c) => (c.callbackId ? { type: "callback", id: s(c.callbackId) } : null),
    dueAt: (c) => (c.dueAt ? new Date(s(c.dueAt)) : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // SKO-464: the accountable owner of a postal item until it is handed over.
  POSTAL_ASSIGNED: {
    title: () => "Postal item assigned to you",
    message: (c) => `${s(c.actorName)} made you responsible for handing over ${s(c.itemCode)}`,
    icon: "Mail",
    link: "/receptionist?view=postal",
    category: "ACTION",
    source: (c) => (c.postalId ? { type: "postal", id: s(c.postalId) } : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // SKO-469: a document requested by reception waits for a campus leader's approval.
  CERTIFICATE_APPROVAL_NEEDED: {
    title: () => "Document waiting for approval",
    message: (c) => `${s(c.actorName)} requested ${s(c.title)} (${s(c.serial)})`,
    icon: "FileText",
    link: "/admin?view=front-desk&tab=certificates",
    category: "ACTION",
    source: (c) => (c.issueId ? { type: "certificate", id: s(c.issueId) } : null),
    recipients: operations("CERTIFICATE_APPROVAL_NEEDED"),
  },
  // SKO-398: the admissions owner of an application, until it is enrolled, closed or handed on.
  ADMISSION_APPLICATION_ASSIGNED: {
    title: () => "Application assigned to you",
    message: (c) => `${s(c.actorName)} made you responsible for application ${s(c.reference)}`,
    icon: "ClipboardList",
    link: "/admin?view=admissions&tab=applications",
    category: "ACTION",
    source: (c) => (c.applicationId ? { type: "application", id: s(c.applicationId) } : null),
    recipients: async (c) => (c.ownerId ? [s(c.ownerId)] : []),
  },
  // ── Leave Management ───────────────────────────────────
  LEAVE_APPLIED: {
    title: () => "Leave request to review",
    message: (c) => `${s(c.actorName)} applied for ${s(c.leaveTypeName)} leave (${s(c.fromDate)} → ${s(c.toDate)})`,
    icon: "Plane",
    link: "/admin?view=leave",
    category: "ACTION",
    source: (c) => (c.leaveId ? { type: "leave", id: s(c.leaveId) } : null),
    // Due the day before the leave starts, so the reviewer decides before it begins.
    dueAt: (c) => (c.fromDate ? new Date(new Date(`${s(c.fromDate)}T00:00:00.000Z`).getTime() - 86_400_000) : null),
    // Teaching staff leave is decided by the academic lead; every other role's leave (principal included) by the
    // campus operator (§2.5).
    recipients: async (c) => {
      const role = typeof c.actorId === "string" && c.actorId ? await directory.userRole(c.actorId) : null;
      return seat("LEAVE_APPLIED", role && TEACHING_ROLES.has(role) ? "academic" : "ops", c);
    },
  },
  LEAVE_REVIEWED: {
    title: (c) => `Leave ${s(c.status).toLowerCase()}`,
    message: (c) => `Your ${s(c.leaveTypeName)} leave request (${s(c.fromDate)} → ${s(c.toDate)}) has been ${s(c.status).toLowerCase()} by ${s(c.actorName)}`,
    icon: "Plane",
    link: "/teacher/leave",
    recipients: async (c) => c.recipientId ? [c.recipientId as string] : [],
  },

  SUBJECT_TEACHER_ASSIGNED: {
    title: (c) => "Teacher assigned to subject",
    message: (c) => `${s(c.teacherName)} assigned to "${s(c.subjectName)}" in ${s(c.className)}`,
    icon: "UserCheck",
    link: "/principal?view=classes",
    recipients: async (c) => unique(
      await academic("SUBJECT_TEACHER_ASSIGNED", "none")(c),
      typeof c.teacherId === "string" && c.teacherId ? [c.teacherId] : [],
    ),
  },

  // ── Licensing / Subscription ───────────────────────────
  SUBSCRIPTION_EXPIRING: {
    title: (c) => "Subscription expiring",
    message: (c) =>
      `${s(c.plan)} plan paid period ended on ${dateText(c.planEndsAt, c.timezone)}. Renew within the grace period to keep the system running.`,
    icon: "CreditCard",
    link: "/billing",
    recipients: async (c) => { await withLocale(c); return getPayers(c.schoolId); },
  },
  SUBSCRIPTION_SUSPENDED: {
    title: (c) => "Subscription suspended",
    message: (c) =>
      `Your ${s(c.plan)} subscription was suspended — the paid period ended on ${dateText(c.planEndsAt, c.timezone)}. Renew it in Billing & plan to restore access.`,
    icon: "Lock",
    link: "/billing",
    // Payers get the renewal link. Campus operators who cannot pay get one plain notice instead (R-I2).
    recipients: async (c) => {
      await withLocale(c);
      const payers = await getPayers(c.schoolId);
      await sendPausedNotice(c, payers);
      return payers;
    },
  },
  // R-I2: the operators' side of a suspension. No link: there is nothing for them to do but wait.
  SUBSCRIPTION_PAUSED_NOTICE: {
    title: () => "School plan paused",
    message: () => "Some actions are paused while the school's plan is renewed.",
    icon: "PauseCircle",
    source: (c) => ({ type: "subscription-pause", id: s(c.schoolId) }),
    recipients: async (c) => (Array.isArray(c.recipientIds) ? c.recipientIds.map(String) : []),
  },

  // ── Revision 2 (§2.5, §2.6, §10.8) ─────────────────────
  // R-B3: a campus event found nobody in the campus-operator seat. One row per authority and campus; repeats bump it.
  CAMPUS_OPS_VACANT: {
    title: (c) => `No campus admin at ${s(c.campusName) || "a campus"}`,
    message: (c) => `No campus admin at ${s(c.campusName) || "a campus"}: ${s(c.eventTitle)}`,
    icon: "UserX",
    link: "/super?view=campuses",
    category: "ACTION",
    source: (c) => (c.campusId ? { type: "campus", id: s(c.campusId) } : null),
    recipients: (c) => getInstitutionAuthority(c.schoolId),
  },
  // R-B2: a payment or mark correction waits for its checker seat (PAYMENT → campus ops, MARK → academic lead).
  CORRECTION_REQUESTED: {
    title: () => "Correction waiting for approval",
    message: (c) => (c.correctionKind === "MARK" ? "A mark correction is waiting for your approval." : "A payment correction is waiting for your approval."),
    icon: "History",
    link: "/corrections",
    category: "ACTION",
    source: (c) => (c.correctionId ? { type: "correction", id: s(c.correctionId) } : null),
    recipients: (c) => seat("CORRECTION_REQUESTED", c.correctionKind === "MARK" ? "academic" : "ops", c),
  },
  // R-B4: SD3 audit trail — a maker decided their own request because no other checker holds the seat.
  SELF_APPROVED: {
    title: () => "Self-approved decision",
    message: (c) => `${s(c.actorName) || "A staff member"} approved their own ${SELF_APPROVAL_LABEL[s(c.approvalKind)] ?? "request"} because no other approver is available. Reason: ${s(c.reason)}`,
    icon: "ShieldAlert",
    source: (c) => (c.recordId ? { type: `self-approval:${s(c.approvalKind)}`, id: s(c.recordId) } : null),
    recipients: (c) => getInstitutionAuthority(c.schoolId),
  },
  // role-ux §4.4b (P8 `tax.requestSignOff`): the finance desk submitted a blocker-free tax package draft. Tax sign-off
  // is the institution authority's (C3): the group admin of a GROUP, the school admin of a single school. One ACTION
  // row per draft; a resubmission after an edit bumps it, and approving or withdrawing the draft resolves it.
  TAX_SIGNOFF_REQUESTED: {
    title: () => "Tax package waiting for your sign-off",
    message: () => "A tax package draft is ready for your sign-off. Review it in Approvals.",
    icon: "Receipt",
    link: "/super?view=approvals&tab=tax",
    category: "ACTION",
    source: (c) => (c.activationId ? { type: "tax-activation", id: s(c.activationId) } : null),
    recipients: (c) => getInstitutionAuthority(c.schoolId),
  },
};

const SELF_APPROVAL_LABEL: Record<string, string> = {
  finance: "fee adjustment",
  purchase: "purchase order",
  tax: "tax package",
  policy: "group policy",
};

// ─── Helpers for other packages (§10.8) ──────────────────
// Both are fire-and-forget: called after the caller's write commits, errors are logged and never thrown into it.

/** P8 (corrections/service.ts): a correction was requested; tell the checker seat for its kind. */
export async function notifyCorrectionRequested(input: { schoolId: string; campusId: string; correctionId: string; kind: "MARK" | "PAYMENT"; requesterId: string }): Promise<void> {
  try {
    const requesterName = await requesterNameOf(input.requesterId);
    await sendNotice("CORRECTION_REQUESTED", {
      schoolId: input.schoolId,
      campusId: input.campusId,
      actorId: input.requesterId,
      actorName: requesterName,
      correctionId: input.correctionId,
      correctionKind: input.kind,
    });
  } catch (error) {
    console.error("[notify] CORRECTION_REQUESTED failed:", error);
  }
}

/**
 * P8 (adjustments, tax), P6 (purchasing), P1 (group policy): an SD3 self-approval was recorded. The institution
 * authority sees it, unless the maker is the authority (nobody above them to tell).
 */
export async function notifySelfApproval(input: { schoolId: string; campusId: string | null; kind: "finance" | "purchase" | "tax" | "policy"; recordId: string; actorId: string; reason: string }): Promise<void> {
  try {
    const authorities = await getInstitutionAuthority(input.schoolId);
    if (authorities.includes(input.actorId)) return;
    const actorName = await requesterNameOf(input.actorId);
    await sendNotice("SELF_APPROVED", {
      schoolId: input.schoolId,
      campusId: input.campusId,
      actorId: input.actorId,
      actorName,
      approvalKind: input.kind,
      recordId: input.recordId,
      reason: input.reason,
    });
  } catch (error) {
    console.error("[notify] SELF_APPROVED failed:", error);
  }
}

async function requesterNameOf(userId: string): Promise<string | null> {
  try {
    return await directory.userName(userId);
  } catch {
    return null;
  }
}
