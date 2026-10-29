/**
 * The navigation registry (SPEC §3, verbatim). One declarative tree per console; RoleShell, the mobile bar,
 * the legacy redirects, the spotlight tour and the tests all read it. Pure: no React state, no server imports.
 * Visibility is presentation only — every API keeps its own server gate.
 *
 * Addendum 2026-10-22: the generic "AI assistant" rows give way to the two flagship leaves (`aiWorkflows()`,
 * `examStudio()`, `flagship: true`) placed directly after the landing leaf; the old in-console `ai` views stay valid
 * as `hiddenInNav` leaves. The flagship pair does not count toward the ten-row budget (tests/navigation/role-nav.test.ts).
 */
import type { LucideIcon } from "lucide-react";
import {
  Accessibility, Archive, ArrowRightLeft, Award, BadgeCheck, Banknote, BarChart3, BedDouble, BookCopy, BookOpen, Building2,
  Bus, CalendarCheck, CalendarClock, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, Clock, Compass, ConciergeBell,
  Contact, CreditCard, Crown, DollarSign, DoorOpen, FileCheck2, FileText, FlaskConical, FolderOpen, Gauge, GraduationCap,
  HeartHandshake, History, House, Inbox, Landmark, Layers, LayoutDashboard, LayoutGrid, Library, Lightbulb, Lock, Mail,
  MessageCircle, MessageSquareWarning, MonitorCheck, Network, Package, PenLine, PhoneCall, Plane, Receipt, ScanLine, Scale,
  School, ScrollText, Send, Settings, Shield, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Tag, Target, Trophy, UserCheck,
  UserPlus, Users, UsersRound, UtensilsCrossed, Wallet, WalletCards, Wand2, Wrench,
} from "lucide-react";
import type { PermissionModule } from "@/lib/permissions";
import type { UserRole } from "@/lib/roles";
import type { CapabilityKey } from "@/lib/navigation/capability-keys";

export type ConsoleId = "owner" | "super" | "admin" | "principal" | "teacher" | "accountant" | "receptionist" | "librarian" | "parent" | "student";
export type AccessKey = PermissionModule | CapabilityKey;
export type Tier = "D" | "W" | "T" | "R";

/** Declarative visibility. Omitted = always visible. All present clauses must hold. */
export interface Visibility {
  module?: PermissionModule;   // permission-matrix canView for the caller's role
  all?: AccessKey[];           // every key true
  any?: AccessKey[];           // at least one key true
  none?: AccessKey[];          // hidden if any key true
}
export type ViewTarget = { view: string; tab?: string };
export type NavTarget = ViewTarget | { href: string };

export interface NavLeaf {
  kind: "leaf";
  id: string;                         // stable kebab id → data-tour="shell.nav.<id>"; never derived from translated text
  label: string;                      // EN UI key, translated by useUiText()
  labelWhen?: { key: AccessKey; label: string }[]; // first key that is true wins
  icon: LucideIcon;
  target: NavTarget;
  group?: string;                     // id of the enclosing group (set by group()); undefined at top level
  activePaths?: string[];             // extra pathnames that mark the leaf active (path consoles, frames)
  visible?: Visibility;
  deniedReason?: string;              // AccessNotice copy when the view is opened by URL without access
  hiddenInNav?: boolean;              // allowed + fenced view without a sidebar row
  mobile?: 1 | 2 | 3 | 4;
  mobileLabel?: string;               // shorter EN UI key for the phone bar ("Requests"); the sidebar keeps `label`
  mobileVisible?: Visibility;         // extra clause for the `mobile` slot only (the sidebar row is unaffected)
  mobileWhen?: { key: AccessKey; slot: 1 | 2 | 3 | 4 }; // takes `slot` on the phone bar while `key` is true
  badge?: "approvals" | "queue";      // number from GET /api/navigation/counts
  summary?: string;                   // PageHeader description (EN UI key)
  flagship?: true;                    // a flagship surface (AI Workflows, Exam Studio): placed right after Today, never under More; RoleSidebar adds the FlagshipChip
  tier: Tier;
  tourAnchor: string;                 // `shell.nav.${id}`
}
export interface NavGroup {
  kind: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  zone: "primary" | "more" | "owner" | "settings";
  visible?: Visibility;
  collapsed?: boolean;                // default true unless it holds the active leaf
  children: NavLeaf[];
  tourAnchor: string;                 // `shell.nav-group.${id}`
}
export type NavEntry = NavLeaf | NavGroup;

export interface ConsoleNav {
  id: ConsoleId;
  base: string;                       // console landing path
  mode: "view" | "path";              // ?view= workspaces vs one route per page
  defaultView?: string;               // view consoles only
  eyebrow: string;
  eyebrowWhen?: { key: AccessKey; label: string }[];
  entries: NavEntry[];
  accountMenu: NavLeaf[];             // rendered in RoleHeader's account menu (e.g. My leave)
  aliases: Record<string, ViewTarget>;  // old ?view= → new (bookmarks, notifications, tests)
  retired: Record<string, string>;    // removed ?view= → notice shown on the landing view
  recordSearch: boolean;              // console allows the sidebar "Search records" link (AND access.recordSearch)
}

