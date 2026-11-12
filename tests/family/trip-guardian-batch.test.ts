import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1872: a guardian's trip list reads only their own children's consent rows and looks up eligible
// guardians once per consent kind, however many pupils, consents or open trips the school has. Statuses,
// signatory rights and school scope stay exactly as before.
type Consent = { schoolId: string; tripId: string; studentId: string; guardianUserId: string; choice: string; createdAt: Date; version: number; receiptCode: string };
type Rel = { id: string; schoolId: string; studentId: string; guardianUserId: string; kinds: string[] };
const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 9, n));
const version = (tripId: string, kind: string, rule = "ANY_GUARDIAN") => ({ id: `${tripId}-v1`, version: 1, material: true, consentKind: kind, signatoryRule: rule, respondBy: new Date(Date.UTC(2099, 0, 1)), departAt: new Date(Date.UTC(2099, 0, 2)) });
const trips = [
  { id: "trip-museum", schoolId: "school-a", status: "OPEN", versions: [version("trip-museum", "fieldTrips")] },
  { id: "trip-zoo", schoolId: "school-a", status: "OPEN", versions: [version("trip-zoo", "fieldTrips", "ALL_GUARDIANS")] },
  { id: "trip-abroad", schoolId: "school-a", status: "OPEN", versions: [version("trip-abroad", "offsiteTravel")] },
  { id: "trip-b", schoolId: "school-b", status: "OPEN", versions: [version("trip-b", "fieldTrips")] },
];
const invitees: { schoolId: string; tripId: string; studentId: string }[] = [];
const consents: Consent[] = [];
const rels: Rel[] = [
  { id: "r1", schoolId: "school-a", studentId: "kid-1", guardianUserId: "mum", kinds: ["fieldTrips", "offsiteTravel"] },
  { id: "r2", schoolId: "school-a", studentId: "kid-1", guardianUserId: "dad", kinds: ["fieldTrips"] },
  { id: "r3", schoolId: "school-a", studentId: "kid-2", guardianUserId: "mum", kinds: ["fieldTrips"] },
  { id: "r4", schoolId: "school-b", studentId: "kid-b", guardianUserId: "mum", kinds: ["fieldTrips"] },
];
for (const t of ["trip-museum", "trip-zoo"]) for (const s of ["kid-1", "kid-2"]) invitees.push({ schoolId: "school-a", tripId: t, studentId: s });
invitees.push({ schoolId: "school-a", tripId: "trip-abroad", studentId: "kid-1" }, { schoolId: "school-b", tripId: "trip-b", studentId: "kid-b" });
// 300 other pupils on the museum and zoo trips, each with two guardian answers that must never be loaded.
for (let i = 0; i < 300; i++) for (const t of ["trip-museum", "trip-zoo"]) {
  invitees.push({ schoolId: "school-a", tripId: t, studentId: `other-${i}` });
  for (const g of ["x", "y"]) consents.push({ schoolId: "school-a", tripId: t, studentId: `other-${i}`, guardianUserId: `${g}-${i}`, choice: "DECLINED", createdAt: at(1), version: 1, receiptCode: "TRP-OTHER" });
}
consents.push(
  { schoolId: "school-a", tripId: "trip-museum", studentId: "kid-1", guardianUserId: "dad", choice: "GRANTED", createdAt: at(2), version: 1, receiptCode: "TRP-DAD" },
  { schoolId: "school-a", tripId: "trip-zoo", studentId: "kid-1", guardianUserId: "mum", choice: "GRANTED", createdAt: at(3), version: 1, receiptCode: "TRP-MUM" },
  { schoolId: "school-b", tripId: "trip-b", studentId: "kid-b", guardianUserId: "mum", choice: "DECLINED", createdAt: at(4), version: 1, receiptCode: "TRP-B" },
);

