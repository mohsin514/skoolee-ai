import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyGraduation } from "@/lib/students/enrollment";
import type { TxClient } from "@/lib/db/prisma";

type Row = Record<string, unknown>;
function fakeTx(state: { students: Row[]; enrollments: Row[]; users: Row[]; sessions: Row[]; timeline: Row[]; audit: Row[] }) {
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => v && typeof v === "object" && "not" in (v as Row) ? row[k] !== (v as Row).not : row[k] === v);
  return {
    student: { findFirst: async ({ where }: { where: Row }) => state.students.find((s) => match(s, where)) ?? null, update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(state.students.find((s) => s.id === where.id)!, data) },
    studentEnrollment: {
      findFirst: async ({ where }: { where: Row }) => state.enrollments.find((e) => match(e, where)) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = state.enrollments.filter((e) => match(e, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    },
    user: { updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = state.users.filter((u) => u.id === where.id && u.role === where.role); rows.forEach((u) => { u.isActive = data.isActive; }); return { count: rows.length }; } },
    loginSession: { updateMany: async ({ where }: { where: Row }) => { const rows = state.sessions.filter((s) => s.userId === where.userId && s.isActive); rows.forEach((s) => { s.isActive = false; }); return { count: rows.length }; } },
    studentTimelineEvent: { create: async ({ data }: { data: Row }) => state.timeline.push(data) },
    auditLog: { create: async ({ data }: { data: Row }) => state.audit.push(data) },
  } as unknown as TxClient;
}
const seed = () => ({
  students: [{ id: "grad-01", schoolId: "qa-01", campusId: "c1", consolidatedIntoId: null, studentUserId: "u1", archivedAt: new Date("2026-06-30"), archiveReason: "Year end", status: "archived" }],
  enrollments: [{ id: "e1", studentId: "grad-01", endDate: null as Date | null, status: "ACTIVE", startDate: new Date("2025-09-01") }],
  users: [{ id: "u1", role: "STUDENT", isActive: true }], sessions: [{ userId: "u1", isActive: true }], timeline: [] as Row[], audit: [] as Row[],
});
const input = { studentId: "grad-01", effectiveDate: new Date("2026-07-01T00:00:00.000Z"), actorId: "registrar", reason: "Graduated" };

test("SKAI-1470: graduation closes the enrollment, revokes the login and writes timeline plus audit", async () => {
  const state = seed();
  assert.equal(await applyGraduation(fakeTx(state), input), "changed");
  assert.equal(state.enrollments[0].status, "GRADUATED");
  assert.deepEqual(state.enrollments[0].endDate, input.effectiveDate);
  assert.equal(state.students[0].status, "graduated");
  assert.equal(state.users[0].isActive, false);
  assert.equal(state.sessions[0].isActive, false);
  assert.equal(state.timeline.length, 1);
  assert.equal(state.timeline[0].kind, "GRADUATED");
  assert.equal(state.audit.length, 1);
});

test("SKAI-1470: a repeated graduation is an explained no-op with no second history", async () => {
  const state = seed();
  const tx = fakeTx(state);
  await applyGraduation(tx, input);
  assert.equal(await applyGraduation(tx, input), "unchanged");
  assert.equal(state.timeline.length, 1);
  assert.equal(state.audit.length, 1);
});

test("SKAI-1470: a pupil with no open placement is refused, not silently relabelled", async () => {
  const state = seed();
  state.enrollments[0].endDate = new Date("2026-05-01");
  state.enrollments[0].status = "WITHDRAWN";
  await assert.rejects(applyGraduation(fakeTx(state), input), /no open placement/);
  assert.equal(state.students[0].status, "archived");
});

test("SKAI-1470: bulk graduation routes through the lifecycle only after campus scoping and permission", () => {
  const source = readFileSync("src/app/api/students/route.ts", "utf8");
  const scope = source.indexOf('throw new ApiError("One or more students are not in this campus", 404)');
  const branch = source.indexOf('if (status === "graduated") {');
  assert.ok(source.indexOf('assertPermission(user, "students", "edit")') < scope && scope > 0 && scope < branch);
  assert.match(source.slice(branch, branch + 900), /prisma\.\$transaction\(async \(tx\) => \{[\s\S]*applyGraduation\(tx,/);
});
