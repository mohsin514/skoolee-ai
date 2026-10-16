import { useParentData as useBaseParent, useStudentData as useBaseStudent, LONG_ROLL_A } from './data-mock';
export { FixtureData } from './data-mock';
export const PUBLISHED_EXAM_TITLE = 'Published end-of-term assessment with a complete and deliberately long examination title';
const publishedReport = { id: 'report-one', status: 'PUBLISHED', term: 'TERM 1', academicYear: 2026, examTitle: PUBLISHED_EXAM_TITLE, percentage: 80, grade: 'A', remarksEn: 'Synthetic approved report with readable feedback and a full published assessment title.' };
const mark = { marksObtained: 82, isAbsent: false, subject: { name: 'Mathematics', totalMarks: 100 }, exam: { id: 'exam-one', title: PUBLISHED_EXAM_TITLE } };
export function useParentData() {
  const base = useBaseParent();
  return { ...base, data: { ...base.data, fees: [], reportCards: [publishedReport], marksByExam: [{ examTitle: PUBLISHED_EXAM_TITLE, marks: [{ subject: 'Mathematics', obtained: 82, total: 100 }] }], attendance: { rate: 90, total: 10, present: 9, recent: [] } } };
}
export function useStudentData() {
  const base = useBaseStudent();
  return { ...base, data: { ...base.data, user: { ...base.data.user, id: 'child-a', classId: 'class-a', campusName: 'International School', rollNo: LONG_ROLL_A, profileImageUrl: null, marks: [mark], attendance: [], attendanceRate: null, invoices: [], balanceDue: 0, balanceCurrency: 'USD', subjects: [{ name: 'Mathematics' }], aiInsights: [{ id: 'insight-one', feature: 'explain_report_card', summary: 'Synthetic published academic summary for the learner.' }], reportCards: [publishedReport] } } };
}
