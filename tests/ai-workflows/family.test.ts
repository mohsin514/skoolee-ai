import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { mentionsCare } from "../../src/lib/ai-workflows/pii/care-detector";
import { compileStudent, STUDENT_QUESTIONNAIRE } from "../../src/lib/ai-workflows/questionnaire/roles/student";
import { compileParent } from "../../src/lib/ai-workflows/questionnaire/roles/parent";
import { definitionForRole } from "../../src/lib/ai-workflows/questionnaire/service";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });

test("child-safety and wellbeing phrases are caught in English, Roman Urdu, Urdu and Arabic", () => {
  for (const text of ["My son says a boy keeps bullying him", "I want to kill myself", "mujhe marta hai", "استاد مجھے مارتا ہے", "خودکشی", "أحد يضربني", "تنمر في الصف"]) assert.ok(mentionsCare(text), text);
  for (const text of ["Hamza is absent tomorrow", "Pay the October fee", "حمزہ کل غیر حاضر ہوگا", "أريد حجز موعد", "disabused of the idea", "bullet points for the essay"]) assert.ok(!mentionsCare(text), text);
});

test("parents and students have their own sheets", () => {
  assert.equal(definitionForRole("PARENT")?.key, "parent");
  assert.equal(definitionForRole("STUDENT")?.key, "student");
});

test("a student's plan is dated from today in the chosen times, rotating subjects, and the goal stays private", () => {
  const prefill = { today: "2026-10-26", language: null, className: "7 B", subjects: ["Maths", "Science"], weekend: [] };
  const steps = compileStudent({ language: "ur", focusSubjects: ["Maths", "Science"], studyTimes: { slots: ["1:18", "3:18"], weeks: 1 }, planTarget: "NEXT_TEST", termGoal: "Score 80% in Maths", counsellorMeeting: "YES" }, prefill);
  assert.deepEqual(steps.map(step => step.capabilityKey), ["profile.update", "personal.save_plan", "pathways.save_goal_private"], "no appointment time is invented");
  const plan = steps[1].input as { steps: Array<{ title: string; dueDate: string }> };
  assert.deepEqual(plan.steps.map(row => `${row.dueDate} ${row.title}`), ["2026-10-26 Maths · 18:00", "2026-10-28 Science · 18:00"]);
  assert.ok(!steps.some(step => step.capabilityKey === "pathways.share_goal"), "sharing a goal is never compiled; the student confirms it later");
  assert.ok(STUDENT_QUESTIONNAIRE.questions.find(question => question.key === "focusSubjects")!.answer(prefill).safeParse(["History"]).success === false);
});

test("a parent's absence notes and office note compile only for the family's own open absences", () => {
  const prefill = { language: "en", children: [{ id: "c1", name: "Hamza", className: "5 A" }], pendingInvitations: 0, absences: [{ id: "a1", childId: "c1", childName: "Hamza", date: "2026-10-20" }] };
  const steps = compileParent({ childrenCheck: "MISSING", openAbsences: { a1: "ILL", other: "ILL" } }, prefill);
  assert.deepEqual(steps.map(step => step.capabilityKey), ["chat.message_office", "parent.explain_absence"]);
  assert.deepEqual(steps[1].input, { child: "Hamza", date: "2026-10-20", reason: "Unwell" });
});
