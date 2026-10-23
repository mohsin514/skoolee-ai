import { test } from "node:test";
import assert from "node:assert/strict";
import { setupJourney, type SetupJourneyFacts } from "../../src/lib/school-ai/setup-journey";
const empty: SetupJourneyFacts = { classes: 0, activeCycles: 0, teachers: 0, students: 0, classesWithSubjects: 0, subjects: 0, assignedSubjects: 0, subjectsWithTopics: 0, rooms: 0, periods: 0, classesWithPublishedTimetable: 0, classesWithFees: 0 };
test("empty school cannot appear ready and prerequisites are explicit", () => {
 const steps = setupJourney(empty, "complete");
 assert.ok(steps.every(step => !step.complete));
 assert.deepEqual(steps.find(step => step.key === "timetable")?.blockedBy, ["subjects", "resources"]);
});
test("drafts, partial class coverage and unassigned teachers do not complete the journey", () => {
 const steps = setupJourney({ ...empty, activeCycles: 1, classes: 2, teachers: 1, subjects: 4, assignedSubjects: 3, classesWithSubjects: 1, subjectsWithTopics: 3, classesWithPublishedTimetable: 1 }, "complete");
 assert.equal(steps.find(step => step.key === "academics")?.complete, true);
 for (const key of ["subjects", "curriculum", "timetable"]) assert.equal(steps.find(step => step.key === key)?.complete, false);
});
test("chosen outcome controls required steps and fully saved records clear dependencies", () => {
 assert.deepEqual(setupJourney(empty, "records").map(step => step.key), ["academics", "staff", "students"]);
 const steps = setupJourney({ ...empty, activeCycles: 1, classes: 2, teachers: 2, students: 10, classesWithSubjects: 2, subjects: 4, assignedSubjects: 4, subjectsWithTopics: 4, rooms: 2, periods: 6, classesWithPublishedTimetable: 2, classesWithFees: 2 }, "complete");
 assert.ok(steps.every(step => step.complete && !step.blockedBy.length));
});
