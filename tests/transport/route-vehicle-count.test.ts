import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { routeVehicleCount } from "../../src/lib/transport/route-vehicle-count";

// SKAI-1774: the Routes list read `_count.routeVehicles`, which the route list never returns, so every route
// showed 0 vehicles. The count now comes from the `vehicles[]` links the GET returns, inside the caller's campus.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const routes = [
  { id: "r-0", schoolId: "school-a", campusId: "campus-a", title: "None", vehicles: [] },
  { id: "r-1", schoolId: "school-a", campusId: "campus-a", title: "One", vehicles: [{ vehicleId: "v1" }] },
  { id: "r-2", schoolId: "school-a", campusId: "campus-a", title: "Two", vehicles: [{ vehicleId: "v2" }, { vehicleId: "v3" }] },
  { id: "r-b", schoolId: "school-b", campusId: "campus-b", title: "Other", vehicles: [{ vehicleId: "vb" }] },
];
let user: { role: string; schoolId: string; campusId: string; denied?: boolean } = { role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
mock.module("@/lib/db/prisma", { namedExports: { prisma: { transportRoute: { findMany: async ({ where }: { where: { campusId: string } }) => routes.filter(r => r.campusId === where.campusId && r.schoolId === user.schoolId) } } } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  assertModuleRead: async (u: typeof user) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  assertPermission: async () => {},
  canManageCampusOps: () => true,
  resolveCampusId: async (u: typeof user) => u.campusId,
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
} });
mock.module("@/lib/destructive/operations", { namedExports: { operationDeleteResponse: async () => new Response(null) } });
mock.module("@/lib/transport/service", { namedExports: { setRouteVehicles: async () => {} } });

const list = async () => {
  const { GET } = await import("../../src/app/api/transport/routes/route");
  const res = await GET({ nextUrl: new URL("http://x/api/transport/routes") } as never);
  return { status: res.status, body: await res.json() };
};

test("routes with 0, 1 and 2 linked vehicles count 0, 1 and 2", async () => {
  user = { role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
  const { body } = await list();
  assert.deepEqual(body.data.map((r: never) => routeVehicleCount(r)), [0, 1, 2]);
});

test("a missing or malformed vehicles list counts 0", () => {
  assert.equal(routeVehicleCount({}), 0);
  assert.equal(routeVehicleCount(null), 0);
});

test("two schools stay isolated: each sees only its own routes and counts", async () => {
  user = { role: "CAMPUS_ADMIN", schoolId: "school-b", campusId: "campus-b" };
  const { body } = await list();
  assert.deepEqual(body.data.map((r: { id: string }) => [r.id, routeVehicleCount(r as never)]), [["r-b", 1]]);
});

test("a role without transport read is denied", async () => {
  user = { role: "PARENT", schoolId: "school-a", campusId: "campus-a", denied: true };
  assert.equal((await list()).status, 403);
});

test("the Routes list and export use the shared count, not the absent _count field", () => {
  const source = readFileSync("src/components/operations/index.tsx", "utf8");
  assert.doesNotMatch(source, /_count\?\.routeVehicles/u);
  assert.equal(source.match(/routeVehicleCount\(r\)/gu)?.length, 3);
});
