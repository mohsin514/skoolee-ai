import { zonedInstant } from "@/lib/meetings/time";

/**
 * SKO-505 My Next Paper: one list per learner of the published date-sheet papers (paper sittings) and the
 * online sittings they are assigned, with the state of each and the next one to sit. Paper times are the
 * school's wall clock, converted to instants in the school time zone, so the countdown is the school's.
 */
export type TimelineState = "UPCOMING" | "OPEN" | "IN_PROGRESS" | "SUBMITTED" | "RESULT_RELEASED" | "MISSED" | "DONE";
export interface TimelineEntry {
  id: string; kind: "PAPER" | "ONLINE"; title: string; subject: string | null;
  date: string; startsAt: string | null; endsAt: string | null;
  room: string | null; seat: string | null; invigilator: string | null; mode: string | null; state: TimelineState;
}
export interface PublishedPaperRow { scheduleId: string; examTitle: string; subjectName: string; date: string; startTime: string | null; endTime: string | null; classId: string }
export interface SeatRow { scheduleId: string; room: string; seat: string; invigilator: string | null }
export interface OnlineRow { id: string; title: string; subject: string | null; startsAt: Date; endsAt: Date; mode: string; resultsReleasedAt: Date | null; attempt: { status: string } | null }

const ACTIVE: readonly TimelineState[] = ["UPCOMING", "OPEN", "IN_PROGRESS"];

export function buildExamTimeline(input: { papers: readonly PublishedPaperRow[]; seats: readonly SeatRow[]; online: readonly OnlineRow[]; now: Date; timeZone: string }) {
  const { now, timeZone } = input;
  const localDate = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  const papers = input.papers.map((paper): TimelineEntry => {
    const seat = input.seats.find(row => row.scheduleId === paper.scheduleId);
    const starts = paper.startTime ? zonedInstant(paper.date, paper.startTime, timeZone) : null;
    const ends = paper.endTime ? zonedInstant(paper.date, paper.endTime, timeZone) : null;
    // A paper without a period is still on the date sheet; it reads as past once its day has gone.
    const endOfDay = zonedInstant(paper.date, "23:59", timeZone);
    const state: TimelineState = starts && now < starts ? "UPCOMING" : ends && now < ends ? "OPEN" : !starts && now < endOfDay ? "UPCOMING" : "DONE";
    return { id: `paper:${paper.scheduleId}`, kind: "PAPER", title: paper.examTitle, subject: paper.subjectName, date: paper.date, startsAt: starts?.toISOString() ?? null, endsAt: ends?.toISOString() ?? null, room: seat?.room ?? null, seat: seat?.seat ?? null, invigilator: seat?.invigilator ?? null, mode: null, state };
  });
  const online = input.online.map((sitting): TimelineEntry => {
    const status = sitting.attempt?.status ?? null;
    const state: TimelineState = sitting.resultsReleasedAt && now >= sitting.endsAt && status === "REVIEWED" ? "RESULT_RELEASED"
      : status === "SUBMITTED" || status === "REVIEWED" ? "SUBMITTED"
      : now < sitting.startsAt ? "UPCOMING"
      : now < sitting.endsAt ? (status === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN")
      : "MISSED";
    return { id: `online:${sitting.id}`, kind: "ONLINE", title: sitting.title, subject: sitting.subject, date: localDate(sitting.startsAt), startsAt: sitting.startsAt.toISOString(), endsAt: sitting.endsAt.toISOString(), room: null, seat: null, invigilator: null, mode: sitting.mode, state };
  });
  const order = (a: TimelineEntry, b: TimelineEntry) => (a.startsAt ?? `${a.date}T23:59`).localeCompare(b.startsAt ?? `${b.date}T23:59`) || a.id.localeCompare(b.id);
  const all = [...papers, ...online].sort(order);
  const upcoming = all.filter(entry => ACTIVE.includes(entry.state));
  const past = all.filter(entry => !ACTIVE.includes(entry.state)).reverse();
  return { now: now.toISOString(), timeZone, next: upcoming[0] ?? null, upcoming, past };
}
