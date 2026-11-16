import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { listAuditHistory } from "../../src/lib/audit-history";

// SKAI-1194: the automatic SKAI-1162 row is superseded by the route's own row (newValue.supersedesAuditId).
// The activity history and its export show each change once, and never another school's rows.
const school = "school-1";
const admin = { userId: "u1", email: "u@example.invalid", role: "SUPER_ADMIN", schoolId: school, campusId: null, accessVersion: 0, institutionKind: "GROUP" } as unknown as AuthUser;

type Row = { id: string; schoolId: string; createdAt: Date; tableName: string; recordId: string; userId: string; campusId: string | null; retentionUntil: Date | null; oldValue: unknown; newValue: Record<string, unknown> };
const row = (over: Partial<Row> & Pick<Row, "id" | "createdAt">): Row => ({ schoolId: school, tableName: "students", recordId: "s1", userId: "u1", campusId: null, retentionUntil: null, oldValue: { status: "A" }, newValue: { status: "B" }, ...over });

const clauses = (where: any): Record<string, any>[] => (where.AND ? where.AND.flatMap(clauses) : [where]);

function fakeDb(rows: Row[]) {
  const auditLog = {
    findFirst: async () => null,
    findMany: async ({ where, take }: { where: Record<string, any>; take?: number }) => {
      const inSchool = rows.filter(entry => entry.schoolId === school);
      if (clauses(where).some(clause => clause.newValue?.path)) {
        return inSchool.filter(entry => typeof entry.newValue.supersedesAuditId === "string").map(entry => ({ newValue: entry.newValue }));
      }
      const notIn: string[] = clauses(where).find(clause => clause.id?.notIn)?.id.notIn ?? [];
      return inSchool.filter(entry => !notIn.includes(entry.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
    },
  };
  return { campus: { findMany: async () => [] }, user: { findMany: async () => [] }, auditLog } as never;
}

test("a superseded automatic row is folded out of the history; the superseding row and unrelated rows stay", async () => {
  const db = fakeDb([
    row({ id: "auto-1", createdAt: new Date(1000), newValue: { status: "B" } }),
    row({ id: "route-2", createdAt: new Date(2000), newValue: { status: "B", supersedesAuditId: "auto-1" } }),
    row({ id: "auto-3", createdAt: new Date(0), recordId: "s2" }),
    row({ id: "other-school", schoolId: "school-2", createdAt: new Date(3000) }),
  ]);
  const page = await listAuditHistory(admin, { limit: 25 }, db, new Date(5000));
  assert.deepEqual(page.data.map(entry => entry.id), ["route-2", "auto-3"]);
});
