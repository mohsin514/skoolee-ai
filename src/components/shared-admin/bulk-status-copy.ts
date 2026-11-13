import { countLabel, isSingularCount } from "@/lib/locale/count-label";

type Ui = (source: string, values?: unknown[]) => string;

/**
 * SKAI-1929: the bulk archive/restore confirmation counts pupils with each language's plural rules
 * ("Archive 1 student?", "Archive 3 students?") and the button agrees with the count, never "student(s)".
 */
export function bulkStatusConfirmCopy(target: "archived" | "active", count: number, language: string, ui: Ui): { title: string; confirmLabel: string; description?: string } {
  const students = countLabel(language, count, "student");
  if (target === "archived") {
    return {
      title: ui("Archive {0}?", [students]),
      confirmLabel: ui(isSingularCount(language, count) ? "Archive student" : "Archive students"),
    };
  }
  return {
    title: ui("Restore these students?"),
    description: ui("{0} will return to the active roster in their existing class.", [students]),
    confirmLabel: ui("Restore"),
  };
}
