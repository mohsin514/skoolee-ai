import { h, groupUser, loadDashboard, logged, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readTeacherSchedule, scheduleAvailability } from "../../src/lib/timetable/teacher-schedule-read";

/** SKAI-1024: the teacher workspace degrades per widget; Today and /teacher/timetable share one schedule read. */

for (const [label, teacher] of [["standalone", user("TEACHER")], ["group", groupUser("TEACHER")]] as const) {
  test(`SKAI-1024: ${label} teacher workspace loads when an optional read fails`, async () => {
    const dashboard = await loadDashboard();
    h.session = teacher;
    h.failing = new Set(["aIInsight.findMany", "campus.findFirst"]);
    const data = await dashboard.getTeacherDashboardData();
    assert.deepEqual([...data.degraded].sort(), ["aiInsights", "teacherCampus"]);
    assert.equal(h.maxInFlight, 1);
  });
}

test("SKAI-1024: teacher workspace still fails closed when its class assignments cannot be read", async () => {
  const dashboard = await loadDashboard();
  h.session = user("TEACHER");
  h.failing = new Set(["subject.findMany"]);
  await assert.rejects(() => dashboard.getTeacherDashboardData());
  assert.ok(logged('required read "subjects" failed', "P2024"));
});

for (const role of ["PRINCIPAL", "ADMIN", "PARENT"]) {
  test(`SKAI-1024: ${role} is denied the teacher workspace`, async () => {
    const dashboard = await loadDashboard();
    h.session = user(role);
    await assert.rejects(() => dashboard.getTeacherDashboardData(), /Unauthorized/);
  });
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("SKAI-1024: an empty published week is the 'No published timetable yet' state, not a failure", async () => {
  const slots = await readTeacherSchedule({ request: async () => json(200, { success: true, data: [] }) });
  assert.equal(scheduleAvailability(slots, null), "unpublished");
});

test("SKAI-1024: a transient schedule failure is retried once before it is reported", async () => {
  let calls = 0;
  const slots = await readTeacherSchedule({ retryDelayMs: 0, request: async () => (++calls === 1 ? json(500, { error: "x" }) : json(200, { success: true, data: [{ id: "s1" }] })) });
  assert.equal(calls, 2);
  assert.equal(scheduleAvailability(slots, null), "published");
});

test("SKAI-1024: a denied schedule read is not retried and reports failure", async () => {
  let calls = 0;
  await assert.rejects(
    () => readTeacherSchedule({ retryDelayMs: 0, request: async () => { calls += 1; return json(403, { error: "Forbidden" }); } }),
    (error: { kind?: string }) => error.kind === "denied",
  );
  assert.equal(calls, 1);
});
