import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { campusToday } from "@/lib/dormitory/allocations";

/**
 * SKO-456 optional campus packages: canteen, boarding operations and specialist templates.
 *
 * - A package is off until a school leader names its operators and completes its checklist; then
 *   it can be enabled. Disabling stops new transactions and keeps history readable; archiving needs
 *   every open obligation closed first. Package administration grants no access to dietary records.
 * - Canteen orders check the current menu, capacity (atomically) and the guardian's daily limit; a
 *   retried order replays; each order is charged and refunded at most once and reconciles. An item
 *   whose allergens meet the student's record, or any allergen item for a student whose record is not
 *   confirmed, waits for the dietary lead. Nothing claims allergen safety.
 * - Boarding leave is approved by a named approver and handed over on departure and return; roll
 *   calls turn absences and overdue returns into exceptions for wardens. Bed history stays in the
 *   SKO-463 allocations.
 */

const LEADERS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const STAFF = [...LEADERS, "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"];
export const PACKAGES = {
  CANTEEN: { roles: ["MANAGER", "DIETARY_LEAD"], checklist: ["food_safety_procedure", "allergen_procedure_validated", "refund_policy", "menu_publishing_owner"] },
  BOARDING: { roles: ["WARDEN", "LEAVE_APPROVER"], checklist: ["missing_student_procedure", "leave_policy_validated", "roll_call_times", "night_supervision_rota"] },
  SPECIALIST: { roles: ["LEAD"], checklist: ["local_requirements_validated", "template_reviewed"] },
} as const;
export type PackageKey = keyof typeof PACKAGES;
const ROLE_LABEL: Record<string, string> = { MANAGER: "canteen manager", DIETARY_LEAD: "dietary lead", WARDEN: "warden", LEAVE_APPROVER: "leave approver", LEAD: "package lead" };
export const SPECIALIST_TEMPLATES = ["Learning support provision", "Sports academy", "Performing arts", "Faith-based programme"] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const json = (value: unknown) => value as Prisma.InputJsonValue;
const push = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;
const day = (d: Date) => d.toISOString().slice(0, 10);
function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
function campusOf(user: AuthUser) { assert(!!user.campusId, "Choose a campus first.", 400); return user.campusId!; }

async function pkg(schoolId: string, campusId: string, key: PackageKey) {
  return prisma.campusPackage.findUnique({ where: { campusId_package: { campusId, package: key } } }).then((p) => (p && p.schoolId === schoolId ? p : null));
}
const operatorsOf = (p: { operators: Prisma.JsonValue } | null) => ((p?.operators ?? {}) as Record<string, string[]>);
async function operator(user: AuthUser, key: PackageKey, role: string) {
  const p = await pkg(user.schoolId, campusOf(user), key);
  assert(!!p && operatorsOf(p)[role]?.includes(user.userId), `Only the campus ${ROLE_LABEL[role]} can do this.`);
  return p;
}
async function requireEnabled(schoolId: string, campusId: string, key: PackageKey, label: string) {
  const p = await pkg(schoolId, campusId, key);
  assert(p?.status === "ENABLED", `${label} is not enabled for this campus.`, 409);
  return p;
}

// ─── Package setup ──────────────────────────────────────────────

const SetupInput = z.object({
  package: z.enum(["CANTEEN", "BOARDING", "SPECIALIST"]),
  operators: z.record(z.string(), z.array(text(1, 120)).max(10)).optional(),
  check: z.object({ item: text(2, 60), note: text(3, 300) }).strict().optional(),
  template: z.enum(SPECIALIST_TEMPLATES).optional(),
}).strict();

