import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1461: two identical supplier invoices recorded at the same time must not both be MATCHED.
type Invoice = { id: string; schoolId: string; campusId: string; supplierId: string | null; invoiceNo: string; amount: number; status: string; issues: { code: string }[] };
type Request = { id: string; schoolId: string; campusId: string; supplierId: string; lines: { unitPrice: number; quantity: number }[]; received: number[] };
let invoices: Invoice[] = [];
let requests: Request[] = [];
let seq = 0;

// pg_advisory_xact_lock: one holder per key until the owning transaction ends.
const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));

function client(held: Array<() => void>) {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("?").includes("pg_advisory_xact_lock")) held.push(await acquire(String(values[0])));
      return [];
    },
    purchaseRequest: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => requests.find((r) => r.id === where.id && r.schoolId === where.schoolId) ?? null },
    supplierInvoice: {
      findFirst: async ({ where }: { where: { schoolId: string; supplierId: string | null; invoiceNo: unknown } }) => {
        await pause();
        const q = where.invoiceNo as string | { equals: string; mode?: string };
        const same = (stored: string) => typeof q === "string" ? stored === q : q.mode === "insensitive" ? stored.toLowerCase() === q.equals.toLowerCase() : stored === q.equals;
        return invoices.find((i) => i.schoolId === where.schoolId && i.supplierId === where.supplierId && same(i.invoiceNo)) ?? null;
      },
      create: async ({ data }: { data: Omit<Invoice, "id"> }) => {
        await pause();
        const row = { id: `inv-${++seq}`, ...data };
        invoices.push(row);
        return row;
      },
    },
  };
}

const fakePrisma = {
  ...client([]),
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(client(held)); } finally { held.forEach((release) => release()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, soleChecker: async () => false } });
mock.module("@/lib/auth/institution", { namedExports: { isCampusOperator: () => true } });
mock.module("@/lib/notifications/events", { namedExports: { notifySelfApproval: async () => {} } });

const record = async (schoolId: string, requestId: string, invoiceNo: string, role = "CAMPUS_ADMIN") =>
  (await import("@/lib/purchasing/service")).recordInvoice({ userId: "u-1", role, schoolId, campusId: "campus-a" } as never, requestId, { invoiceNo, amount: 500 });

function seed() {
  invoices = [];
  seq = 0;
  requests = [
    { id: "po-a1", schoolId: "school-a", campusId: "campus-a", supplierId: "sup-a", lines: [{ unitPrice: 100, quantity: 5 }], received: [5] },
    { id: "po-a2", schoolId: "school-a", campusId: "campus-b", supplierId: "sup-a", lines: [{ unitPrice: 100, quantity: 5 }], received: [5] },
    { id: "po-b1", schoolId: "school-b", campusId: "campus-c", supplierId: "sup-a", lines: [{ unitPrice: 100, quantity: 5 }], received: [5] },
  ];
}

test("concurrent identical invoices: exactly one MATCHED, the other is a DUPLICATE review", async () => {
  seed();
  const [a, b] = await Promise.all([record("school-a", "po-a1", "INV-77"), record("school-a", "po-a1", "INV-77")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, ["MATCHED", "REVIEW"]);
  const review = [a, b].find((x) => x.status === "REVIEW")!;
  assert.ok((review.issues as { code: string }[]).some((i) => i.code === "DUPLICATE"));
});

test("invoice numbers are compared canonically (case and spacing)", async () => {
  seed();
  await record("school-a", "po-a1", "INV-77");
  const again = await record("school-a", "po-a2", " inv-77 ");
  assert.equal(again.status, "REVIEW", "same supplier invoice on a second campus order is still a duplicate");
});

test("another school can use the same supplier invoice number", async () => {
  seed();
  const [a, b] = await Promise.all([record("school-a", "po-a1", "INV-77"), record("school-b", "po-b1", "INV-77")]);
  assert.equal(a.status, "MATCHED");
  assert.equal(b.status, "MATCHED");
});

test("a denied role cannot record an invoice", async () => {
  seed();
  await assert.rejects(record("school-a", "po-a1", "INV-77", "TEACHER"));
  assert.equal(invoices.length, 0);
});
