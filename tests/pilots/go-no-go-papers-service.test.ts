import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1174: the board counts each pilot school's own teachers and PAPER records, never another school's.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Where = { schoolId: string; createdAt?: { gte: Date; lt: Date } };
const calls: { model: string; where: Where }[] = [];
const teachers: Record<string, { id: string }[]> = { "school-a": [{ id: "a1" }, { id: "a2" }], "school-b": [{ id: "b1" }] };
const papers: Record<string, { createdById: string; createdAt: Date }[]> = {
  "school-a": [1, 2].map((d) => ({ createdById: "a1", createdAt: new Date(`2026-09-0${d + 1}`) })),
  "school-b": [{ createdById: "a2", createdAt: new Date("2026-09-03") }, { createdById: "a2", createdAt: new Date("2026-09-04") }],
};
const pilot = (id: string, school: string) => ({ id, name: id, status: "ACTIVE", synthetic: true, targetSchoolId: school, startsOn: new Date("2026-09-01"), workflows: [] });

mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      pilot: { findMany: async () => [pilot("p-a", "school-a"), pilot("p-b", "school-b")] },
      school: { findMany: async () => [{ id: "school-a", name: "QA-01" }, { id: "school-b", name: "QA-02" }] },
      pilotObservation: { findMany: async () => [] },
      pilotMeasure: { findMany: async () => [] },
      user: { findMany: async ({ where }: { where: Where }) => { calls.push({ model: "user", where }); return teachers[where.schoolId] ?? []; } },
      schoolAiRecord: { findMany: async ({ where }: { where: Where }) => { calls.push({ model: "paper", where }); return papers[where.schoolId] ?? []; } },
    },
  },
});
mock.module(src("lib/pilots/readiness-service.ts"), {
  namedExports: { schoolPilotRecords: async () => ({ readiness: [], events: [] }), pilotActivationGate: async () => ({ allowed: true }) },
});

test("each pilot reads its own school's teachers and papers within the four-week window", async () => {
  const { goNoGoBoard } = await import("../../src/lib/pilots/go-no-go-service");
  const rows = await goNoGoBoard(new Date("2026-10-29"));
  const usage = (id: string) => rows.find((r) => r.pilotId === id)!.result.criteria.find((c) => c.key === "TEACHER_USAGE")!;
  assert.equal(usage("p-a").value, "50%");
  // school-b's only teacher wrote nothing; papers attributed to a school-a teacher id do not count there.
  assert.equal(usage("p-b").value, "0%");
  assert.equal(usage("p-b").state, "RED");
  assert.deepEqual(calls.map((c) => c.where.schoolId).sort(), ["school-a", "school-a", "school-b", "school-b"]);
  const paperCall = calls.find((c) => c.model === "paper")!;
  assert.equal(paperCall.where.createdAt!.lt.toISOString(), new Date("2026-09-29").toISOString());
});
