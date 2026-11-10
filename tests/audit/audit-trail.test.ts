import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { auditedOperation, isAuditedModel, resetAuditTrailState, withTransactionAudit } from "../../src/lib/db/audit-trail";
import { referenceTransaction } from "../../src/lib/db/reference-transaction";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1162: every create, update and delete on an audited model writes exactly one audit row,
// filed under the row's school and the acting user, and a route's own audit row is appended as a newer event that supersedes it (audit_logs is append-only).

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

test("a route's own audit row is appended and supersedes the automatic one, never updating it", async () => {
  const { audits, client } = fakeClient();
  (client as unknown as { auditLog: { update: unknown } }).auditLog.update = async () => { throw new Error("Audit events are append-only"); };
  await asUser(async () => {
    await auditedOperation({
      delegate: "student",
      operation: "create",
      args: { data: {} },
      query: async () => ({ id: "s1", schoolId: "school-a" }),
      client,
    });
    await auditedOperation({
      delegate: "auditLog",
      operation: "create",
      args: { data: { tableName: "student", recordId: "s1", newValue: { rich: true }, userId: "user-1" } },
      query: async (args) => (client as unknown as { auditLog: { create: (a: unknown) => Promise<unknown> } }).auditLog.create(args),
      client,
    });
  });

  assert.equal(audits.length, 2);
  assert.deepEqual(audits[1].newValue, { rich: true, supersedesAuditId: audits[0].id });
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

// SKAI-1796: document text and other free-text content never reach audit_logs.
test("content fields are omitted from the automatic audit row", async () => {
  const { audits, client } = fakeClient();
  const created = { id: "r1", schoolId: "school-a", title: "Synthetic", data: { extractedText: "Synthetic document text" }, extractedText: "Synthetic document text", body: "Synthetic body", messageContent: "Synthetic" };
  await asUser(() => auditedOperation({ delegate: "student", operation: "create", args: { data: {} }, query: async () => created, client }));
  const stored = JSON.stringify(audits[0].newValue);
  assert.equal(stored.includes("Synthetic document text"), false);
  assert.equal(stored.includes("Synthetic body"), false);
  assert.deepEqual(audits[0].newValue, { operation: "create", id: "r1", schoolId: "school-a", title: "Synthetic", data: "[omitted]", extractedText: "[omitted]", body: "[omitted]", messageContent: "[omitted]" });
});

const inTransaction = <T>(client: never, fn: () => Promise<T>) => asUser(() => referenceTransaction.run(client, () => withTransactionAudit(client, fn)));
const manualAudit = (client: never, recordId: string) => auditedOperation({
  delegate: "auditLog",
  operation: "create",
  args: { data: { schoolId: "school-a", tableName: "student", recordId, newValue: { rich: true }, userId: "user-1" } },
  query: async (args) => (client as unknown as { auditLog: { create: (a: unknown) => Promise<unknown> } }).auditLog.create(args),
  client,
});

test("inside a transaction a route's own audit row replaces the automatic one: one row per create", async () => {
  const { audits, client } = fakeClient();
  await inTransaction(client, async () => {
    await auditedOperation({ delegate: "student", operation: "create", args: { data: {} }, query: async () => ({ id: "s1", schoolId: "school-a" }), client });
    await auditedOperation({ delegate: "student", operation: "create", args: { data: {} }, query: async () => ({ id: "s2", schoolId: "school-a" }), client });
    await manualAudit(client, "s1");
  });
  assert.deepEqual(audits.map((row) => row.recordId), ["s1", "s2"]);
  assert.deepEqual(audits[0].newValue, { rich: true });
});

test("inside a transaction a failed audit write fails the transaction so it can be retried", async () => {
  const { client } = fakeClient();
  (client as { auditLog: { create: unknown } }).auditLog.create = async () => { throw new Error("could not serialize access"); };
  await assert.rejects(() => inTransaction(client, () =>
    auditedOperation({ delegate: "student", operation: "create", args: {}, query: async () => ({ id: "s3", schoolId: "school-a" }), client })
  ), /could not serialize/);
});

// SKAI-1358: a platform owner provisioning a school has no school context; the school row is filed under itself.
const asOwner = <T>(fn: () => Promise<T>) =>
  runWithTenantContext({ schoolId: "", userId: "owner-1", unscoped: true } as never, fn);

test("creating a school as the platform owner files the audit row under the new school", async () => {
  const { audits, client } = fakeClient();
  const created = { id: "school-b", name: "Synthetic Group" };
  await asOwner(() =>
    auditedOperation({ delegate: "school", operation: "create", args: { data: {} }, query: async () => created, client })
  );

  assert.equal(audits.length, 1);
  assert.equal(audits[0].tableName, "schools");
  assert.equal(audits[0].recordId, "school-b");
  assert.equal(audits[0].schoolId, undefined);
  assert.equal(audits[0].userId, "owner-1");
});

test("other school changes stay with the owner log, not audit_logs", async () => {
  const before = { id: "school-b", name: "Synthetic Group" };
  const { audits, client } = fakeClient();
  (client as unknown as Record<string, unknown>).school = { findUnique: async () => before };
  await asOwner(() =>
    auditedOperation({ delegate: "school", operation: "update", args: { where: { id: "school-b" }, data: {} }, query: async () => before, client })
  );
  assert.equal(audits.length, 0);
});
