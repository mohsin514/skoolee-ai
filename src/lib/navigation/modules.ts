import type { PermissionModule } from "@/lib/permissions";

/**
 * Stable destinations, never translated display labels. Null means shell-level navigation or a view gated
 * only by a capability key (see `src/lib/navigation/role-nav.ts`, which is the source of truth for
 * visibility; these maps serve legacy callers and must agree with it).
 */
export function moduleForHref(href?: string): PermissionModule | null {
  const path = href?.split(/[?#]/)[0];
  if (!path) return null;
  if (path === '/ai') return 'ai';
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const leaf = segments[1];
  const modules: Record<string, PermissionModule> = {
    students: 'students', classes: 'timetable', coursework: 'timetable', resources: 'timetable', assignments: 'timetable', timetable: 'timetable', calendar: 'timetable',
    attendance: 'attendance', marks: 'exams', tests: 'exams', curriculum: 'exams', accommodations: 'exams', access: 'exams', reports: 'reports', results: 'reports', fees: 'fees',
    // M72: "My teaching evidence" is a reports surface, not an AI one.
    leave: 'leave', ai: 'ai', insights: 'reports', 'staff-hierarchy': 'staff', analytics: 'reports', communications: 'reports',
  };
  return modules[leaf] ?? null;
}

export function moduleForView(view: string): PermissionModule | null {
  const modules: Record<string, PermissionModule | null> = {
    students: 'students', 'student-setup': 'students', 'promote-archive': 'students', 'year-cycle': 'students', guardians: 'students',
    'admission-queries': 'admissions', applications: 'admissions', admissions: 'admissions', 'academic-hub': 'timetable', 'year-setup': 'timetable', 'academic-model': 'exams', classes: 'timetable',
    'school-calendar': 'timetable', timetable: 'timetable', 'period-setup': 'timetable', 'class-rooms': 'timetable', 'academic-rules': 'exams',
    'exam-cycles': 'exams', 'grading-rules': 'exams', 'report-cards': 'reports', engagement: 'reports', communications: 'reports', teachers: 'staff',
    'staff-hierarchy': 'staff', 'teacher-performance': 'staff', permissions: 'staff', leadership: 'staff',
    attendance: 'attendance', fees: 'fees', ai: 'ai', leave: 'leave', 'my-leave': 'leave', transport: 'transport',
    dormitory: 'dormitory', inventory: 'inventory', library: 'library', lending: 'library', catalogue: 'library',
    'fee-overview': 'fees', 'fee-structures': 'fees', 'fee-layers': 'fees', invoices: 'fees', payments: 'fees', tax: 'fees',
    'fee-reports': 'reports', accounts: 'accounts', payroll: 'payroll', visitors: 'front-desk',
    complaints: 'front-desk', postal: 'front-desk', 'phone-calls': 'front-desk', certificates: 'front-desk', 'front-desk': 'front-desk', pickup: 'front-desk',
    // Capability-gated views (institutionAuthority, billing, standaloneOwner, campusOps, pkgCanteen …): no module.
    canteen: null, 'school-settings': null, settings: null, access: null, approvals: null, billing: null, standards: null,
  };
  return modules[view] ?? null;
}
export type NavigationAccess = Record<string, boolean>;
