import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageLibrary } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { DEFAULT_RULES, dueDate, finePreview, type LoanRules } from "./rules";

/**
 * SKO-436 lending desk on top of the existing catalogue (Book, LibraryMember, BookIssue keep
 * working). Every physical copy has its own barcode and state; issue and return are single
 * conditional updates, so two desks cannot lend the same copy and a repeated return scan changes
 * nothing; a returned copy is held for the first waiting reservation; fines follow the loan's own
 * rule version and can only be waived by a campus admin with a reason.
 */

/** Waiving a library charge is the campus operator's decision (matrix §2.4 #87: CA/ADMIN approve; the principal and
 *  the group admin do not). */
const canWaiveCharge = (user: AuthUser) => isCampusOperator(user);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const barcode = z.string().trim().regex(/^[A-Za-z0-9-]{3,40}$/u, "A barcode uses letters, numbers and dashes.");
const day = z.iso.date();

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assertDesk(user: AuthUser) { if (!canManageLibrary(user)) throw new ApiError("Only library staff use the lending desk.", 403); }
function campusOf(user: AuthUser) { if (!user.campusId) throw new ApiError("Choose a campus first.", 400); return user.campusId; }


export async function currentRules(db: TxClient, schoolId: string, campusId: string): Promise<LoanRules> {
  const row = await db.libraryLoanPolicy.findFirst({ where: { schoolId, campusId }, orderBy: { version: "desc" } });
  return row ? { version: row.version, loanDays: row.loanDays, maxLoans: row.maxLoans, maxRenewals: row.maxRenewals, graceDays: row.graceDays, finePerDay: row.finePerDay, fineCap: row.fineCap, lostCharge: row.lostCharge, holdDays: row.holdDays, currency: row.currency, closures: row.closures as string[] } : { version: 0, ...DEFAULT_RULES };
}

const PolicyInput = z.object({
  loanDays: z.number().int().min(1).max(120), maxLoans: z.number().int().min(1).max(20), maxRenewals: z.number().int().min(0).max(10), graceDays: z.number().int().min(0).max(30),
  finePerDay: z.number().int().min(0).max(100000), fineCap: z.number().int().min(0).max(10000000), lostCharge: z.number().int().min(0).max(10000000), holdDays: z.number().int().min(1).max(14),
  currency: z.string().trim().regex(/^[A-Z]{3}$/u), closures: z.array(day).max(400).default([]),
}).strict();

/** Rules are versioned: saving adds a version; loans keep the version they were issued under. */
export async function saveRules(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(PolicyInput, raw), campusId = campusOf(user);
  const latest = await currentRules(prisma, user.schoolId, campusId);
  return prisma.libraryLoanPolicy.create({ data: { ...input, closures: [...new Set(input.closures)].sort(), schoolId: user.schoolId, campusId, version: latest.version + 1, createdById: user.userId } });
}

/** Register physical copies. Existing titles without copies get one per counted copy first. */
export async function addCopies(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ bookId: text(1, 120), barcodes: z.array(barcode).min(1).max(100) }).strict(), raw), campusId = campusOf(user);
  if (new Set(input.barcodes).size !== input.barcodes.length) throw new ApiError("Each barcode can be used once.", 400);
  return prisma.$transaction(async (tx) => {
    const book = await tx.book.findFirst({ where: { id: input.bookId, schoolId: user.schoolId, campusId } });
    if (!book) throw new ApiError("Book not found", 404);
    const taken = await tx.bookCopy.findMany({ where: { campusId, barcode: { in: input.barcodes } }, select: { barcode: true } });
    if (taken.length) throw new ApiError(`Barcode already in use: ${taken.map((t) => t.barcode).join(", ")}`, 409);
    const existing = await tx.bookCopy.count({ where: { bookId: book.id } });
    await tx.bookCopy.createMany({ data: input.barcodes.map((code) => ({ schoolId: user.schoolId, campusId, bookId: book.id, barcode: code })) });
    // The title counters stay the single source the older screens read.
    const add = existing === 0 ? Math.max(0, input.barcodes.length - book.copiesTotal) : input.barcodes.length;
    await tx.book.update({ where: { id: book.id }, data: { copiesTotal: { increment: add }, copiesAvailable: { increment: add } } });
    return tx.bookCopy.findMany({ where: { bookId: book.id }, orderBy: { barcode: "asc" } });
  });
}

