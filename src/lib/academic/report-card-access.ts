import { isCampusAdminRole } from "@/lib/roles";

/** SKAI-2087: report cards are academic records about minors. Only teachers (of their class), the academic
 *  lead and campus administration read them; accountant, librarian and receptionist hold the generic
 *  "reports" module (business reports) but not exams.view, so that module alone must not open them. */
export function canViewReportCards(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}
