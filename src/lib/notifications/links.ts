/**
 * Where a notification takes its reader (§10.8, G41b). Pure and client-safe: no database, no server imports.
 *
 * A notification row stores one link for every recipient, but the recipients sit in different consoles: the same
 * "Marks sent back" notice reaches the teacher (`/teacher/marks`) and the academic lead (`/principal?view=exam-cycles`).
 * Before this file, 32 events linked every reader to `/admin`, which a principal, teacher or group admin cannot open.
 * Now the link is resolved for each reader, at read time, from the notification kind:
 *
 *   kind → intent (what the notice is about) → the reader's own console route for that intent
 *
 * The result is always a route the reader can open (role guard + registry view of their own console). Anything
 * else — an unknown kind, an intent their console has no screen for, a stored link into another console or into
 * a retired view — resolves to their home (`dashboardPathForRole`).
 */
import { isStandaloneOwner, type InstitutionKind } from "@/lib/auth/institution";
import { canAccessRoleDashboard, dashboardPathForRole, normalizeUserRole, roleGuardRedirect, type UserRole } from "@/lib/roles";
import { ROLE_NAV, consoleForRole, leaves, type ConsoleId } from "@/lib/navigation/role-nav";

/** `institutionKind` unknown fails closed (C32): only the owner flag in an authority role can stand in for it. */
export type NotificationViewer = { role: UserRole; institutionKind?: InstitutionKind; isInstitutionOwner?: boolean };
export type NotificationLinkContext = Record<string, string | null | undefined>;

/** What a notification is about. Each intent maps to at most one screen per console. */
export type NotificationIntent =
  | "classes" | "students" | "teachers" | "staff" | "attendance" | "exams" | "marks" | "report-cards"
  | "fee-setup" | "invoices" | "payments" | "timetable" | "datesheet" | "cover" | "academic-year" | "promotion"
  | "family-home" | "family-attendance" | "activities" | "pickup" | "study-help" | "service-desk" | "meetings"
  | "transport" | "care" | "phone-calls" | "postal" | "certificates" | "applications" | "leave-review" | "my-leave"
  | "billing" | "campus" | "corrections" | "self-approval" | "support-approvals" | "tax-signoff" | "home";