/** What the desk shows after a scan: the member (with loans and limit) or the copy (with state). */
export async function lookup(user: AuthUser, code: string) {
  assertDesk(user);
  const campusId = campusOf(user), value = code.trim();
  await expireHolds(user.schoolId, campusId);
  const member = await prisma.libraryMember.findFirst({ where: { schoolId: user.schoolId, campusId, memberNo: value }, include: { user: { select: { fullName: true } } } });
  if (member) {
    const rules = await currentRules(prisma, user.schoolId, campusId);
    const loans = await prisma.bookIssue.findMany({ where: { memberId: member.id, returnedAt: null }, include: { book: { select: { title: true } } }, orderBy: { dueAt: "asc" } });
    const copies = await prisma.bookCopy.findMany({ where: { id: { in: loans.map((l) => l.copyId).filter((x): x is string => !!x) } }, select: { id: true, barcode: true } });
    const holds = await prisma.bookReservation.findMany({ where: { memberId: member.id, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" } });
    const charges = await prisma.libraryCharge.findMany({ where: { memberId: member.id, status: "OPEN" } });
    return { kind: "MEMBER" as const, member: { id: member.id, memberNo: member.memberNo, name: member.user.fullName }, maxLoans: rules.maxLoans,
      loans: loans.map((l) => ({ id: l.id, title: l.book.title, barcode: copies.find((c) => c.id === l.copyId)?.barcode ?? null, dueAt: l.dueAt, renewals: l.renewals })),
      reservations: holds.map((h) => ({ id: h.id, bookId: h.bookId, status: h.status, readyUntil: h.readyUntil })), openCharges: charges.map((c) => ({ id: c.id, kind: c.kind, amount: c.amount, currency: c.currency })) };
  }
  const copy = await prisma.bookCopy.findFirst({ where: { schoolId: user.schoolId, campusId, barcode: value } });
  if (!copy) throw new ApiError("No member card or copy matches that code.", 404);
  const book = await prisma.book.findUnique({ where: { id: copy.bookId }, select: { id: true, title: true, author: true, isbn: true } });
  const waiting = await prisma.bookReservation.count({ where: { bookId: copy.bookId, status: "WAITING" } });
  return { kind: "COPY" as const, copy: { id: copy.id, barcode: copy.barcode, status: copy.status, condition: copy.condition, heldForReservation: !!copy.holdFor }, book, waitingReservations: waiting };
}

/** Issue one copy to one member. One conditional update decides which desk wins. */
export async function issueCopy(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ memberId: text(1, 120), barcode, overrideReason: text(8, 300).optional() }).strict(), raw), campusId = campusOf(user);
  return prisma.$transaction(async (tx) => {
    const member = await tx.libraryMember.findFirst({ where: { id: input.memberId, schoolId: user.schoolId, campusId } });
    if (!member) throw new ApiError("Member not found", 404);
    const copy = await tx.bookCopy.findFirst({ where: { schoolId: user.schoolId, campusId, barcode: input.barcode } });
    if (!copy) throw new ApiError("Copy not found", 404);
    const rules = await currentRules(tx, user.schoolId, campusId);
    const open = await tx.bookIssue.count({ where: { memberId: member.id, returnedAt: null } });
    if (open >= rules.maxLoans) throw new ApiError(`This reader already has ${open} of ${rules.maxLoans} allowed loans.`, 409);
    let hold: { id: string; memberId: string } | null = null;
    if (copy.status === "RESERVED_HOLD") {
      hold = await tx.bookReservation.findFirst({ where: { id: copy.holdFor ?? "", status: "READY" }, select: { id: true, memberId: true } });
      const forThisReader = hold?.memberId === member.id;
      if (!forThisReader && !input.overrideReason) throw new ApiError("This copy is held for another reader's reservation. Choose another copy, or record why it is released.", 409);
    } else if (copy.status !== "AVAILABLE") throw new ApiError(copy.status === "ON_LOAN" ? "This copy was just issued at another desk. Choose another copy." : "This copy is not available to lend.", 409);
    const claimed = await tx.bookCopy.updateMany({ where: { id: copy.id, status: copy.status, updatedAt: copy.updatedAt }, data: { status: "ON_LOAN", holdFor: null } });
    if (!claimed.count) throw new ApiError("This copy was just issued at another desk. Choose another copy.", 409);
    if (hold) await tx.bookReservation.update({ where: { id: hold.id }, data: { status: hold.memberId === member.id ? "FULFILLED" : "WAITING", copyId: null, readyUntil: null } });
    else await tx.book.update({ where: { id: copy.bookId }, data: { copiesAvailable: { decrement: 1 } } });
    const now = new Date();
    // `issuedById` lets a replay recognise only the loans this desk user made (AI Workflows reconcile, RT17).
    const snapshot = { ...rules, issuedById: user.userId, ...(input.overrideReason ? { holdOverride: { by: user.userId, reason: input.overrideReason } } : {}) };
    return tx.bookIssue.create({ data: { schoolId: user.schoolId, bookId: copy.bookId, memberId: member.id, copyId: copy.id, dueAt: dueDate(now, rules), policySnapshot: snapshot as unknown as Prisma.InputJsonValue } });
  });
}

