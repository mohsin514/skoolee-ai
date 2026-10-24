import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { addCopies, decideCharge, issueCopy, lookup, markLost, renewLoan, reserveTitle, returnCopy, saveRules } from "../../src/lib/library/desk";
import { dueDate, finePreview } from "../../src/lib/library/rules";

// SKO-436: copies have their own barcodes and states; two desks cannot lend one copy; a repeated
// return scan changes nothing; fines skip closures, honour grace and cap, and use the loan's own
// rule version; only leaders waive; a returned copy is held for the first waiting reader.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");
const raw = new PrismaClient(), schoolId = `library-${randomUUID()}`, campusId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid` });
const librarian = actor("LIBRARIAN"), lead = actor("PRINCIPAL"), readerUsers = [actor("STUDENT"), actor("STUDENT"), actor("STUDENT")];
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, work);
const ids: Record<string, string> = {}, members: string[] = [];

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic library school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic", regId: campusId, city: "Synthetic" } });
  for (const user of [librarian, lead, ...readerUsers]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, role: user.role, email: user.email, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  for (const [i, u] of readerUsers.entries()) members.push((await raw.libraryMember.create({ data: { schoolId, campusId, userId: u.userId, memberNo: `LM-${i + 1}` } })).id);
  ids.atlas = (await raw.book.create({ data: { schoolId, campusId, title: "Synthetic Atlas", isbn: "9780000000001", copiesTotal: 0, copiesAvailable: 0 } })).id;
  ids.novel = (await raw.book.create({ data: { schoolId, campusId, title: "Synthetic Novel", copiesTotal: 0, copiesAvailable: 0 } })).id;
});
after(async () => {
  for (const m of [raw.libraryCharge, raw.bookReservation, raw.bookCopy, raw.libraryLoanPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect();
});

test("rules: due dates skip closures; fines skip closures, honour grace and the cap", () => {
  assert.equal(dueDate(new Date("2026-12-11T09:00:00Z"), { loanDays: 14, closures: ["2026-12-25"] }).toISOString().slice(0, 10), "2026-12-26");
  const fine = finePreview(new Date("2026-12-20T00:00:00Z"), new Date("2026-12-28T15:00:00Z"), { graceDays: 1, finePerDay: 10, fineCap: 50, closures: ["2026-12-25", "2026-12-26"], currency: "SAR" });
  assert.deepEqual([fine.overdueDays, fine.closureDays.length, fine.graceDays, fine.chargeableDays, fine.uncapped, fine.amount], [8, 2, 1, 5, 50, 50]);
});

test("copies of one title have their own barcodes and states; a barcode is used once; only library staff use the desk", async () => {
  await ctx(librarian, () => saveRules(librarian, { loanDays: 7, maxLoans: 2, maxRenewals: 1, graceDays: 1, finePerDay: 10, fineCap: 40, lostCharge: 900, holdDays: 3, currency: "SAR", closures: ["2026-10-30"] }));
  await assert.rejects(() => ctx(readerUsers[0], () => addCopies(readerUsers[0], { bookId: ids.atlas, barcodes: ["AT-1"] })), { status: 403 });
  await ctx(librarian, () => addCopies(librarian, { bookId: ids.atlas, barcodes: ["AT-1", "AT-2"] }));
  await ctx(librarian, () => addCopies(librarian, { bookId: ids.novel, barcodes: ["NV-1"] }));
  await assert.rejects(() => ctx(librarian, () => addCopies(librarian, { bookId: ids.novel, barcodes: ["AT-1"] })), { status: 409 });
  const book = await raw.book.findUniqueOrThrow({ where: { id: ids.atlas } });
  assert.deepEqual([book.copiesTotal, book.copiesAvailable], [2, 2]);
  const scanned = await ctx(librarian, () => lookup(librarian, "AT-2"));
  assert.equal(scanned.kind, "COPY");
});

test("two desks cannot lend the same copy; the loan keeps its rules; limits are enforced", async () => {
  const race = await Promise.allSettled([members[0], members[1]].map((m) => ctx(librarian, () => issueCopy(librarian, { memberId: m, barcode: "AT-1" }))));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1, "one desk wins");
  const lost = race.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.match(lost.reason.message, /just issued at another desk/);
  const loan = await raw.bookIssue.findFirstOrThrow({ where: { copyId: { not: null }, returnedAt: null } });
  assert.equal((loan.policySnapshot as { version: number; loanDays: number }).loanDays, 7);
  ids.firstBorrower = loan.memberId;
  const other = members.find((m) => m !== loan.memberId)!;
  ids.secondReader = other;
  assert.equal((await raw.bookCopy.findFirstOrThrow({ where: { barcode: "AT-2", campusId } })).status, "AVAILABLE", "the other copy of the same title is unaffected");
  assert.equal((await raw.book.findUniqueOrThrow({ where: { id: ids.atlas } })).copiesAvailable, 1);
  await ctx(librarian, () => issueCopy(librarian, { memberId: loan.memberId, barcode: "AT-2" }));
  await assert.rejects(() => ctx(librarian, () => issueCopy(librarian, { memberId: loan.memberId, barcode: "NV-1" })), /2 of 2 allowed loans/);
});

test("a repeated return scan changes nothing; the fine skips closures and caps; only leaders waive", async () => {
  const loan = await raw.bookIssue.findFirstOrThrow({ where: { copyId: (await raw.bookCopy.findFirstOrThrow({ where: { barcode: "AT-1", campusId } })).id, returnedAt: null } });
  await raw.bookIssue.update({ where: { id: loan.id }, data: { dueAt: new Date("2026-10-27T00:00:00Z") } });
  const first = await ctx(librarian, () => returnCopy(librarian, { barcode: "AT-1", returnedOn: "2026-11-02" }));
  assert.equal(first.alreadyReturned, false);
  assert.deepEqual([first.fine!.overdueDays, first.fine!.closureDays, first.fine!.chargeableDays, first.fine!.amount], [6, ["2026-10-30"], 4, 40]);
  const again = await ctx(librarian, () => returnCopy(librarian, { barcode: "AT-1", returnedOn: "2026-11-02" }));
  assert.equal(again.alreadyReturned, true);
  assert.equal((await raw.book.findUniqueOrThrow({ where: { id: ids.atlas } })).copiesAvailable, 1, "availability went up once");
  const charge = await raw.libraryCharge.findFirstOrThrow({ where: { issueId: loan.id } });
  await assert.rejects(() => ctx(librarian, () => decideCharge(librarian, { chargeId: charge.id, decision: "WAIVE", reason: "Family circumstances" })), { status: 403 });
  await ctx(lead, () => decideCharge(lead, { chargeId: charge.id, decision: "WAIVE", reason: "Family bereavement that week" }));
  const waived = await raw.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.deepEqual([waived.status, waived.waivedById, waived.waiverReason], ["WAIVED", lead.userId, "Family bereavement that week"]);
  await assert.rejects(() => ctx(lead, () => decideCharge(lead, { chargeId: charge.id, decision: "WAIVE", reason: "Second decision attempt" })), { status: 409 });
});

test("a returned copy is held for the first waiting reader; others need a recorded reason; renewals wait for the queue", async () => {
  const novelReader = members[2];
  await ctx(librarian, () => issueCopy(librarian, { memberId: novelReader, barcode: "NV-1" }));
  await assert.rejects(() => ctx(librarian, () => reserveTitle(librarian, { memberId: ids.secondReader, bookId: ids.atlas })), /on the shelf now/);
  const reservation = await ctx(librarian, () => reserveTitle(librarian, { memberId: ids.secondReader, bookId: ids.novel }));
  assert.equal(reservation.position, 1);
  const novelLoan = await raw.bookIssue.findFirstOrThrow({ where: { memberId: novelReader, returnedAt: null } });
  await assert.rejects(() => ctx(librarian, () => renewLoan(librarian, { issueId: novelLoan.id })), /waiting for this title/);
  const back = await ctx(librarian, () => returnCopy(librarian, { barcode: "NV-1" }));
  assert.equal(back.heldForNextReservation, true);
  assert.equal((await raw.bookCopy.findFirstOrThrow({ where: { barcode: "NV-1", campusId } })).status, "RESERVED_HOLD");
  await assert.rejects(() => ctx(librarian, () => issueCopy(librarian, { memberId: novelReader, barcode: "NV-1" })), /held for another reader/);
  await ctx(librarian, () => issueCopy(librarian, { memberId: ids.secondReader, barcode: "NV-1" }));
  assert.equal((await raw.bookReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status, "FULFILLED");
});

test("a lost copy closes the loan, records a charge and can be handed to the fees office", async () => {
  const loan = await raw.bookIssue.findFirstOrThrow({ where: { memberId: ids.secondReader, returnedAt: null } });
  const charge = await ctx(librarian, () => markLost(librarian, { issueId: loan.id }));
  assert.deepEqual([charge.kind, charge.amount, charge.currency], ["LOST", 900, "SAR"]);
  assert.equal((await raw.bookCopy.findFirstOrThrow({ where: { barcode: "NV-1", campusId } })).status, "LOST");
  const handed = await ctx(librarian, () => decideCharge(librarian, { chargeId: charge.id, decision: "HAND_TO_FEES", reason: "Replacement cost to be billed" }));
  assert.equal(handed!.status, "HANDED_TO_FEES");
});