/** Every notification kind the product emits (events.ts plus the rows written directly by other services). */
export const NOTIFICATION_KIND_INTENT: Record<string, NotificationIntent> = {
  CLASS_CREATED: "classes", CLASS_UPDATED: "classes", CLASS_DELETED: "classes",
  SUBJECT_CREATED: "classes", SUBJECT_TEACHER_ASSIGNED: "classes",
  STUDENT_ADMITTED: "students", STUDENT_TRANSFERRED: "students", STUDENT_DELETED: "students",
  TEACHER_ADDED: "teachers",
  STAFF_ADDED: "staff", STAFF_INVITED: "staff", STAFF_REMOVED: "staff", INVITE_ACCEPTED: "staff",
  ATTENDANCE_SUBMITTED: "attendance", TEACHER_ATTENDANCE_MARKED: "attendance",
  ATTENDANCE_CORRECTED: "family-attendance", LEARNER_LEAVE_DECIDED: "family-attendance",
  EXAM_CREATED: "exams", EXAM_STATUS_CHANGED: "exams", EXAM_LOCKED: "exams",
  MARKS_ENTERED: "marks", MARKS_REJECTED: "marks",
  REPORT_CARDS_GENERATED: "report-cards", REPORT_CARDS_REVIEWED: "report-cards", REPORT_CARDS_PUBLISHED: "report-cards",
  FEE_STRUCTURE_CREATED: "fee-setup", FEE_STRUCTURE_UPDATED: "fee-setup",
  INVOICES_GENERATED: "invoices", PAYMENT_RECORDED: "payments",
  TIMETABLE_CREATED: "timetable", TIMETABLE_PUBLISHED: "timetable", TIMETABLE_DELETED: "timetable", TIMETABLE_CHANGED: "timetable",
  EXAM_DATESHEET_PUBLISHED: "datesheet",
  COVER_HANDOVER_READY: "cover", LESSON_RECOVERY_NEEDED: "cover",
  ACADEMIC_YEAR_CLOSED: "academic-year", ACADEMIC_CYCLE_CHANGED: "academic-year",
  STUDENTS_PROMOTED: "promotion",
  FAMILY_DIGEST_READY: "family-home", CARE_MESSAGE_FAMILY: "family-home",
  ACTIVITY_PLACE_OFFERED: "activities", ACTIVITY_CANCELLED: "activities",
  PICKUP_RELEASED: "pickup", PICKUP_EXCEPTION_REQUESTED: "pickup",
  STUDY_HELP_REQUESTED: "study-help",
  SERVICE_REQUEST_ASSIGNED: "service-desk", SERVICE_REQUEST_UPDATED: "service-desk", SERVICE_REQUEST_RESOLVED: "service-desk",
  SERVICE_REQUEST_REOPENED: "service-desk", SERVICE_REQUEST_COMMENT: "service-desk", SERVICE_REQUEST_ESCALATED: "service-desk",
  SERVICE_SAFETY_REPORTED: "service-desk",
  MEETING_BOOKED: "meetings", MEETING_MOVED: "meetings", MEETING_CANCELLED: "meetings", MEETING_NEEDS_RESCHEDULE: "meetings",
  MEETING_REMINDER: "meetings", MEETING_MOVED_FAMILY: "meetings", MEETING_CANCELLED_FAMILY: "meetings",
  MEETING_NEEDS_RESCHEDULE_FAMILY: "meetings", MEETING_REMINDER_FAMILY: "meetings", MEETING_FOLLOW_UP_SHARED: "meetings",
  TRANSPORT_EXCEPTION: "transport",
  SAFEGUARDING_CONCERN_RECEIVED: "care", SAFEGUARDING_CASE_ASSIGNED: "care", SAFEGUARDING_DISCLOSURE_REVIEW: "care",
  CONFIDENTIAL_EMERGENCY_ACCESS: "care", CARE_MESSAGE_STAFF: "care",
  PHONE_CALLBACK_ASSIGNED: "phone-calls", POSTAL_ASSIGNED: "postal",
  CERTIFICATE_APPROVAL_NEEDED: "certificates", ADMISSION_APPLICATION_ASSIGNED: "applications",
  LEAVE_APPLIED: "leave-review", LEAVE_REVIEWED: "my-leave",
  SUBSCRIPTION_EXPIRING: "billing", SUBSCRIPTION_SUSPENDED: "billing",
  // Revision 2 (G41): operators who are not payers get a link-less notice; the authority hears about a vacant seat.
  SUBSCRIPTION_PAUSED_NOTICE: "home",
  CAMPUS_OPS_VACANT: "campus",
  CORRECTION_REQUESTED: "corrections",
  SELF_APPROVED: "self-approval",
  TAX_SIGNOFF_REQUESTED: "tax-signoff",
  // Written directly by other services (not through NOTIFICATION_EVENTS).
  support_access_request: "support-approvals", support_emergency_review: "support-approvals",
};

/**
 * Kinds whose stored title is a fixed sentence (no names, references or amounts), so the notification centre can
 * show it in the reader's language (F27). Every one has AR/UR in src/lib/locale/role-ux/p9-messages.ts; the
 * notifications test keeps this list in step with events.ts.
 */
