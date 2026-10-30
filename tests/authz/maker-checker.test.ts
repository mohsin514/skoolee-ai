import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

/**
 * P8 — maker → checker pairs for tuition finance (role-ux §2.5, G27, G28, SD3).
 *
 *  1. Pure: who holds the maker and checker seats (canManageFinance / canApproveFinance / institution authority).
 *  2. Behaviour: `decideAdjustment` and tax `approve` run against an in-memory Prisma stand-in installed as
 *     `globalThis.prisma` before the services load (src/lib/db/prisma.ts reuses that client outside production).
 *     No database, no server: the stand-in answers only the calls these two decisions make.
 *  3. Source: the routes pass the SD3 reason through and self-approval notifies the institution authority.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/**
 * Equality, `{ in }`, `{ not }`, `{ lte }` and `{ has }` on top-level fields, plus `OR`: everything these services
 * filter on. An `undefined` condition is ignored, as Prisma does.
 */
function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "OR") return (condition as Where[]).some((branch) => matches(row, branch));
    const value = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const c = condition as { in?: unknown[]; not?: unknown; lte?: Date; has?: unknown };
      if ("has" in c && !(Array.isArray(value) && value.includes(c.has))) return false;
      if (c.in && !c.in.includes(value)) return false;
      if ("not" in c && value === c.not) return false;
      if (c.lte && !(value instanceof Date && value <= c.lte)) return false;
      return true;
    }
    return value === condition;
  });
}

const db = {
  users: [] as Row[],
  adjustments: [] as Row[],
  invoices: [] as Row[],
  activations: [] as Row[],
  runs: [] as Row[],
  audit: [] as Row[],
  activities: [] as Row[],
  places: [] as Row[],
  classes: [] as Row[],
  trips: [] as Row[],
  payments: [] as Row[],
  marks: [] as Row[],
};

function table(rows: () => Row[]) {
  return {
    findFirst: async ({ where }: { where?: Where } = {}) => rows().find((row) => matches(row, where)) ?? null,
    findUnique: async ({ where }: { where: Where }) => rows().find((row) => matches(row, where)) ?? null,
    findUniqueOrThrow: async ({ where }: { where: Where }) => {
      const found = rows().find((row) => matches(row, where));
      if (!found) throw new Error("not found");
      return found;
    },
    findMany: async ({ where }: { where?: Where } = {}) => rows().filter((row) => matches(row, where)),
    count: async ({ where }: { where?: Where } = {}) => rows().filter((row) => matches(row, where)).length,
    update: async ({ where, data }: { where: Where; data: Row }) => {
      const found = rows().find((row) => matches(row, where));
      if (!found) throw new Error("not found");
      Object.assign(found, data);
      return found;
    },
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows().filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    },
    create: async ({ data }: { data: Row }) => {
      rows().push({ ...data });
      return data;
    },
    groupBy: async ({ by, where }: { by: string[]; where?: Where }) => {
      const groups = new Map<string, { row: Row; count: number }>();
      for (const row of rows().filter((candidate) => matches(candidate, where))) {
        const key = by.map((field) => String(row[field])).join("|");
        const group = groups.get(key) ?? { row: Object.fromEntries(by.map((field) => [field, row[field]])), count: 0 };
        group.count += 1;
        groups.set(key, group);
      }
      return [...groups.values()].map(({ row, count }) => ({ ...row, _count: { _all: count } }));
    },
  };
}

const fake: Record<string, unknown> = {
  user: table(() => db.users),
  financialAdjustment: table(() => db.adjustments),
  invoice: table(() => db.invoices),
  taxActivation: table(() => db.activations),
  taxFixtureRun: table(() => db.runs),
  auditLog: table(() => db.audit),
  activity: table(() => db.activities),
  activityPlace: table(() => db.places),
  class: table(() => db.classes),
  trip: table(() => db.trips),
  payment: table(() => db.payments),
  mark: table(() => db.marks),
  // The school's locale package: defaults (no policies, no legacy weekends).
  school: table(() => [{ id: SCHOOL, timezone: "Asia/Karachi" }]),
  localePolicy: table(() => []),
  weekend: table(() => []),
  // No stored overrides: every role falls back to its default permission matrix.
  rolePermission: { findMany: async () => [] },
  $queryRaw: async () => [],
};
fake.$transaction = async (work: unknown) => (typeof work === "function" ? (work as (tx: unknown) => unknown)(fake) : Promise.all(work as unknown[]));

