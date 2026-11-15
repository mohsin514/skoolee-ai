import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2184: only teachers and campus leadership may open emergency clinic access; support staff may not.
type Row = Record<string, unknown>;
const logs: Row[] = [];
const created: Row[] = [];
const client = {
  student: { findFirst: async () => ({ id: "kid-a1", campusId: "campus-a1" }) },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  emergencyAccess: { create: async ({ data }: { data: Row }) => { created.push(data); return { id: "grant-1", expiresAt: data.expiresAt }; }, findMany: async () => [] },
  confidentialMember: { findFirst: async () => null },
  confidentialAccessLog: { create: async ({ data }: { data: Row }) => { logs.push(data); return data; } },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => work(client) } });

const as = (role: string) => ({ userId: `u-${role}`, schoolId: "school-a", campusId: "campus-a1", role }) as never;
const body = { action: "emergency", domain: "CLINIC", studentId: "kid-a1", purpose: "Pupil collapsed", minutes: 5 };
const load = async () => await import("../../src/lib/care/service");

for (const role of ["LIBRARIAN", "ACCOUNTANT", "RECEPTIONIST"]) {
  test(`${role} cannot open emergency clinic access, and the refusal is logged`, async () => {
    const { openEmergency, workspaces } = await load();
    created.length = 0; logs.length = 0;
    await assert.rejects(openEmergency(as(role), body), (e: { status?: number }) => e.status === 403);
    assert.equal(created.length, 0);
    assert.equal(logs.at(-1)?.action, "DENIED");
    const me = await workspaces(as(role)) as { canEmergency: Record<string, boolean> };
    assert.equal(me.canEmergency.CLINIC, false);
  });
}

for (const role of ["STUDENT", "PARENT"]) {
  test(`${role} cannot open emergency clinic access`, async () => {
    const { openEmergency } = await load();
    created.length = 0;
    await assert.rejects(openEmergency(as(role), body), (e: { status?: number }) => e.status === 403);
    assert.equal(created.length, 0);
  });
}

for (const role of ["TEACHER", "PRINCIPAL"]) {
  test(`${role} can still open emergency clinic access`, async () => {
    const { openEmergency, workspaces } = await load();
    created.length = 0;
    await openEmergency(as(role), body);
    assert.equal(created.length, 1);
    const me = await workspaces(as(role)) as { canEmergency: Record<string, boolean> };
    assert.equal(me.canEmergency.CLINIC, true);
  });
}
