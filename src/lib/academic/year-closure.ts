import { prisma } from "@/lib/db/prisma";

/**
 * Closing an academic year is the point of no return: marks stop being
 * editable, report cards become the permanent record, and students get promoted
 * out of their classes. A year must therefore be genuinely finished before it
 * can close — every exam marked, every report card generated, and the principal
 * having reviewed and released the results.
 *
 * This module is the single source of truth for "is the year finished?". The
 * API enforces it and the UI renders it, so the rule and the explanation can
 * never drift apart.
 */

export type ClosureStepId =
  | "marks-complete"
  | "report-cards"
  | "principal-approved"
  | "results-released";

export interface ClosureStep {
  id: ClosureStepId;
  /** Plain-language name shown to admins. */
  label: string;
  /** What "done" means for this step. */
  requirement: string;
  done: boolean;
  /** How many things still block this step. */
  outstanding: number;
  /** Human explanation of what is left, or confirmation when done. */
  detail: string;
  /** Which screen fixes it. */
  view: "exam-cycles" | "report-cards";
  /** Who is responsible for clearing it. */
  owner: "Teachers" | "Office" | "Principal";
}

export interface YearClosureReport {
  academicYear: number;
  canClose: boolean;
  steps: ClosureStep[];
  /** Short reasons, used for API error messages. */
  blockingReasons: string[];
  totals: { exams: number; studentsWithReportCards: number };
}

/** Exams whose marks are still being worked on. */
const UNFINISHED_MARK_STATUSES = ["DRAFT", "ACTIVE", "MARKS_ENTRY"];

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export async function getYearClosureReport(
  campusId: string,
  academicYear: number,
): Promise<YearClosureReport> {
  const exams = await prisma.exam.findMany({
    where: { campusId, academicYear },
    select: {
      id: true,
      title: true,
      status: true,
      _count: { select: { reportCards: true } },
    },
  });

  const totalExams = exams.length;

  // 1 — Marks finished and locked by the teachers.
  const marksOutstanding = exams.filter((e) => UNFINISHED_MARK_STATUSES.includes(e.status));

  // 2 — Report cards generated. Only meaningful once an exam is locked, since
  // locking is what generates them.
  const lockedOrLater = exams.filter((e) => !UNFINISHED_MARK_STATUSES.includes(e.status));
  const missingReportCards = lockedOrLater.filter((e) => e._count.reportCards === 0);

  // 3 — Principal has reviewed. Anything still sitting at LOCKED is awaiting them.
  const awaitingPrincipal = exams.filter((e) => e.status === "LOCKED");

  // 4 — Results released to families.
  const notPublished = exams.filter((e) => e.status !== "PUBLISHED");

  const studentsWithReportCards = await prisma.reportCard.count({
    where: { campusId, exam: { academicYear } },
  });

  const noExamsAtAll = totalExams === 0;

  const steps: ClosureStep[] = [
    {
      id: "marks-complete",
      label: "All marks entered",
      requirement: "Every exam has its marks in and locked.",
      done: !noExamsAtAll && marksOutstanding.length === 0,
      outstanding: noExamsAtAll ? 1 : marksOutstanding.length,
      detail: noExamsAtAll
        ? "No exams exist for this year, so there is nothing to close."
        : marksOutstanding.length === 0
          ? "Every exam is marked and locked."
          : `${plural(marksOutstanding.length, "exam is", "exams are")} still awaiting marks: ${marksOutstanding
              .slice(0, 3)
              .map((e) => e.title)
              .join(", ")}${marksOutstanding.length > 3 ? "…" : ""}`,
      view: "exam-cycles",
      owner: "Teachers",
    },
    {
      id: "report-cards",
      label: "Report cards generated",
      requirement: "Every locked exam has produced report cards.",
      done: !noExamsAtAll && missingReportCards.length === 0,
      outstanding: noExamsAtAll ? 1 : missingReportCards.length,
      detail: noExamsAtAll
        ? "Nothing to generate yet."
        : missingReportCards.length === 0
          ? `${plural(studentsWithReportCards, "report card", "report cards")} generated.`
          : `${plural(missingReportCards.length, "exam has", "exams have")} no report cards yet.`,
      view: "report-cards",
      owner: "Office",
    },
    {
      id: "principal-approved",
      label: "Principal has approved",
      requirement: "The principal has reviewed every set of results.",
      done: !noExamsAtAll && awaitingPrincipal.length === 0,
      outstanding: noExamsAtAll ? 1 : awaitingPrincipal.length,
      detail: noExamsAtAll
        ? "Nothing to approve yet."
        : awaitingPrincipal.length === 0
          ? "The principal has signed off on all results."
          : `${plural(awaitingPrincipal.length, "exam is", "exams are")} waiting for the principal's approval.`,
      view: "exam-cycles",
      owner: "Principal",
    },
    {
      id: "results-released",
      label: "Results released to families",
      requirement: "Every exam has been published to students and parents.",
      done: !noExamsAtAll && notPublished.length === 0,
      outstanding: noExamsAtAll ? 1 : notPublished.length,
      detail: noExamsAtAll
        ? "Nothing to release yet."
        : notPublished.length === 0
          ? "All results are visible to families."
          : `${plural(notPublished.length, "exam has", "exams have")} not been released yet.`,
      view: "exam-cycles",
      owner: "Office",
    },
  ];

  // With no exams every step trivially fails; saying so four times is noise.
  const blockingReasons = noExamsAtAll
    ? [
        "This year has no exams, so there are no results to finalise. If it was created by mistake, the principal can close it.",
      ]
    : steps.filter((s) => !s.done).map((s) => s.detail);

  return {
    academicYear,
    canClose: steps.every((s) => s.done),
    steps,
    blockingReasons,
    totals: { exams: totalExams, studentsWithReportCards },
  };
}

/**
 * A new year cannot begin while an older one is still open — otherwise marks
 * and promotions from two years run at once and nobody can tell which year a
 * class belongs to. Returns the cycles that must be closed first.
 */
export async function getUnclosedPriorCycles(campusId: string, newAcademicYear: number) {
  return prisma.academicCycle.findMany({
    where: {
      campusId,
      academicYear: { lt: newAcademicYear },
      status: { not: "ENDED" },
    },
    orderBy: { academicYear: "asc" },
    select: { id: true, label: true, academicYear: true, status: true },
  });
}