export const NOTIFICATION_FIXED_TITLE_KINDS: ReadonlySet<string> = new Set([
  "CLASS_CREATED", "CLASS_UPDATED", "CLASS_DELETED", "STUDENT_ADMITTED", "STUDENT_TRANSFERRED", "STUDENT_DELETED",
  "TEACHER_ADDED", "STAFF_ADDED", "STAFF_INVITED", "STAFF_REMOVED", "INVITE_ACCEPTED", "ATTENDANCE_SUBMITTED",
  "ATTENDANCE_CORRECTED", "TEACHER_ATTENDANCE_MARKED", "EXAM_CREATED", "EXAM_STATUS_CHANGED", "MARKS_ENTERED",
  "EXAM_LOCKED", "MARKS_REJECTED", "REPORT_CARDS_GENERATED", "REPORT_CARDS_REVIEWED", "REPORT_CARDS_PUBLISHED",
  "FEE_STRUCTURE_CREATED", "FEE_STRUCTURE_UPDATED", "INVOICES_GENERATED", "PAYMENT_RECORDED", "TIMETABLE_CREATED",
  "FAMILY_DIGEST_READY", "ACTIVITY_PLACE_OFFERED", "ACTIVITY_CANCELLED", "PICKUP_RELEASED", "PICKUP_EXCEPTION_REQUESTED",
  "STUDY_HELP_REQUESTED", "COVER_HANDOVER_READY", "LESSON_RECOVERY_NEEDED", "MEETING_BOOKED", "MEETING_MOVED",
  "MEETING_CANCELLED", "MEETING_NEEDS_RESCHEDULE", "MEETING_REMINDER", "MEETING_MOVED_FAMILY", "MEETING_CANCELLED_FAMILY",
  "MEETING_NEEDS_RESCHEDULE_FAMILY", "MEETING_REMINDER_FAMILY", "MEETING_FOLLOW_UP_SHARED", "TRANSPORT_EXCEPTION",
  "SAFEGUARDING_CONCERN_RECEIVED", "SAFEGUARDING_CASE_ASSIGNED", "SAFEGUARDING_DISCLOSURE_REVIEW",
  "CONFIDENTIAL_EMERGENCY_ACCESS", "CARE_MESSAGE_STAFF", "CARE_MESSAGE_FAMILY", "LEARNER_LEAVE_DECIDED",
  "TIMETABLE_CHANGED", "EXAM_DATESHEET_PUBLISHED", "TIMETABLE_PUBLISHED", "TIMETABLE_DELETED", "ACADEMIC_YEAR_CLOSED",
  "STUDENTS_PROMOTED", "ACADEMIC_CYCLE_CHANGED", "SUBJECT_CREATED", "PHONE_CALLBACK_ASSIGNED", "POSTAL_ASSIGNED",
  "CERTIFICATE_APPROVAL_NEEDED", "ADMISSION_APPLICATION_ASSIGNED", "LEAVE_APPLIED", "LEAVE_REVIEWED",
  "SUBJECT_TEACHER_ASSIGNED", "SUBSCRIPTION_EXPIRING", "SUBSCRIPTION_SUSPENDED", "SUBSCRIPTION_PAUSED_NOTICE",
  "CORRECTION_REQUESTED", "SELF_APPROVED", "TAX_SIGNOFF_REQUESTED",
]);
/** Kinds whose stored message is a fixed sentence too (most messages name a person, class or amount). */
export const NOTIFICATION_FIXED_MESSAGE_KINDS: ReadonlySet<string> = new Set([
  "FAMILY_DIGEST_READY", "ACTIVITY_PLACE_OFFERED", "ACTIVITY_CANCELLED", "PICKUP_RELEASED", "PICKUP_EXCEPTION_REQUESTED",
  "STUDY_HELP_REQUESTED", "SERVICE_REQUEST_ASSIGNED", "SERVICE_REQUEST_UPDATED", "SERVICE_REQUEST_RESOLVED",
  "SERVICE_REQUEST_REOPENED", "SERVICE_REQUEST_COMMENT", "SERVICE_REQUEST_ESCALATED", "SERVICE_SAFETY_REPORTED",
  "COVER_HANDOVER_READY", "LESSON_RECOVERY_NEEDED", "MEETING_BOOKED", "MEETING_MOVED", "MEETING_CANCELLED",
  "MEETING_NEEDS_RESCHEDULE", "MEETING_REMINDER", "MEETING_MOVED_FAMILY", "MEETING_CANCELLED_FAMILY",
  "MEETING_NEEDS_RESCHEDULE_FAMILY", "MEETING_REMINDER_FAMILY", "MEETING_FOLLOW_UP_SHARED", "TRANSPORT_EXCEPTION",
  "SAFEGUARDING_CONCERN_RECEIVED", "SAFEGUARDING_CASE_ASSIGNED", "SAFEGUARDING_DISCLOSURE_REVIEW",
  "CONFIDENTIAL_EMERGENCY_ACCESS", "CARE_MESSAGE_STAFF", "CARE_MESSAGE_FAMILY", "LEARNER_LEAVE_DECIDED",
  "SUBSCRIPTION_PAUSED_NOTICE", "CORRECTION_REQUESTED", "TAX_SIGNOFF_REQUESTED",
]);
/** Plain notices: nothing to open (the paused-plan line for operators who cannot renew, R-I2). */
export const NOTIFICATION_NOTICE_ONLY_KINDS: ReadonlySet<string> = new Set(["SUBSCRIPTION_PAUSED_NOTICE"]);