/** Preview the fine for a loan if it were returned on a date (default today). */
export async function previewReturn(user: AuthUser, barcodeValue: string, on?: string) {
  assertDesk(user);
  const campusId = campusOf(user);
  const copy = await prisma.bookCopy.findFirst({ where: { schoolId: user.schoolId, campusId, barcode: barcodeValue } });
  if (!copy) throw new ApiError("Copy not found", 404);
  const loan = await prisma.bookIssue.findFirst({ where: { copyId: copy.id, returnedAt: null } });
  if (!loan) return { onLoan: false };
  const rules = (loan.policySnapshot as LoanRules | null) ?? (await currentRules(prisma, user.schoolId, campusId));
  return { onLoan: true, dueAt: loan.dueAt, rulesVersion: rules.version, fine: finePreview(loan.dueAt, on ? new Date(`${on}T00:00:00Z`) : new Date(), rules) };
}

/**
 * Return a copy. A second scan of the same copy reports "already returned" and changes nothing.
 * The fine uses the loan's own rule version. The copy then goes to the first waiting reservation.
 */
export async function returnCopy(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ barcode, condition: z.enum(["GOOD", "WORN", "DAMAGED"]).default("GOOD"), returnedOn: day.optional() }).strict(), raw), campusId = campusOf(user);
  return prisma.$transaction(async (tx) => {
    const copy = await tx.bookCopy.findFirst({ where: { schoolId: user.schoolId, campusId, barcode: input.barcode } });
    if (!copy) throw new ApiError("Copy not found", 404);
    const loan = await tx.bookIssue.findFirst({ where: { copyId: copy.id, returnedAt: null } });
    if (!loan) return { alreadyReturned: true, barcode: copy.barcode };
    const back = input.returnedOn ? new Date(`${input.returnedOn}T12:00:00Z`) : new Date();
    const rules = (loan.policySnapshot as LoanRules | null) ?? (await currentRules(tx, user.schoolId, campusId));
    const fine = finePreview(loan.dueAt, back, rules);
    const closed = await tx.bookIssue.updateMany({ where: { id: loan.id, returnedAt: null }, data: { returnedAt: back, fine: fine.amount, returnCondition: input.condition } });
    if (!closed.count) return { alreadyReturned: true, barcode: copy.barcode };
    if (fine.amount > 0) await tx.libraryCharge.create({ data: { schoolId: user.schoolId, campusId, issueId: loan.id, memberId: loan.memberId, kind: "FINE", amount: fine.amount, currency: fine.currency, detail: fine as unknown as Prisma.InputJsonValue } });
    // Hand the copy to the first waiting reader without telling them anything about this borrower.
    const next = input.condition === "DAMAGED" ? null : await tx.bookReservation.findFirst({ where: { bookId: copy.bookId, status: "WAITING" }, orderBy: { createdAt: "asc" } });
    if (next) {
      await tx.bookReservation.update({ where: { id: next.id }, data: { status: "READY", copyId: copy.id, readyUntil: new Date(Date.now() + rules.holdDays * 86_400_000) } });
      await tx.bookCopy.update({ where: { id: copy.id }, data: { status: "RESERVED_HOLD", holdFor: next.id, condition: input.condition } });
    } else {
      await tx.bookCopy.update({ where: { id: copy.id }, data: { status: input.condition === "DAMAGED" ? "DAMAGED" : "AVAILABLE", condition: input.condition } });
      if (input.condition !== "DAMAGED") await tx.book.update({ where: { id: copy.bookId }, data: { copiesAvailable: { increment: 1 } } });
    }
    return { alreadyReturned: false, barcode: copy.barcode, fine, heldForNextReservation: !!next };
  });
}