/** Name operators, tick checklist items with a note, or choose a specialist template. */
export async function setupPackage(user: AuthUser, raw: unknown) {
  assert(LEADERS.includes(user.role), "Only school leaders set up campus packages.");
  const input = parse(SetupInput, raw), campusId = campusOf(user), def = PACKAGES[input.package];
  const current = await pkg(user.schoolId, campusId, input.package) ?? await prisma.campusPackage.create({ data: { schoolId: user.schoolId, campusId, package: input.package, history: json([{ at: new Date().toISOString(), event: "SETUP_STARTED", by: user.userId }]) } });
  assert(current.status !== "ARCHIVED", "This package was archived. Start a new setup by asking support to reopen it.", 409);
  const data: Prisma.CampusPackageUpdateInput = {};
  if (input.operators) {
    for (const [role, ids] of Object.entries(input.operators)) {
      assert((def.roles as readonly string[]).includes(role), `Unknown role for this package: ${role}.`, 400);
      const found = await prisma.user.count({ where: { id: { in: ids }, schoolId: user.schoolId, campusId, isActive: true, role: { in: STAFF as never[] } } });
      assert(found === new Set(ids).size, "Operators must be active staff at this campus.", 400);
    }
    data.operators = json({ ...operatorsOf(current), ...input.operators });
  }
  if (input.check) {
    assert((def.checklist as readonly string[]).includes(input.check.item), "Unknown checklist item.", 400);
    data.checklist = json({ ...(current.checklist as Record<string, unknown>), [input.check.item]: { by: user.userId, at: new Date().toISOString(), note: input.check.note } });
  }
  if (input.template) { assert(input.package === "SPECIALIST", "Templates belong to the specialist package.", 400); data.settings = json({ ...(current.settings as Record<string, unknown>), template: input.template }); }
  data.history = push(current.history, { event: "SETUP_CHANGED", by: user.userId, operators: !!input.operators, check: input.check?.item ?? null, template: input.template ?? null });
  return prisma.campusPackage.update({ where: { id: current.id }, data });
}

/** What still blocks enabling: unnamed roles and unticked checklist items. */
export function setupGaps(key: PackageKey, p: { operators: Prisma.JsonValue; checklist: Prisma.JsonValue; settings: Prisma.JsonValue } | null) {
  const def = PACKAGES[key], ops = operatorsOf(p), done = (p?.checklist ?? {}) as Record<string, unknown>;
  const gaps = [...def.roles.filter((r) => !ops[r]?.length).map((r) => `Assign a ${ROLE_LABEL[r]}.`), ...def.checklist.filter((c) => !done[c]).map((c) => `Complete "${c.replace(/_/g, " ")}".`)];
  if (key === "SPECIALIST" && !(p?.settings as { template?: string } | null)?.template) gaps.push("Choose the specialist template this campus validated.");
  return gaps;
}

export async function enablePackage(user: AuthUser, raw: unknown) {
  assert(LEADERS.includes(user.role), "Only school leaders enable campus packages.");
  const { package: key } = parse(z.object({ package: z.enum(["CANTEEN", "BOARDING", "SPECIALIST"]) }).strict(), raw);
  const p = await pkg(user.schoolId, campusOf(user), key);
  assert(!!p && p.status !== "ARCHIVED", "Set the package up first.", 409);
  const gaps = setupGaps(key, p);
  assert(!gaps.length, `${key.charAt(0) + key.slice(1).toLowerCase()} cannot be enabled yet. ${gaps.join(" ")}`, 409);
  return prisma.campusPackage.update({ where: { id: p.id }, data: { status: "ENABLED", enabledById: user.userId, enabledAt: new Date(), history: push(p.history, { event: "ENABLED", by: user.userId }) } });
}

/** Open obligations that must close before a package can be archived. */
export async function obligations(schoolId: string, campusId: string, key: PackageKey) {
  const today = await campusToday(schoolId, campusId);
  if (key === "CANTEEN") {
    const [open, mismatches] = await Promise.all([
      prisma.canteenOrder.count({ where: { schoolId, campusId, status: { in: ["PLACED", "HOLD"] }, createdAt: { gte: new Date(0) }, itemId: { in: (await prisma.canteenItem.findMany({ where: { schoolId, campusId, serviceDate: { gte: today } }, select: { id: true } })).map((i) => i.id) } } }),
      reconcile(schoolId, campusId).then((r) => r.mismatches.length),
    ]);
    return [...(open ? [`${open} meal order(s) for today or later are still open.`] : []), ...(mismatches ? [`${mismatches} order(s) do not reconcile with their charges and refunds.`] : [])];
  }
  if (key === "BOARDING") {
    const [leave, exceptions] = await Promise.all([
      prisma.boardingLeave.count({ where: { schoolId, campusId, status: { in: ["PLANNED", "OUT"] } } }),
      prisma.boardingRollCall.findMany({ where: { schoolId, campusId }, select: { exceptions: true } }).then((rows) => rows.flatMap((r) => r.exceptions as { resolvedAt?: string }[]).filter((e) => !e.resolvedAt).length),
    ]);
    return [...(leave ? [`${leave} boarder(s) are on or about to go on leave.`] : []), ...(exceptions ? [`${exceptions} roll-call exception(s) are unresolved.`] : [])];
  }
  return [];
}

