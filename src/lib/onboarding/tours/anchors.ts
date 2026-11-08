/**
 * Tour anchor convention (SPEC §9.4): data-tour="<scope>.<area>.<control>", lowercase kebab segments, 2–4 segments,
 * unique per rendered page, never derived from translated text.
 *
 * Shell and page anchors are emitted by shared components from registry ids (RoleHeader, RoleSidebar, HelpMenu,
 * PageHeader, ViewTabs, chat dock). Feature anchors are literal data-tour attributes placed by the package that owns
 * the screen; the emitter notes are guidance only and no test depends on a line number [K-m11].
 */

export const ANCHOR_FORMAT = /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/;

/** Shell anchors with a fixed name (P2 emitters). */
export const SHELL_ANCHORS = [
  "shell.header.identity", "shell.header.scope", "shell.header.cycle", "shell.header.context",
  "shell.header.help", "shell.header.notifications", "shell.header.account",
  "shell.sidebar.find", "shell.sidebar.search-records", "shell.sidebar.collapse",
  "shell.mobile.more", "shell.chat.launcher",
] as const;

/** Shell anchors derived from registry ids: shell.nav.<leaf id>, shell.nav-group.<group id>, shell.mobile.<leaf id>. */
export const REGISTRY_ANCHOR = /^shell\.(nav|nav-group|mobile)\.([a-z0-9-]+)$/;

/** PageHeader / ViewTabs anchors (P2 emitters). */
export const PAGE_ANCHORS = ["page.header", "page.title", "page.primary-action", "page.actions", "page.tabs"] as const;
export const PAGE_TAB_ANCHOR = /^page\.tab\.[a-z0-9-]+$/;

/**
 * Feature anchors: a literal data-tour="…" placed by the owning package — or, for the flagship Today cards (addendum
 * 2026-10-22), the literal `tourAnchor="…"` prop of the shared FlagshipCard, which renders it as data-tour.
 */
export const FEATURE_ANCHORS = [
  // P7 parent header switcher
  { anchor: "shell.parent.child-switcher", owner: "P7", emitter: "parent header child switcher" },
  // P5
  { anchor: "work.today.queue", owner: "P5", emitter: "ActionQueue root (src/components/principal/action-queue.tsx)" },
  // P4
  { anchor: "super.overview.attention", owner: "P4", emitter: "super Overview attention list" },
  { anchor: "super.campus.leadership", owner: "P4", emitter: "super campus-detail ManagementCard pair" },
  { anchor: "owner.schools.table", owner: "P4", emitter: "owner Schools table" },
  // P6
  { anchor: "principal.reports.approve", owner: "P6", emitter: "ReportCardPipeline approve control" },
  { anchor: "principal.exams.publish", owner: "P6", emitter: "ExamsWorkspace rendered Publish button" },
  // P7
  { anchor: "teacher.today.checkin", owner: "P7", emitter: "src/app/teacher/page.tsx check-in" },
  { anchor: "teacher.today.schedule", owner: "P7", emitter: "src/components/teacher/today-schedule.tsx" },
  { anchor: "teacher.attendance.submit", owner: "P7", emitter: "src/components/attendance/class-register.tsx" },
  { anchor: "teacher.marks.save", owner: "P7", emitter: "src/components/teacher/sticky-save-bar.tsx" },
  { anchor: "parent.home.inbox", owner: "P7", emitter: "src/components/parent/family-inbox.tsx (inbox root)" },
  { anchor: "student.today.next", owner: "P7", emitter: "src/components/student/student-today.tsx" },
  { anchor: "student.today.flagship-exams", owner: "P7", emitter: "src/components/student/student-today.tsx upcoming online exams (only while there are some)" },
  // Flagship Today cards (shared FlagshipCard `tourAnchor`, addendum 2026-10-22)
  { anchor: "super.today.flagship-ai", owner: "P4", emitter: "super Overview FlagshipCard kind=ai-workflows" },
  { anchor: "admin.today.flagship-ai", owner: "P5", emitter: "admin Today FlagshipCard kind=ai-workflows" },
  { anchor: "admin.today.flagship-exams", owner: "P5", emitter: "admin Today FlagshipCard kind=exam-studio (academic lead only)" },
  { anchor: "principal.today.flagship-ai", owner: "P6", emitter: "principal Today FlagshipCard kind=ai-workflows" },
  { anchor: "principal.today.flagship-exams", owner: "P6", emitter: "principal Today FlagshipCard kind=exam-studio" },
  { anchor: "teacher.today.flagship-exams", owner: "P7", emitter: "teacher Today FlagshipCard kind=exam-studio" },
  // P8
  { anchor: "accountant.today.summary", owner: "P8", emitter: "FinanceOverview hero" },
  { anchor: "accountant.reports.remind", owner: "P8", emitter: "FeeReportsTab reminders" },
  { anchor: "reception.today.summary", owner: "P8", emitter: "FrontDeskOverview hero" },
  { anchor: "reception.pickup.check", owner: "P8", emitter: "pickup.tsx code check" },
  { anchor: "library.today.summary", owner: "P8", emitter: "LibraryOverview hero" },
  { anchor: "library.lending.scan", owner: "P8", emitter: "lending-desk.tsx scan field" },
  { anchor: "library.lending.return", owner: "P8", emitter: "lending-desk.tsx return confirm" },
] as const;

export type FeatureAnchor = (typeof FEATURE_ANCHORS)[number]["anchor"];

export function isShellOrPageAnchor(anchor: string): boolean {
  return (SHELL_ANCHORS as readonly string[]).includes(anchor)
    || REGISTRY_ANCHOR.test(anchor)
    || (PAGE_ANCHORS as readonly string[]).includes(anchor)
    || PAGE_TAB_ANCHOR.test(anchor);
}

/** CSS selector for an anchor value (values are validated against ANCHOR_FORMAT, so no escaping is needed). */
export function anchorSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`;
}
