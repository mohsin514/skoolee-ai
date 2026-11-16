import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2143: a duplicate route name or vehicle number is a 409 the form can show, not a 500.
const dup = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
const prisma = {
  transportRoute: { create: async () => { throw dup(); }, findFirst: async () => ({ id: "r1" }), update: async () => { throw dup(); } },
  vehicle: { create: async () => { throw dup(); }, findFirst: async () => ({ id: "v1" }), update: async () => { throw dup(); } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
let ready: Promise<void> | undefined;
const setup = () => (ready ??= (async () => {
  const real = await import("@/lib/api/scope");
  mock.module("@/lib/api/scope", {
    namedExports: {
      ...real,
      requireAuthUser: async () => ({ userId: "u", role: "CAMPUS_ADMIN", schoolId: "s", campusId: "c" }),
      canManageCampusOps: () => true,
      assertPermission: async () => undefined,
      resolveCampusId: async () => "c",
    },
  });
})());
mock.module("@/lib/transport/service", { namedExports: { setRouteVehicles: async () => undefined, changeVehicleWithinCapacity: async (_u: unknown, _id: string, _c: unknown, save: (db: unknown) => unknown) => save(prisma) } });

const req = (method: string, body: unknown) => new Request("http://x/api", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never;

test("duplicate route name returns 409 on create and rename", async () => {
  await setup();
  const r = await import("@/app/api/transport/routes/route");
  for (const res of [await r.POST(req("POST", { title: "A", fare: 0 })), await r.PATCH(req("PATCH", { id: "d4e5fe0a-24b7-4b62-9bf6-60b84342e623", title: "A" }))]) {
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /route with this name already exists/);
  }
});

test("duplicate vehicle number returns 409 on create and rename", async () => {
  await setup();
  const v = await import("@/app/api/transport/vehicles/route");
  for (const res of [await v.POST(req("POST", { number: "V2", capacity: 5 })), await v.PATCH(req("PATCH", { id: "v1", number: "V2" }))]) {
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /vehicle with this number already exists/);
  }
});
