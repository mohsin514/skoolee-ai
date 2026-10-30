import { dashboardPathForRole } from "@/lib/roles";

export const EXAM_STUDIO_HREF = "/ai/studio";

/** Only verified public routes/deep links; internal-only console tabs return their dashboard. */
export function moduleWorkspaceHref(role: string, module: string): string {
  if (["ADMIN", "CAMPUS_ADMIN"].includes(role)) {
    const views: Record<string, string> = { students: "students", admissions: "admissions", academics: "academic-hub", school: "settings", timetable: "timetable", exams: "exam-cycles", reports: "report-cards", staff: "teachers", attendance: "attendance", fees: "fees", finance: "fees", transport: "transport", dormitory: "dormitory", inventory: "inventory", library: "library" };
    if (views[module]) return `/admin?view=${views[module]}`;
  }
  if (role === "PRINCIPAL") {
    // G42: academic deep links land in the principal's own console views (registry ids, §3).
    const views: Record<string, string> = { students: "students", academics: "overview", timetable: "timetable", exams: "exam-cycles", reports: "report-cards", staff: "teachers", attendance: "attendance", leave: "leave" };
    if (views[module]) return `/principal?view=${views[module]}`;
  }
  if (role === "TEACHER") {
    const routes: Record<string, string> = { students: "students", timetable: "timetable", attendance: "attendance", exams: "tests", reports: "reports", leave: "leave" };
    if (routes[module]) return `/teacher/${routes[module]}`;
  }
  if (module === "exam-studio") return EXAM_STUDIO_HREF;
  if (["curriculum", "assessment", "ai"].includes(module)) return "/ai";
  return dashboardPathForRole(role);
}
