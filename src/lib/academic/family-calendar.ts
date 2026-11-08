/**
 * SKAI-1027: families see exam dates on the calendar only from the published
 * date sheet. Draft rows never reach them; this folds published snapshot
 * papers into the calendar's per-exam date lists.
 */
export type CalendarExam = { id: string; title: string; examType: string; status: string; className: string; dates: string[] };
export type PublishedPaperLite = { examId: string; examTitle: string; classLabel: string; date: string | Date };

export function mergePublishedPapers(examMap: Map<string, CalendarExam>, published: PublishedPaperLite[], year: number) {
  const yearPrefix = `${year}-`;
  for (const p of published) {
    const dateStr = (p.date instanceof Date ? p.date.toISOString() : String(p.date)).slice(0, 10);
    if (!dateStr.startsWith(yearPrefix)) continue;
    if (!examMap.has(p.examId)) {
      examMap.set(p.examId, { id: p.examId, title: p.examTitle, examType: "", status: "", className: p.classLabel, dates: [] });
    }
    const entry = examMap.get(p.examId)!;
    if (!entry.dates.includes(dateStr)) entry.dates.push(dateStr);
  }
  return examMap;
}