const v = (view: string, tab?: string): ViewTarget => (tab ? { view, tab } : { view });
const h = (href: string): NavTarget => ({ href });
type LeafOpts = Partial<Omit<NavLeaf, "kind" | "id" | "label" | "icon" | "target" | "tourAnchor" | "group">>;
function leaf(id: string, label: string, icon: LucideIcon, target: NavTarget, o: LeafOpts = {}): NavLeaf {
  return { kind: "leaf", id, label, icon, target, tier: o.tier ?? "W", tourAnchor: `shell.nav.${id}`, ...o };
}
function group(id: string, label: string, icon: LucideIcon, zone: NavGroup["zone"], children: NavLeaf[], visible?: Visibility): NavGroup {
  return { kind: "group", id, label, icon, zone, visible, collapsed: true, children: children.map((c) => ({ ...c, group: id })), tourAnchor: `shell.nav-group.${id}` };
}
const myLeave = (target: NavTarget) => leaf("my-leave", "My leave", Plane, target, { tier: "R", visible: { module: "leave" }, summary: "Apply for leave and track your requests." });
const messages = (mobile?: 1 | 2 | 3 | 4) => leaf("messages", "Messages", MessageCircle, h("/messages"), { tier: "D", mobile });
/**
 * The two flagship surfaces (addendum 2026-10-22). They replace the generic "AI assistant" row wherever the role may
 * use them and sit directly after the landing leaf, never under More.
 * - AI Workflows (`/ai`): the School AI workspace — the setup questionnaire that drafts the school's launch plan,
 *   and the reviewed operational runs. SUPER_ADMIN, standalone ADMIN, CAMPUS_ADMIN and PRINCIPAL; `schoolAi` is the
 *   page gate (`assertSchoolAiAccess`: a School AI staff role with the `ai` module).
 * - Exam Studio (`/ai/studio`): AI-built assessments, secure delivery, marking and learning recovery. PRINCIPAL,
 *   TEACHER, and a campus operator only while it is the academic lead; `schoolAiExams` is the page gate for those
 *   roles (School AI view and `exams` view).
 */
const aiWorkflows = (vis: Visibility = { module: "ai", all: ["schoolAi"] }) => leaf("ai-workflows", "AI Workflows", Sparkles, h("/ai"), { tier: "D", flagship: true, visible: vis, summary: "Describe the result you need. AI executes the actions your role permits and asks for missing details." });
const examStudio = (vis: Visibility = { all: ["schoolAiExams"] }) => leaf("exam-studio", "Exam Studio", Wand2, h("/ai/studio"), { tier: "D", flagship: true, visible: vis, summary: "Build assessments with AI, deliver them securely, mark them and plan learning recovery." });

