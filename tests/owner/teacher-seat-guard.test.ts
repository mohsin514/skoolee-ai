import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Teacher = { schoolId: string; role: string; isActive: boolean };
type Invite = { schoolId: string; role: string; status: string };

let teachers: Teacher[] = [];
let invites: Invite[] = [];
const plan = "FREE";
let maxTeachers = 2;

const db = {
  school: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "school-a" || where.id === "school-b" ? { plan, commercialContract: null } : null) },
  user: { count: async ({ where }: { where: Teacher }) => teachers.filter((t) => t.schoolId === where.schoolId && t.role === where.role && t.isActive === where.isActive).length },
  staffInvitation: { count: async ({ where }: { where: { role: string } }) => invites.filter((i) => i.role === where.role && i.status === "pending").length },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: db, } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/config/commercial-contract", { namedExports: { getSchoolPlanContract: () => ({ maxTeachers }) } });

const loadProvisioning = () => import("@/lib/owner/provisioning");
const expect402 = (e: { status?: number }) => e.status === 402;

test("the last free seat is allowed and the next one is refused", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-a", role: "TEACHER", isActive: true }];
  invites = [];
  await assertSeatAvailable("school-a", "TEACHER" as never);
  teachers.push({ schoolId: "school-a", role: "TEACHER", isActive: true });
  await assert.rejects(() => assertSeatAvailable("school-a", "TEACHER" as never), expect402);
});

test("pending invitations consume seats", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-a", role: "TEACHER", isActive: true }];
  invites = [{ schoolId: "school-a", role: "TEACHER", status: "pending" }];
  await assert.rejects(() => assertSeatAvailable("school-a", "TEACHER" as never), expect402);
});

test("inactive teachers do not consume seats", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-a", role: "TEACHER", isActive: false }, { schoolId: "school-a", role: "TEACHER", isActive: false }];
  invites = [];
  await assertSeatAvailable("school-a", "TEACHER" as never);
});

test("another school's teachers do not use this school's seats", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-b", role: "TEACHER", isActive: true }, { schoolId: "school-b", role: "TEACHER", isActive: true }];
  invites = [];
  await assertSeatAvailable("school-a", "TEACHER" as never);
});

test("unlimited plans are never refused", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  maxTeachers = -1;
  teachers = Array.from({ length: 50 }, () => ({ schoolId: "school-a", role: "TEACHER", isActive: true }));
  await assertSeatAvailable("school-a", "TEACHER" as never);
  maxTeachers = 2;
});

test("non-teacher roles are not metered", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-a", role: "TEACHER", isActive: true }, { schoolId: "school-a", role: "TEACHER", isActive: true }];
  await assertSeatAvailable("school-a", "ACCOUNTANT" as never);
});

test("a check run inside a caller transaction counts that transaction's view", async () => {
  const { assertSeatAvailable } = await loadProvisioning();
  teachers = [{ schoolId: "school-a", role: "TEACHER", isActive: true }];
  invites = [];
  const tx = { ...db, user: { count: async (args: { where: Teacher }) => teachers.filter((t) => t.schoolId === args.where.schoolId && t.role === args.where.role && t.isActive === args.where.isActive).length + 1 } };
  await assert.rejects(() => assertSeatAvailable("school-a", "TEACHER" as never, tx as never), expect402);
});
