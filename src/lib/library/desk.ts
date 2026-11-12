import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, assertStaffRole, canManageLibrary } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { writeAuditEvent } from "@/lib/audit-events";
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

const RULE_KEYS = ["loanDays", "maxLoans", "maxRenewals", "graceDays", "finePerDay", "fineCap", "lostCharge", "holdDays", "currency"] as const;
const RULES_CHANGED = "These library rules changed while you were saving. Reload them, then save again.";

/** Whether a stored version already holds these rules, so saving them again is a replay. */
const sameRules = (stored: Record<(typeof RULE_KEYS)[number], number | string> & { closures: unknown }, input: z.infer<typeof PolicyInput>, closures: string[]) =>
  RULE_KEYS.every((key) => stored[key] === input[key]) && JSON.stringify(stored.closures) === JSON.stringify(closures);

/**
 * Rules are versioned: saving adds a version, and loans keep the version they were issued under. A payload identical to
 * the current version replays it. The version is allocated under a lock per campus, so racing saves never collide on the
 * unique key. A save that did not read the version a racing save committed gets a 409, and a unique violation is mapped to
 * the same 409. The audit row is written in the same transaction, so only committed versions are audited.
 */
export async function saveRules(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(PolicyInput, raw), campusId = campusOf(user);
  const closures = [...new Set(input.closures)].sort();
  const seen = await prisma.libraryLoanPolicy.findFirst({ where: { schoolId: user.schoolId, campusId }, orderBy: { version: "desc" }, select: { version: true } });
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${campusId}:library-loan-policy`}, 0))`;
      const last = await tx.libraryLoanPolicy.findFirst({ where: { schoolId: user.schoolId, campusId }, orderBy: { version: "desc" } });
      if (last && sameRules(last, input, closures)) return last;
      if ((last?.version ?? 0) !== (seen?.version ?? 0)) throw new ApiError(RULES_CHANGED, 409);
      const policy = await tx.libraryLoanPolicy.create({ data: { ...input, closures, schoolId: user.schoolId, campusId, version: (last?.version ?? 0) + 1, createdById: user.userId } });
      await writeAuditEvent(tx, user, { table: "library_loan_policies", recordId: policy.id, action: "CREATE", campusId, after: { version: policy.version, currency: policy.currency } });
      return policy;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(RULES_CHANGED, 409);
    throw error;
  }
}

