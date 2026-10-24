import type { SchoolAICopyKey } from "./copy";

export const SETUP_ANSWER_KEYS = ["schoolName", "country", "timezone", "campuses", "grades", "academicYear", "startDate", "endDate", "workingDays", "firstOutcome", "curriculum", "assessmentPolicy", "feePolicy", "communications", "resources", "staff", "students", "migrationSource"] as const;
export type SetupAnswerKey = typeof SETUP_ANSWER_KEYS[number];
export type SetupPath = "new" | "import" | "migrate";
export type SetupAnswers = Partial<Record<SetupAnswerKey, string>>;
export interface SetupDraft {
  path: SetupPath;
  answers: SetupAnswers;
  confirmedKeys: SetupAnswerKey[];
  step: "profile" | "academics" | "people" | "policies" | "review";
  currentQuestion?: SetupAnswerKey | "path";
}
export interface SetupQuestion { key: SetupAnswerKey | "path"; label: SchoolAICopyKey; hint: SchoolAICopyKey; section: SetupDraft["step"]; type: "text" | "date" | "path" | "outcome" }
const question = (key: SetupAnswerKey, section: SetupDraft["step"], hint: SchoolAICopyKey = "questionHint", label: SchoolAICopyKey = key): SetupQuestion => ({ key, label, hint, section, type: key === "startDate" || key === "endDate" ? "date" : key === "firstOutcome" ? "outcome" : "text" });

export function setupQuestions(draft: Pick<SetupDraft, "path" | "answers">): SetupQuestion[] {
  const items: SetupQuestion[] = [
    { key: "path", label: "setupPath", hint: "pathHint", section: "profile", type: "path" },
    question("schoolName", "profile"), question("country", "profile"), question("timezone", "profile", "timezoneHint"),
    question("campuses", "profile", "campusesHint"), question("grades", "academics"), question("academicYear", "academics"),
    question("startDate", "academics"), question("endDate", "academics"), question("workingDays", "academics"),
  ];
  if (draft.path !== "new") items.push(question("migrationSource", "people", "migrationHint"));
  items.push(question("firstOutcome", "academics", "outcomeHint"));
  const outcome = draft.answers.firstOutcome;
  if (outcome === "exams" || outcome === "complete") items.push(question("curriculum", "academics", "curriculumHint", "curriculumQuestion"), question("assessmentPolicy", "policies", "assessmentHint"));
  if (outcome === "timetable" || outcome === "complete") items.push(question("resources", "academics"), question("staff", "people", "staffHint"));
  if (outcome === "fees" || outcome === "complete") items.push(question("feePolicy", "policies", "feeHint"));
  if (outcome === "records" || outcome === "complete") {
    items.push(question("students", "people", "studentsHint"));
    if (outcome !== "complete") items.push(question("staff", "people", "staffHint"));
  }
  items.push(question("communications", "policies"));
  return items;
}

export function validateSetupAnswer(key: SetupQuestion["key"], value: string, answers: SetupAnswers): "required" | "dateError" | "timezoneError" | undefined {
  if (!value.trim()) return "required";
  if (key === "timezone") {
    try { new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format(); } catch { return "timezoneError"; }
  }
  if (key === "startDate" || key === "endDate") {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "dateError";
    const start = key === "startDate" ? value : answers.startDate;
    const end = key === "endDate" ? value : answers.endDate;
    if (start && end && start > end) return "dateError";
  }
}

export function setupReadiness(answers: SetupAnswers) {
  const groups: { label: SchoolAICopyKey; keys: SetupAnswerKey[] }[] = [
    { label: "profile", keys: ["schoolName", "country", "timezone", "campuses"] },
    { label: "academics", keys: ["grades", "academicYear", "startDate", "endDate", "workingDays"] },
  ];
  const outcome = answers.firstOutcome;
  if (outcome === "exams" || outcome === "complete") groups.push({ label: "exams", keys: ["curriculum", "assessmentPolicy"] });
  if (outcome === "timetable" || outcome === "complete") groups.push({ label: "timetable", keys: ["resources", "staff"] });
  if (outcome === "fees" || outcome === "complete") groups.push({ label: "fees", keys: ["feePolicy"] });
  if (outcome === "records" || outcome === "complete") groups.push({ label: "people", keys: ["students", "staff"] });
  return groups.map(group => ({ ...group, missing: group.keys.filter(key => !answers[key]?.trim() || validateSetupAnswer(key, answers[key]!, answers)) }));
}

export function readSetupDraft(data: unknown): SetupDraft {
  const source = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const answers: SetupAnswers = {};
  const rawAnswers = source.answers && typeof source.answers === "object" ? source.answers as Record<string, unknown> : {};
  for (const key of SETUP_ANSWER_KEYS) if (typeof rawAnswers[key] === "string") answers[key] = rawAnswers[key].slice(0, 4000);
  const currentQuestion = source.currentQuestion === "path" || SETUP_ANSWER_KEYS.includes(source.currentQuestion as SetupAnswerKey) ? source.currentQuestion as SetupAnswerKey | "path" : undefined;
  return {
    path: source.path === "import" || source.path === "migrate" ? source.path : "new", answers,
    confirmedKeys: Array.isArray(source.confirmedKeys) ? source.confirmedKeys.filter((key): key is SetupAnswerKey => SETUP_ANSWER_KEYS.includes(key as SetupAnswerKey)) : [],
    step: ["profile", "academics", "people", "policies", "review"].includes(String(source.step)) ? source.step as SetupDraft["step"] : "profile",
    currentQuestion,
  };
}
