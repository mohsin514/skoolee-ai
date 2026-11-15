import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2148: transport coordinator actions are for campus operators only. PRINCIPAL (academic, no campus logistics)
// is refused for rider, stop, vehicle and staff actions before any query runs.
const prisma = { transportTrip: { findMany: async () => [] } };
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("database must not be reached"); } } });

const user = (role: string) => ({ userId: "u-a", role, schoolId: "school-a", campusId: "campus-a" }) as never;
const svc = () => import("@/lib/transport/service");

test("SKAI-2148: PRINCIPAL cannot read or change routes, riders, stops and vehicles", async () => {
  const s = await svc();
  const p = user("PRINCIPAL");
  const refused = (e: unknown) => (e as { status?: number }).status === 403;
  await assert.rejects(s.routeDetail(p, "r1"), refused);
  await assert.rejects(s.findStudents(p, "a"), refused);
  await assert.rejects(s.assignRider(p, { routeId: "r1", studentId: "s1" }), refused);
  await assert.rejects(s.unassignRider(p, "s1"), refused);
  await assert.rejects(s.saveStop(p, { routeId: "r1", name: "x", sequence: 1 }), refused);
  await assert.rejects(s.setRouteVehicles(p, "r1", []), refused);
  await assert.rejects(s.publishTrip(p, { routeId: "r1", direction: "AM", serviceDate: "2026-11-15" }), refused);
  await assert.rejects(s.coordinatorStaff(p), refused);
});

test("SKAI-2148: PRINCIPAL is not a trip lead; a campus admin is", async () => {
  const s = await svc();
  assert.equal((await s.listTrips(user("PRINCIPAL"), "2026-11-15")).lead, false);
  assert.equal((await s.listTrips(user("CAMPUS_ADMIN"), "2026-11-15")).lead, true);
});
