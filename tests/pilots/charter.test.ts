import { test } from "node:test";
import assert from "node:assert/strict";
const rows = new Map<string, Record<string, unknown>>();
let race = false;
const fake = { pilot: {
  findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id),
  updateMany: async ({ where, data }: { where: { id: string }; data: object }) => {
    if (race) return { count: 0 };
    Object.assign(rows.get(where.id)!, data); return { count: 1 };
  },
}, pilotClaim: { findFirst: async () => ({ id: "QA-01-claim", version: 1, findingKey: "TIME:MARKS_ENTRY" }) },
  // SKAI-1018 gate: a ready readiness record and a passing Pakistan trust gate unless `gateOpen` is false.
  marketTrustReview: { findMany: async () => trustRows() },
  pilotReadinessRecord: { findFirst: async () => (gateOpen ? { record: readyRecord() } : null), findMany: async () => [] } };
let gateOpen = true;
// Substitute persistence only; the service validation is real.
globalThis.prisma = fake as never;
const fixture = (synthetic = false) => ({ id: "QA-01", targetSchoolId: "QA-01-school-a", synthetic,
  status: "PLANNED", consentReference: "QA-01 consent", caseStudyPermission: "NONE", permissionReference: null,
  startsOn: new Date("2026-10-01"), endsOn: null, updatedAt: new Date(), charterHistory: [], championName: "QA-01 coordinator",
  workflows: [{ key: "MARKS_ENTRY", definition: "QA-01 entry", successDefinition: "QA-01 checked" }] });
import { evidence } from "./charter-fixture";
import { readyRecord, trustRows } from "./readiness-fixture";

test("SKAI-1018: full commercial evidence without a readiness record waits on the pilot gate", async () => {
  const { updateCharter } = await import("../../src/lib/pilots/service");
  rows.set("QA-01", fixture()); race = false; gateOpen = false;
  await updateCharter("QA-01", { status: "ACTIVE", commercial: evidence() });
  assert.equal(rows.get("QA-01")!.status, "WAITING_PILOT_GATE");
  const snap = (rows.get("QA-01")!.charterHistory as { gateBlockers: { item: string }[] }[]).at(-1)!;
  assert.deepEqual(snap.gateBlockers.map((b) => b.item), ["READINESS"]);
  gateOpen = true;
});

test("charter guards preserve consent, isolation, waiting states, history and conflicts", async () => {
  const { updateCharter, reviewClaim } = await import("../../src/lib/pilots/service");
  const reset = (synthetic = false) => { rows.set("QA-01", fixture(synthetic)); race = false; };
  reset(true);
  await assert.rejects(updateCharter("QA-01", { status: "ACTIVE" }), /synthetic/i);
  reset();
  await assert.rejects(updateCharter("QA-01", { status: "ACTIVE", consentReference: null }), /consent/);
  rows.get("QA-01")!.status = "ACTIVE";
  await assert.rejects(updateCharter("QA-01", { consentReference: null }), /consent/);
  reset();
  await assert.rejects(updateCharter("QA-01", { endsOn: "2026-09-01" }), /before/);
  await assert.rejects(updateCharter("QA-01", { caseStudyPermission: "NAMED" }), /permission/);
  Object.assign(rows.get("QA-01")!, { caseStudyPermission: "NAMED", permissionReference: "QA-01 written permission" });
  await assert.rejects(updateCharter("QA-01", { permissionReference: null }), /permission/);
  for (const [change, expected] of [
    [{}, "WAITING_CHARTER"],
    [{ commercial: { ...evidence(), paymentStatus: "FAILED" } }, "WAITING_PAYMENT"],
    [{ commercial: { ...evidence(), paymentReference: null } }, "WAITING_PAYMENT"],
    [{ commercial: { ...evidence(), providerReference: null } }, "WAITING_PROVIDER"],
    [{ commercial: { ...evidence(), privacyReference: null } }, "WAITING_READINESS"],
    [{ commercial: evidence() }, "ACTIVE"],
  ] as const) {
    reset(); await updateCharter("QA-01", { status: "ACTIVE", ...change });
    assert.equal(rows.get("QA-01")!.status, expected);
  }
  reset();
  const cycle = { id: "cycle-1", workflow: "MARKS_ENTRY", completed: true, reference: "QA-01 cycle source", date: "2026-10-01" };
  await assert.rejects(updateCharter("QA-01", { commercial: { ...evidence(), cycles: [cycle, { ...cycle, id: "cycle-2" }] } }), /distinct/);
  await assert.rejects(updateCharter("QA-01", { commercial: { ...evidence(), cycles: [{ ...cycle, date: "2099-01-01" }] } }), /future/);
  for (const cycles of [[], [cycle], [cycle, { ...cycle, id: "cycle-2", reference: "QA-01 partial", completed: false }]]) {
    reset(); await updateCharter("QA-01", { commercial: { ...evidence(), cycles } });
    await assert.rejects(reviewClaim("QA-01", "QA-01-claim", { decision: "APPROVE", note: "QA-01 reviewed source", version: 1 }, "QA-01-owner"), /two complete cycles/);
  }
  reset();
  const untouched = { ...fixture(), id: "QA-01-B", targetSchoolId: "QA-01-school-b", campusId: "QA-01-campus-b" };
  rows.set("QA-01-B", untouched); rows.get("QA-01")!.campusId = "QA-01-campus-a";
  await updateCharter("QA-01", { commercial: evidence(), status: "ACTIVE" });
  assert.deepEqual(rows.get("QA-01-B"), untouched);
  const before = structuredClone(rows.get("QA-01")!.charterHistory);
  await assert.rejects(updateCharter("QA-01", { status: "CLOSED" }), /changed/);
  await assert.rejects(updateCharter("QA-01", { version: 1, status: "CLOSED" }), /closure/);
  await assert.rejects(updateCharter("QA-01", { version: 1, workflows: fixture().workflows }), /approval/);
  await updateCharter("QA-01", { version: 1, caseStudyPermission: "NONE" });
  assert.deepEqual((rows.get("QA-01")!.charterHistory as unknown[])[0], (before as unknown[])[0]);
  await assert.rejects(updateCharter("QA-01", { version: 2, commercial: evidence(), workflows: [{ ...fixture().workflows[0], successDefinition: "QA-01 revised target" }] }), /fresh approval/);
  await updateCharter("QA-01", { version: 2, commercial: { ...evidence(), schoolApproval: "QA-01 school v2", vendorApproval: "QA-01 vendor v2" }, workflows: [{ ...fixture().workflows[0], successDefinition: "QA-01 revised target" }] });
  assert.equal((rows.get("QA-01")!.workflows as { successDefinition: string }[])[0].successDefinition, "QA-01 revised target");
  assert.equal(((rows.get("QA-01")!.charterHistory as { workflows: { successDefinition: string }[] }[])[0]).workflows[0].successDefinition, "QA-01 checked");
  race = true;
  await assert.rejects(updateCharter("QA-01", { version: 3, status: "PLANNED" }), /changed/);
  assert.equal(rows.get("QA-01")!.status, "ACTIVE");
  race = false;
  const closure = { outcome: "DECLINED", reason: "QA-01 evaluation ended", reference: "QA-01 decision", date: "2026-10-28", exitReference: "QA-01 export and access closure" };
  await updateCharter("QA-01", { version: 3, status: "CLOSED", commercial: { ...evidence(), closure } });
  assert.equal(rows.get("QA-01")!.status, "CLOSED");
});
