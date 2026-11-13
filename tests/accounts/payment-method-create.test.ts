import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-413: creating a payment method returned 500 because school_id fell back to "" and broke the
// schools foreign key. The row must carry the caller's school; another school's campus is refused.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
const campuses: Record<string, string> = { "campus-a": "school-a", "campus-b": "school-b" };
const created: Record<string, unknown>[] = [];
const tx = {
  paymentMethodRef: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: `pm-${created.length}`, ...data }; } },
};
const prisma = {
  paymentMethodRef: { findFirst: async () => null },
  $transaction: async (fn: (c: typeof tx) => unknown) => fn(tx),
};
class ApiError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
mock.module(src("lib/api/scope.ts"), { namedExports: {
  ApiError,
  resolveCampusId: async (user: { schoolId: string; campusId: string }) => {
    if (campuses[user.campusId] !== user.schoolId) throw new ApiError("Campus not found", 404);
    return user.campusId;
  },
} });

test("payment methods are stamped with each caller's own school and campus", async () => {
  const { createPaymentMethod } = await import("../../src/lib/accounts/payment-method-command");
  type U = Parameters<typeof createPaymentMethod>[0];
  await createPaymentMethod({ schoolId: "school-a", campusId: "campus-a", role: "ACCOUNTANT" } as unknown as U, { name: "Easypaisa" });
  await createPaymentMethod({ schoolId: "school-b", campusId: "campus-b", role: "ACCOUNTANT" } as unknown as U, { name: "Easypaisa" });
  assert.deepEqual(created.map((r) => [r.schoolId, r.campusId]), [["school-a", "campus-a"], ["school-b", "campus-b"]]);

  await assert.rejects(
    createPaymentMethod({ schoolId: "school-b", campusId: "campus-a", role: "ACCOUNTANT" } as unknown as U, { name: "Cash" }),
    { message: "Campus not found" },
  );
  await assert.rejects(createPaymentMethod({ schoolId: "school-a", campusId: "campus-a" } as unknown as U, { name: " " }), { message: "name is required" });
  assert.equal(created.length, 2);
});
