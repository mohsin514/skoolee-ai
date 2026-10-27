import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/lib/resources/service.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
function fixture() {
  const db = {
    class: { findMany: async () => [] },
    learningResource: { findMany: async () => { throw new Error("Must not read resource rows without a class scope"); } },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/api/scope") return {
      ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
      canManageOperations: (user: any) => user.role === "PRINCIPAL",
    };
    if (id === "@/lib/chat/policy") return { teacherClassIds: async () => [] };
    if (id === "@/lib/school-ai/transaction") return { schoolAiTransaction: async (_user: unknown, work: (db: unknown) => Promise<unknown>) => work(db) };
    if (id === "@/lib/storage/private-upload") return { MAX_PRIVATE_UPLOAD_BYTES: 1000000 };
    if (id.startsWith("@/")) return {};
    return require(id);
  });
  return (role: string, input = {}) => module.exports.listResources({ userId: "teacher-a", schoolId: "school-a", campusId: "campus-a", role }, input);
}

test("a teacher without assigned classes gets an empty scoped library", async () => {
  assert.deepEqual(await fixture()("TEACHER"), { mode: "staff", classId: "", classes: [], resources: [] });
});

test("a class-specific request and unsupported staff remain denied", async () => {
  const list = fixture();
  await assert.rejects(() => list("TEACHER", { classId: "foreign-class" }), { status: 403 });
  await assert.rejects(() => list("RECEPTIONIST"), { status: 403 });
});