/** Register physical copies. Existing titles without copies get one per counted copy first. */
export async function addCopies(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ bookId: text(1, 120), barcodes: z.array(barcode).min(1).max(100) }).strict(), raw), campusId = campusOf(user);
  if (new Set(input.barcodes).size !== input.barcodes.length) throw new ApiError("Each barcode can be used once.", 400);
  return prisma.$transaction(async (tx) => {
    // SKAI-1562: lock the title so two registrations cannot count the same unbarcoded copies twice.
    await tx.$queryRaw`SELECT id FROM books WHERE id = ${input.bookId} AND school_id = ${user.schoolId} AND campus_id = ${campusId} FOR UPDATE`;
    const book = await tx.book.findFirst({ where: { id: input.bookId, schoolId: user.schoolId, campusId } });
    if (!book) throw new ApiError("Book not found", 404);
    const taken = await tx.bookCopy.findMany({ where: { campusId, barcode: { in: input.barcodes } }, select: { barcode: true } });
    if (taken.length) throw new ApiError(`Barcode already in use: ${taken.map((t) => t.barcode).join(", ")}`, 409);
    const existing = await tx.bookCopy.count({ where: { bookId: book.id } });
    await tx.bookCopy.createMany({ data: input.barcodes.map((code) => ({ schoolId: user.schoolId, campusId, bookId: book.id, barcode: code })) });
    // The title counters stay the single source the older screens read.
    // Counted copies that have no barcode yet absorb new barcodes first, whatever the batch size;
    // only barcodes beyond them are new stock.
    const unbarcoded = Math.max(0, book.copiesTotal - existing);
    const add = Math.max(0, input.barcodes.length - unbarcoded);
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
    // SKAI-1858: once the card matches, the reader's rules, loans (with their copies), holds and charges load together.
    const loansWithCopies = async () => {
      const loans = await prisma.bookIssue.findMany({ where: { schoolId: user.schoolId, memberId: member.id, returnedAt: null }, include: { book: { select: { title: true } } }, orderBy: { dueAt: "asc" } });
      const copyIds = loans.map((l) => l.copyId).filter((x): x is string => !!x);
      const copies = copyIds.length ? await prisma.bookCopy.findMany({ where: { schoolId: user.schoolId, id: { in: copyIds } }, select: { id: true, barcode: true } }) : [];
      return { loans, copies };
    };
    const [rules, { loans, copies }, holds, charges] = await Promise.all([
      currentRules(prisma, user.schoolId, campusId),
      loansWithCopies(),
      prisma.bookReservation.findMany({ where: { schoolId: user.schoolId, memberId: member.id, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" } }),
      prisma.libraryCharge.findMany({ where: { schoolId: user.schoolId, memberId: member.id, status: "OPEN" } }),
    ]);
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
    // SKAI-1671: serialise issues per reader so two desks lending different copies cannot both pass the limit count.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`library-reader-loans:${member.id}`}))`;
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

/**
 * SKAI-1288: return a loan from the circulation list (a title without a barcoded copy). It charges
 * the same overdue fine as the lending desk, under the loan's own rule version.
 */
export async function returnIssue(user: AuthUser, id: string) {
  const existing = await prisma.bookIssue.findFirst({ where: { id, book: { campus: { schoolId: user.schoolId } } }, include: { book: { select: { campusId: true } } } });
  if (!existing) throw new ApiError("Issue not found", 404);
  if (existing.returnedAt) throw new ApiError("Book already returned", 409);
  // SKO-436: loans of a barcoded copy are returned at the lending desk, which also settles the
  // copy, any fine and the reservation queue.
  if (existing.copyId) throw new ApiError("Return this copy by scanning it at the lending desk.", 409);
  const now = new Date(), campusId = existing.book.campusId;
  return prisma.$transaction(async (tx) => {
    const rules = (existing.policySnapshot as LoanRules | null) ?? (await currentRules(tx, user.schoolId, campusId));
    const fine = finePreview(existing.dueAt, now, rules);
    // One conditional update decides the return, so a repeated request cannot add a copy twice.
    const closed = await tx.bookIssue.updateMany({ where: { id, returnedAt: null }, data: { returnedAt: now, fine: fine.amount } });
    if (!closed.count) throw new ApiError("Book already returned", 409);
    if (fine.amount > 0) await tx.libraryCharge.create({ data: { schoolId: user.schoolId, campusId, issueId: id, memberId: existing.memberId, kind: "FINE", amount: fine.amount, currency: fine.currency, detail: fine as unknown as Prisma.InputJsonValue } });
    await tx.book.update({ where: { id: existing.bookId }, data: { copiesAvailable: { increment: 1 } } });
    return tx.bookIssue.findUniqueOrThrow({ where: { id } });
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
    // SKAI-1643: claim the renewal count we read, so two desks renewing at once extend the loan once.
    const claimed = await tx.bookIssue.updateMany({ where: { id: loan.id, schoolId: user.schoolId, returnedAt: null, renewals: loan.renewals }, data: { dueAt: dueDate(loan.dueAt > new Date() ? loan.dueAt : new Date(), rules), renewals: loan.renewals + 1 } });
    if (claimed.count !== 1) throw new ApiError("This loan was just renewed or returned. Refresh to see its new due date.", 409);
    return tx.bookIssue.findUniqueOrThrow({ where: { id: loan.id } });
  });
}

/** Join the queue for a title that has no copy on the shelf. */
export async function reserveTitle(user: AuthUser, raw: unknown) {
  assertDesk(user);
  const input = parse(z.object({ memberId: text(1, 120), bookId: text(1, 120) }).strict(), raw), campusId = campusOf(user);
  const book = await prisma.book.findFirst({ where: { id: input.bookId, schoolId: user.schoolId, campusId } });
  if (!book) throw new ApiError("Book not found", 404);
  // SKAI-1447: the reader must be a library member of this school and campus, checked in the same transaction as the queue write.
  return prisma.$transaction(async (tx) => {
    const member = await tx.libraryMember.findFirst({ where: { id: input.memberId, schoolId: user.schoolId, campusId }, select: { id: true } });
    if (!member) throw new ApiError("Member not found", 404);
    if (await tx.bookCopy.count({ where: { bookId: book.id, status: "AVAILABLE" } })) throw new ApiError("A copy is on the shelf now; issue it instead of reserving.", 409);
    if (await tx.bookReservation.findFirst({ where: { bookId: book.id, memberId: member.id, status: { in: ["WAITING", "READY"] } }, select: { id: true } })) throw new ApiError("This reader is already in the queue for this title.", 409);
    const created = await tx.bookReservation.create({ data: { schoolId: user.schoolId, campusId, bookId: book.id, memberId: member.id } });
    const position = await tx.bookReservation.count({ where: { bookId: book.id, status: "WAITING", createdAt: { lte: created.createdAt } } });
    return { id: created.id, position };
  });
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
  // SKAI-1858: the desk pulse needs only the campus's copy totals; titles are picked through the books search.
  const [rules, shelf, reservations, charges] = await Promise.all([
    currentRules(prisma, user.schoolId, campusId),
    prisma.book.aggregate({ where: { schoolId: user.schoolId, campusId }, _sum: { copiesTotal: true, copiesAvailable: true } }),
    prisma.bookReservation.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.libraryCharge.findMany({ where: { schoolId: user.schoolId, campusId, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  // SKAI-1665: the desk keeps sight of what it handed to the fees office instead of losing it from view.
  // SKAI-1669: posted charges stay listed with their invoice link, so the desk sees what finance did with them.
  const handed = await prisma.libraryCharge.findMany({ where: { schoolId: user.schoolId, campusId, OR: [{ status: { in: ["HANDED_TO_FEES", "POSTED"] } }, { invoiceId: { not: null } }] }, orderBy: { decidedAt: "desc" }, take: 100 });
  const stock = { copiesTotal: shelf._sum.copiesTotal ?? 0, copiesAvailable: shelf._sum.copiesAvailable ?? 0 };
  return { rules, canWaive: canWaiveCharge(user), stock, reservations, charges, handed };
}

/**
 * SKAI-1665: the fees office queue for library charges handed over by the desk — campus-scoped, finance view
 * permission, with the member's name and number and the librarian's recorded reason as provenance.
 */
export async function handedLibraryCharges(user: AuthUser) {
  assertStaffRole(user);
  await assertPermission(user, "fees", "view");
  const campusId = campusOf(user);
  const charges = await prisma.libraryCharge.findMany({ where: { schoolId: user.schoolId, campusId, status: "HANDED_TO_FEES" }, orderBy: { decidedAt: "asc" }, take: 200 });
  const members = await prisma.libraryMember.findMany({ where: { schoolId: user.schoolId, campusId, id: { in: [...new Set(charges.map(c => c.memberId))] } }, select: { id: true, memberNo: true, user: { select: { fullName: true } } } });
  const byId = new Map(members.map(m => [m.id, m]));
  return charges.map(c => ({ id: c.id, issueId: c.issueId, kind: c.kind, amount: c.amount, currency: c.currency, reason: c.waiverReason, handedById: c.waivedById, handedAt: c.decidedAt, memberNo: byId.get(c.memberId)?.memberNo ?? null, memberName: byId.get(c.memberId)?.user.fullName ?? null }));
}
