import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-920: two staff starting an application from the same enquiry end with one linked application or an
// explicit conflict. The enquiry row lock (FOR UPDATE) is modelled as a per-row mutex held until commit.

type App = { id: string; schoolId: string; campusId: string; enquiryId: string | null; status: string; reference: string; resumeKeyHash: string | null };
type Enquiry = { id: string; schoolId: string; campusId: string; name: string; phone: string; email: string | null };

let apps: App[] = [];
let enquiries: Enquiry[] = [];
let seq = 0;
const definition = { identityKeys: [], documents: [], consent: { en: "" }, fields: [{ key: "guardian", identity: "guardianName", type: "text", label: "Guardian" }, { key: "phone", identity: "guardianPhone", type: "text", label: "Phone" }] };

const locks = new Map<string, Promise<void>>();
async function acquire(key: string) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const linkedTo = (where: { enquiryId: string; status: { notIn: string[] } }) => apps.find((a) => a.enquiryId === where.enquiryId && !where.status.notIn.includes(a.status)) ?? null;

const fakePrisma = {
  admissionForm: { findFirst: async ({ where }: { where: { schoolId: string } }) => (where.schoolId === "school-a" ? { id: "form-1", currentVersion: 1 } : null) },
  admissionFormVersion: { findUniqueOrThrow: async () => ({ id: "fv-1", definition }) },
  admissionQuery: { findFirst: async ({ where }: { where: { id: string; campusId: string; schoolId: string } }) => enquiries.find((e) => e.id === where.id && e.campusId === where.campusId && e.schoolId === where.schoolId) ?? null },
  admissionApplication: { findFirst: async ({ where }: { where: { enquiryId: string; status: { notIn: string[] } } }) => linkedTo(where) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join("?").includes("FOR UPDATE")) held.push(await acquire(`enquiry:${values[0]}`));
        return [];
      },
      admissionApplication: {
        findFirst: async ({ where }: { where: { enquiryId: string; status: { notIn: string[] } } }) => linkedTo(where),
        create: async ({ data }: { data: Omit<App, "id" | "status" | "resumeKeyHash"> }) => {
          await tick(); // the window in which an unlocked competitor would also pass its check
          const app = { ...data, id: `app-${++seq}`, status: "DRAFT", resumeKeyHash: null };
          apps.push(app);
          return app;
        },
      },
      admissionApplicationEvent: { create: async () => ({}) },
    };
    try { return await fn(tx); } finally { held.forEach((release) => release()); }
  },
};

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, assertModuleRead: async () => {}, assertStaffRole: () => {}, assertPermission: async (u: { role: string }) => { if (u.role === "TEACHER") throw new ApiError("Forbidden", 403); } } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => fn() } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (tx: unknown) => Promise<unknown>) => fakePrisma.$transaction(fn) } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertPlanCapacity: async () => {} } });
mock.module("@/lib/notifications/actions", { namedExports: { resolveSourceActions: async () => {} } });
mock.module("@/lib/notifications/in-app", { namedExports: { deliverNotification: async () => {} } });

const load = () => import("@/lib/admissions/service");
const staff = (over: Record<string, string> = {}) => ({ userId: "staff-1", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a", ...over }) as never;
function reset() {
  apps = []; seq = 0; locks.clear();
  enquiries = [
    { id: "enq-1", schoolId: "school-a", campusId: "campus-a", name: "Guardian One", phone: "+92 300 0000001", email: null },
    { id: "enq-2", schoolId: "school-a", campusId: "campus-b", name: "Guardian Two", phone: "+92 300 0000002", email: null },
  ];
}

test("two staff starting an application from the same enquiry get one application and an explicit conflict", async () => {
  reset();
  const { staffStart } = await load();
  const results = await Promise.allSettled([
    staffStart(staff(), "campus-a", { formId: "form-1", enquiryId: "enq-1" }),
    staffStart(staff({ userId: "staff-2" }), "campus-a", { formId: "form-1", enquiryId: "enq-1" }),
  ]);
  assert.equal(apps.length, 1, "exactly one application is linked to the enquiry");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);
  assert.match(rejected[0].reason.message, new RegExp(`already has application ${apps[0].reference}`));
});

test("the application carries the enquiry's verified contact without retyping", async () => {
  reset();
  const { staffStart } = await load();
  const created = await staffStart(staff(), "campus-a", { formId: "form-1", enquiryId: "enq-1" }) as { answers: Record<string, string>; enquiryId: string };
  assert.equal(created.enquiryId, "enq-1");
  assert.deepEqual(created.answers, { guardian: "Guardian One", phone: "+92 300 0000001" });
});

test("an enquiry from another campus or school is not found", async () => {
  reset();
  const { staffStart } = await load();
  await assert.rejects(() => staffStart(staff(), "campus-a", { formId: "form-1", enquiryId: "enq-2" }), (e: { status?: number }) => e.status === 404);
  await assert.rejects(() => staffStart(staff({ schoolId: "school-b" }), "campus-a", { formId: "form-1", enquiryId: "enq-1" }), (e: { status?: number }) => e.status === 409 || e.status === 404);
  assert.equal(apps.length, 0);
});

test("a role without admissions.edit cannot start an application", async () => {
  reset();
  const { staffStart } = await load();
  await assert.rejects(() => staffStart(staff({ role: "TEACHER" }), "campus-a", { formId: "form-1", enquiryId: "enq-1" }), (e: { status?: number }) => e.status === 403);
  assert.equal(apps.length, 0);
});