let consentRowsLoaded = 0, guardianLookups = 0;
type InviteWhere = { schoolId: string; studentId: { in: string[] } };
type ConsentWhere = { schoolId?: string; studentId?: { in: string[] } } | undefined;
type InviteArgs = { where: InviteWhere; include: { trip: { include: { consents: { where?: ConsentWhere } } } } };
const prisma = {
  tripInvitee: {
    findMany: async ({ where, include }: InviteArgs) => {
      const filter = include.trip.include.consents.where;
      return invitees.filter(i => i.schoolId === where.schoolId && where.studentId.in.includes(i.studentId)).map(i => {
        const trip = trips.find(t => t.id === i.tripId && t.status === "OPEN")!;
        const rows = consents.filter(c => c.tripId === trip.id && (!filter?.schoolId || c.schoolId === filter.schoolId) && (!filter?.studentId || filter.studentId.in.includes(c.studentId)));
        consentRowsLoaded += rows.length;
        return { ...i, trip: { ...trip, consents: rows.map(c => ({ ...c, tripVersion: { version: c.version } })) } };
      });
    },
  },
  guardianRelationship: {
    findMany: async ({ where }: { where: { schoolId: string; studentId: { in: string[] }; accessVersions: { some: { permissions: { path: string[] } } } } }) => {
      guardianLookups++;
      const kind = where.accessVersions.some.permissions.path.at(-1)!;
      return rels.filter(r => r.schoolId === where.schoolId && where.studentId.in.includes(r.studentId) && r.kinds.includes(kind)).map(r => ({ id: r.id, studentId: r.studentId, guardianUserId: r.guardianUserId, fullName: r.guardianUserId }));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });
const svc = () => import("@/lib/family/trips");
const reset = () => { consentRowsLoaded = 0; guardianLookups = 0; };

test("SKAI-1872: only the children's own consents load, with one guardian lookup per consent kind", async () => {
  reset();
  const rows = await (await svc()).guardianTrips("mum", "school-a", ["kid-1", "kid-2"]);
  assert.equal(rows.length, 5);
  assert.equal(consentRowsLoaded, 2 * 2, "only kid-1 has answers: one on the museum and one on the zoo trip, seen from each child's invite");
  assert.equal(guardianLookups, 2, "fieldTrips and offsiteTravel");
  const find = (trip: string, kid: string) => rows.find(r => r.tripId === trip && r.studentId === kid)!;
  // ANY_GUARDIAN: dad granted, so granted; mum may still sign but has no answer of her own.
  assert.equal(find("trip-museum", "kid-1").status, "GRANTED");
  assert.equal(find("trip-museum", "kid-1").answeredByOther, true);
  assert.equal(find("trip-museum", "kid-1").myAnswer, null);
  // ALL_GUARDIANS: only mum granted, dad still to answer.
  assert.equal(find("trip-zoo", "kid-1").status, "PARTIAL");
  assert.equal(find("trip-zoo", "kid-1").myAnswer?.receiptCode, "TRP-MUM");
  assert.equal(find("trip-zoo", "kid-1").answeredByOther, false);
  // Another pupil's declines on the same trip never reach this child.
  assert.equal(find("trip-museum", "kid-2").status, "PENDING");
  assert.equal(find("trip-zoo", "kid-2").answeredByOther, false);
  // Offsite travel: only mum is a signatory for kid-1.
  assert.equal(find("trip-abroad", "kid-1").canSign, true);
});

test("SKAI-1872: work stays flat as other pupils' answers grow", async () => {
  reset();
  await (await svc()).guardianTrips("mum", "school-a", ["kid-2"]);
  const before = consentRowsLoaded;
  for (let i = 0; i < 200; i++) consents.push({ schoolId: "school-a", tripId: "trip-museum", studentId: `other-${i}`, guardianUserId: `z-${i}`, choice: "GRANTED", createdAt: at(5), version: 1, receiptCode: "TRP-MORE" });
  reset();
  await (await svc()).guardianTrips("mum", "school-a", ["kid-2"]);
  assert.equal(consentRowsLoaded, before);
  assert.equal(before, 0);
  assert.equal(guardianLookups, 1);
});

test("SKAI-1872: another school's trips and answers stay out, and a non-signatory cannot sign", async () => {
  reset();
  const b = await (await svc()).guardianTrips("mum", "school-b", ["kid-b"]);
  assert.deepEqual(b.map(r => [r.tripId, r.status]), [["trip-b", "DECLINED"]]);
  assert.equal((await (await svc()).guardianTrips("mum", "school-b", ["kid-1"])).length, 0);
  const dad = await (await svc()).guardianTrips("dad", "school-a", ["kid-1"]);
  assert.equal(dad.find(r => r.tripId === "trip-abroad")!.canSign, false);
  assert.equal(dad.find(r => r.tripId === "trip-museum")!.myAnswer?.receiptCode, "TRP-DAD");
  assert.deepEqual(await (await svc()).guardianTrips("mum", "school-a", []), []);
});
