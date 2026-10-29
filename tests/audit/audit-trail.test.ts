import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { auditedOperation, isAuditedModel, resetAuditTrailState } from "../../src/lib/db/audit-trail";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1162: every create, update and delete on an audited model writes exactly one audit row,
// filed under the row's school and the acting user, and a route's own audit row replaces it.

type Row = Record<string, unknown>;

function fakeClient(existing: Row | null = null) {
  const audits: Row[] = [];
  const client = {
    student: { findUnique: async () => existing },
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `audit-${audits.length + 1}`, ...data };
        audits.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = audits.find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  };
  return { audits, client: client as never };
}

const asUser = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId: "school-a", userId: "user-1" }, fn);

beforeEach(() => resetAuditTrailState());

test("create writes one audit row with the school and actor", async () => {
  const { audits, client } = fakeClient();
  const created = { id: "s1", schoolId: "school-a", fullName: "Synthetic One" };
  const result = await asUser(() =>
    auditedOperation({ delegate: "student", operation: "create", args: { data: {} }, query: async () => created, client })
  );

  assert.equal(result, created);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].recordId, "s1");
  assert.equal(audits[0].userId, "user-1");
  assert.equal(audits[0].oldValue, undefined);
  assert.deepEqual(audits[0].newValue, { operation: "create", ...created });
});

test("update writes one audit row carrying the previous values", async () => {
  const before = { id: "s1", schoolId: "school-a", fullName: "Old", password: "x" };
  const { audits, client } = fakeClient(before);
  await asUser(() =>
    auditedOperation({
      delegate: "student",
      operation: "update",
      args: { where: { id: "s1" }, data: { fullName: "New" } },
      query: async () => ({ ...before, fullName: "New" }),
      client,
    })
  );

  assert.equal(audits.length, 1);
  assert.equal((audits[0].oldValue as Row).fullName, "Old");
  assert.equal((audits[0].oldValue as Row).password, "[redacted]");
  assert.equal((audits[0].newValue as Row).fullName, "New");
});

test("delete writes one audit row with the deleted record as the old value", async () => {
  const before = { id: "s1", schoolId: "school-a", fullName: "Gone" };
  const { audits, client } = fakeClient(before);
  await asUser(() =>
    auditedOperation({ delegate: "student", operation: "delete", args: { where: { id: "s1" } }, query: async () => before, client })
  );

  assert.equal(audits.length, 1);
  assert.equal(audits[0].recordId, "s1");
  assert.deepEqual(audits[0].oldValue, before);
  assert.deepEqual(audits[0].newValue, { operation: "delete" });
});

test("a route's own audit row replaces the automatic one instead of adding a second", async () => {
  const { audits, client } = fakeClient();
  await asUser(async () => {
    await auditedOperation({
      delegate: "student",
      operation: "create",
      args: { data: {} },
      query: async () => ({ id: "s1", schoolId: "school-a" }),
      client,
    });
    let manualInserted = false;
    await auditedOperation({
      delegate: "auditLog",
      operation: "create",
      args: { data: { tableName: "student", recordId: "s1", newValue: { rich: true }, userId: "user-1" } },
      query: async () => (manualInserted = true),
      client,
    });
    assert.equal(manualInserted, false);
  });

  assert.equal(audits.length, 1);
  assert.equal(audits[0].tableName, "student");
  assert.deepEqual(audits[0].newValue, { rich: true });
});

test("reads, skipped models and bulk counts behave as documented", async () => {
  const { audits, client } = fakeClient();
  await asUser(async () => {
    await auditedOperation({ delegate: "student", operation: "findMany", args: {}, query: async () => [], client });
    await auditedOperation({ delegate: "loginSession", operation: "create", args: {}, query: async () => ({ id: "l" }), client });
    await auditedOperation({
      delegate: "student",
      operation: "deleteMany",
      args: { where: { classId: "c1" } },
      query: async () => ({ count: 3 }),
      client,
    });
  });

  assert.equal(audits.length, 1);
  assert.equal(audits[0].recordId, "*");
  assert.deepEqual(audits[0].newValue, { operation: "deleteMany", where: { classId: "c1" }, count: 3 });
  assert.equal(isAuditedModel("auditLog"), false);
  assert.equal(isAuditedModel("studentTimelineEvent"), false);
  assert.equal(isAuditedModel("school"), false);
});

test("a failed audit write does not fail the change", async () => {
  const { client } = fakeClient();
  (client as { auditLog: { create: unknown } }).auditLog.create = async () => {
    throw new Error("db down");
  };
  const result = await asUser(() =>
    auditedOperation({ delegate: "student", operation: "create", args: {}, query: async () => ({ id: "s2", schoolId: "school-a" }), client })
  );
  assert.deepEqual(result, { id: "s2", schoolId: "school-a" });
});
