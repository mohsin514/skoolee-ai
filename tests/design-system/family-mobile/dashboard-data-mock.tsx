import { useParentData as useBaseParent, useStudentData as useBaseStudent, LONG_ROLL_A } from './data-mock';
export { FixtureData } from './data-mock';
export const PUBLISHED_EXAM_TITLE = 'Published end-of-term assessment with a complete and deliberately long examination title';
export const NEXT_TASK_TITLE = 'Synthetic essay on the water cycle with a deliberately long and complete assignment title';
const publishedReport = { id: 'report-one', status: 'PUBLISHED', term: 'TERM 1', academicYear: 2026, examTitle: PUBLISHED_EXAM_TITLE, percentage: 80, grade: 'A', remarksEn: 'Synthetic approved report with readable feedback and a full published assessment title.' };
// Home reads the latest released card and the outstanding totals from every open invoice (F19).
export function useParentData() {
  const base = useBaseParent();
  return { ...base, data: { ...base.data, fees: [], feeTotals: [{ currency: 'USD', outstanding: 4500, invoices: 1 }], reportCards: [publishedReport], marksByExam: [], attendance: { rate: 90, total: 10, present: 9, recent: [] } } };
}
// Today renders StudentToday only (M99); the page header names the learner's roll number, class and campus.
export function useStudentData() {
  const base = useBaseStudent();
  return { ...base, data: { ...base.data, user: { ...base.data.user, id: 'child-a', classId: 'class-a', campusName: 'International School', rollNo: LONG_ROLL_A, profileImageUrl: null, reportCards: [publishedReport] } } };
}
/** The /api/student/today payload for a school day with one lesson, one task due and nothing returned. */
export function studentTodayPayload() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const due = new Date(now.getTime() + 26 * 3_600_000).toISOString();
  const lesson = { id: 'lesson-one', startTime: '08:00', endTime: '08:45', kind: 'CLASS', subject: 'Mathematics and statistics with a long subject name', teacher: 'Synthetic teacher', room: '12' };
  return {
    success: true,
    data: {
      day, today: day, timezone: 'Asia/Karachi', clock: null, schoolDay: true, closure: null, cycle: null, timetableVersion: 3,
      lessons: [lesson], current: null, next: lesson, examLock: false, activeExam: null,
      nextAction: { kind: 'NEXT_DUE', title: NEXT_TASK_TITLE, href: '/student/assignments?open=task-one&from=today', dueAt: due },
      work: [{ id: 'task-one', title: NEXT_TASK_TITLE, state: 'OPEN', dueAt: due, extended: false, overdue: false, canSubmit: true, draftSavedAt: null, href: '/student/assignments?open=task-one&from=today' }],
      upcomingExams: [], returned: [], refreshedAt: now.toISOString(), catchUp: [],
    },
  };
}
/** The /api/parent/inbox payload: one fee request for the selected child, so Home has its contextual primary action. */
export function parentInboxPayload() {
  const now = new Date().toISOString();
  return {
    success: true,
    data: {
      children: [{ id: 'child-a', name: 'Same pupil name طفل ایک جیسا', schoolName: 'International School' }, { id: 'child-b', name: 'Same pupil name طفل ایک جیسا', schoolName: 'International School' }],
      unavailable: [], counts: { action: 1, waiting: 0, completed: 0 }, refreshedAt: now,
      items: [{ id: 'fee:invoice-one', kind: 'PAY_FEE', state: 'ACTION', childId: 'child-a', childName: 'Same pupil name طفل ایک جیسا', schoolName: 'International School', campusName: 'North Campus', title: 'USD 45.00', detail: 'INV-2026-0001', dueAt: now, overdue: false, at: now, href: '/parent/fees?invoice=invoice-one', completedByOther: false, receipt: null }],
    },
  };
}