export const ROLE_NAV: Record<ConsoleId, ConsoleNav> = {
  // ─── Group console (SUPER_ADMIN, GROUP) ───────────────────────────────────
  super: {
    id: "super", base: "/super", mode: "view", defaultView: "overview", eyebrow: "Group console", recordSearch: false,
    entries: [
      leaf("overview", "Overview", LayoutDashboard, v("overview"), { tier: "D", mobile: 1, summary: "Decisions waiting on you and how every campus is doing." }),
      aiWorkflows(),
      leaf("campuses", "Campuses", Building2, v("campuses"), { tier: "W", mobile: 2, summary: "Open a campus to see its numbers and the people who run it." }),
      leaf("approvals", "Approvals", ShieldCheck, v("approvals"), { tier: "D", mobile: 3, badge: "approvals", visible: { all: ["institutionAuthority"] }, summary: "Support access, tax sign-off and policy reviews waiting for you." }),
      leaf("access", "People & access", UsersRound, v("access"), { tier: "T", visible: { all: ["institutionAuthority"] }, summary: "Campus leaders, who may manage members, and role permissions." }),
      leaf("standards", "Group standards", Layers, v("standards"), { tier: "T", visible: { all: ["groupConsole"] }, summary: "Curriculum templates and group policy every campus follows." }),
      leaf("billing", "Billing & plan", CreditCard, v("billing"), { tier: "T", visible: { all: ["billing"] }, deniedReason: "The subscription is managed by the account owner.", summary: "Your SkooleeAI plan, AI credits and payment method." }),
      messages(4),
      leaf("settings", "Settings", Settings, v("settings"), { tier: "R", visible: { all: ["institutionAuthority"] }, summary: "School profile, language, sign-in, integrations, data and activity." }),
    ],
    accountMenu: [],
    aliases: { schools: v("overview"), fees: v("overview"), "curriculum-templates": v("standards", "templates"), support: v("approvals", "support") },
    retired: {},
  },

  // ─── Campus / School console (CAMPUS_ADMIN and ADMIN; variant by keys) ────
  admin: {
    id: "admin", base: "/admin", mode: "view", defaultView: "overview", eyebrow: "Campus console",
    eyebrowWhen: [{ key: "standaloneOwner", label: "School console" }], recordSearch: true,
    entries: [
      leaf("today", "Today", LayoutDashboard, v("overview"), { tier: "D", mobile: 1, summary: "What needs you on this campus today." }),
      // A group campus admin's second phone slot is AI Workflows (the student list stays one tap away in the sidebar).
      { ...aiWorkflows(), mobileWhen: { key: "groupCampus", slot: 2 } },
      examStudio({ all: ["schoolAiExams", "academicLead"] }),
      group("students", "Students", GraduationCap, "primary", [
        leaf("student-list", "Student list", GraduationCap, v("students"), { tier: "D", mobile: 2, mobileVisible: { none: ["groupCampus"] }, visible: { module: "students" } }),
        leaf("admissions", "Admissions", UserPlus, v("admissions"), { visible: { module: "admissions" }, summary: "Enquiries, applications and the online form." }),
        leaf("guardians", "Guardians & access", Contact, v("guardians"), { visible: { module: "students", all: ["campusOps"] }, summary: "Link guardians to children and choose what each can see." }),
        leaf("family-communication", "Family communication", Inbox, v("communications"), { visible: { module: "reports", all: ["campusOps"] }, summary: "Messages sent to families, failed deliveries and reminders." }),
        leaf("learning-actions", "Learning actions", Target, v("learning-actions"), { visible: { all: ["academicLead"] } }),
        leaf("year-end", "Year end & promotion", ArrowRightLeft, v("promote-archive"), { tier: "T", visible: { module: "students" } }),
      ]),
      leaf("attendance", "Attendance", CalendarCheck, v("attendance"), { tier: "D", mobile: 3, visible: { module: "attendance" } }),
      group("staff", "Staff", Users, "primary", [
        leaf("teachers", "Teachers", Users, v("teachers"), { visible: { module: "staff" } }),
        leaf("staff-invites", "Staff & invites", BadgeCheck, v("leadership"), { visible: { module: "staff" }, labelWhen: [{ key: "standaloneOwner", label: "Staff & leaders" }, { key: "groupCampus", label: "Office staff" }] }),
        leaf("leave-approvals", "Leave approvals", Plane, v("leave"), { visible: { module: "leave" } }),
        leaf("staff-structure", "Staff structure", Network, v("staff-hierarchy"), { tier: "T", visible: { module: "staff" } }),
        leaf("teacher-performance", "Teacher performance", Award, v("teacher-performance"), { visible: { module: "staff", all: ["academicLead"] } }),
      ]),
      group("academics", "Academics", BookOpen, "primary", [
        leaf("academic-overview", "Academic overview", Compass, v("academic-hub"), { activePaths: ["/curriculum", "/resources"], visible: { module: "timetable" } }),
        leaf("classes", "Classes & subjects", School, v("classes"), { visible: { module: "timetable" } }),
        leaf("timetable", "Timetable", CalendarRange, v("timetable"), { visible: { module: "timetable", all: ["academicLead"] }, deniedReason: "Your principal publishes the timetable." }),
        leaf("exams", "Exams & results", FileCheck2, v("exam-cycles"), { tier: "T", visible: { module: "exams", all: ["academicLead"] }, deniedReason: "Your principal runs exams and results." }),
        leaf("report-cards", "Report cards", ClipboardList, v("report-cards"), { tier: "T", visible: { module: "reports" } }),
        leaf("academic-year", "Academic year", CalendarDays, v("year-cycle"), { tier: "T", visible: { module: "students" } }),
        leaf("improvement", "Improvement evidence", ClipboardCheck, h("/improvement"), { tier: "T", visible: { all: ["improvementLead"] } }),
        // The campus assistant view stays valid (bookmarks, notifications) but has no row: AI Workflows replaces it.
        leaf("ai", "AI assistant", Sparkles, v("ai"), { hiddenInNav: true, visible: { module: "ai" } }),
        leaf("access-plans", "Access plans", Accessibility, h("/accommodations"), { visible: { module: "exams", all: ["academicLead"] } }),   // [R-I5]
        leaf("secure-exams", "Secure exam delivery", Lock, h("/exam-delivery"), { visible: { module: "exams", all: ["academicLead"] } }), // [R-I5]
      ]),
      group("money", "Money", Wallet, "primary", [
        leaf("fees", "Fees", Receipt, v("fees"), { visible: { module: "fees" }, summary: "Family tuition: invoices, payments and approvals." }),
        leaf("payroll", "Payroll approvals", Banknote, v("payroll"), { tier: "T", visible: { module: "payroll" } }),
        leaf("corrections", "Record corrections", History, h("/corrections"), { tier: "T", visible: { all: ["corrections", "campusOps"] }, summary: "Approve payment corrections and, without a principal, mark corrections." }), // [R-B2, K-I7]
      ]),
      messages(4),
      group("services", "Campus services", ConciergeBell, "more", [
        leaf("front-desk", "Front desk", ConciergeBell, v("front-desk"), { visible: { module: "front-desk" }, summary: "Complaints, certificates and, when no receptionist is on duty, visitors, calls and post." }),
        leaf("pickup", "Pickup", UserCheck, v("pickup"), { visible: { all: ["campusOps"] } }),
        leaf("transport", "Transport", Bus, v("transport"), { visible: { module: "transport" } }),
        leaf("hostel", "Hostel", BedDouble, v("dormitory"), { visible: { module: "dormitory" } }),
        leaf("canteen", "Canteen", UtensilsCrossed, v("canteen"), { visible: { all: ["pkgCanteen"] } }),
        leaf("inventory", "Inventory & purchasing", Package, v("inventory"), { visible: { module: "inventory" } }),
        leaf("library", "Library", Library, v("library"), { visible: { module: "library", all: ["libraryDesk"] }, deniedReason: "Your librarian runs the library." }),
        leaf("activities", "Activities", Trophy, h("/activities"), { visible: { all: ["activityStaff"] } }),
        leaf("service-desk", "Service desk", Wrench, h("/service-desk"), { visible: { all: ["serviceAgent"] } }),
        leaf("care", "Care & safeguarding", HeartHandshake, h("/care"), { visible: { all: ["careMember"] } }),
      ]),
      group("your-school", "Your school", Crown, "owner", [
        leaf("billing", "Billing & plan", CreditCard, v("billing"), { tier: "T", visible: { all: ["billing"] }, deniedReason: "The SkooleeAI subscription is managed by the account owner.", summary: "Your SkooleeAI plan, AI credits and payment method." }), // AccessNotice adds owner={subscriptionOwnerName} [R-I11, K-I12]
        leaf("approvals", "Approvals", ShieldCheck, v("approvals"), { tier: "T", badge: "approvals", visible: { all: ["institutionAuthority", "standaloneOwner"] } }),
        leaf("access", "People & access", UsersRound, v("access"), { tier: "T", visible: { all: ["institutionAuthority", "standaloneOwner"] } }),
        leaf("school-settings", "School settings", Landmark, v("school-settings"), { tier: "R", visible: { all: ["institutionAuthority", "standaloneOwner"] } }),
      ], { all: ["standaloneOwner"] }),
      leaf("campus-setup", "Campus setup", Settings, v("settings"), { tier: "R", visible: { all: ["campusOps"] }, labelWhen: [{ key: "standaloneOwner", label: "School setup" }], summary: "Year setup, calendar, periods, rooms, categories, policies and packages." }),
    ],
    accountMenu: [],
    aliases: {
      "admission-queries": v("admissions", "enquiries"), applications: v("admissions", "applications"),
      complaints: v("front-desk", "complaints"), "phone-calls": v("front-desk", "calls"), postal: v("front-desk", "post"), certificates: v("front-desk", "certificates"),
      institution: v("settings", "profile"), "year-setup": v("settings", "year"), "school-calendar": v("settings", "calendar"),
      "period-setup": v("settings", "periods"), "class-rooms": v("settings", "rooms"), "student-setup": v("settings", "categories"),
      "academic-model": v("settings", "academic-rules"), "grading-rules": v("settings", "academic-rules"),
      permissions: v("access", "permissions"), engagement: v("communications"),
    },
    retired: {},
  },

  // ─── Academic console (PRINCIPAL) ──────────────────────────────────────────
  principal: {
    id: "principal", base: "/principal", mode: "view", defaultView: "overview", eyebrow: "Academic console", recordSearch: true,
    entries: [
      leaf("today", "Today", LayoutDashboard, v("overview"), { tier: "D", mobile: 1, summary: "Academic decisions waiting on you." }),
      aiWorkflows(),
      examStudio(),
      group("results", "Results", FileCheck2, "primary", [
        leaf("report-cards", "Report cards", ClipboardList, v("report-cards"), { tier: "D", mobile: 2, visible: { module: "reports" } }),
        leaf("exams", "Exams & results", FileCheck2, v("exam-cycles"), { tier: "T", visible: { module: "exams" } }),
        leaf("mark-corrections", "Mark corrections", History, h("/corrections"), { visible: { all: ["corrections"] } }),
      ]),
      group("teaching", "Teaching", CalendarRange, "primary", [
        leaf("timetable", "Timetable & cover", CalendarRange, v("timetable"), { tier: "D", mobile: 3, visible: { module: "timetable" } }),
        leaf("classes", "Classes & subjects", School, v("classes"), { tier: "T", visible: { module: "timetable" } }),
        leaf("curriculum", "Curriculum & grading", Scale, v("academic-rules"), { tier: "R", visible: { module: "exams" } }),
        leaf("calendar", "School calendar", CalendarDays, v("school-calendar"), { visible: { module: "timetable" } }),
      ]),
      group("teachers", "Teachers", Users, "primary", [
        leaf("teacher-profiles", "Teacher profiles", Users, v("teachers"), { visible: { module: "staff" } }),
        leaf("teacher-performance", "Teacher performance", Award, v("teacher-performance"), { visible: { module: "staff" } }),
        // Staff leave is the campus admin's desk; the view stays valid for bookmarks and notifications.
        leaf("leave-approvals", "Leave approvals", Plane, v("leave"), { hiddenInNav: true, visible: { module: "leave" } }),
      ]),
      group("learners", "Learners", GraduationCap, "primary", [
        leaf("students", "Students", GraduationCap, v("students"), { visible: { module: "students" } }),
        leaf("attendance", "Attendance", CalendarCheck, v("attendance"), { tier: "D", visible: { module: "attendance" } }),
        leaf("learning-actions", "Learning actions", Target, v("learning-actions")),
        leaf("promotion", "Promotion approval", ArrowRightLeft, v("promote-archive"), { tier: "T", visible: { module: "students" } }),
      ]),
      leaf("academic-year", "Academic year", History, v("year-cycle"), { tier: "T" }),
      messages(4),
      group("more", "More", LayoutGrid, "more", [
        // The AI review queue (C16) stays a view, reached from Today ("AI drafts waiting (n)"); AI Workflows replaces the row.
        leaf("ai", "AI assistant", Sparkles, v("ai"), { hiddenInNav: true, visible: { module: "ai" } }),
        leaf("report-delivery", "Report delivery", Send, v("engagement"), { hiddenInNav: true, visible: { module: "reports" } }),
        leaf("access-plans", "Access plans", Accessibility, h("/accommodations"), { visible: { module: "exams" } }),
        leaf("secure-exams", "Secure exam delivery", Lock, h("/exam-delivery"), { hiddenInNav: true, visible: { module: "exams" } }), // reached from Exam Studio
        leaf("objective-map", "Objective map", Target, h("/curriculum"), { visible: { module: "exams" } }),        // [K-I7]
        leaf("resources", "Learning resources", FolderOpen, h("/resources"), { hiddenInNav: true, visible: { module: "timetable" } }), // [K-I7]
        leaf("improvement", "Improvement evidence", ClipboardCheck, h("/improvement"), { visible: { all: ["improvementLead"] } }),
        leaf("care", "Care & safeguarding", HeartHandshake, h("/care"), { visible: { all: ["careMember"] } }),
      ]),
    ],
    accountMenu: [myLeave(v("my-leave"))],
    aliases: { "academic-model": v("academic-rules", "curriculum"), "grading-rules": v("academic-rules", "grading"), "academic-hub": v("overview") },
    retired: {
      ...Object.fromEntries(["fees", "transport", "dormitory", "canteen", "complaints", "phone-calls", "postal", "certificates", "inventory", "library", "admission-queries", "applications", "student-setup", "staff-hierarchy", "year-setup", "period-setup", "class-rooms"].map((view) => [view, "This now lives with your campus admin."])),
      // [R-I11] leadership and permissions belong to the institution authority, not the campus admin
      leadership: "Staff access and appointments are managed by your school's administrator.",
      permissions: "Staff access and appointments are managed by your school's administrator.",
    },
  },

  // ─── Teaching (TEACHER, path console) ─────────────────────────────────────
  teacher: {
    id: "teacher", base: "/teacher", mode: "path", eyebrow: "Teaching", recordSearch: false,
    entries: [
      leaf("today", "Today", Sun, h("/teacher"), { tier: "D", mobile: 1 }),
      aiWorkflows(),
      examStudio(),
      leaf("attendance", "Attendance", CalendarCheck, h("/teacher/attendance"), { tier: "D", mobile: 2, mobileLabel: "Register", visible: { module: "attendance" } }),
      group("assess", "Assessments", ClipboardList, "primary", [
        leaf("tests", "Tests & quizzes", ClipboardList, h("/teacher/tests"), { tier: "D", visible: { module: "exams" } }),
        leaf("marks", "Marks", PenLine, h("/teacher/marks"), { tier: "D", mobile: 3, visible: { module: "exams" } }),
        leaf("report-cards", "Report cards", FileText, h("/teacher/reports"), { tier: "T", visible: { module: "reports" } }),
      ]),
      // Homework (`/api/assignments`) sets work for the teacher's own classes: the timetable module, as moduleForHref.
      leaf("homework", "Homework", ClipboardCheck, h("/teacher/assignments"), { tier: "D", visible: { module: "timetable" } }),
      group("classes", "My classes", GraduationCap, "primary", [
        leaf("my-classes", "My classes", GraduationCap, h("/teacher/classes"), { visible: { module: "timetable" } }),
        leaf("students", "Students", Users, h("/teacher/students"), { visible: { module: "students" } }),
        leaf("resources", "Resources", FolderOpen, h("/teacher/resources"), { visible: { module: "timetable" } }),
        leaf("portfolios", "Portfolios", Sparkles, h("/teacher/portfolio"), { visible: { module: "students" } }),
      ]),
      messages(4),
      group("more", "More", LayoutGrid, "more", [
        leaf("objective-map", "Objective map", Target, h("/teacher/curriculum"), { visible: { module: "exams" } }),
        leaf("timetable", "Timetable & cover", CalendarRange, h("/teacher/timetable"), { visible: { module: "timetable" } }),
        leaf("calendar", "Calendar & meetings", CalendarDays, h("/teacher/calendar"), { visible: { module: "timetable" } }),
        // The teacher's own classroom helpers (insights, lesson plans, remarks) — not the School AI workspace, which a
        // teacher does not run; Exam Studio is the teacher's flagship and owns /ai/studio.
        leaf("ai", "AI assistant", Sparkles, h("/teacher/ai"), { visible: { module: "ai" } }),
        leaf("access-plans", "Access plans", Accessibility, h("/teacher/accommodations"), { visible: { all: ["accessPlans"] } }),
        leaf("activities", "Activities", Trophy, h("/activities"), { visible: { all: ["activityStaff"] } }),
        leaf("trips", "Today's trip", Bus, h("/transport"), { tier: "D", visible: { all: ["tripToday"] } }),
        leaf("care", "Care & safeguarding", HeartHandshake, h("/care"), { visible: { all: ["careMember"] } }),
        leaf("evidence", "My teaching evidence", Award, h("/teacher/insights"), { tier: "T", visible: { module: "reports" } }),
        leaf("corrections", "Record corrections", History, h("/corrections"), { tier: "T", visible: { all: ["corrections"] } }),
      ]),
    ],
    accountMenu: [myLeave(h("/teacher/leave"))],
    aliases: {}, retired: {},
  },

  // ─── Finance desk (ACCOUNTANT) ────────────────────────────────────────────
  accountant: {
    id: "accountant", base: "/accountant", mode: "view", defaultView: "dashboard", eyebrow: "Finance desk", recordSearch: false,
    entries: [
      leaf("today", "Today", LayoutDashboard, v("dashboard"), { tier: "D", mobile: 1, summary: "Collected today, outstanding, and what is waiting on you." }),
      aiWorkflows(),
      leaf("collect", "Collect", Wallet, v("payments"), { tier: "D", mobile: 2, visible: { module: "fees" }, summary: "Record payments, print receipts, import bank statements and reconcile." }),
      leaf("invoices", "Invoices", FileText, v("invoices"), { tier: "D", mobile: 3, visible: { module: "fees" }, summary: "Generate invoices, set instalments and request adjustments." }),
      leaf("reports", "Reports & reminders", BarChart3, v("fee-reports"), { visible: { module: "reports" } }),
      group("books", "Books", Landmark, "primary", [
        leaf("accounts", "Accounts & ledger", Landmark, v("accounts"), { visible: { module: "accounts" } }),
        leaf("tax", "Tax packages", Receipt, v("tax"), { tier: "R", visible: { module: "fees" } }),
      ]),
      leaf("payroll", "Payroll", Banknote, v("payroll"), { tier: "T", visible: { module: "payroll" }, summary: "Prepare the payroll run; your campus admin approves it." }),
      messages(4),
      group("setup", "Setup", SlidersHorizontal, "more", [
        leaf("fee-setup", "Fee setup", SlidersHorizontal, v("fee-structures"), { tier: "R", visible: { module: "fees" } }),
        leaf("payment-corrections", "Payment corrections", History, h("/corrections"), { tier: "T", visible: { all: ["corrections"] } }),
      ]),
    ],
    accountMenu: [myLeave(v("my-leave"))],
    aliases: { "fee-overview": v("dashboard"), "fee-layers": v("fee-structures", "layers"), leave: v("my-leave") },
    retired: {},
  },

  // ─── Front desk (RECEPTIONIST) ────────────────────────────────────────────
  receptionist: {
    id: "receptionist", base: "/receptionist", mode: "view", defaultView: "dashboard", eyebrow: "Front desk", recordSearch: true,
    entries: [
      leaf("today", "Today", LayoutDashboard, v("dashboard"), { tier: "D", mobile: 1, summary: "Who is on site, callbacks due and pickups waiting." }),
      aiWorkflows(),
      leaf("visitors", "Visitors", DoorOpen, v("visitors"), { tier: "D", mobile: 2, visible: { module: "front-desk" } }),
      leaf("pickup", "Pickup", UserCheck, v("pickup"), { tier: "D", mobile: 3, visible: { module: "front-desk" } }),
      leaf("admissions", "Admissions", UserPlus, v("admissions"), { tier: "D", visible: { module: "admissions" }, summary: "Log enquiries and move applications forward; your campus admin makes offers." }),
      leaf("complaints", "Complaints", MessageSquareWarning, v("complaints"), { visible: { module: "front-desk" } }),
      group("calls-post", "Calls & post", PhoneCall, "primary", [
        leaf("calls", "Phone calls", PhoneCall, v("phone-calls"), { tier: "D", mobile: 4, visible: { module: "front-desk" } }),
        leaf("post", "Post", Mail, v("postal"), { tier: "D", visible: { module: "front-desk" } }),
      ]),
      leaf("documents", "Documents", ScrollText, v("certificates"), { visible: { module: "front-desk" } }),
      messages(),
    ],
    accountMenu: [myLeave(v("my-leave"))],
    aliases: { leave: v("my-leave"), "admission-queries": v("admissions", "enquiries") },
    retired: {},
  },

  // ─── Library (LIBRARIAN) ──────────────────────────────────────────────────
  librarian: {
    id: "librarian", base: "/librarian", mode: "view", defaultView: "dashboard", eyebrow: "Library", recordSearch: false,
    entries: [
      leaf("today", "Today", LayoutDashboard, v("dashboard"), { tier: "D", mobile: 1 }),
      aiWorkflows(),
      leaf("lending", "Lending desk", ScanLine, v("lending"), { tier: "D", mobile: 2, visible: { module: "library" } }),
      leaf("catalogue", "Catalogue & members", BookCopy, v("catalogue"), { tier: "W", mobile: 3, visible: { module: "library" } }),
      messages(4),
    ],
    accountMenu: [myLeave(v("my-leave"))],
    aliases: { library: v("lending"), leave: v("my-leave") },
    retired: { inventory: "Inventory is managed by your campus admin." },
  },

  // ─── Family (PARENT, path console; access provided by /api/parent/data) ───
  parent: {
    id: "parent", base: "/parent", mode: "path", eyebrow: "Family", recordSearch: false,
    entries: [
      leaf("home", "Home", House, h("/parent"), { tier: "D", mobile: 1 }),
      aiWorkflows(),
      leaf("fees", "Fees", CreditCard, h("/parent/fees"), { tier: "W", mobile: 2, visible: { module: "fees" } }),
      leaf("attendance", "Attendance", CalendarCheck, h("/parent/attendance"), { tier: "W", mobile: 3, visible: { module: "attendance" } }),
      leaf("results", "Results", FileText, h("/parent/results"), { tier: "T", mobile: 4, visible: { module: "reports" } }),
      messages(),
      group("more", "More", LayoutGrid, "more", [
        leaf("meetings", "Meet a teacher", CalendarClock, h("/parent/meetings")),
        leaf("timetable", "Timetable & exams", Clock, h("/parent/timetable"), { visible: { module: "timetable" } }),
        leaf("homework", "Homework & resources", ClipboardCheck, h("/parent/assignments"), { activePaths: ["/parent/resources"], visible: { module: "timetable" } }),
        leaf("activities", "Activities & trips", Trophy, h("/parent/activities")),
        leaf("pickup", "Pickup & transport", Bus, h("/parent/pickup"), { visible: { all: ["pickupGuardian"] } }),
        leaf("canteen", "Canteen", UtensilsCrossed, h("/parent/canteen"), { visible: { all: ["pkgCanteen"] } }),
        leaf("support-plans", "Support plans", Accessibility, h("/parent/access"), { visible: { all: ["accessPlans"] } }),
        leaf("corrections", "Record corrections", History, h("/corrections"), { tier: "R", visible: { all: ["corrections"] } }),
      ]),
    ],
    accountMenu: [], aliases: {}, retired: {},
  },

  // ─── Learner (STUDENT, path console) ──────────────────────────────────────
  student: {
    id: "student", base: "/student", mode: "path", eyebrow: "Learner", recordSearch: false,
    entries: [
      leaf("today", "Today", Sun, h("/student"), { tier: "D", mobile: 1 }),
      aiWorkflows(),
      // Exam Studio's delivery side: a learner's secure online exams stay one tap from Today, never under More.
      leaf("online-exams", "My online exams", MonitorCheck, h("/ai/exams"), { tier: "D", visible: { all: ["schoolAiExams"] } }),
      leaf("work", "Work", ClipboardCheck, h("/student/assignments"), { tier: "D", mobile: 2, activePaths: ["/student/resources"], visible: { module: "timetable" } }),
      leaf("timetable", "Timetable", Clock, h("/student/timetable"), { tier: "D", mobile: 3, visible: { module: "timetable" } }),
      leaf("results", "Results", FileText, h("/student/reports"), { tier: "T", mobile: 4, visible: { module: "reports" } }),
      messages(),
      group("more", "More", LayoutGrid, "more", [
        leaf("study", "Study help", Lightbulb, h("/student/study")),
        leaf("portfolio", "Portfolio & goals", Sparkles, h("/student/portfolio")),
        leaf("attendance", "Attendance", CalendarCheck, h("/student/attendance"), { visible: { module: "attendance" } }),
        leaf("class", "My class & subjects", School, h("/student/coursework"), { visible: { module: "timetable" } }),
        leaf("fees", "Fees", CreditCard, h("/student/fees"), { visible: { module: "fees" } }),
        leaf("support-plan", "Support plan", Accessibility, h("/student/access"), { visible: { all: ["accessPlans"] } }),
        leaf("corrections", "Record corrections", History, h("/corrections"), { visible: { all: ["corrections"] } }),
      ]),
    ],
    accountMenu: [], aliases: {}, retired: {},
  },

  // ─── Platform operations (APP_OWNER) ──────────────────────────────────────
  owner: {
    id: "owner", base: "/owner", mode: "view", defaultView: "schools", eyebrow: "Platform operations", recordSearch: false,
    entries: [
      leaf("schools", "Schools", LayoutGrid, v("schools"), { tier: "D", mobile: 1 }),
      aiWorkflows({ all: ["schoolAi"] }),
      leaf("users", "Tenant users", Users, v("users")),
      group("commercial", "Commercial", CreditCard, "primary", [
        leaf("subscription-requests", "Subscription requests", CreditCard, v("subscription-requests"), { tier: "D", mobile: 2, mobileLabel: "Requests", badge: "approvals" }),
        leaf("pricing", "Pricing", Tag, v("pricing")),
        leaf("gateways", "Payment gateways", WalletCards, v("payments")),
        leaf("plans-revenue", "Plans & revenue", DollarSign, v("billing")),
      ]),
      group("trust", "Trust & safety", ShieldCheck, "primary", [
        leaf("support", "Support access", ShieldCheck, v("support"), { tier: "D", mobile: 3 }),
        leaf("audit", "Audit log", FileText, v("audit"), { tier: "D", mobile: 4 }),
        leaf("sessions", "Sessions", Shield, v("sessions")),
      ]),
      group("insights", "Insights", Gauge, "primary", [
        leaf("pilots", "Pilot evidence", FlaskConical, v("pilots")),
        leaf("pilot-readiness", "Pilot readiness", ShieldCheck, v("pilot-readiness")),
        leaf("capacity", "Capacity", Gauge, v("capacity")),
      ]),
    ],
    accountMenu: [], aliases: {}, retired: {},
  },
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────
export function consoleForRole(role: UserRole): ConsoleId {
  const map: Record<UserRole, ConsoleId> = { APP_OWNER: "owner", SUPER_ADMIN: "super", CAMPUS_ADMIN: "admin", ADMIN: "admin", PRINCIPAL: "principal", TEACHER: "teacher", ACCOUNTANT: "accountant", RECEPTIONIST: "receptionist", LIBRARIAN: "librarian", PARENT: "parent", STUDENT: "student" };
  return map[role];
}
export function isVisible(vis: Visibility | undefined, access: Record<string, boolean>): boolean {
  if (!vis) return true;
  if (vis.module && access[vis.module] !== true) return false;
  if (vis.all && !vis.all.every((k) => access[k] === true)) return false;
  if (vis.any && !vis.any.some((k) => access[k] === true)) return false;
  if (vis.none && vis.none.some((k) => access[k] === true)) return false;
  return true;
}
export function leaves(nav: ConsoleNav): NavLeaf[] {
  return [...nav.entries.flatMap((e) => (e.kind === "group" ? e.children : [e])), ...nav.accountMenu];
}
export function consoleViews(id: ConsoleId): string[] {
  const nav = ROLE_NAV[id];
  const own = leaves(nav).flatMap((l) => ("view" in l.target ? [l.target.view] : []));
  return [...new Set([...own, ...Object.keys(nav.aliases), ...Object.keys(nav.retired)])];
}
export function resolveAlias(id: ConsoleId, view: string | null): ViewTarget | null {
  return view ? ROLE_NAV[id].aliases[view] ?? null : null;
}
export function leafForView(id: ConsoleId, view: string): NavLeaf | undefined {
  return leaves(ROLE_NAV[id]).find((l) => "view" in l.target && l.target.view === view);
}
/** Href leaves by exact path first, then ANY leaf (view leaves included) by activePaths. The earlier draft filtered
 *  activePaths to href leaves, so admin/principal "AI assistant" (a view leaf) never lit up on /ai. */
export function leafForPath(id: ConsoleId, pathname: string): NavLeaf | undefined {
  const all = leaves(ROLE_NAV[id]);
  return all.find((l) => "href" in l.target && l.target.href === pathname) ?? all.find((l) => l.activePaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
}
export function labelFor(entry: { label: string; labelWhen?: { key: AccessKey; label: string }[] }, access: Record<string, boolean>): string {
  return entry.labelWhen?.find((w) => access[w.key] === true)?.label ?? entry.label;
}
export function eyebrowFor(nav: ConsoleNav, access: Record<string, boolean>): string {
  return nav.eyebrowWhen?.find((w) => access[w.key] === true)?.label ?? nav.eyebrow;
}
export function mobileLeaves(nav: ConsoleNav, access: Record<string, boolean>): NavLeaf[] {
  const slot = (l: NavLeaf) => (l.mobileWhen && access[l.mobileWhen.key] === true ? l.mobileWhen.slot : l.mobile);
  return leaves(nav)
    .filter((l) => slot(l) && isVisible(l.visible, access) && (slot(l) !== l.mobile || isVisible(l.mobileVisible, access)))
    .map((l) => ({ ...l, mobile: slot(l) }))
    .sort((a, b) => (slot(a) ?? 9) - (slot(b) ?? 9));
}
export function hrefFor(nav: ConsoleNav, l: NavLeaf): string {
  if ("href" in l.target) return l.target.href;
  const q = new URLSearchParams({ view: l.target.view, ...(l.target.tab ? { tab: l.target.tab } : {}) });
  return `${nav.base}?${q.toString()}`;
}

// ─── Shell helpers (P2 additions beyond §3; pure) ───────────────────────────
/** The group that holds a leaf, if any (accountMenu leaves and top-level leaves have none). */
export function groupOf(nav: ConsoleNav, leafId: string): NavGroup | undefined {
  return nav.entries.find((e): e is NavGroup => e.kind === "group" && e.children.some((c) => c.id === leafId));
}
/** A leaf is visible when its own clause and its enclosing group's clause both hold. */
export function leafVisible(nav: ConsoleNav, l: NavLeaf, access: Record<string, boolean>): boolean {
  const g = groupOf(nav, l.id);
  return isVisible(l.visible, access) && (!g || isVisible(g.visible, access));
}
/** Find a leaf by its target view first, then by its id. */
export function findLeaf(id: ConsoleId, viewOrLeafId: string): NavLeaf | undefined {
  return leafForView(id, viewOrLeafId) ?? leaves(ROLE_NAV[id]).find((l) => l.id === viewOrLeafId);
}
/** The entries a caller sees: hidden leaves dropped, empty groups dropped, `hiddenInNav` leaves kept out. */
export function visibleEntries(nav: ConsoleNav, access: Record<string, boolean>): NavEntry[] {
  return nav.entries.flatMap((e): NavEntry[] => {
    if (e.kind === "leaf") return isVisible(e.visible, access) && !e.hiddenInNav ? [e] : [];
    if (!isVisible(e.visible, access)) return [];
    const children = e.children.filter((c) => isVisible(c.visible, access) && !c.hiddenInNav);
    return children.length ? [{ ...e, children }] : [];
  });
}
/** Translation key of a console name (a registry `eyebrow` / `eyebrowWhen` label). Console names have their own keys
 *  because the bare words are ordinary labels elsewhere with another meaning ("Teaching" is also the principal's
 *  nav group, "Family" and "Library" appear in records), and §1.5 fixes the console wording in AR and UR. */
export const consoleNameKey = (label: string): string => `Console name: ${label}`;
/** The console name in the viewer's language: its `consoleNameKey` entry, else (EN, or a name without one) the
 *  plain label through the same translator. `translate` is `useUiText()` or `translateUi` bound to a language. */
export function consoleName(label: string, translate: (key: string) => string): string {
  const key = consoleNameKey(label);
  const named = translate(key);
  return named && named !== key ? named : translate(label);
}
