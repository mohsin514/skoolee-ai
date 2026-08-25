/**
 * Pure logic for the exams & results pipeline.
 *
 * The board, the table and the keyboard shortcuts all have to agree on what
 * stage an exam is in and what may happen to it next. Keeping that in one
 * dependency-free module means a card, a row and an arrow key can never
 * disagree — and it mirrors the rules the API enforces in
 * `/api/exams` (PATCH), `/api/exams/[id]/lock` and `/api/exams/[id]/reject`,
 * so a move the UI offers is one the server will accept.
 */

/** Who is looking at the pipeline. Teachers only ever see their own assessments. */
export type ExamCycleRole = "OFFICE" | "TEACHER";

export type ExamStatus =
  | "DRAFT"
  | "ACTIVE"
  | "MARKS_ENTRY"
  | "LOCKED"
  | "PRINCIPAL_REVIEWED"
  | "PUBLISHED";

export interface ExamItem {
  id: string;
  classId: string;
  title: string;
  term: string;
  academicYear: number;
  examType?: string | null;
  subjectId?: string | null;
  totalMarks: number;
  status: ExamStatus;
  isLocked?: boolean;
  class?: { id?: string; name: string; section?: string | null; academicYear?: number } | null;
  locker?: { fullName?: string } | null;
  rejectionReason?: string | null;
  rejectionCount?: number;
  subject?: { id: string; name: string; totalMarks: number } | null;
  _count: { marks: number; reportCards: number };
}

/**
 * What the marks screen knows about an exam. `enteredMarks`/`expectedMarks`
 * mirror the completeness check the lock endpoint runs, so the board can say
 * exactly how many marks are missing instead of only "not ready".
 */
export interface ExamMeta {
  subjectsCount: number;
  studentsCount: number;
  markedSubjects: number;
  enteredMarks: number;
  expectedMarks: number;
}

/** Date-sheet facts rolled up per exam, for the cards and the timeline. */
export interface ScheduleSummary {
  papers: number;
  firstDate: string | null;
  lastDate: string | null;
}

export const ALL_COLUMNS = [
  {
    key: "PLANNING",
    title: "Being Prepared",
    accent: "#8127cf",
    hint: "Not started yet",
  },
  {
    key: "SCHEDULE",
    title: "On the Datesheet",
    accent: "#0d9488",
    hint: "Dates and rooms set",
  },
  {
    key: "MARKS",
    title: "Entering Marks",
    accent: "#f59e0b",
    hint: "Teachers recording marks",
  },
  {
    key: "REVIEW",
    title: "Awaiting Approval",
    accent: "#d97706",
    hint: "Marks locked, office checking",
  },
  {
    key: "PUBLISHED",
    title: "Results Released",
    accent: "#10b981",
    hint: "Families can see results",
  },
] as const;

export type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

export interface BoardColumn {
  key: ColumnKey;
  title: string;
  accent: string;
  hint: string;
}

/**
 * Teachers never build a datesheet and never publish results, so those columns
 * would sit permanently empty for them. Show only the lanes they can act on.
 */
export function columnsForRole(role: ExamCycleRole): BoardColumn[] {
  if (role === "TEACHER") {
    return ALL_COLUMNS.filter(
      (c) => c.key === "PLANNING" || c.key === "MARKS" || c.key === "REVIEW",
    ).map((c) =>
      c.key === "PLANNING"
        ? { ...c, title: "Not Started", hint: "Create and open a test" }
        : c.key === "REVIEW"
          ? { ...c, title: "Sent to Office", hint: "Marks locked and submitted" }
          : { ...c },
    );
  }
  return ALL_COLUMNS.map((c) => ({ ...c }));
}

