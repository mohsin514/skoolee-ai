import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deliverableUserIds } from "../../src/lib/chat/membership";

// SKAI-2165: live chat events go only to members the read API would still admit (school and campus scope).
const users = [
  { id: "main-admin", role: "ADMIN", campusId: "main", schoolId: "s1", isActive: true },
  { id: "garden-admin", role: "ADMIN", campusId: "garden", schoolId: "s1", isActive: true },
  { id: "no-campus", role: "RECEPTIONIST", campusId: null, schoolId: "s1", isActive: true },
  { id: "super", role: "SUPER_ADMIN", campusId: null, schoolId: "s1", isActive: true },
  { id: "parent", role: "PARENT", campusId: null, schoolId: "s1", isActive: true },
  { id: "other-school", role: "ADMIN", campusId: "main", schoolId: "s2", isActive: true },
  { id: "inactive", role: "ADMIN", campusId: "main", schoolId: "s1", isActive: false },
];
const db = {
  user: {
    findMany: async ({ where }: { where: { id: { in: string[] }; schoolId: string; isActive: boolean } }) =>
      users.filter((u) => where.id.in.includes(u.id) && u.schoolId === where.schoolId && u.isActive === where.isActive),
  },
} as never;
const ids = users.map((u) => u.id);

test("a campus-bound member of another campus or with no campus gets no live events", async () => {
  const got = await deliverableUserIds({ schoolId: "s1", campusId: "main" }, ids, db);
  assert.deepEqual(got, ["main-admin", "super", "parent"]);
});

test("a campus-less room reaches only school-wide roles", async () => {
  const got = await deliverableUserIds({ schoolId: "s1", campusId: null }, ids, db);
  assert.deepEqual(got, ["super", "parent"]);
});

test("every publishToUsers caller and the typing and stream routes apply the access filter", () => {
  const svc = readFileSync("src/lib/chat/service.ts", "utf8");
  assert.equal(/publishToUsers\(\s*(recipientIds|\[|recipients\b)/.test(svc), false, "no raw recipient list is published");
  assert.match(readFileSync("src/app/api/chat/conversations/[id]/typing/route.ts", "utf8"), /deliverableUserIds/);
  assert.match(readFileSync("src/app/api/chat/stream/route.ts", "utf8"), /campusBoundChatRole\(user\.role\) && !user\.campusId/);
});
