import type { PermissionModule } from "@/lib/permissions";

/** Stable destinations, never translated display labels. Null means shell-level navigation. */
export function moduleForHref(href?: string): PermissionModule | null {
  const path = href?.split(/[?#]/)[0];
  if (!path) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const leaf = segments[1];
  const modules: Record<string, PermissionModule> = {
    students: 'students', classes: 'timetable', coursework: 'timetable', timetable: 'timetable', calendar: 'timetable',
    attendance: 'attendance', marks: 'exams', tests: 'exams', reports: 'reports', results: 'reports', fees: 'fees',
    leave: 'leave', ai: 'ai', insights: 'ai', 'staff-hierarchy': 'staff', analytics: 'reports', communications: 'reports',
  };
  return modules[leaf] ?? null;
}

export function moduleForView(view: string): PermissionModule | null {
  const modules: Record<string, PermissionModule> = {
    students: 'students', 'student-setup': 'students', 'promote-archive': 'students', 'year-cycle': 'students',
    'admission-queries': 'admissions', 'academic-hub': 'timetable', 'year-setup': 'timetable', 'academic-model': 'exams', classes: 'timetable',
    'school-calendar': 'timetable', timetable: 'timetable', 'period-setup': 'timetable', 'class-rooms': 'timetable',
    'exam-cycles': 'exams', 'grading-rules': 'exams', 'report-cards': 'reports', teachers: 'staff',
    'staff-hierarchy': 'staff', 'teacher-performance': 'staff', permissions: 'staff', leadership: 'staff',
    attendance: 'attendance', fees: 'fees', ai: 'ai', leave: 'leave', transport: 'transport',
    dormitory: 'dormitory', inventory: 'inventory', library: 'library',
    'fee-overview': 'fees', 'fee-structures': 'fees', 'fee-layers': 'fees', invoices: 'fees', payments: 'fees',
    'fee-reports': 'reports', accounts: 'accounts', payroll: 'payroll', visitors: 'front-desk',
    complaints: 'front-desk', postal: 'front-desk', 'phone-calls': 'front-desk', certificates: 'students',
  };
  return modules[view] ?? null;
}
export type NavigationAccess = Record<string, boolean>;
