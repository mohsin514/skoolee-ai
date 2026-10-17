// SKO-462: the impact of changing or removing a class or subject, fetched from the server before the
// change is confirmed and phrased through the UI catalog (EN/AR/UR) with numbered placeholders.
export type AcademicImpact = { kind: "class" | "subject"; id: string; label: string; archived: boolean; counts: Record<string, number> };
export type UiText = (source: string, values?: unknown[]) => string;

const COUNT_TEMPLATES: Record<string, string> = {
  students: "{0} enrolled student(s)", subjects: "{0} subject(s)", attendance: "{0} attendance record(s)", exams: "{0} exam(s)", marks: "{0} mark(s)",
  timetables: "{0} timetable(s)", publishedTimetables: "{0} published timetable(s)", assignmentHistory: "{0} teaching history record(s)",
  examSchedules: "{0} exam schedule(s)", timetableSlots: "{0} timetable lesson(s)", syllabusTopics: "{0} syllabus topic(s)",
  feeStructures: "{0} fee structure(s)", classHistory: "{0} class history record(s)", admissionQueries: "{0} admission enquiry(ies)",
};

export async function fetchAcademicImpact(kind: "class" | "subject", id: string): Promise<AcademicImpact> {
  const response = await fetch(`/api/academic/impact?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not calculate the impact of this change");
  return payload.impact as AcademicImpact;
}

export function describeCounts(counts: Record<string, number>, ui: UiText, keys?: string[]) {
  const parts = Object.entries(counts).filter(([key, count]) => Number(count) > 0 && (!keys || keys.includes(key)) && COUNT_TEMPLATES[key]).map(([key, count]) => ui(COUNT_TEMPLATES[key], [count]));
  return parts.length ? parts.join(" · ") : ui("no linked records");
}

/** The plain-language outcome of removing a subject, matching what the server will allow. */
export function subjectRemovalText(impact: AcademicImpact, ui: UiText) {
  const { marks = 0, exams = 0, examSchedules = 0 } = impact.counts;
  if (marks || exams || examSchedules) return ui("{0} has {1}, so it cannot be deleted. Move or remove those first; nothing will be changed now.", [impact.label, describeCounts(impact.counts, ui, ["marks", "exams", "examSchedules"])]);
  return ui("{0} has {1}. Deleting it removes the subject and frees its timetable lessons; its teaching-assignment history is kept.", [impact.label, describeCounts(impact.counts, ui)]);
}

/** The outcome of moving a subject to another teacher from today. */
export function teacherChangeText(impact: AcademicImpact, ui: UiText) {
  return ui("From today, {0} timetable lesson(s) of {1} move to the new teacher. {2} existing mark(s) keep their original marker, and the previous assignment stays in the teaching history.", [impact.counts.timetableSlots ?? 0, impact.label, impact.counts.marks ?? 0]);
}

/** Archive wording for a class, from the archive preview's dependency counts. */
export function classArchiveText(dependencies: Record<string, number>, ui: UiText) {
  const enrolled = Number(dependencies.students || 0), summary = describeCounts(dependencies, ui);
  return enrolled
    ? ui("This class has {0}. Move its {1} enrolled student(s) to another class first; a class with students is never archived or deleted.", [summary, enrolled])
    : ui("This class has {0}. Archive hides it from current class lists while preserving its academic and financial history. You can restore it later.", [summary]);
}
