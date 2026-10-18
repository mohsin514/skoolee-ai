import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { listAssignments } from "@/lib/assignments/service";
import { listSchoolAiExams } from "@/lib/school-ai/exam-service";
import { slotsOf, versionsFor } from "@/lib/timetable/versions";
import { classCatchUp, coverForDay } from "@/lib/cover/recovery";

// SKO-418: the student's Today read model. Every item comes from its own source workflow and keeps that
// source's state — opening a card never completes it. Lessons are the published timetable version in
// force on the chosen school-local date; work comes from the learner's released assignments (with any
// approved individual extension) and their assigned exams. Nothing here is invented or inferred.
//
// Next action, in this order (deterministic, first match wins):
//   1. an exam attempt in progress (resume it — while it runs, nothing else is offered);
//   2. work with a saved draft, soonest effective due date first (continue it);
//   3. open work that is overdue and still accepted, then work due on the chosen day;
//   4. the next open work by due date;
//   5. nothing — returned feedback to read is offered as an optional item instead.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const isoWeekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
const clockIn = (timeZone: string, at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

export type TodayWork = { id: string; title: string; state: string; dueAt: string; dueLocal: string; extended: boolean; overdue: boolean; canSubmit: boolean; draftSavedAt: string | null; href: string };
export type TodayAction = { kind: "RESUME_EXAM" | "CONTINUE_DRAFT" | "OVERDUE" | "DUE_TODAY" | "NEXT_DUE"; title: string; href: string; dueAt?: string; reason: string };

export async function studentToday(user: AuthUser, requestedDay: string | null, now = new Date()) {
  if (user.role !== "STUDENT") throw new ApiError("Today is for a student's own account.", 403);
  const student = await prisma.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true, fullName: true, classId: true, campusId: true, class: { select: { name: true, section: true, academicYear: true } } } });
  if (!student) throw new ApiError("An active student record is required.", 403);
  const locale = await getLocalePackage(user.schoolId, student.campusId, now);
  const today = calendarDateIn(locale.timezone, now);
  const day = requestedDay && DAY.test(requestedDay) ? requestedDay : today;
  if (Math.abs(new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) > 31 * 86_400_000) throw new ApiError("Choose a day within a month of today.", 400);
  const weekday = isoWeekday(day);
  const weekend = locale.weekend.map(value => value || 7).includes(weekday);
  const [holiday, cycle, timetable] = await Promise.all([
    prisma.holiday.findFirst({ where: { schoolId: user.schoolId, campusId: student.campusId, fromDate: { lte: new Date(`${day}T00:00:00Z`) }, toDate: { gte: new Date(`${day}T00:00:00Z`) } }, select: { name: true } }),
    prisma.academicCycle.findFirst({ where: { schoolId: user.schoolId, campusId: student.campusId, status: "ACTIVE" }, select: { label: true, academicYear: true } }),
    student.classId ? prisma.timetable.findFirst({ where: { schoolId: user.schoolId, classId: student.classId, status: "PUBLISHED" }, orderBy: { academicYear: "desc" }, select: { id: true } }) : null,
  ]);
  const schoolDay = !weekend && !holiday;

  // Lessons: the version in force on that date (a future version applies from its own date).
  const version = timetable ? (await versionsFor(timetable.id, day)).inForce : null;
  const lessons = schoolDay ? slotsOf(version).filter(slot => slot.dayOfWeek === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map(slot => ({ id: slot.id, startTime: slot.startTime, endTime: slot.endTime, kind: slot.slotType, subject: slot.subjectName, teacher: slot.teacherName, room: slot.roomNumber })) : [];
  // SKO-442: an approved cover shows who is teaching; catch-up work for missed lessons is listed separately.
  const cover = schoolDay ? await coverForDay(user.schoolId, lessons.map(l => l.id), day) : new Map<string, string>();
  for (const lesson of lessons) if (cover.has(lesson.id)) Object.assign(lesson, { teacher: cover.get(lesson.id) ?? lesson.teacher, cover: true });
  const catchUp = student.classId ? await classCatchUp(user.schoolId, student.classId) : [];
  const clock = day === today ? clockIn(locale.timezone, now) : null;
  const teaching = lessons.filter(lesson => lesson.kind === "CLASS" && lesson.subject);
  const current = clock ? teaching.find(lesson => lesson.startTime <= clock && clock < lesson.endTime) ?? null : null;
  const next = clock ? teaching.find(lesson => lesson.startTime > clock) ?? null : null;

  // Exams: the learner's own assigned exams; an attempt in progress is resumed, never restarted.
  const exams = await listSchoolAiExams(user).catch(() => [] as Awaited<ReturnType<typeof listSchoolAiExams>>);
  const examItems = exams.map(exam => ({ id: exam.id, title: exam.title, startsAt: exam.startsAt.toISOString(), endsAt: exam.endsAt.toISOString(), attempt: ("attempts" in exam && Array.isArray(exam.attempts) ? exam.attempts[0] as { id: string; status: string; submittedAt: Date | null } : null) ?? null, href: `/ai/exams/${exam.id}` }));
  const activeExam = examItems.find(exam => exam.attempt?.status === "IN_PROGRESS" && new Date(exam.endsAt) > now) ?? null;
  const dayEnd = new Date(`${addDays(day, 1)}T00:00:00Z`);
  const upcomingExams = examItems.filter(exam => !exam.attempt?.submittedAt && exam.attempt?.status !== "IN_PROGRESS" && new Date(exam.endsAt) > now && new Date(exam.startsAt) < new Date(dayEnd.getTime() + 7 * 86_400_000))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Work: released assignments in their source states, with the learner's effective due date.
  const listed = await listAssignments(user, {}, now);
  if (listed.mode === "staff") throw new ApiError("Today is for a student's own account.", 403);
  const assignments = listed.assignments;
  const work: TodayWork[] = assignments.map(item => ({
    id: item.id, title: item.title, state: item.state, dueAt: new Date(item.effectiveDueAt).toISOString(), dueLocal: item.extension?.dueLocal ?? item.dueLocal,
    extended: Boolean(item.extension), overdue: item.overdue, canSubmit: item.canSubmit, draftSavedAt: item.draft?.savedAt ? new Date(item.draft.savedAt).toISOString() : null,
    href: `/student/assignments?open=${encodeURIComponent(item.id)}&from=today`,
  }));
  const open = work.filter(item => ["OPEN", "DRAFT", "REOPENED"].includes(item.state));
  const dueOnDay = (item: TodayWork) => calendarDateIn(locale.timezone, new Date(item.dueAt)) === day;
  const returned = assignments.filter(item => item.state === "RETURNED").map(item => {
    const feedback = item.versions.map(v => v.feedback).find(f => f && f.returnedAt);
    return feedback?.returnedAt && now.getTime() - new Date(feedback.returnedAt).getTime() < 14 * 86_400_000 ? { id: item.id, title: item.title, returnedAt: new Date(feedback.returnedAt).toISOString(), href: `/student/assignments?open=${encodeURIComponent(item.id)}&from=today` } : null;
  }).filter(Boolean) as { id: string; title: string; returnedAt: string; href: string }[];

  let nextAction: TodayAction | null = null;
  const drafts = open.filter(item => item.state === "DRAFT" && item.canSubmit).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const overdue = open.filter(item => item.overdue && item.canSubmit).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const dueToday = open.filter(item => !item.overdue && dueOnDay(item)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const upcoming = open.filter(item => !item.overdue && item.canSubmit).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (activeExam) nextAction = { kind: "RESUME_EXAM", title: activeExam.title, href: activeExam.href, reason: "EXAM_IN_PROGRESS" };
  else if (drafts[0]) nextAction = { kind: "CONTINUE_DRAFT", title: drafts[0].title, href: drafts[0].href, dueAt: drafts[0].dueAt, reason: "SAVED_DRAFT" };
  else if (overdue[0]) nextAction = { kind: "OVERDUE", title: overdue[0].title, href: overdue[0].href, dueAt: overdue[0].dueAt, reason: "PAST_DUE_STILL_ACCEPTED" };
  else if (dueToday[0]) nextAction = { kind: "DUE_TODAY", title: dueToday[0].title, href: dueToday[0].href, dueAt: dueToday[0].dueAt, reason: "DUE_ON_THIS_DAY" };
  else if (upcoming[0]) nextAction = { kind: "NEXT_DUE", title: upcoming[0].title, href: upcoming[0].href, dueAt: upcoming[0].dueAt, reason: "NEXT_DUE" };

  return {
    day, today, timezone: locale.timezone, clock, weekday, weekend: locale.weekend, schoolDay, closure: holiday ? { kind: "HOLIDAY" as const, name: holiday.name } : weekend ? { kind: "WEEKEND" as const, name: null } : null,
    cycle, student: { name: student.fullName, className: [student.class?.name, student.class?.section].filter(Boolean).join(" ") },
    timetableVersion: version?.version ?? null, lessons, current, next,
    // While an exam is running, Today offers only the way back into it.
    examLock: Boolean(activeExam), activeExam,
    nextAction,
    work: activeExam ? [] : [...overdue, ...open.filter(item => !overdue.includes(item))].slice(0, 20),
    upcomingExams: activeExam ? [] : upcomingExams.slice(0, 5),
    returned: activeExam ? [] : returned.slice(0, 5),
    catchUp: activeExam ? [] : catchUp,
    refreshedAt: now.toISOString(),
  };
}
