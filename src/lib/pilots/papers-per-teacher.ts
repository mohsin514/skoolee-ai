import { GO_NO_GO_CRITERIA } from "./go-no-go-config";

/**
 * SKAI-1174 pure "teachers generating ≥ N papers in the window" metric (SKAI-1005 §8 pilot usage).
 * Denominator: the school's active teachers (the invited cohort). Numerator: those teachers with at
 * least `minPapers` PAPER records created between the pilot start and the window end (or now).
 */
export type PaperRow = { createdById: string; createdAt: Date };
export type PapersPerTeacher = { value: number | null; withheld: string | null; teachers: number; qualifying: number; papers: number };

const DAY_MS = 86_400_000;

export function papersWindow(startsOn: Date, now: Date, windowDays: number = GO_NO_GO_CRITERIA.TEACHER_USAGE.windowDays) {
  const end = new Date(Math.min(startsOn.getTime() + windowDays * DAY_MS, now.getTime()));
  return { start: startsOn, end };
}

export function papersPerTeacher(teacherIds: readonly string[], papers: readonly PaperRow[], window: { start: Date; end: Date }, minPapers: number = GO_NO_GO_CRITERIA.TEACHER_USAGE.minPapers): PapersPerTeacher {
  const teachers = new Set(teacherIds);
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of papers) {
    if (!teachers.has(p.createdById) || p.createdAt < window.start || p.createdAt >= window.end) continue;
    counts.set(p.createdById, (counts.get(p.createdById) ?? 0) + 1);
    total++;
  }
  const qualifying = [...counts.values()].filter((n) => n >= minPapers).length;
  const base = { teachers: teachers.size, qualifying, papers: total };
  if (window.end <= window.start) return { ...base, value: null, withheld: "The pilot has not started yet." };
  if (!teachers.size) return { ...base, value: null, withheld: "No active teachers at the school, so no percentage is shown." };
  return { ...base, value: Math.round((qualifying / teachers.size) * 1000) / 10, withheld: null };
}