/** Disable stops new transactions and keeps history; archive needs every obligation closed. */
export async function disablePackage(user: AuthUser, raw: unknown) {
  assert(LEADERS.includes(user.role), "Only school leaders disable campus packages.");
  const input = parse(z.object({ package: z.enum(["CANTEEN", "BOARDING", "SPECIALIST"]), archive: z.boolean().default(false), reason: text(5, 300) }).strict(), raw);
  const campusId = campusOf(user), p = await pkg(user.schoolId, campusId, input.package);
  assert(!!p && ["ENABLED", "DISABLED", "SETUP"].includes(p.status), "This package is not active.", 409);
  const open = await obligations(user.schoolId, campusId, input.package);
  if (input.archive) assert(!open.length, `Close these before archiving: ${open.join(" ")}`, 409);
  const status = input.archive ? "ARCHIVED" : "DISABLED";
  const updated = await prisma.campusPackage.update({ where: { id: p.id }, data: { status, history: push(p.history, { event: status, reason: input.reason, openObligations: open, by: user.userId }) } });
  return { package: updated, obligations: open };
}

// ─── Canteen ────────────────────────────────────────────────────

const ItemInput = z.object({ serviceDate: z.iso.date(), name: text(2, 120), price: z.number().int().min(0).max(10_000_000), currency: z.string().regex(/^[A-Z]{3}$/u), capacity: z.number().int().min(1).max(5000), allergens: z.array(text(2, 40)).max(14) }).strict();

export async function addMenuItem(user: AuthUser, raw: unknown) {
  await operator(user, "CANTEEN", "MANAGER");
  await requireEnabled(user.schoolId, campusOf(user), "CANTEEN", "The canteen");
  const input = parse(ItemInput, raw);
  return prisma.canteenItem.create({ data: { ...input, serviceDate: new Date(`${input.serviceDate}T00:00:00Z`), allergens: input.allergens.map((a) => a.toLowerCase()), schoolId: user.schoolId, campusId: campusOf(user), createdById: user.userId } });
}

async function guardianFor(user: AuthUser, studentId: string) {
  assert(user.role === "PARENT" && !!(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "finances" })), "Not found", 404);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, campusId: true, fullName: true } });
  assert(!!student, "Not found", 404);
  return student;
}

export async function setSpendLimit(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ studentId: text(1, 120), dailyLimit: z.number().int().min(0).max(10_000_000) }).strict(), raw);
  await guardianFor(user, input.studentId);
  return prisma.canteenSpendLimit.upsert({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId: input.studentId } }, create: { schoolId: user.schoolId, studentId: input.studentId, dailyLimit: input.dailyLimit, setById: user.userId }, update: { dailyLimit: input.dailyLimit, setById: user.userId } });
}

/** Guardians record dietary information with its source; staff confirm it. Updates reset confirmation. */
export async function recordDietary(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ studentId: text(1, 120), allergens: z.array(text(2, 40)).max(14), diet: text(2, 120).nullable().optional(), source: z.enum(["GUARDIAN", "CLINIC", "DOCTOR_LETTER"]), sourceDate: z.iso.date() }).strict(), raw);
  let campusId: string;
  if (user.role === "PARENT") campusId = (await guardianFor(user, input.studentId)).campusId;
  else { await operator(user, "CANTEEN", "DIETARY_LEAD"); campusId = campusOf(user); }
  const existing = await prisma.dietaryRecord.findUnique({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId: input.studentId } } });
  const data = { allergens: input.allergens.map((a) => a.toLowerCase()), diet: input.diet ?? null, source: input.source, sourceDate: new Date(`${input.sourceDate}T00:00:00Z`), status: "NEEDS_CONFIRMATION", recordedById: user.userId, confirmedById: null, confirmedAt: null };
  if (existing) return prisma.dietaryRecord.update({ where: { id: existing.id }, data: { ...data, history: push(existing.history, { event: "UPDATED", by: user.userId, source: input.source }) } });
  return prisma.dietaryRecord.create({ data: { ...data, schoolId: user.schoolId, campusId, studentId: input.studentId, history: json([{ at: new Date().toISOString(), event: "RECORDED", by: user.userId, source: input.source }]) } });
}

