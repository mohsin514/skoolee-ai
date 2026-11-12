/**
 * Which exams the admin "Report cards" view lists (SKAI-1821).
 *
 * Every listed exam mounts a ReportCardPipeline that loads /api/reports, and exams are per class, so listing every
 * released exam from every year meant classes x terms x years heavy requests on open. By default only exams from
 * the active academic year (or later) are listed; earlier years sit behind "Show earlier years". The linked
 * `?exam=` exam is always listed, and listed first, whatever its year. Without a known active year nothing is
 * hidden (the previous behaviour).
 */
export type ReportCardExam = { id: string; isLocked?: boolean | null; status?: string | null; academicYear?: number | string | null };

const RELEASED_STATUSES = ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"];

export function isReportCardExam(exam: ReportCardExam): boolean {
  return Boolean(exam.isLocked) || RELEASED_STATUSES.includes(exam.status ?? "");
}

export function reportCardExamsInView<T extends ReportCardExam>(
  recentExams: readonly T[] | null | undefined,
  options: { activeYear: number | null | undefined; focusExam: string | null; showEarlier: boolean },
): { exams: T[]; earlierCount: number } {
  const { activeYear, focusExam, showEarlier } = options;
  const released = (recentExams ?? []).filter(isReportCardExam);
  const isEarlier = (exam: T) =>
    typeof activeYear === "number" && exam.id !== focusExam && Number(exam.academicYear) < activeYear;
  const earlierCount = released.filter(isEarlier).length;
  const exams = (showEarlier ? released : released.filter((exam) => !isEarlier(exam)))
    .sort((a, b) => (a.id === focusExam ? -1 : b.id === focusExam ? 1 : 0));
  return { exams, earlierCount };
}
