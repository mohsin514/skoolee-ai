import { dashboardPathForRole } from "@/lib/roles";

/** Only verified public routes/deep links; internal-only console tabs return their dashboard. */
export function moduleWorkspaceHref(role: string, module: string): string {
  if (["ADMIN", "CAMPUS_ADMIN"].includes(role)) {
    const views: Record<string, string> = { students: "students", admissions: "admission-queries", academics: "academic-hub", school: "institution", timetable: "timetable", exams: "exam-cycles", reports: "report-cards", staff: "teachers", attendance: "attendance", fees: "fees", finance: "fees", transport: "transport", dormitory: "dormitory", inventory: "inventory", library: "library" };
    if (views[module]) return `/admin?view=${views[module]}`;
  }
  if (role === "TEACHER") {
    const routes: Record<string, string> = { students: "students", timetable: "timetable", attendance: "attendance", exams: "tests", reports: "reports", leave: "leave" };
    if (routes[module]) return `/teacher/${routes[module]}`;
  }
  if (["curriculum", "assessment", "ai"].includes(module)) return "/ai";
  return dashboardPathForRole(role);
}