export async function reviewDietary(user: AuthUser, id: string, raw: unknown) {
  await operator(user, "CANTEEN", "DIETARY_LEAD");
  const { status, note } = parse(z.object({ status: z.enum(["CONFIRMED", "UNCERTAIN"]), note: text(3, 300) }).strict(), raw);
  const record = await prisma.dietaryRecord.findFirst({ where: { id, schoolId: user.schoolId, campusId: campusOf(user) } });
  assert(!!record, "Record not found", 404);
  return prisma.dietaryRecord.update({ where: { id }, data: { status, confirmedById: status === "CONFIRMED" ? user.userId : null, confirmedAt: status === "CONFIRMED" ? new Date() : null, history: push(record.history, { event: status, note, by: user.userId }) } });
}

/** Restricted: the campus dietary lead only. Leaders administering the package do not get it. */
export async function dietaryRecords(user: AuthUser) {
  await operator(user, "CANTEEN", "DIETARY_LEAD");
  const rows = await prisma.dietaryRecord.findMany({ where: { schoolId: user.schoolId, campusId: campusOf(user) }, orderBy: { updatedAt: "desc" } });
  const students = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
  return rows.map((r) => ({ ...r, studentName: students.find((s) => s.id === r.studentId)?.fullName ?? "" }));
}

const OrderInput = z.object({ studentId: text(1, 120), itemId: text(1, 120), quantity: z.number().int().min(1).max(5), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/u, "Invalid idempotency key") }).strict();

export async function placeOrder(user: AuthUser, raw: unknown) {
  const input = parse(OrderInput, raw);
  const replay = await prisma.canteenOrder.findUnique({ where: { schoolId_idempotencyKey: { schoolId: user.schoolId, idempotencyKey: input.idempotencyKey } } });
  if (replay) { assert(replay.orderedById === user.userId && replay.itemId === input.itemId && replay.studentId === input.studentId && replay.quantity === input.quantity, "This order reference was used for a different order.", 409); return { order: replay, replayed: true }; }
  const student = await guardianFor(user, input.studentId);
  await requireEnabled(user.schoolId, student.campusId, "CANTEEN", "Canteen ordering");
  const item = await prisma.canteenItem.findFirst({ where: { id: input.itemId, schoolId: user.schoolId, campusId: student.campusId, status: "ACTIVE" } });
  assert(!!item, "That meal is not on the current menu.", 404);
  assert(item.serviceDate >= await campusToday(user.schoolId, student.campusId), "That meal's service date has passed.", 409);
  const amount = item.price * input.quantity;
  const limit = await prisma.canteenSpendLimit.findUnique({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId: student.id } } });
  if (limit) {
    const sameDay = await prisma.canteenItem.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, serviceDate: item.serviceDate }, select: { id: true } });
    const spent = (await prisma.canteenOrder.aggregate({ where: { studentId: student.id, itemId: { in: sameDay.map((i) => i.id) }, status: { in: ["PLACED", "HOLD", "SERVED"] } }, _sum: { amount: true } }))._sum.amount ?? 0;
    assert(spent + amount <= limit.dailyLimit, `This order would pass the daily limit of ${limit.dailyLimit} ${item.currency} (already ${spent}).`, 409);
  }
  const record = await prisma.dietaryRecord.findUnique({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId: student.id } } });
  const clash = record?.allergens.filter((a) => item.allergens.includes(a)) ?? [];
  const hold = clash.length ? `Declared allergen: ${clash.join(", ")}. A trained staff member will check this order.` : item.allergens.length && (!record || record.status !== "CONFIRMED") ? "The meal has allergens and the dietary record is not confirmed. A trained staff member will check this order." : null;
  try {
    return await prisma.$transaction(async (tx) => {
      const reserved = await tx.canteenItem.updateMany({ where: { id: item.id, status: "ACTIVE", sold: { lte: item.capacity - input.quantity } }, data: { sold: { increment: input.quantity } } });
      assert(reserved.count === 1, "Sold out. No charge was made.", 409);
      const order = await tx.canteenOrder.create({ data: { schoolId: user.schoolId, campusId: student.campusId, itemId: item.id, studentId: student.id, quantity: input.quantity, amount, currency: item.currency, status: hold ? "HOLD" : "PLACED", holdReason: hold, idempotencyKey: input.idempotencyKey, orderedById: user.userId, history: json([{ at: new Date().toISOString(), event: hold ? "HELD" : "PLACED", by: user.userId }]) } });
      if (!hold) await tx.canteenLedgerEntry.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, orderId: order.id, kind: "CHARGE", amount, currency: item.currency, createdById: user.userId } });
      return { order, replayed: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.canteenOrder.findUnique({ where: { schoolId_idempotencyKey: { schoolId: user.schoolId, idempotencyKey: input.idempotencyKey } } });
      if (again) return { order: again, replayed: true };
    }
    throw error;
  }
}