let scope: typeof import("../../src/lib/api/scope");
let adjustments: typeof import("../../src/lib/fees/adjustments-service");
let tax: typeof import("../../src/lib/tax/service");
let institution: typeof import("../../src/lib/auth/institution");
let activities: typeof import("../../src/lib/activities/service");
let corrections: typeof import("../../src/lib/corrections/service");

before(async () => {
  (globalThis as unknown as { prisma: unknown }).prisma = fake;
  scope = await import("../../src/lib/api/scope");
  adjustments = await import("../../src/lib/fees/adjustments-service");
  tax = await import("../../src/lib/tax/service");
  institution = await import("../../src/lib/auth/institution");
  activities = await import("../../src/lib/activities/service");
  corrections = await import("../../src/lib/corrections/service");
});

// The activities and corrections services reach the notification queue, whose module opens the shared Redis client
// on import. Nothing here uses it; close it so the run ends (and never waits on a local Redis).
after(async () => {
  const { redis } = await import("../../src/lib/queue/connection");
  redis.disconnect();
});

const SCHOOL = "school-1";
const CAMPUS = "campus-1";

function actor(id: string, role: AuthUser["role"], changes: Partial<AuthUser> = {}): AuthUser {
  return { userId: id, schoolId: SCHOOL, campusId: CAMPUS, role, email: `${id}@example.invalid`, ...changes };
}
const staff = (id: string, role: string, campusId: string | null = CAMPUS, isActive = true) => ({ id, schoolId: SCHOOL, campusId, role, isActive, fullName: `Synthetic ${id}` });

const INVOICE = { id: "inv-1", schoolId: SCHOOL, campusId: CAMPUS, studentId: "pupil-1", currency: "PKR", status: "PENDING", totalAmount: 10_000, totalAmountPaid: 0, balanceDue: 10_000, discountAmount: 0 };
const invoiceVersion = `${INVOICE.totalAmount}:${INVOICE.totalAmountPaid}:${INVOICE.balanceDue}:${INVOICE.status}`;
const waiver = (requesterId: string) => ({ id: "adj-1", schoolId: SCHOOL, campusId: CAMPUS, invoiceId: INVOICE.id, paymentId: null, kind: "WAIVER", status: "REQUESTED", amount: 1_000, requesterId, approverId: null, sourceVersion: invoiceVersion });

const ACTIVATION = (preparedById: string) => ({
  id: "act-1", schoolId: SCHOOL, status: "DRAFT", preparedById, approvedById: null, packageCode: "PK-DEMO", packageVersion: 1,
  campusIds: [CAMPUS], legalName: "Synthetic School Trust", taxId: "1234567", exemptFeeCodes: [], currency: "PKR",
  ownerId: "owner-1", evidenceReviewer: "Synthetic reviewer", evidenceReference: "REF-1", evidenceReviewedAt: new Date("2026-10-01T00:00:00Z"),
  effectiveFrom: new Date("2099-01-01T00:00:00Z"), configHash: "cfg-1",
});

beforeEach(() => {
  for (const list of Object.values(db)) list.length = 0;
  db.invoices.push({ ...INVOICE });
});

async function refusal(work: () => Promise<unknown>): Promise<number> {
  try { await work(); } catch (error) { return Number((error as { status?: number }).status ?? 500); }
  return 200;
}

// ─── 1. Seats ────────────────────────────────────────────────────────────────