export function columnFor(
  exam: ExamItem,
  hasSchedule: boolean,
  role: ExamCycleRole,
): ColumnKey {
  if (exam.status === "PUBLISHED") return role === "TEACHER" ? "REVIEW" : "PUBLISHED";
  if (exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED") return "REVIEW";
  if (exam.status === "MARKS_ENTRY") return "MARKS";
  // Only office exams pass through a datesheet stage.
  if (exam.status === "ACTIVE") return hasSchedule && role !== "TEACHER" ? "SCHEDULE" : "PLANNING";
  return "PLANNING";
}

export type NextAction =
  | { type: "patch"; status: ExamStatus; label: string }
  | { type: "lock"; label: string }
  | { type: "open"; label: string }
  | null;

export function nextAction(
  exam: ExamItem,
  hasSchedule: boolean,
  role: ExamCycleRole,
): NextAction {
  const isTeacher = role === "TEACHER";
  switch (exam.status) {
    case "DRAFT":
      return { type: "patch", status: "ACTIVE", label: "Open for Marks" };
    case "ACTIVE":
      // Teachers go straight to marks; office exams need a datesheet first.
      if (isTeacher) return { type: "patch", status: "MARKS_ENTRY", label: "Start Entering Marks" };
      return hasSchedule
        ? { type: "patch", status: "MARKS_ENTRY", label: "Start Entering Marks" }
        : { type: "open", label: "Set Dates" };
    case "MARKS_ENTRY":
      return { type: "lock", label: isTeacher ? "Submit to Office" : "Lock Marks" };
    case "LOCKED":
      // Review and publish are office-only decisions.
      return isTeacher ? null : { type: "patch", status: "PRINCIPAL_REVIEWED", label: "Approve" };
    case "PRINCIPAL_REVIEWED":
      return isTeacher ? null : { type: "patch", status: "PUBLISHED", label: "Release Results" };
    default:
      return null;
  }
}

export interface MoveContext {
  role: ExamCycleRole;
  hasSchedule: boolean;
  meta?: ExamMeta;
}

/**
 * The answer to "what happens if I drop this card here?".
 *
 * A refusal always carries the reason in the same words the user would use,
 * and — where the block is fixable — the one place that fixes it, so a
 * rejected drop teaches instead of just bouncing.
 */
export type MoveVerdict =
  | { ok: true; kind: "patch"; status: ExamStatus; label: string; confirm?: string }
  | { ok: true; kind: "lock"; label: string; confirm?: string }
  | { ok: true; kind: "reject"; label: string }
  | { ok: false; reason: string; fix?: { label: string; tab?: "schedule" | "marks" } };

export function evaluateMove(
  exam: ExamItem,
  to: ColumnKey,
  ctx: MoveContext,
): MoveVerdict {
  const from = columnFor(exam, ctx.hasSchedule, ctx.role);
  const isTeacher = ctx.role === "TEACHER";

  if (from === to) return { ok: false, reason: "This exam is already at this stage." };

  if (exam.status === "PUBLISHED") {
    return {
      ok: false,
      reason: "Results are already out. Published results cannot be moved back.",
    };
  }

  switch (to) {
    case "PLANNING":
    case "SCHEDULE": {
      if (exam.isLocked || from === "REVIEW") {
        return {
          ok: false,
          reason: "Marks are locked. Send them back to the teacher instead of moving the card.",
        };
      }
      if (from === "MARKS") {
        if (to === "SCHEDULE" && !ctx.hasSchedule) {
          return {
            ok: false,
            reason: "This exam has no datesheet yet — add dates and it moves here on its own.",
            fix: { label: "Set dates", tab: "schedule" },
          };
        }
        if (to === "PLANNING" && ctx.hasSchedule) {
          return {
            ok: false,
            reason: "This exam has a datesheet. Clear it under Dates & Rooms to move it back here.",
            fix: { label: "Open dates", tab: "schedule" },
          };
        }
        return {
          ok: true,
          kind: "patch",
          status: "ACTIVE",
          label: "Reopen for preparation",
          confirm:
            "Teachers will not be able to record any more marks until you start marks entry again. Marks already saved are kept.",
        };
      }
      if (to === "SCHEDULE") {
        return {
          ok: false,
          reason: "Add dates and rooms to this exam — the card moves here by itself once a paper is scheduled.",
          fix: { label: "Set dates", tab: "schedule" },
        };
      }
      return {
        ok: false,
        reason: "Clear the datesheet under Dates & Rooms to move this exam back to preparation.",
        fix: { label: "Open dates", tab: "schedule" },
      };
    }

    case "MARKS": {
      if (from === "REVIEW") {
        if (isTeacher) {
          return { ok: false, reason: "The office decides when locked marks come back to you." };
        }
        return { ok: true, kind: "reject", label: "Send marks back" };
      }
      if (!isTeacher && !ctx.hasSchedule) {
        return {
          ok: false,
          reason: "Set the exam dates before marks entry opens.",
          fix: { label: "Set dates", tab: "schedule" },
        };
      }
      return { ok: true, kind: "patch", status: "MARKS_ENTRY", label: "Start entering marks" };
    }

    case "REVIEW": {
      if (from !== "MARKS") {
        return {
          ok: false,
          reason: "Only an exam that is in marks entry can be locked and sent for approval.",
        };
      }
      const m = ctx.meta;
      if (m && m.expectedMarks > 0 && m.enteredMarks < m.expectedMarks) {
        const missing = m.expectedMarks - m.enteredMarks;
        return {
          ok: false,
          reason: `${missing} of ${m.expectedMarks} marks are still missing. Every student needs a mark in every subject before this exam can be locked.`,
          fix: { label: "Enter marks", tab: "marks" },
        };
      }
      return {
        ok: true,
        kind: "lock",
        label: isTeacher ? "Submit to office" : "Lock marks",
        confirm:
          "Locking generates the report cards and stops teachers editing these marks. You can still send them back afterwards.",
      };
    }

    case "PUBLISHED": {
      if (isTeacher) return { ok: false, reason: "Only the school office releases results." };
      if (exam.status === "LOCKED") {
        return {
          ok: false,
          reason: "Approve the marks first, then release the results.",
        };
      }
      if (exam.status !== "PRINCIPAL_REVIEWED") {
        return {
          ok: false,
          reason: "Lock the marks and approve them before releasing results to families.",
        };
      }
      return {
        ok: true,
        kind: "patch",
        status: "PUBLISHED",
        label: "Release results",
        confirm: "Families will be able to see these results as soon as you release them.",
      };
    }
  }
}

export function classLabel(item: { name: string; section?: string | null } | null | undefined) {
  if (!item) return "Unassigned";
  return [item.name, item.section].filter(Boolean).join(" ");
}

/** How far along marks entry is, as a 0–100 percentage. */
export function marksProgress(meta?: ExamMeta): number {
  if (!meta || meta.expectedMarks <= 0) return 0;
  return Math.min(100, Math.round((meta.enteredMarks / meta.expectedMarks) * 100));
}

/**
 * Exams the user should look at before anything else: marks sent back, marks
 * entry that has stalled short of complete, and results approved but not yet
 * released.
 */
export function needsAttention(
  exam: ExamItem,
  meta: ExamMeta | undefined,
  hasSchedule: boolean,
  role: ExamCycleRole = "OFFICE",
): boolean {
  if (exam.rejectionReason) return true;
  // A missing datesheet only blocks office exams — teachers never build one, so
  // flagging every unstarted quiz would make the filter useless for them.
  if (role !== "TEACHER" && exam.status === "ACTIVE" && !hasSchedule) return true;
  if (exam.status === "MARKS_ENTRY") {
    return !meta || meta.expectedMarks === 0 || meta.enteredMarks < meta.expectedMarks;
  }
  if (exam.status === "LOCKED" || exam.status === "PRINCIPAL_REVIEWED") return true;
  return false;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "12 Sep" or "12–16 Sep" for a paper window. */
export function formatDateRange(first: string | null, last: string | null): string | null {
  if (!first) return null;
  const start = new Date(first);
  if (!last || last === first) return DATE_FMT.format(start);
  return `${DATE_FMT.format(start)} – ${DATE_FMT.format(new Date(last))}`;
}

/** Long form used by the timeline's day headings. */
export function formatDayHeading(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/** Whole days from today; negative when the date has passed. */
export function daysFromToday(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