/** Cancel (guardian before the service date), release or reject a held order (dietary lead). */
export async function decideOrder(user: AuthUser, id: string, raw: unknown) {
  const { action, note } = parse(z.object({ action: z.enum(["CANCEL", "RELEASE", "REJECT", "SERVE"]), note: text(3, 300).optional() }).strict(), raw);
  const order = await prisma.canteenOrder.findFirst({ where: { id, schoolId: user.schoolId } });
  assert(!!order, "Order not found", 404);
  if (action === "CANCEL") { assert(order.orderedById === user.userId, "Only the guardian who ordered can cancel."); assert(["PLACED", "HOLD"].includes(order.status), "This order can no longer be cancelled.", 409); }
  else if (action === "SERVE") { await operator(user, "CANTEEN", "MANAGER"); assert(order.status === "PLACED", "Only a placed order is served.", 409); }
  else { await operator(user, "CANTEEN", "DIETARY_LEAD"); assert(order.status === "HOLD", "Only a held order is checked.", 409); assert(!!note, "Record what was checked.", 400); }
  return prisma.$transaction(async (tx) => {
    const next = action === "RELEASE" ? "PLACED" : action === "SERVE" ? "SERVED" : "CANCELLED";
    const moved = await tx.canteenOrder.updateMany({ where: { id, status: order.status }, data: { status: next, history: push(order.history, { event: action, note: note ?? null, by: user.userId }) } });
    assert(moved.count === 1, "This order changed since you opened it.", 409);
    if (next === "CANCELLED") {
      await tx.canteenItem.update({ where: { id: order.itemId }, data: { sold: { decrement: order.quantity } } });
      if (order.status === "PLACED") await tx.canteenLedgerEntry.create({ data: { schoolId: order.schoolId, campusId: order.campusId, studentId: order.studentId, orderId: order.id, kind: "REFUND", amount: order.amount, currency: order.currency, createdById: user.userId } });
    }
    if (action === "RELEASE") await tx.canteenLedgerEntry.create({ data: { schoolId: order.schoolId, campusId: order.campusId, studentId: order.studentId, orderId: order.id, kind: "CHARGE", amount: order.amount, currency: order.currency, createdById: user.userId } });
    return tx.canteenOrder.findUniqueOrThrow({ where: { id } });
  });
}

/** Every order's charges minus refunds against what it should be: its amount if live, zero otherwise. */
export async function reconcile(schoolId: string, campusId: string) {
  const [orders, entries] = await Promise.all([prisma.canteenOrder.findMany({ where: { schoolId, campusId } }), prisma.canteenLedgerEntry.findMany({ where: { schoolId, campusId } })]);
  const net = new Map<string, number>();
  for (const e of entries) net.set(e.orderId, (net.get(e.orderId) ?? 0) + (e.kind === "CHARGE" ? e.amount : -e.amount));
  const mismatches = orders.filter((o) => (net.get(o.id) ?? 0) !== (["PLACED", "SERVED"].includes(o.status) ? o.amount : 0)).map((o) => ({ orderId: o.id, status: o.status, expected: ["PLACED", "SERVED"].includes(o.status) ? o.amount : 0, net: net.get(o.id) ?? 0 }));
  return { charged: entries.filter((e) => e.kind === "CHARGE").reduce((s, e) => s + e.amount, 0), refunded: entries.filter((e) => e.kind === "REFUND").reduce((s, e) => s + e.amount, 0), orders: orders.length, mismatches };
}