export async function renewLoan(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ issueId: text(1, 120) }).strict(), raw);
  return prisma.$transaction(async (tx) => {
    const loan = await tx.bookIssue.findFirst({ where: { id: input.issueId, schoolId: user.schoolId, returnedAt: null } });
    if (!loan) throw new ApiError("Open loan not found", 404);
    const rules = (loan.policySnapshot as LoanRules | null) ?? (await currentRules(tx, user.schoolId, campusOf(user)));
    if (loan.renewals >= rules.maxRenewals) throw new ApiError(`This loan has used its ${rules.maxRenewals} renewals.`, 409);
    if (await tx.bookReservation.count({ where: { bookId: loan.bookId, status: "WAITING" } })) throw new ApiError("Another reader is waiting for this title, so it cannot be renewed.", 409);
    return tx.bookIssue.update({ where: { id: loan.id }, data: { dueAt: dueDate(new Date(), rules), renewals: { increment: 1 } } });
  });
}

/** Join the queue for a title that has no copy on the shelf. */
export async function reserveTitle(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ memberId: text(1, 120), bookId: text(1, 120) }).strict(), raw), campusId = campusOf(user);
  const book = await prisma.book.findFirst({ where: { id: input.bookId, schoolId: user.schoolId, campusId } });
  if (!book) throw new ApiError("Book not found", 404);
  if (await prisma.bookCopy.count({ where: { bookId: book.id, status: "AVAILABLE" } })) throw new ApiError("A copy is on the shelf now; issue it instead of reserving.", 409);
  if (await prisma.bookReservation.findFirst({ where: { bookId: book.id, memberId: input.memberId, status: { in: ["WAITING", "READY"] } }, select: { id: true } })) throw new ApiError("This reader is already in the queue for this title.", 409);
  const created = await prisma.bookReservation.create({ data: { schoolId: user.schoolId, campusId, bookId: book.id, memberId: input.memberId } });
  const position = await prisma.bookReservation.count({ where: { bookId: book.id, status: "WAITING", createdAt: { lte: created.createdAt } } });
  return { id: created.id, position };
}