type Target = string | ((ctx: NotificationLinkContext, viewer: NotificationViewer) => string | null);

/** `${base}?view=…&tab=…&extra…` with URLSearchParams (never string concatenation of values). */
function view(console: ConsoleId, viewId: string, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams({ view: viewId });
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `${ROLE_NAV[console].base}?${query.toString()}`;
}
function path(pathname: string, params: Record<string, string | null | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${pathname}?${text}` : pathname;
}

const correctionKind = (ctx: NotificationLinkContext): "MARK" | "PAYMENT" | null => {
  const direct = ctx.kind ?? ctx.correctionKind;
  if (direct === "MARK" || direct === "PAYMENT") return direct;
  if (ctx.link) {
    const fromLink = new URL(ctx.link, "https://skoolee.invalid").searchParams.get("kind");
    if (fromLink === "MARK" || fromLink === "PAYMENT") return fromLink;
  }
  return null;
};
const campusOf = (ctx: NotificationLinkContext) => ctx.campusId ?? (ctx.sourceType === "campus" ? ctx.sourceId : null) ?? null;
/**
 * The school admin of a single school wears the institution hat inside /admin (§0.3 rule 3); a campus admin does not.
 * An ADMIN whose kind is unknown is NOT treated as the owner (C32, P9-10): no billing, approvals or school links.
 */
const schoolAdmin = (viewer: NotificationViewer) => isStandaloneOwner(viewer);
const STAFF: ConsoleId[] = ["super", "admin", "principal", "teacher", "accountant", "receptionist", "librarian"];
const forConsoles = (consoles: ConsoleId[], target: Target): Partial<Record<ConsoleId, Target>> =>
  Object.fromEntries(consoles.map((id) => [id, target]));

/** The screen for each intent, per console. A console missing from an intent sends the reader home. */
const TARGETS: Record<NotificationIntent, Partial<Record<ConsoleId, Target>>> = {
  classes: { admin: view("admin", "classes"), principal: view("principal", "classes"), teacher: "/teacher/classes" },
  students: {
    admin: (c) => view("admin", "students", { student: c.studentId }),
    principal: (c) => view("principal", "students", { student: c.studentId }),
    teacher: "/teacher/students",
  },
  teachers: { admin: view("admin", "teachers"), principal: view("principal", "teachers") },
  staff: { admin: view("admin", "leadership"), super: view("super", "access", { tab: "leadership" }), principal: view("principal", "teachers") },
  attendance: {
    admin: view("admin", "attendance"), principal: view("principal", "attendance"), teacher: "/teacher/attendance",
    parent: "/parent/attendance", student: "/student/attendance",
  },
  exams: {
    admin: view("admin", "exam-cycles"), principal: view("principal", "exam-cycles"), teacher: "/teacher/tests",
    parent: "/parent/timetable", student: "/student/timetable",
  },
  marks: { admin: view("admin", "exam-cycles"), principal: view("principal", "exam-cycles"), teacher: "/teacher/marks" },
  "report-cards": {
    admin: (c) => view("admin", "report-cards", { exam: c.examId }),
    principal: (c) => view("principal", "report-cards", { exam: c.examId }),
    teacher: "/teacher/reports", parent: "/parent/results", student: "/student/reports",
  },
  "fee-setup": { accountant: view("accountant", "fee-structures"), admin: view("admin", "fees") },
  invoices: { accountant: view("accountant", "invoices"), admin: view("admin", "fees"), parent: "/parent/fees", student: "/student/fees" },
  payments: { accountant: view("accountant", "payments"), admin: view("admin", "fees"), parent: "/parent/fees", student: "/student/fees" },
  timetable: {
    admin: view("admin", "timetable"), principal: view("principal", "timetable"), teacher: "/teacher/timetable",
    parent: "/parent/timetable", student: "/student/timetable",
  },
  datesheet: {
    admin: view("admin", "exam-cycles"), principal: view("principal", "exam-cycles"), teacher: "/teacher/timetable",
    parent: "/parent/timetable", student: "/student/timetable",
  },
  cover: { teacher: "/teacher/timetable", principal: view("principal", "timetable"), admin: view("admin", "timetable") },
  "academic-year": { admin: view("admin", "year-cycle"), principal: view("principal", "year-cycle") },
  promotion: { admin: view("admin", "promote-archive"), principal: view("principal", "promote-archive"), teacher: "/teacher/students" },
  "family-home": { parent: "/parent", student: "/student" },
  "family-attendance": { parent: "/parent/attendance", student: "/student/attendance" },
  activities: { parent: "/parent/activities", ...forConsoles(["admin", "teacher", "accountant", "receptionist", "librarian", "principal"], "/activities") },
  pickup: { admin: view("admin", "pickup"), receptionist: view("receptionist", "pickup"), parent: "/parent/pickup" },
  "study-help": { teacher: "/teacher/resources" },
  "service-desk": forConsoles(STAFF, "/service-desk"),
  meetings: { teacher: "/teacher/calendar", parent: "/parent/meetings" },
  transport: { ...forConsoles(["admin", "teacher", "accountant", "receptionist", "librarian"], "/transport"), parent: "/parent/pickup" },
  care: forConsoles(["admin", "principal", "teacher", "accountant", "receptionist", "librarian"], "/care"),
  "phone-calls": { receptionist: view("receptionist", "phone-calls"), admin: view("admin", "front-desk", { tab: "calls" }) },
  postal: { receptionist: view("receptionist", "postal"), admin: view("admin", "front-desk", { tab: "post" }) },
  certificates: { receptionist: view("receptionist", "certificates"), admin: view("admin", "front-desk", { tab: "certificates" }) },
  applications: {
    receptionist: view("receptionist", "admissions", { tab: "applications" }),
    admin: view("admin", "admissions", { tab: "applications" }),
  },
  "leave-review": { admin: view("admin", "leave"), principal: view("principal", "leave") },
  "my-leave": {
    teacher: "/teacher/leave", principal: view("principal", "my-leave"), accountant: view("accountant", "my-leave"),
    receptionist: view("receptionist", "my-leave"), librarian: view("librarian", "my-leave"),
  },
  // The /billing resolver sends a payer to their own Billing & plan and explains to anyone else who pays (§6.2).
  // Only the authority roles hold a subscription; a campus admin of a group lands home.
  billing: {
    super: "/billing",
    admin: (_c, viewer) => (schoolAdmin(viewer) ? "/billing" : null),
  },
  campus: { super: (c) => view("super", "campuses", { campus: campusOf(c) }) },
  corrections: forConsoles(["admin", "principal", "teacher", "accountant", "parent", "student"], (c) => path("/corrections", { kind: correctionKind(c) })),
  "self-approval": {
    super: (c) => c.approvalKind === "tax" ? view("super", "approvals", { tab: "tax" })
      : c.approvalKind === "policy" ? view("super", "standards", { tab: "policies" })
      : view("super", "campuses", { campus: campusOf(c) }),
    admin: (c, viewer) => !schoolAdmin(viewer) ? null
      : c.approvalKind === "tax" ? view("admin", "approvals", { tab: "tax" })
      : c.approvalKind === "purchase" ? view("admin", "inventory")
      : c.approvalKind === "finance" ? view("admin", "fees")
      : null,
  },
  "support-approvals": {
    super: view("super", "approvals", { tab: "support" }),
    admin: (_c, viewer) => (schoolAdmin(viewer) ? view("admin", "approvals", { tab: "support" }) : null),
  },
  // Tax sign-off is the institution authority's (C3); a campus admin of a group, or an ADMIN of unknown kind, lands home.
  "tax-signoff": {
    super: view("super", "approvals", { tab: "tax" }),
    admin: (_c, viewer) => (schoolAdmin(viewer) ? view("admin", "approvals", { tab: "tax" }) : null),
  },
  home: {},
};

const liveViewCache = new Map<ConsoleId, Set<string>>();
/** Registry views a console can open: its leaves and aliases. Retired views only land on the landing with a notice. */
function liveViews(id: ConsoleId): Set<string> {
  let views = liveViewCache.get(id);
  if (!views) {
    const nav = ROLE_NAV[id];
    views = new Set([...leaves(nav).flatMap((l) => ("view" in l.target ? [l.target.view] : [])), ...Object.keys(nav.aliases)]);
    liveViewCache.set(id, views);
  }
  return views;
}

/**
 * True when `href` is a route this role can open: the proxy role guard lets it through, the console check admits
 * it, and — on the reader's own `?view=` console — the view is a live registry view. Exported for tests and for
 * search / job links that make the same promise.
 */
export function canOpenHref(role: UserRole, href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const url = new URL(href, "https://skoolee.invalid");
  if (roleGuardRedirect(role, url.pathname) !== null) return false;
  if (!canAccessRoleDashboard(role, url.pathname)) return false;
  const id = consoleForRole(role);
  const nav = ROLE_NAV[id];
  if (nav.mode === "view" && url.pathname === nav.base) {
    const viewId = url.searchParams.get("view");
    if (viewId && !liveViews(id).has(viewId)) return false;
  }
  return true;
}

/** The intent for a kind, or null for a kind this file does not know. */
export function notificationIntent(kind: string): NotificationIntent | null {
  return NOTIFICATION_KIND_INTENT[kind] ?? null;
}

/**
 * The reader's own route for a notification (§10.8). `ctx` carries what the row knows: the stored `link`,
 * `sourceType`/`sourceId`, and optional `campusId`, `studentId`, `examId`, `kind` (MARK | PAYMENT) and
 * `approvalKind` (finance | purchase | tax | policy). Never returns a console the role cannot open.
 */
export function notificationHref(viewer: NotificationViewer, kind: string, ctx: NotificationLinkContext = {}): string {
  const role = normalizeUserRole(viewer.role);
  if (!role) return "/login";
  const home = dashboardPathForRole(role);
  const intent = notificationIntent(kind);
  if (intent) {
    const target = TARGETS[intent][consoleForRole(role)];
    const href = typeof target === "function" ? target(ctx, { ...viewer, role }) : target;
    if (href && canOpenHref(role, href)) return href;
    // A known kind with no screen in this console: home, never the stored link (it was written for someone else).
    return home;
  }
  // Unknown kinds (rows written directly by other services) keep their stored link when this reader can open it.
  if (ctx.link && canOpenHref(role, ctx.link)) return ctx.link;
  return home;
}