// ─── Boarding ───────────────────────────────────────────────────

async function currentBoarders(schoolId: string, campusId: string) {
  const today = await campusToday(schoolId, campusId);
  const stays = await prisma.dormAllocation.findMany({ where: { schoolId, campusId, status: "ACTIVE", startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gt: today } }] }, select: { studentId: true, room: { select: { number: true } }, student: { select: { fullName: true } } } });
  return stays.map((s) => ({ studentId: s.studentId, name: s.student.fullName, room: s.room.number }));
}

const LeaveInput = z.object({ studentId: text(1, 120), departAt: z.iso.datetime(), expectedReturnAt: z.iso.datetime(), destination: text(2, 200), collectedBy: text(2, 120) }).strict();

export async function approveLeave(user: AuthUser, raw: unknown) {
  await operator(user, "BOARDING", "LEAVE_APPROVER");
  const campusId = campusOf(user);
  await requireEnabled(user.schoolId, campusId, "BOARDING", "Boarding");
  const input = parse(LeaveInput, raw);
  assert(new Date(input.expectedReturnAt) > new Date(input.departAt), "The return must be after the departure.", 400);
  assert((await currentBoarders(user.schoolId, campusId)).some((b) => b.studentId === input.studentId), "Leave is for a current boarder.", 400);
  return prisma.boardingLeave.create({ data: { schoolId: user.schoolId, campusId, studentId: input.studentId, departAt: new Date(input.departAt), expectedReturnAt: new Date(input.expectedReturnAt), destination: input.destination, collectedBy: input.collectedBy, approvedById: user.userId, history: json([{ at: new Date().toISOString(), event: "APPROVED", by: user.userId }]) } });
}

/** Wardens record the departure handover and the return handover; a late return needs a reason. */
export async function leaveHandover(user: AuthUser, id: string, raw: unknown) {
  await operator(user, "BOARDING", "WARDEN");
  const input = parse(z.object({ step: z.enum(["DEPART", "RETURN", "CANCEL"]), returnedTo: text(2, 120).optional(), lateReason: text(3, 300).optional() }).strict(), raw);
  const leave = await prisma.boardingLeave.findFirst({ where: { id, schoolId: user.schoolId, campusId: campusOf(user) } });
  assert(!!leave, "Leave not found", 404);
  const now = new Date();
  if (input.step === "DEPART") { assert(leave.status === "PLANNED", "This leave has already started.", 409); return prisma.boardingLeave.update({ where: { id }, data: { status: "OUT", departedAt: now, history: push(leave.history, { event: "DEPARTED", collectedBy: leave.collectedBy, by: user.userId }) } }); }
  if (input.step === "CANCEL") { assert(leave.status === "PLANNED", "Only planned leave can be cancelled.", 409); return prisma.boardingLeave.update({ where: { id }, data: { status: "CANCELLED", history: push(leave.history, { event: "CANCELLED", by: user.userId }) } }); }
  assert(leave.status === "OUT", "The boarder has not left.", 409);
  assert(!!input.returnedTo, "Record who handed the boarder back.", 400);
  const late = now > leave.expectedReturnAt;
  assert(!late || !!input.lateReason, "This return is late. Record the reason.", 400);
  return prisma.boardingLeave.update({ where: { id }, data: { status: "RETURNED", returnedAt: now, returnedTo: input.returnedTo, receivedById: user.userId, lateReason: late ? input.lateReason : null, history: push(leave.history, { event: late ? "RETURNED_LATE" : "RETURNED", returnedTo: input.returnedTo, by: user.userId }) } });
}

