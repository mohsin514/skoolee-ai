import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2150: catalogue writes must honour the permission matrix (library.add / library.edit), not only the role predicate.

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const checks: Array<[string, string]> = [];
let denied = false;
const writes: string[] = [];
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    canManageLibrary: () => true,
    assertPermission: async (_u: unknown, module: string, action: string) => { checks.push([module, action]); if (denied) throw new ApiError(`Insufficient permissions: ${module}.${action} denied`, 403); },
    resolveCampusId: async () => "campus-1",
  },
});
mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  bookCategory: { findFirst: async () => null, create: async () => { writes.push("category"); return {}; } },
  book: { create: async () => { writes.push("book"); return {}; }, findFirst: async () => null, update: async () => { writes.push("book-update"); return {}; } },
  libraryMember: { findFirst: async () => null, create: async () => { writes.push("member"); return {}; } },
} } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { writes.push("rename"); return {}; } } });

const user = { userId: "u1", role: "PRINCIPAL", schoolId: "s1", campusId: "campus-1" } as never;
const cmd = await import("@/lib/library/catalogue-command");

test("matrix denial blocks every catalogue write before touching the database", async () => {
  denied = true; writes.length = 0;
  const calls = [
    () => cmd.createCategory(user, { name: "x" }),
    () => cmd.createBook(user, { title: "t", copiesTotal: 1 }),
    () => cmd.updateBook(user, { id: "b1", author: "a" }),
    () => cmd.createMember(user, { userId: "u2", memberNo: "M1" }),
    () => cmd.renameCategory(user, { id: "c1", name: "n" }),
  ];
  for (const call of calls) await assert.rejects(call, (e: ApiError) => e.status === 403 && /library\./.test(e.message));
  assert.deepEqual(writes, []);
});

test("writes check library.add for creates and library.edit for edits", async () => {
  denied = false; checks.length = 0;
  await cmd.createCategory(user, { name: "x" });
  await cmd.createMember(user, { userId: "u2", memberNo: "M1" });
  await cmd.updateBook(user, { id: "b1", author: "a" }).catch(() => undefined);
  await cmd.renameCategory(user, { id: "c1", name: "n" });
  assert.deepEqual(checks, [["library", "add"], ["library", "add"], ["library", "edit"], ["library", "edit"]]);
});