/** Holds not collected in time pass to the next reader, or back to the shelf. */
export async function expireHolds(schoolId: string, campusId: string) {
  const expired = await prisma.bookReservation.findMany({ where: { schoolId, campusId, status: "READY", readyUntil: { lt: new Date() } } });
  for (const hold of expired) {
    await prisma.$transaction(async (tx) => {
      const done = await tx.bookReservation.updateMany({ where: { id: hold.id, status: "READY" }, data: { status: "EXPIRED", copyId: null } });
      if (!done.count || !hold.copyId) return;
      const rules = await currentRules(tx, schoolId, campusId);
      const next = await tx.bookReservation.findFirst({ where: { bookId: hold.bookId, status: "WAITING" }, orderBy: { createdAt: "asc" } });
      if (next) {
        await tx.bookReservation.update({ where: { id: next.id }, data: { status: "READY", copyId: hold.copyId, readyUntil: new Date(Date.now() + rules.holdDays * 86_400_000) } });
        await tx.bookCopy.update({ where: { id: hold.copyId }, data: { holdFor: next.id } });
      } else {
        await tx.bookCopy.update({ where: { id: hold.copyId }, data: { status: "AVAILABLE", holdFor: null } });
        await tx.book.update({ where: { id: hold.bookId }, data: { copiesAvailable: { increment: 1 } } });
      }
    });
  }
}

/** Lost copy: the loan closes, the copy is marked lost and a charge is recorded for the fees office. */
export async function markLost(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ issueId: text(1, 120) }).strict(), raw), campusId = campusOf(user);
  return prisma.$transaction(async (tx) => {
    const loan = await tx.bookIssue.findFirst({ where: { id: input.issueId, schoolId: user.schoolId, returnedAt: null } });
    if (!loan) throw new ApiError("Open loan not found", 404);
    const rules = (loan.policySnapshot as LoanRules | null) ?? (await currentRules(tx, user.schoolId, campusId));
    await tx.bookIssue.update({ where: { id: loan.id }, data: { returnedAt: new Date(), returnCondition: "LOST" } });
    if (loan.copyId) await tx.bookCopy.update({ where: { id: loan.copyId }, data: { status: "LOST" } });
    await tx.book.update({ where: { id: loan.bookId }, data: { copiesTotal: { decrement: 1 } } });
    return tx.libraryCharge.create({ data: { schoolId: user.schoolId, campusId, issueId: loan.id, memberId: loan.memberId, kind: "LOST", amount: rules.lostCharge, currency: rules.currency, detail: { rulesVersion: rules.version } } });
  });
}

/** Waive (leaders only, with a reason) or hand a charge to the fees office (recorded, not posted). */
export async function decideCharge(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ chargeId: text(1, 120), decision: z.enum(["WAIVE", "HAND_TO_FEES"]), reason: text(8, 500) }).strict(), raw);
  if (input.decision === "WAIVE" && !canWaiveCharge(user)) throw new ApiError("Only a school leader can waive a library charge.", 403);
  if (input.decision === "HAND_TO_FEES") assertDesk(user);
  const done = await prisma.libraryCharge.updateMany({ where: { id: input.chargeId, schoolId: user.schoolId, status: "OPEN" },
    data: { status: input.decision === "WAIVE" ? "WAIVED" : "HANDED_TO_FEES", waivedById: user.userId, waiverReason: input.reason, decidedAt: new Date() } });
  if (!done.count) throw new ApiError("This charge has already been decided.", 409);
  return prisma.libraryCharge.findUnique({ where: { id: input.chargeId } });
}

export async function deskOverview(user: AuthUser) {
  assertDesk(user);
  const campusId = campusOf(user);
  await expireHolds(user.schoolId, campusId);
  const [rules, books, reservations, charges] = await Promise.all([
    currentRules(prisma, user.schoolId, campusId),
    prisma.book.findMany({ where: { schoolId: user.schoolId, campusId }, select: { id: true, title: true, copiesTotal: true, copiesAvailable: true }, orderBy: { title: "asc" }, take: 300 }),
    prisma.bookReservation.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.libraryCharge.findMany({ where: { schoolId: user.schoolId, campusId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return { rules, canWaive: canWaiveCharge(user), books, reservations, charges };
}