/** A roll call over current boarders. Absent without leave is MISSING; leave past its return is overdue. */
export async function takeRollCall(user: AuthUser, raw: unknown) {
  await operator(user, "BOARDING", "WARDEN");
  const campusId = campusOf(user);
  await requireEnabled(user.schoolId, campusId, "BOARDING", "Boarding");
  const input = parse(z.object({ label: text(2, 40), present: z.array(text(1, 120)).max(2000) }).strict(), raw);
  const [boarders, out] = await Promise.all([currentBoarders(user.schoolId, campusId), prisma.boardingLeave.findMany({ where: { schoolId: user.schoolId, campusId, status: "OUT" } })]);
  const onLeave = new Set(out.map((l) => l.studentId)), present = new Set(input.present);
  const entries = boarders.map((b) => ({ studentId: b.studentId, status: present.has(b.studentId) ? "PRESENT" : onLeave.has(b.studentId) ? "ON_LEAVE" : "ABSENT" }));
  const now = new Date();
  const exceptions = [
    ...entries.filter((e) => e.status === "ABSENT").map((e) => ({ studentId: e.studentId, kind: "MISSING" })),
    ...out.filter((l) => l.expectedReturnAt < now && !present.has(l.studentId)).map((l) => ({ studentId: l.studentId, kind: "LEAVE_OVERDUE", leaveId: l.id })),
  ];
  return prisma.boardingRollCall.create({ data: { schoolId: user.schoolId, campusId, label: input.label, takenById: user.userId, entries: json(entries), exceptions: json(exceptions) } });
}

export async function resolveException(user: AuthUser, rollCallId: string, raw: unknown) {
  await operator(user, "BOARDING", "WARDEN");
  const { studentId, resolution } = parse(z.object({ studentId: text(1, 120), resolution: text(5, 500) }).strict(), raw);
  const roll = await prisma.boardingRollCall.findFirst({ where: { id: rollCallId, schoolId: user.schoolId, campusId: campusOf(user) } });
  assert(!!roll, "Roll call not found", 404);
  const list = roll.exceptions as { studentId: string; resolvedAt?: string }[];
  const target = list.find((e) => e.studentId === studentId && !e.resolvedAt);
  assert(!!target, "No open exception for this student.", 409);
  Object.assign(target, { resolvedAt: new Date().toISOString(), resolution, resolvedById: user.userId });
  return prisma.boardingRollCall.update({ where: { id: roll.id }, data: { exceptions: json(list) } });
}

// ─── Overviews ──────────────────────────────────────────────────

/** Package states for navigation: a package adds navigation only while it is enabled or disabled. */
export async function packageStates(user: AuthUser) {
  if (!user.campusId) return {};
  const rows = await prisma.campusPackage.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId } });
  return Object.fromEntries(rows.map((r) => [r.package, r.status]));
}

