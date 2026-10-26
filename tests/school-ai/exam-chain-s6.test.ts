import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExamTimeline } from "../../src/lib/school-ai/exam-timeline";
import { briefItemsFor } from "../../src/lib/academic/exam-brief";
import type { Paper } from "../../src/lib/academic/datesheet-publication";

// SKO-505: one timeline of paper and online sittings, and the family brief of a republished date sheet.
const now = new Date("2026-11-02T06:00:00Z"); // 09:00 in Riyadh (UTC+3)
const paper = (scheduleId: string, date: string, startTime: string | null, endTime: string | null, classId = "7a") => ({ scheduleId, examTitle: "Mid-term", subjectName: scheduleId, date, startTime, endTime, classId });

test("papers and online sittings merge in school time, the next one first, past ones apart", () => {
  const timeline = buildExamTimeline({
    now, timeZone: "Asia/Riyadh",
    papers: [paper("Science", "2026-11-05", "08:00", "10:00"), paper("History", "2026-10-30", "08:00", "10:00"), paper("Maths", "2026-11-02", "08:30", "10:30")],
    seats: [{ scheduleId: "Science", room: "Hall 2", seat: "3-2", invigilator: "Ms Noor" }],
    online: [
      { id: "quiz", title: "Plants quiz", subject: "Science", startsAt: new Date("2026-11-03T05:00:00Z"), endsAt: new Date("2026-11-03T06:00:00Z"), mode: "STANDARD", resultsReleasedAt: null, attempt: null },
      { id: "released", title: "Cells check", subject: "Science", startsAt: new Date("2026-10-20T05:00:00Z"), endsAt: new Date("2026-10-20T06:00:00Z"), mode: "STANDARD", resultsReleasedAt: new Date("2026-10-25T05:00:00Z"), attempt: { status: "REVIEWED" } },
      { id: "missed", title: "Forces check", subject: "Physics", startsAt: new Date("2026-10-21T05:00:00Z"), endsAt: new Date("2026-10-21T06:00:00Z"), mode: "STANDARD", resultsReleasedAt: null, attempt: null },
    ],
  });
  assert.equal(timeline.next?.id, "paper:Maths", "Maths is sitting now (08:30–10:30 school time), so it is next");
  assert.equal(timeline.next?.state, "OPEN");
  assert.deepEqual(timeline.upcoming.map(entry => entry.id), ["paper:Maths", "online:quiz", "paper:Science"]);
  assert.equal(timeline.upcoming[2].startsAt, "2026-11-05T05:00:00.000Z", "08:00 in Riyadh is 05:00 UTC");
  assert.equal(timeline.upcoming[2].room, "Hall 2");
  assert.deepEqual(timeline.past.map(entry => [entry.id, entry.state]), [["paper:History", "DONE"], ["online:missed", "MISSED"], ["online:released", "RESULT_RELEASED"]]);
});

test("an online sitting reads open, resume and submitted from the learner's own attempt", () => {
  const online = (status: string | null) => ({ id: status ?? "none", title: "Quiz", subject: null, startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 3_600_000), mode: "STANDARD", resultsReleasedAt: null, attempt: status ? { status } : null });
  const states = buildExamTimeline({ now, timeZone: "UTC", papers: [], seats: [], online: [online(null), online("IN_PROGRESS"), online("SUBMITTED")] });
  assert.deepEqual(Object.fromEntries([...states.upcoming, ...states.past].map(entry => [entry.id, entry.state])), { "online:none": "OPEN", "online:IN_PROGRESS": "IN_PROGRESS", "online:SUBMITTED": "SUBMITTED" });
});

test("an extended or paused learner remains able to resume after the assignment window ends", () => {
  const closed = new Date(now.getTime() - 60_000);
  const extraTime = new Date(now.getTime() + 600_000);
  const sitting = (id: string, deadlineAt: Date, pausedAt: Date | null = null) => ({ id, title: "Quiz", subject: null, startsAt: new Date(now.getTime() - 3_600_000), endsAt: closed, mode: "STANDARD", resultsReleasedAt: null, attempt: { status: "IN_PROGRESS", deadlineAt, pausedAt } });
  const timeline = buildExamTimeline({ now, timeZone: "UTC", papers: [], seats: [], online: [sitting("extended", extraTime), sitting("paused", closed, new Date(now.getTime() - 120_000)), sitting("expired", closed)] });
  assert.deepEqual(timeline.upcoming.map(entry => [entry.id, entry.state]), [["online:extended", "IN_PROGRESS"], ["online:paused", "IN_PROGRESS"]]);
  assert.equal(timeline.upcoming[0].endsAt, extraTime.toISOString(), "show the learner's approved deadline");
  assert.deepEqual(timeline.past.map(entry => [entry.id, entry.state]), [["online:expired", "SUBMITTED"]], "saved work awaiting expiry finalization is never labelled missed");
});

test("the family brief names only this class's added, removed, moved or re-roomed papers", () => {
  const p = (scheduleId: string, classId: string, subjectName: string, date: string): Paper => ({ scheduleId, examId: "e", examTitle: "Mid-term", classId, classLabel: classId, subjectId: subjectName, subjectName, totalMarks: 50, date, startTime: "08:00", endTime: "10:00", rooms: [], candidates: 0, seated: 0 });
  const before = [p("s1", "7a", "Maths", "2026-11-03"), p("s2", "7b", "Maths", "2026-11-03"), p("s3", "7a", "Art", "2026-11-06")];
  const after = [p("s1", "7a", "Maths", "2026-11-05"), p("s2", "7b", "Maths", "2026-11-03")];
  const changes = [{ scheduleId: "s1", kind: "MOVED" }, { scheduleId: "s2", kind: "INVIGILATORS_CHANGED" }, { scheduleId: "s3", kind: "REMOVED" }];
  assert.deepEqual(briefItemsFor(changes, after, before, "7a"), [
    { scheduleId: "s1", kind: "MOVED", subject: "Maths", date: "2026-11-05", previousDate: "2026-11-03" },
    { scheduleId: "s3", kind: "REMOVED", subject: "Art", date: null, previousDate: "2026-11-06" },
  ]);
  assert.deepEqual(briefItemsFor(changes, after, before, "7b"), [], "an invigilator swap does not ask the family anything");
});
