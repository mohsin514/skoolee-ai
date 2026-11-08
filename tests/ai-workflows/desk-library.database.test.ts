import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { CLASS_A_ALLOWLIST } from "../../src/lib/ai-workflows/registry/floors";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { sha256 } from "../../src/lib/ai-workflows/executor/canonical";
import type { CapabilityContext, CapabilityEntry, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * The librarian's desk entries, exercised directly (resolve → preview → execute / prepare) until the lead
 * wires them into the registry. `library.category_create` is a class A write that needs a CLASS_A_ALLOWLIST
 * line the lead adds in floors.ts; until then this file adds it in memory before importing the entries.
 */
let loaded: readonly CapabilityEntry[] | null = null;
async function entries() {
  if (!loaded) {
    (CLASS_A_ALLOWLIST as Record<string, string>)["library.category_create"] ??= "test: pending floors.ts entry";
    loaded = (await import("../../src/lib/ai-workflows/registry/domains/desk/library")).LIBRARY_ENTRIES;
  }
  return loaded;
}
const exec = async (key: string) => (await entries()).find(item => item.key === key) as ExecEntry<any>;
const handoff = async (key: string) => (await entries()).find(item => item.key === key) as HandoffEntry<any>;
const KEY = () => `wf-test-${randomUUID()}`;
const DESK_WRITES = ["library.desk_issue_copy", "library.desk_return_copy", "library.desk_renew_loan", "library.desk_reserve_title", "library.desk_add_copies", "library.desk_save_rules", "library.member_create", "library.book_update", "library.category_create", "library.category_update", "library.book_create"];

async function fixture(role: AuthUser["role"] = "LIBRARIAN") {
  const schoolId = `lib-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic library school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", country: "PK", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: userId, financeReviewedBy: userId } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic librarian", role, isActive: true } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic librarian", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function bind(ctx: CapabilityContext, key: string, input: unknown) {
  const item = await exec(key);
  const parsed = item.input.parse(input);
  return item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
}
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = await exec(key);
  const bound = await bind(ctx, key, input);
  const preview = item.preview ? await item.preview(ctx, bound) : null;
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { bound, preview, receipt };
}

/** A class 7B with Ayesha Khan (a pupil with an account and a library card), one title with copies LB-0042 and LB-0043. */
async function library(schoolId: string, campusId: string, copies = ["LB-0042"]) {
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE" } });
  const pupil = async (fullName: string, rollNo: string, account = true) => {
    const accountId = account ? randomUUID() : null;
    if (accountId) await db.user.create({ data: { id: accountId, schoolId, campusId, email: `${accountId}@example.invalid`, fullName, role: "STUDENT", isActive: true } });
    const student = await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName, rollNo, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z"), studentUserId: accountId, admissionNo: `ADM-${rollNo}` } });
    return { accountId, student };
  };
  const ayesha = await pupil("Ayesha Khan", "12");
  const member = await db.libraryMember.create({ data: { schoolId, campusId, userId: ayesha.accountId!, memberNo: "M-0012" } });
  const book = await db.book.create({ data: { schoolId, campusId, title: "Atlas of the World", author: "Collins", isbn: "9780007428946", copiesTotal: copies.length, copiesAvailable: copies.length } });
  for (const barcode of copies) await db.bookCopy.create({ data: { schoolId, campusId, bookId: book.id, barcode } });
  return { klass, pupil, ayesha, member, book };
}

test("library entries define with their static classes, roles, evidence and seat gates", async () => {
  const all = await entries();
  assert.deepEqual(all.map(item => [item.key, item.class, item.risk]), [
    ["library.desk_issue_copy", "B", "CREATE"], ["library.desk_return_copy", "B", "UPDATE"], ["library.desk_renew_loan", "B", "UPDATE"],
    ["library.desk_reserve_title", "B", "CREATE"], ["library.desk_add_copies", "B", "CREATE"], ["library.desk_save_rules", "B", "UPDATE"],
    ["library.member_create", "B", "CREATE"], ["library.book_update", "B", "UPDATE"], ["purchasing.save_request", "B", "CREATE"],
    ["library.category_create", "A", "CREATE"], ["library.category_update", "B", "UPDATE"], ["library.book_create", "A", "CREATE"], ["read.library.overdue", "A", "READ"],
    ["library.desk_save_rules_money", "C", "FINANCIAL"], ["library.desk_mark_lost", "C", "FINANCIAL"], ["library.desk_decide_charge", "C", "FINANCIAL"],
  ]);
  for (const item of all) {
    assert.deepEqual([...item.roles], ["LIBRARIAN", "ADMIN", "CAMPUS_ADMIN"], item.key);
    if (DESK_WRITES.includes(item.key)) assert.ok(item.gates.some(gate => gate.id === "seat:librarian"), `${item.key} carries the librarian seat gate`);
    if (item.class === "C") assert.equal((item as { execute?: unknown }).execute, undefined, `${item.key} never executes`);
  }
  assert.deepEqual((await exec("library.desk_issue_copy")).evidence, ["/member", "/copy"]);
  assert.deepEqual((await exec("library.desk_issue_copy")).humanFields, ["memberId", "copyId"]);
  // No fine, amount or return date the model could write: the fine is the policy's, shown and not editable.
  const ret = await exec("library.desk_return_copy");
  assert.equal(ret.input.safeParse({ copy: "LB-0042", fine: 0 }).success, false);
  assert.deepEqual(ret.humanFields, ["copyId", "loanId", "returnedOn"]);
  // The circulation rules have no money field at all.
  const rules = await exec("library.desk_save_rules");
  for (const field of ["finePerDay", "fineCap", "lostCharge", "graceDays", "currency"]) assert.equal(rules.input.safeParse({ loanDays: 14, [field]: 5 }).success, false, `refuses ${field}`);
});

test("issue creates one loan with the due date in the preview; a replay after a crash reconciles and never lends twice", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { klass, member, book } = await library(schoolId, campusId, ["LB-0042", "LB-0043"]);
  await db.libraryLoanPolicy.create({ data: { schoolId, campusId, version: 1, loanDays: 7, maxLoans: 3, maxRenewals: 2, graceDays: 0, finePerDay: 0, fineCap: 0, lostCharge: 0, holdDays: 3, currency: "PKR", createdById: user.userId } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const issue = await exec("library.desk_issue_copy");
    // By title with two copies on the shelf: which label, never a guess.
    assert.equal(await code(bind(ctx, "library.desk_issue_copy", { member: "Ayesha Khan", copy: "Atlas", classId: klass.id })), "INPUT:/copy");
    const bound = await bind(ctx, "library.desk_issue_copy", { member: "Ayesha Khan", copy: "LB-0042", classId: klass.id });
    assert.equal(bound.memberId, member.id);
    const preview = await issue.preview!(ctx, bound);
    const due = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate() + 7)).toISOString().slice(0, 10);
    assert.ok(preview.lines.some(line => line.value === due), "the due date is on the preview");
    assert.match(preview.confirmLabel ?? "", new RegExp(due));
    const first = await issue.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(first.counts.issued, 1);
    assert.equal((first.detail as { dueAt: string }).dueAt, due);
    assert.equal(await db.bookIssue.count({ where: { memberId: member.id } }), 1);

    // Kill test: the domain write committed, the intent did not; the replay runs execute again.
    const replay = await issue.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(replay.counts.issued, 0);
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(replay.entities[0].id, first.entities[0].id);
    assert.equal(await db.bookIssue.count({ where: { memberId: member.id } }), 1, "never a second loan");
    assert.equal((await db.book.findUniqueOrThrow({ where: { id: book.id } })).copiesAvailable, 1);
  });

  // RT17: a loan another desk user made is not this step's write; the replay refuses instead of claiming it.
  const other = randomUUID();
  await db.user.create({ data: { id: other, schoolId, campusId, email: `${other}@example.invalid`, fullName: "Other librarian", role: "LIBRARIAN", isActive: true } });
  const colleague: AuthUser = { ...user, userId: other, email: `${other}@example.invalid` };
  await within(colleague, async () => {
    const ctx = await ctxFor(colleague, campusId);
    const bound = await bind(ctx, "library.desk_issue_copy", { member: "M-0012", copy: "LB-0043" });
    await (await exec("library.desk_issue_copy")).execute(ctx, bound, { idempotencyKey: KEY() });
  });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const copy = await db.bookCopy.findFirstOrThrow({ where: { campusId, barcode: "LB-0043" } });
    assert.equal(await code((await exec("library.desk_issue_copy")).execute(ctx, { member: "Ayesha Khan", copy: "LB-0043", memberId: member.id, copyId: copy.id }, { idempotencyKey: KEY() })), "DOMAIN_REFUSED");
  });
  assert.equal(await db.bookIssue.count({ where: { memberId: member.id } }), 2);
});

test("the return preview shows the policy fine, which cannot be edited; a policy change makes the preview stale", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { member, book } = await library(schoolId, campusId);
  await db.libraryLoanPolicy.create({ data: { schoolId, campusId, version: 1, loanDays: 14, maxLoans: 3, maxRenewals: 2, graceDays: 0, finePerDay: 10, fineCap: 0, lostCharge: 500, holdDays: 3, currency: "PKR", createdById: user.userId } });
  const copy = await db.bookCopy.update({ where: { campusId_barcode: { campusId, barcode: "LB-0042" } }, data: { status: "ON_LOAN" } });
  const fiveDaysAgo = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 5));
  // A legacy loan with no rule snapshot follows the live policy.
  const loan = await db.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, copyId: copy.id, dueAt: fiveDaysAgo } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const ret = await exec("library.desk_return_copy");
    const bound = await bind(ctx, "library.desk_return_copy", { copy: "Atlas of the World", condition: "WORN" });
    assert.equal(bound.loanId, loan.id);
    // Days late as of the campus's own today (bound by the server, never by the model).
    const late = Math.round((new Date(`${bound.returnedOn}T00:00:00Z`).getTime() - fiveDaysAgo.getTime()) / 86_400_000);
    const before = await ret.preview!(ctx, bound);
    const fineLine = before.lines.find(line => line.label === "Late fine")!;
    assert.match(fineLine.value, new RegExp(`PKR ${late * 10} for ${late} chargeable days`));
    assert.match(fineLine.value, /cannot be changed/);
    assert.equal(before.counts.fine, late * 10);

    await db.libraryLoanPolicy.create({ data: { schoolId, campusId, version: 2, loanDays: 14, maxLoans: 3, maxRenewals: 2, graceDays: 0, finePerDay: 20, fineCap: 0, lostCharge: 500, holdDays: 3, currency: "PKR", createdById: user.userId } });
    const afterChange = await ret.preview!(ctx, bound);
    assert.notEqual(sha256(afterChange), sha256(before), "the confirm-time preview no longer matches: STALE");
    assert.equal(afterChange.counts.fine, late * 20);

    const done = await ret.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(done.counts.returned, 1);
    assert.equal(done.counts.fine, afterChange.counts.fine, "the charged fine is the one on the confirmed preview");
    const closed = await db.bookIssue.findUniqueOrThrow({ where: { id: loan.id } });
    assert.deepEqual([closed.returnedAt !== null, closed.fine, closed.returnCondition], [true, late * 20, "WORN"]);
    assert.equal(await db.libraryCharge.count({ where: { issueId: loan.id, kind: "FINE", amount: late * 20 } }), 1);
    const replay = await ret.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(replay.counts.returned, 0);
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.libraryCharge.count({ where: { issueId: loan.id } }), 1, "one charge only");
  });
});

test("a renewal reconciles on the renewal count after a crash", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { klass } = await library(schoolId, campusId);
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    await confirmRun(ctx, "library.desk_issue_copy", { member: "Ayesha", copy: "LB-0042", classId: klass.id });
    const renew = await exec("library.desk_renew_loan");
    const bound = await bind(ctx, "library.desk_renew_loan", { copy: "LB-0042" });
    assert.equal(bound.renewals, 0);
    const preview = await renew.preview!(ctx, bound);
    assert.ok(preview.lines.some(line => line.value === "1 / 2"));
    const first = await renew.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(first.counts.renewed, 1);
    const replay = await renew.execute(ctx, bound, { idempotencyKey: KEY() });
    assert.equal(replay.counts.renewed, 0);
    assert.equal((replay.detail as { reconciled?: boolean }).reconciled, true);
    const loan = await db.bookIssue.findFirstOrThrow({ where: { id: bound.loanId } });
    assert.equal(loan.renewals, 1, "renewed once, not twice");
    // Someone else renewed again in between: the count no longer matches, so nothing is renewed blind.
    await db.bookIssue.update({ where: { id: loan.id }, data: { renewals: 2 } });
    assert.equal(await code(renew.execute(ctx, bound, { idempotencyKey: KEY() })), "STALE_VERSION");
  });
});

test("money is never the AI's: a waiver, a lost copy and fine rules are class C hand-offs that write nothing", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { member, book } = await library(schoolId, campusId);
  const copy = await db.bookCopy.findFirstOrThrow({ where: { campusId, barcode: "LB-0042" } });
  const returned = await db.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, copyId: copy.id, dueAt: new Date("2026-09-01Z"), returnedAt: new Date("2026-09-10Z"), fine: 90 } });
  const charge = await db.libraryCharge.create({ data: { schoolId, campusId, issueId: returned.id, memberId: member.id, kind: "FINE", amount: 90, currency: "PKR", detail: {} } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const waive = await handoff("library.desk_decide_charge");
    assert.equal(waive.class, "C");
    const input = waive.input.parse({ copy: "LB-0042", decision: "WAIVE", reason: "The library was shut that week" });
    const bound = waive.input.parse(await waive.resolve!(ctx, input));
    assert.equal(bound.chargeId, charge.id);
    const prepared = await waive.handoff.prepare(ctx, bound, { idempotencyKey: KEY() });
    assert.deepEqual([...prepared.targetRoles], ["CAMPUS_ADMIN", "ADMIN"]);
    assert.equal(prepared.link, "/admin?view=library&tab=lending");
    assert.deepEqual(prepared.prefill, { action: "charge", chargeId: charge.id, decision: "WAIVE", reason: "The library was shut that week" });
    const after = await db.libraryCharge.findUniqueOrThrow({ where: { id: charge.id } });
    assert.deepEqual([after.status, after.waivedById, after.decidedAt], ["OPEN", null, null], "nothing written");

    const money = await handoff("library.desk_save_rules_money");
    const rules = await money.handoff.prepare(ctx, money.input.parse({ finePerDay: 10, fineCap: 200 }), { idempotencyKey: KEY() });
    assert.deepEqual([...rules.targetRoles], ["CAMPUS_ADMIN", "ADMIN"]);
    assert.equal((rules.prefill.rules as { finePerDay: number }).finePerDay, 10);
    assert.equal(await db.libraryLoanPolicy.count({ where: { campusId } }), 0, "no policy version is saved");

    await db.bookCopy.update({ where: { id: copy.id }, data: { status: "ON_LOAN" } });
    const open = await db.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, copyId: copy.id, dueAt: new Date("2026-12-01Z") } });
    const lost = await handoff("library.desk_mark_lost");
    const lostBound = lost.input.parse(await lost.resolve!(ctx, lost.input.parse({ copy: "LB-0042" })));
    const lostPrepared = await lost.handoff.prepare(ctx, lostBound, { idempotencyKey: KEY() });
    assert.deepEqual(lostPrepared.prefill, { action: "lost", issueId: open.id, barcode: "LB-0042" });
    assert.equal((await db.bookIssue.findUniqueOrThrow({ where: { id: open.id } })).returnedAt, null);
    assert.equal(await db.libraryCharge.count({ where: { campusId } }), 1);
  });
});

test("circulation rules keep the money fields; sections, titles (ISBN merge), copies, members, edits, reservations and a purchase draft reconcile", async () => {
  const { user, schoolId, campusId } = await fixture();
  const { klass, pupil, member, book } = await library(schoolId, campusId);
  await db.libraryLoanPolicy.create({ data: { schoolId, campusId, version: 1, loanDays: 14, maxLoans: 3, maxRenewals: 2, graceDays: 1, finePerDay: 10, fineCap: 200, lostCharge: 500, holdDays: 3, currency: "PKR", createdById: user.userId } });
  const sara = await pupil("Sara Raza", "13");
  await pupil("Omar Noaccount", "14", false);
  await db.purchaseBudget.create({ data: { schoolId, campusId, costCenter: "Library", period: "2026-27", amount: 500000, currency: "PKR", approvalLimit: 100000, createdById: user.userId } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const saved = await confirmRun(ctx, "library.desk_save_rules", { loanDays: 21, maxLoans: 4 });
    assert.equal(saved.receipt.counts.versions, 1);
    const v2 = await db.libraryLoanPolicy.findFirstOrThrow({ where: { campusId, version: 2 } });
    assert.deepEqual([v2.loanDays, v2.maxLoans, v2.finePerDay, v2.fineCap, v2.lostCharge, v2.graceDays], [21, 4, 10, 200, 500, 1], "money fields unchanged");
    assert.equal((await confirmRun(ctx, "library.desk_save_rules", { loanDays: 21, maxLoans: 4 })).receipt.counts.versions, 0, "same rules: no new version");

    const category = await exec("library.category_create");
    const made = await category.execute(ctx, { name: "Reference" }, { idempotencyKey: KEY() });
    assert.equal(made.counts.created, 1);
    assert.equal((await category.execute(ctx, { name: "reference" }, { idempotencyKey: KEY() })).counts.created, 0);
    assert.equal(await db.bookCategory.count({ where: { campusId } }), 1);

    const books = await exec("library.book_create");
    const batch = { books: [{ title: "Atlas (2nd)", isbn: "978-0007428946", copiesTotal: 3 }, { title: "Oxford English Grammar", isbn: "9780194420877", copiesTotal: 2, category: "Reference" }, { title: "Oxford Grammar again", isbn: "9780194420877", copiesTotal: 1 }] };
    const created = await books.execute(ctx, books.input.parse(await books.resolve!(ctx, books.input.parse(batch))), { idempotencyKey: KEY() });
    assert.deepEqual(created.counts, { created: 1, merged: 2 }, "an ISBN already in the catalogue (or twice in the list) is merged");
    assert.equal(await db.book.count({ where: { campusId } }), 2);
    assert.deepEqual((await books.execute(ctx, books.input.parse(batch), { idempotencyKey: KEY() })).counts, { created: 0, merged: 3 });
    assert.equal(await code(books.resolve!(ctx, books.input.parse({ books: [{ title: "X", copiesTotal: 1, category: "Nope" }] }))), "INPUT:/books/0/category");

    const copies = await confirmRun(ctx, "library.desk_add_copies", { title: "Oxford English Grammar", numberFrom: "LB-0100", count: 2 });
    assert.deepEqual(copies.bound.barcodes, ["LB-0100", "LB-0101"]);
    assert.equal(copies.receipt.counts.added, 2);
    assert.equal((await confirmRun(ctx, "library.desk_add_copies", { title: "Oxford English Grammar", barcodes: ["LB-0100", "LB-0101"] })).receipt.counts.added, 0);
    assert.equal(await code(bind(ctx, "library.desk_add_copies", { title: "Oxford English Grammar", barcodes: ["LB-0042"] })), "DOMAIN_REFUSED", "a label of another title");

    const enrol = await confirmRun(ctx, "library.member_create", { classId: klass.id });
    assert.deepEqual(enrol.receipt.counts, { created: 1, alreadyMembers: 1 }, "Sara enrolled, Ayesha already; the pupil with no account is not");
    assert.equal((await db.libraryMember.findFirstOrThrow({ where: { campusId, userId: sara.accountId! } })).memberNo, "LIB-0001");
    assert.equal((await confirmRun(ctx, "library.member_create", { classId: klass.id })).receipt.counts.created, 0);

    const edit = await confirmRun(ctx, "library.book_update", { book: "Atlas of the World", category: "reference" });
    assert.equal(edit.receipt.counts.updated, 1);
    assert.equal((await db.book.findUniqueOrThrow({ where: { id: book.id } })).categoryId, made.entities[0].id);
    assert.equal((await confirmRun(ctx, "library.book_update", { book: "Atlas of the World", category: "Reference" })).receipt.counts.updated, 0);

    await confirmRun(ctx, "library.desk_issue_copy", { member: "M-0012", copy: "LB-0042" });
    assert.equal(await code(bind(ctx, "library.desk_reserve_title", { member: "Sara Raza", title: "Oxford English Grammar" })), "DOMAIN_REFUSED", "a copy is on the shelf: issue it");
    const hold = await confirmRun(ctx, "library.desk_reserve_title", { member: "Sara Raza", title: "Atlas of the World" });
    assert.equal(hold.receipt.counts.reserved, 1);
    assert.equal((await confirmRun(ctx, "library.desk_reserve_title", { member: "Sara Raza", title: "Atlas of the World" })).receipt.counts.reserved, 0);
    assert.equal(await db.bookReservation.count({ where: { campusId } }), 1);
    assert.ok(member.id);

    const draft = await confirmRun(ctx, "purchasing.save_request", { title: "Books for this term", lines: [{ description: "Oxford English Grammar", quantity: 10, unitPrice: 950 }] });
    assert.equal(draft.receipt.kind, "draft");
    assert.equal(draft.receipt.counts.created, 1);
    assert.equal((await confirmRun(ctx, "purchasing.save_request", { title: "Books for this term", lines: [{ description: "Oxford English Grammar", quantity: 10, unitPrice: 950 }] })).receipt.counts.created, 0);
    const request = await db.purchaseRequest.findFirstOrThrow({ where: { campusId } });
    assert.deepEqual([request.status, request.total, request.requestedById], ["DRAFT", 9500, user.userId]);
  });
});

test("the overdue list counts this campus's late loans only, with names kept in the receipt", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const { klass, member, book } = await library(schoolId, campusId);
  await db.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, dueAt: new Date("2026-01-05Z") } });
  await db.bookIssue.create({ data: { schoolId, bookId: book.id, memberId: member.id, dueAt: new Date("2099-01-05Z") } });
  const otherBook = await db.book.create({ data: { schoolId, campusId: otherCampusId, title: "Elsewhere", copiesTotal: 1, copiesAvailable: 0 } });
  const outsiderId = randomUUID();
  await db.user.create({ data: { id: outsiderId, schoolId, campusId: otherCampusId, email: `${outsiderId}@example.invalid`, fullName: "Other Campus Reader", role: "TEACHER", isActive: true } });
  const outsider = await db.libraryMember.create({ data: { schoolId, campusId: otherCampusId, userId: outsiderId, memberNo: "X-1" } });
  await db.bookIssue.create({ data: { schoolId, bookId: otherBook.id, memberId: outsider.id, dueAt: new Date("2026-01-05Z") } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const read = await exec("read.library.overdue");
    const all = await read.execute(ctx, {}, { idempotencyKey: KEY() });
    assert.equal(all.kind, "read");
    assert.equal(all.counts.overdue, 1);
    assert.match((all.detail as { text: string }).text, /Ayesha Khan/);
    assert.ok(!(all.detail as { text: string }).text.includes("Other Campus Reader"));
    assert.equal((await read.execute(ctx, { classId: klass.id }, { idempotencyKey: KEY() })).counts.overdue, 1);
  });
});

test("a foreign campus is SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const { member } = await library(schoolId, campusId);
  await db.purchaseBudget.create({ data: { schoolId, campusId, costCenter: "Library", period: "2026-27", amount: 500000, currency: "PKR", approvalLimit: 100000, createdById: user.userId } });
  const all = await entries();
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    for (const item of all) assert.equal((await runGates(ctx, item.gates) as { code?: string }).code, "SCOPE", item.key);
    const inputs: Record<string, unknown> = {
      "library.desk_issue_copy": { member: "Ayesha Khan", copy: "LB-0042" }, "library.desk_return_copy": { copy: "LB-0042" }, "library.desk_renew_loan": { copy: "LB-0042" },
      "library.desk_reserve_title": { member: "Ayesha Khan", title: "Atlas" }, "library.desk_add_copies": { title: "Atlas", barcodes: ["LB-0500"] },
      "library.desk_save_rules": { loanDays: 21 }, "library.member_create": { people: [{ name: "Ayesha Khan" }] }, "library.book_update": { book: "Atlas", author: "X" },
      "purchasing.save_request": { title: "Books", lines: [{ description: "Atlas", quantity: 1, unitPrice: 100 }] },
      "library.category_create": { name: "Reference" }, "library.book_create": { books: [{ title: "New", copiesTotal: 1 }] }, "read.library.overdue": {},
    };
    for (const [key, input] of Object.entries(inputs)) {
      const item = await exec(key);
      const parsed = item.input.parse(input);
      if (item.resolve) assert.equal(await code(item.resolve(ctx, parsed)), "SCOPE_DENIED", `${key} resolve`);
      assert.equal(await code(item.execute(ctx, parsed, { idempotencyKey: KEY() })), "SCOPE_DENIED", `${key} execute`);
    }
    for (const key of ["library.desk_save_rules_money", "library.desk_mark_lost", "library.desk_decide_charge"]) {
      const item = await handoff(key);
      const input = key === "library.desk_save_rules_money" ? { finePerDay: 5 } : key === "library.desk_mark_lost" ? { copy: "LB-0042" } : { copy: "LB-0042", decision: "WAIVE", reason: "Shut that week" };
      assert.equal(await code(item.handoff.prepare(ctx, item.input.parse(input), { idempotencyKey: KEY() })), "SCOPE_DENIED", key);
    }
    // A member id bound on the home campus does not carry into another campus's job.
    const home = await ctxFor(user, campusId);
    const bound = await bind(home, "library.desk_issue_copy", { member: "Ayesha Khan", copy: "LB-0042" });
    assert.equal(bound.memberId, member.id);
    assert.equal(await code((await exec("library.desk_issue_copy")).execute(ctx, bound, { idempotencyKey: KEY() })), "SCOPE_DENIED");
  });
  const rows = await Promise.all([
    db.bookIssue.count({ where: { schoolId } }), db.bookReservation.count({ where: { schoolId } }), db.bookCopy.count({ where: { schoolId } }),
    db.libraryLoanPolicy.count({ where: { schoolId } }), db.libraryMember.count({ where: { schoolId } }), db.book.count({ where: { schoolId } }),
    db.bookCategory.count({ where: { schoolId } }), db.purchaseRequest.count({ where: { schoolId } }),
  ]);
  assert.deepEqual(rows, [0, 0, 1, 0, 1, 1, 0, 0], "only the fixture's own rows");
});

test("an operator with a librarian in post gets SEAT on every desk write", async () => {
  const { user, schoolId, campusId } = await fixture("ADMIN");
  const all = await entries();
  await within(user, async () => {
    const vacant = await ctxFor(user, campusId);
    for (const item of all) assert.deepEqual(await runGates(vacant, item.gates), { ok: true }, `${item.key} open while the seat is empty`);
  });
  const librarianId = randomUUID();
  await db.user.create({ data: { id: librarianId, schoolId, campusId, email: `${librarianId}@example.invalid`, fullName: "Synthetic librarian", role: "LIBRARIAN", isActive: true } });
  await within(user, async () => {
    const held = await ctxFor(user, campusId);
    for (const key of DESK_WRITES) {
      const result = await runGates(held, (await exec(key)).gates);
      assert.deepEqual(result.ok ? null : [result.code, result.whoCan], ["SEAT", ["LIBRARIAN"]], key);
    }
    // The money decisions stay open to the operator: they are theirs to make.
    for (const key of ["library.desk_save_rules_money", "library.desk_decide_charge"]) assert.deepEqual(await runGates(held, (await handoff(key)).gates), { ok: true }, key);
  });
  const librarian: AuthUser = { schoolId, campusId, userId: librarianId, role: "LIBRARIAN", email: `${librarianId}@example.invalid`, fullName: "Synthetic librarian", accessVersion: 0 };
  await within(librarian, async () => { for (const key of DESK_WRITES) assert.deepEqual(await runGates(await ctxFor(librarian, campusId), (await exec(key)).gates), { ok: true }, key); });
});


test("category rename preserves books, replays, rejects stale and foreign-campus updates", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  const original = await db.bookCategory.create({ data: { schoolId, campusId, name: "Fiction" } });
  const other = await db.bookCategory.create({ data: { schoolId, campusId: otherCampusId, name: "Foreign" } });
  const book = await db.book.create({ data: { schoolId, campusId, categoryId: original.id, title: "Story", copiesTotal: 1, copiesAvailable: 1 } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId), entry = await exec("library.category_update");
    const bound = await bind(ctx, entry.key, { category: "Fiction", name: "Stories" });
    assert.equal((await entry.preview!(ctx, bound)).counts.updated, 1);
    assert.equal((await entry.execute(ctx, bound, { idempotencyKey: KEY() })).counts.updated, 1);
    assert.equal((await entry.execute(ctx, bound, { idempotencyKey: KEY() })).detail?.reconciled, true);
    assert.equal((await db.book.findUniqueOrThrow({ where: { id: book.id } })).categoryId, original.id);
    assert.equal(await code(entry.execute(ctx, { ...bound, categoryId: other.id }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    const { renameCategory } = await import("../../src/lib/library/catalogue-command");
    await assert.rejects(() => renameCategory(user, { id: other.id, name: "Stolen" }), { status: 404 });
    await db.bookCategory.create({ data: { schoolId, campusId, name: "Reference" } });
    await assert.rejects(() => renameCategory(user, { id: original.id, name: "reference" }), { status: 409 });
    await db.bookCategory.update({ where: { id: original.id }, data: { name: "Literature" } });
    assert.equal(await code(entry.preview!(ctx, bound)), "STALE_VERSION");
    await assert.rejects(() => entry.execute(ctx, bound, { idempotencyKey: KEY() }));
    assert.equal((await db.bookCategory.findUniqueOrThrow({ where: { id: original.id } })).name, "Literature");
  });
});