export async function packagesOverview(user: AuthUser) {
  assert(LEADERS.includes(user.role), "Package setup is for school leaders.");
  const campusId = campusOf(user);
  const rows = await prisma.campusPackage.findMany({ where: { schoolId: user.schoolId, campusId } });
  const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { in: STAFF as never[] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  const packages = await Promise.all((Object.keys(PACKAGES) as PackageKey[]).map(async (key) => {
    const p = rows.find((r) => r.package === key) ?? null;
    return { key, status: p?.status ?? "OFF", roles: PACKAGES[key].roles, checklist: PACKAGES[key].checklist, operators: operatorsOf(p), done: (p?.checklist ?? {}) as Record<string, { note: string; at: string }>, settings: (p?.settings ?? {}) as Record<string, string>, gaps: setupGaps(key, p), obligations: p && ["ENABLED", "DISABLED"].includes(p.status) ? await obligations(user.schoolId, campusId, key) : [] };
  }));
  return { packages, staff, templates: SPECIALIST_TEMPLATES };
}

export async function canteenOverview(user: AuthUser) {
  const campusId = campusOf(user);
  const p = await pkg(user.schoolId, campusId, "CANTEEN");
  const ops = operatorsOf(p);
  const isManager = !!ops.MANAGER?.includes(user.userId), isDietary = !!ops.DIETARY_LEAD?.includes(user.userId);
  assert(LEADERS.includes(user.role) || isManager || isDietary, "Canteen operations are for the campus canteen team.");
  const today = await campusToday(user.schoolId, campusId);
  const items = await prisma.canteenItem.findMany({ where: { schoolId: user.schoolId, campusId, serviceDate: { gte: today } }, orderBy: [{ serviceDate: "asc" }, { name: "asc" }] });
  const orders = await prisma.canteenOrder.findMany({ where: { itemId: { in: items.map((i) => i.id) } }, orderBy: { createdAt: "asc" } });
  const students = await prisma.student.findMany({ where: { id: { in: orders.map((o) => o.studentId) } }, select: { id: true, fullName: true } });
  return { status: p?.status ?? "OFF", isManager, isDietary, items, orders: orders.map((o) => ({ ...o, studentName: students.find((s) => s.id === o.studentId)?.fullName ?? "", ...(isDietary ? {} : { holdReason: o.holdReason ? "Waiting for the dietary lead" : null }) })), reconciliation: await reconcile(user.schoolId, campusId), dietary: isDietary ? await dietaryRecords(user) : null };
}

export async function familyCanteen(user: AuthUser) {
  assert(user.role === "PARENT", "Not available", 404);
  const links = await prisma.guardianRelationship.findMany({ where: { schoolId: user.schoolId, guardianUserId: user.userId, status: "ACTIVE" }, select: { studentId: true } });
  const children = [];
  for (const { studentId } of links) {
    if (!(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "finances" }))) continue;
    const student = await prisma.student.findFirst({ where: { id: studentId }, select: { id: true, fullName: true, campusId: true } });
    if (!student) continue;
    const p = await pkg(user.schoolId, student.campusId, "CANTEEN");
    if (!p || !["ENABLED", "DISABLED"].includes(p.status)) continue;
    const today = await campusToday(user.schoolId, student.campusId);
    const [menu, orders, limit, dietary] = await Promise.all([
      p.status === "ENABLED" ? prisma.canteenItem.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, status: "ACTIVE", serviceDate: { gte: today } }, orderBy: [{ serviceDate: "asc" }, { name: "asc" }] }) : Promise.resolve([]),
      prisma.canteenOrder.findMany({ where: { studentId, orderedById: user.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.canteenSpendLimit.findUnique({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId } } }),
      prisma.dietaryRecord.findUnique({ where: { schoolId_studentId: { schoolId: user.schoolId, studentId } } }),
    ]);
    children.push({ studentId, name: student.fullName, status: p.status, menu: menu.map((m) => ({ ...m, remaining: m.capacity - m.sold })), orders, limit: limit?.dailyLimit ?? null, dietary: dietary ? { allergens: dietary.allergens, diet: dietary.diet, source: dietary.source, sourceDate: day(dietary.sourceDate), status: dietary.status } : null });
  }
  return { children };
}

export async function boardingOverview(user: AuthUser) {
  const campusId = campusOf(user);
  const p = await pkg(user.schoolId, campusId, "BOARDING");
  const ops = operatorsOf(p);
  const isWarden = !!ops.WARDEN?.includes(user.userId), isApprover = !!ops.LEAVE_APPROVER?.includes(user.userId);
  assert(LEADERS.includes(user.role) || isWarden || isApprover, "Boarding operations are for designated boarding staff.");
  const [boarders, leave, rolls] = await Promise.all([
    currentBoarders(user.schoolId, campusId),
    prisma.boardingLeave.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: ["PLANNED", "OUT"] } }, orderBy: { expectedReturnAt: "asc" } }),
    prisma.boardingRollCall.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { takenAt: "desc" }, take: 5 }),
  ]);
  const names = new Map(boarders.map((b) => [b.studentId, b.name]));
  const now = new Date();
  return {
    status: p?.status ?? "OFF", isWarden, isApprover, boarders,
    leave: leave.map((l) => ({ ...l, studentName: names.get(l.studentId) ?? "", overdue: l.status === "OUT" && l.expectedReturnAt < now })),
    rollCalls: rolls.map((r) => ({ ...r, present: (r.entries as { status: string }[]).filter((e) => e.status === "PRESENT").length, exceptions: (r.exceptions as { studentId: string; kind: string; resolvedAt?: string; resolution?: string }[]).map((e) => ({ ...e, studentName: names.get(e.studentId) ?? "" })) })),
  };
}
