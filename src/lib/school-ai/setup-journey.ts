/** Readiness is based on operational data, never on questionnaire completion. */
export interface SetupJourneyFacts {
  classes: number; activeCycles: number; teachers: number; students: number;
  classesWithSubjects: number; subjects: number; assignedSubjects: number;
  subjectsWithTopics: number; rooms: number; periods: number;
  classesWithPublishedTimetable: number; classesWithFees: number;
}
export type SetupJourneyStep = "academics" | "staff" | "students" | "subjects" | "resources" | "curriculum" | "timetable" | "fees";
export interface SetupJourneyItem { key: SetupJourneyStep; complete: boolean; blockedBy: SetupJourneyStep[]; evidence: number; target: number; workflow: string; module: string }
export function setupJourney(f: SetupJourneyFacts, outcome: string): SetupJourneyItem[] {
 const all = outcome === "complete", records = all || outcome === "records", academics = all || outcome === "exams" || outcome === "timetable";
 const items: SetupJourneyItem[] = [];
 const add = (key: SetupJourneyStep, complete: boolean, evidence: number, target: number, workflow: string, module: string, dependencies: SetupJourneyStep[] = []) => items.push({ key, complete, evidence, target, workflow, module, blockedBy: dependencies.filter(dependency => !items.find(item => item.key === dependency)?.complete) });
 add("academics", f.classes > 0 && f.activeCycles > 0, f.classes, 1, "academicSetup", "academics");
 if (records || academics) add("staff", f.teachers > 0, f.teachers, 1, "schoolSetup", "staff", ["academics"]);
 if (records || outcome === "fees") add("students", f.students > 0, f.students, 1, "sources", "students", ["academics"]);
 if (academics) {
  add("subjects", f.classes > 0 && f.classesWithSubjects === f.classes && f.subjects > 0 && f.assignedSubjects === f.subjects, f.assignedSubjects, f.subjects || 1, "schoolSetup", "academics", ["academics", "staff"]);
  if (all || outcome === "exams") add("curriculum", f.subjects > 0 && f.subjectsWithTopics === f.subjects, f.subjectsWithTopics, f.subjects || 1, "curriculum", "curriculum", ["subjects"]);
  if (all || outcome === "timetable") {
   add("resources", f.rooms > 0 && f.periods > 0, Number(f.rooms > 0) + Number(f.periods > 0), 2, "schoolSetup", "timetable", ["academics"]);
   add("timetable", f.classes > 0 && f.classesWithPublishedTimetable === f.classes, f.classesWithPublishedTimetable, f.classes || 1, "timetableSetup", "timetable", ["subjects", "resources"]);
  }
 }
 if (all || outcome === "fees") add("fees", f.classes > 0 && f.classesWithFees === f.classes, f.classesWithFees, f.classes || 1, "financeOperations", "fees", ["academics", "students"]);
 return items;
}