test("seats: the finance desk makes, the campus operator checks, the principal holds neither", () => {
  const accountant = actor("ac", "ACCOUNTANT", { institutionKind: "GROUP" });
  const campusAdmin = actor("ca", "CAMPUS_ADMIN", { institutionKind: "GROUP" });
  const schoolAdmin = actor("so", "ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true });
  const principal = actor("pr", "PRINCIPAL", { institutionKind: "GROUP" });
  assert.equal(scope.canManageFinance(accountant), true, "accountant makes");
  assert.equal(scope.canApproveFinance(accountant), false, "accountant never checks");
  assert.equal(scope.canApproveFinance(campusAdmin), true, "campus admin checks");
  assert.equal(scope.canApproveFinance(schoolAdmin), true, "single-school admin checks");
  assert.equal(scope.canManageFinance(principal), false, "principal has no tuition writes");
  assert.equal(scope.canApproveFinance(principal), false, "principal approves no money");
});

test("seats: tax sign-off belongs to the institution authority only", () => {
  assert.equal(institution.isInstitutionAuthority(actor("sa", "SUPER_ADMIN", { institutionKind: "GROUP", campusId: null })), true);
  assert.equal(institution.isInstitutionAuthority(actor("so", "ADMIN", { institutionKind: "STANDALONE" })), true);
  assert.equal(institution.isInstitutionAuthority(actor("ca", "CAMPUS_ADMIN", { institutionKind: "GROUP" })), false);
  assert.equal(institution.isInstitutionAuthority(actor("ga", "ADMIN", { institutionKind: "GROUP" })), false, "an ADMIN inside a group is a campus operator");
  assert.equal(institution.isInstitutionAuthority(actor("ac", "ACCOUNTANT", { institutionKind: "STANDALONE" })), false);
});

test("a decided record is marked self-approved only when its maker decided it", () => {
  assert.equal(adjustments.isSelfApproved({ requesterId: "a", approverId: "a" }), true);
  assert.equal(adjustments.isSelfApproved({ requesterId: "a", approverId: "b" }), false);
  assert.equal(adjustments.isSelfApproved({ requesterId: "a", approverId: null }), false);
});

// ─── 2. Fee adjustments (G28 + SD3) ──────────────────────────────────────────

const DECISION_REASON = "Checked the receipt and the fee policy.";

test("the requester cannot approve their own adjustment while another campus admin holds the checker seat", async () => {
  db.users.push(staff("ca-1", "CAMPUS_ADMIN"), staff("ca-2", "CAMPUS_ADMIN"));
  db.adjustments.push(waiver("ca-1"));
  const me = actor("ca-1", "CAMPUS_ADMIN", { institutionKind: "GROUP" });
  assert.equal(await refusal(() => adjustments.decideAdjustment(me, "adj-1", "approve", "No other admin is on duty today.")), 403);
  assert.equal(db.adjustments[0].status, "REQUESTED");
});

test("an accountant can request but never decide, even their own request", async () => {
  db.users.push(staff("ac-1", "ACCOUNTANT"));
  db.adjustments.push(waiver("ac-1"));
  assert.equal(await refusal(() => adjustments.decideAdjustment(actor("ac-1", "ACCOUNTANT", { institutionKind: "GROUP" }), "adj-1", "approve", DECISION_REASON)), 403);
  assert.equal(await refusal(() => adjustments.decideAdjustment(actor("pr-1", "PRINCIPAL", { institutionKind: "GROUP" }), "adj-1", "approve", DECISION_REASON)), 403, "nor the principal");
});

test("the campus operator approves the finance desk's request; no self-approval flag", async () => {
  db.users.push(staff("ac-1", "ACCOUNTANT"), staff("ca-1", "CAMPUS_ADMIN"));
  db.adjustments.push(waiver("ac-1"));
  const checker = actor("ca-1", "CAMPUS_ADMIN", { institutionKind: "GROUP" });
  // P8-10: every money decision carries a typed reason (≥ 10 characters), kept in the audit row.
  assert.equal(await refusal(() => adjustments.decideAdjustment(checker, "adj-1", "approve")), 400, "no decision reason");
  assert.equal(db.adjustments[0].status, "REQUESTED");
  const decided = await adjustments.decideAdjustment(checker, "adj-1", "approve", DECISION_REASON);
  assert.equal((decided as Row).status, "APPLIED");
  assert.equal((decided as Row).approverId, "ca-1");
  const audit = db.audit.find((row) => row.tableName === "financial_adjustments");
  assert.ok(audit);
  assert.equal((audit.newValue as Row).selfApproved, undefined);
  assert.equal((audit.newValue as Row).reason, DECISION_REASON);
  assert.equal(db.invoices[0].balanceDue, 9_000, "the waiver reduced what is owed");
});

test("SD3: a campus admin alone on a group campus decides their own refund request only with a reason", async () => {
  // An accountant on the campus is the maker seat and never blocks SD3; the group admin is break-glass and never counts.
  db.users.push(staff("ca-1", "CAMPUS_ADMIN"), staff("ac-1", "ACCOUNTANT"), staff("sa-1", "SUPER_ADMIN", null), staff("ca-old", "CAMPUS_ADMIN", CAMPUS, false));
  db.adjustments.push(waiver("ca-1"));
  const me = actor("ca-1", "CAMPUS_ADMIN", { institutionKind: "GROUP" });
  assert.equal(await scope.soleChecker("finance", me, CAMPUS), true);
  assert.equal(await refusal(() => adjustments.decideAdjustment(me, "adj-1", "approve")), 400, "no reason");
  assert.equal(await refusal(() => adjustments.decideAdjustment(me, "adj-1", "approve", "too short")), 400, "reason under 10 characters");
  const decided = await adjustments.decideAdjustment(me, "adj-1", "approve", "No other campus admin is appointed yet.");
  assert.equal((decided as Row).status, "APPLIED");
  assert.equal(adjustments.isSelfApproved(decided as { requesterId: string; approverId: string | null }), true);
  const audit = db.audit.find((row) => row.tableName === "financial_adjustments")!;
  assert.deepEqual({ selfApproved: (audit.newValue as Row).selfApproved, reason: (audit.newValue as Row).reason }, { selfApproved: true, reason: "No other campus admin is appointed yet." });
});

test("SD3: the sole single-school admin decides their own request with a reason, recorded as self-approved", async () => {
  db.users.push(staff("so-1", "ADMIN"), staff("ac-1", "ACCOUNTANT"));
  db.adjustments.push(waiver("so-1"));
  const owner = actor("so-1", "ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true });
  const declined = await adjustments.decideAdjustment(owner, "adj-1", "decline", "Requested in error; withdrawing it myself.");
  assert.equal((declined as Row).status, "DECLINED");
  const audit = db.audit.find((row) => row.tableName === "financial_adjustments")!;
  assert.equal((audit.newValue as Row).selfApproved, true);
});

test("SD3 is refused for a single school with a deputy campus admin on the campus", async () => {
  db.users.push(staff("so-1", "ADMIN"), staff("dep-1", "CAMPUS_ADMIN"));
  db.adjustments.push(waiver("so-1"));
  const owner = actor("so-1", "ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true });
  assert.equal(await scope.soleChecker("finance", owner, CAMPUS), false);
  assert.equal(await refusal(() => adjustments.decideAdjustment(owner, "adj-1", "approve", "I am deciding this one myself.")), 403);
});

// ─── 3. Tax sign-off (G27 + SD3) ─────────────────────────────────────────────

test("tax: only the institution authority signs off; the finance desk and campus admins are refused", async () => {
  db.users.push(staff("ac-1", "ACCOUNTANT"), staff("ca-1", "CAMPUS_ADMIN"), staff("sa-1", "SUPER_ADMIN", null));
  db.activations.push(ACTIVATION("ac-1"));
  db.runs.push({ id: "run-1", activationId: "act-1", configHash: "cfg-1", passed: true, createdAt: new Date() });
  assert.equal(await refusal(() => tax.approve(actor("ac-2", "ACCOUNTANT", { institutionKind: "GROUP" }), "act-1")), 403, "a second accountant");
  assert.equal(await refusal(() => tax.approve(actor("ca-1", "CAMPUS_ADMIN", { institutionKind: "GROUP" }), "act-1")), 403, "a campus admin");
  const done = await tax.approve(actor("sa-1", "SUPER_ADMIN", { institutionKind: "GROUP", campusId: null, isInstitutionOwner: true }), "act-1");
  assert.equal(done.id, "act-1");
  assert.equal(db.activations[0].status, "SCHEDULED");
  assert.equal(db.activations[0].approvedById, "sa-1");
  const audit = db.audit.find((row) => row.tableName === "tax_activations")!;
  assert.equal((audit.newValue as Row).selfApproved, undefined);
});

test("tax SD3: the sole single-school admin signs off their own draft with a reason even when an accountant exists", async () => {
  db.users.push(staff("so-1", "ADMIN"), staff("ac-1", "ACCOUNTANT"));
  db.activations.push(ACTIVATION("so-1"));
  db.runs.push({ id: "run-1", activationId: "act-1", configHash: "cfg-1", passed: true, createdAt: new Date() });
  const owner = actor("so-1", "ADMIN", { institutionKind: "STANDALONE", isInstitutionOwner: true });
  assert.equal(await refusal(() => tax.approve(owner, "act-1")), 400, "a reason is required");
  await tax.approve(owner, "act-1", "I am the only administrator of this school.");
  assert.equal(db.activations[0].status, "SCHEDULED");
  const audit = db.audit.find((row) => row.tableName === "tax_activations")!;
  assert.equal((audit.newValue as Row).selfApproved, true);
});

test("tax SD3 is refused while another institution-authority user exists", async () => {
  db.users.push(staff("sa-1", "SUPER_ADMIN", null), staff("sa-2", "SUPER_ADMIN", null));
  db.activations.push(ACTIVATION("sa-1"));
  db.runs.push({ id: "run-1", activationId: "act-1", configHash: "cfg-1", passed: true, createdAt: new Date() });
  const me = actor("sa-1", "SUPER_ADMIN", { institutionKind: "GROUP", campusId: null, isInstitutionOwner: true });
  assert.equal(await refusal(() => tax.approve(me, "act-1", "I prepared this and want it live.")), 403);
  assert.equal(db.activations[0].status, "DRAFT");
});

// ─── 4. Source: wiring that a unit cannot reach ──────────────────────────────

const root = join(__dirname, "..", "..");
const code = (path: string) => readFileSync(join(root, path), "utf8").split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

test("routes pass the SD3 reason; self-approval tells the institution authority", () => {
  assert.match(code("src/app/api/fees/adjustments/route.ts"), /decideAdjustment\(user, id, body\.action, typeof body\.reason === "string" \? body\.reason : null\)/);
  assert.match(code("src/app/api/tax/route.ts"), /tax\.approve\(user, String\(body\.id \?\? ""\), typeof body\.reason === "string" \? body\.reason : null\)/);
  const service = code("src/lib/fees/adjustments-service.ts");
  assert.match(service, /soleChecker\("finance", user, current\.campusId\)/);
  assert.match(service, /notifySelfApproval\(\{ schoolId: user\.schoolId, campusId: sd3\.campusId, kind: "finance"/);
  assert.match(code("src/lib/tax/service.ts"), /soleChecker\("tax", user, null\)/);
});

test("payroll: the finance desk prepares, the campus operator approves (the principal holds neither)", () => {
  const payroll = code("src/lib/payroll-runs/service.ts");
  assert.match(payroll, /const APPROVERS = \["CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"\];/);
  assert.match(payroll, /const PREPARERS = \["ACCOUNTANT", "CAMPUS_ADMIN", "ADMIN"\];/);
  for (const fn of ["savePolicy", "saveProvider", "approveRun"]) {
    const body = payroll.slice(payroll.indexOf(`export async function ${fn}(`));
    assert.match(body.slice(0, body.indexOf("\n}")), /await canApprove\(user\);/, `${fn} is the approver's`);
  }
});

test("G25 (acceptance 1): tuition writes and PDFs gate on the finance desk, paired with the fees/accounts matrix", () => {
  const routes: Array<[string, "fees" | "accounts"]> = [
    ["src/app/api/fees/generate-invoices/route.ts", "fees"], ["src/app/api/fees/invoices/[invoiceId]/route.ts", "fees"],
    ["src/app/api/fees/payment/route.ts", "fees"], ["src/app/api/fees/structure/route.ts", "fees"], ["src/app/api/fees/structure/[structureId]/route.ts", "fees"],
    ["src/app/api/fees/types/route.ts", "fees"], ["src/app/api/fees/groups/route.ts", "fees"], ["src/app/api/fees/master-lines/route.ts", "fees"],
    ["src/app/api/fees/assignments/route.ts", "fees"], ["src/app/api/fees/discounts/route.ts", "fees"], ["src/app/api/fees/discount-assignments/route.ts", "fees"],
    ["src/app/api/fees/fine-rules/route.ts", "fees"], ["src/app/api/fees/carry-forwards/route.ts", "fees"],
    ["src/app/api/accounts/chart/route.ts", "accounts"], ["src/app/api/accounts/payment-methods/route.ts", "accounts"],
  ];
  for (const [file, module] of routes) {
    const source = code(file);
    assert.match(source, /if \(!canManageFinance\(user\)\) throw new ApiError\("Insufficient permissions", 403\);/, `${file} gates on canManageFinance`);
    assert.doesNotMatch(source, /canManageOperations\(/, `${file} no longer admits the principal through canManageOperations`);
    if (!file.includes("[invoiceId]")) assert.match(source, new RegExp(`assertPermission\\(user, "${module}", "(add|edit|delete)"\\)`), `${file} pairs the seat with the ${module} matrix`);
  }
  for (const file of ["src/app/api/fees/invoice-pdf/route.ts", "src/app/api/fees/payment-pdf/route.ts"]) {
    const source = code(file);
    assert.match(source, /canManageFinance\(user\)/, `${file}: staff PDFs are the finance desk's`);
    assert.match(source, /assertFeesRead\(user\)/, `${file}: and need fees.view`);
  }
  const accountant = actor("ac", "ACCOUNTANT", { institutionKind: "GROUP" }), principal = actor("pr", "PRINCIPAL", { institutionKind: "GROUP" });
  assert.deepEqual([scope.canManageFinance(accountant), scope.canManageFinance(principal)], [true, false]);
});

test("corrections: payment requests come from the finance desk, approvals from the checker seat, and the checker is told", () => {
  const corrections = code("src/lib/corrections/service.ts");
  assert.match(corrections, /kind === "MARK" \? canLeadAcademics\(user, campusId\) : canApproveFinance\(user\)/);
  assert.match(corrections, /notifyCorrectionRequested\(\{/);
});

test("activity fee waivers: campus operators only, with a recorded reason (M71, R3)", () => {
  const activities = code("src/lib/activities/service.ts");
  assert.match(activities, /status === "WAIVED" && !isCampusOperator\(user\)/, "only a campus operator waives");
  assert.match(activities, /status === "WAIVED" && reason\.length < 10/, "a waiver needs a reason of at least 10 characters");
  assert.match(activities, /tableName: "activity_places"[^\n]*newValue: \{ feeStatus: "WAIVED", reason \}/, "the waiver and its reason are audited");
  const ui = code("src/components/activities/activities.tsx");
  assert.match(ui, /requireReason=\{\{ label: ui\("Reason for waiving the fee"\) \}\}/, "the desk asks for the reason before waiving");
});

// ─── 5. Fix pass 2026-10-22: nav entries never lead to a refusal; controls follow the server ─────────────────

const activity = (id: string, campusId: string, coordinatorId: string, staffIds: string[] = []) => ({ id, schoolId: SCHOOL, campusId, kind: "CLUB", title: `Synthetic ${id}`, status: "OPEN", startsAt: new Date("2026-11-01T09:00:00Z"), endsAt: new Date("2026-11-01T11:00:00Z"), capacity: 20, coordinatorId, staffIds, costAmount: 0, costCurrency: "PKR" });

test("P8-01: any staff member lists the activities they run; the principal reads the campus; families are refused", async () => {
  db.activities.push(activity("act-1", CAMPUS, "pr-1"), activity("act-2", CAMPUS, "te-1", ["li-1"]), activity("act-3", "campus-2", "te-9", ["li-1"]));
  const principal = await activities.staffActivities(actor("pr-1", "PRINCIPAL", { institutionKind: "GROUP" }));
  assert.deepEqual(principal.activities.map((a) => a.id).sort(), ["act-1", "act-2"], "the principal reads every activity on the campus");
  assert.deepEqual(Object.fromEntries(principal.activities.map((a) => [a.id, a.canRun])), { "act-1": true, "act-2": false }, "and runs only the one they coordinate");
  assert.equal(principal.canPublish, false, "the principal does not publish");
  assert.equal(principal.canLead, false, "nor waive, refund or cancel");
  const librarian = await activities.staffActivities(actor("li-1", "LIBRARIAN", { institutionKind: "GROUP" }));
  assert.deepEqual(librarian.activities.map((a) => a.id).sort(), ["act-2", "act-3"], "a named staff member sees the activities they help run");
  assert.equal(librarian.activities.every((a) => a.canRun), true);
  const outsider = await activities.staffActivities(actor("ac-1", "ACCOUNTANT", { institutionKind: "GROUP" }));
  assert.deepEqual(outsider.activities, [], "a staff member with no activity gets an empty list, not a refusal");
  assert.equal(await refusal(() => activities.staffActivities(actor("pa-1", "PARENT", { institutionKind: "GROUP" }))), 403, "families use their own view");
});

test("P8-03: the correction request form follows the server's request rule (never shown, then refused)", async () => {
  const can = async (user: AuthUser, kind: "MARK" | "PAYMENT") => (await corrections.catalog(user, kind)).canRequest;
  assert.equal(await can(actor("te-1", "TEACHER", { institutionKind: "GROUP" }), "MARK"), true, "teachers request mark corrections");
  assert.equal(await can(actor("pr-1", "PRINCIPAL", { institutionKind: "GROUP" }), "MARK"), false, "the principal approves, never requests");
  assert.equal(await can(actor("ac-1", "ACCOUNTANT", { institutionKind: "GROUP" }), "PAYMENT"), true, "the accountant requests payment corrections");
  assert.equal(await can(actor("sa-1", "SUPER_ADMIN", { institutionKind: "GROUP", campusId: null }), "PAYMENT"), false, "the group admin never requests");
  const campusAdmin = actor("ca-1", "CAMPUS_ADMIN", { institutionKind: "GROUP" });
  assert.equal(await can(campusAdmin, "PAYMENT"), true, "a campus admin holding the finance desk (no accountant) requests");
  db.users.push(staff("ac-1", "ACCOUNTANT"));
  assert.equal(await can(campusAdmin, "PAYMENT"), false, "with an accountant on the campus the campus admin only approves");
});

test("P8-10: approving a payroll run needs a typed reason, kept in the audit row", () => {
  const payroll = code("src/lib/payroll-runs/service.ts");
  const body = payroll.slice(payroll.indexOf("export async function approveRun("));
  const approve = body.slice(0, body.indexOf("\n}"));
  assert.match(approve, /why\.length >= 10/, "a reason of at least 10 characters");
  assert.match(approve, /after: \{[^}]*reason: why \}/, "recorded with the approval");
  assert.match(code("src/app/api/payroll/runs/route.ts"), /case "approve": return approveRun\(user, id, body\.reason\)/);
  assert.match(code("src/components/payroll/payroll-runs-panel.tsx"), /requireReason=\{\{ label: ui\("Reason for approving this run"\)/);
});

test("P8-10: a payment-correction decision carries a typed reason once the route passes one", () => {
  const service = code("src/lib/corrections/service.ts");
  assert.match(service, /export async function decideCorrection\(user: AuthUser, id: string, decision: "APPLIED" \| "REJECTED", reviewHash: string, reason\?: string \| null\)/);
  assert.match(service, /c\.kind === "PAYMENT" && why !== undefined && why\.length < DECISION_REASON_MIN/, "a payment decision needs the reason");
  assert.match(service, /tableName: "corrections"[^\n]*newValue: \{ status: decision, kind: c\.kind, reason: why \}/, "kept in the audit row");
  assert.match(code("src/app/corrections/view.tsx"), /requireReason=\{kind === "PAYMENT" \?/, "the approver is asked for it");
});
