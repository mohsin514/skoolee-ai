import { immutablePaymentPdf } from "../../src/lib/fees/receipt";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { USER_ROLES } from "../../src/lib/roles";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { prisma } from "../../src/lib/db/prisma";
import { recordPayment } from "../../src/lib/fees/payment";
import { reviewQueue, approveVersions, reviewExam, publishExam } from "../../src/lib/academic/report-versions";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55413" || url.pathname !== "/sko213")
    throw new Error("Use only isolated sko213 on 127.0.0.1:55413");
const raw = new PrismaClient();
const base = "http://127.0.0.1:3213";
const schoolId = randomUUID(), campusId = randomUUID(), classId = randomUUID(), studentId = randomUUID(), subjectId = randomUUID(), examId = randomUUID(), reportId = randomUUID();
const users: Record<string, string> = {}, cookies: Record<string, string> = {}, payments: Record<string, string> = {};
let markId = "", publishedId = "";
const scoped = <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: users.PRINCIPAL, role: "PRINCIPAL" }, fn);
async function api(role: string, kind = "MARK", body?: unknown) { const response = await fetch(`${base}/api/corrections?kind=${kind}`, { headers: { cookie: cookies[role], "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() }; }
async function request(role: string, kind: string, id: string, changes: any, overrides: any = {}) { const catalog = await api(role, kind); assert.equal(catalog.status, 200, JSON.stringify(catalog.data)); const record = catalog.data.records.find((r: any) => r.id === id); assert(record); const proposal = { kind, sourceId: id, expectedVersion: record.version, ...changes }; const preview = await api(role, kind, { action: "preview", proposal }); assert.equal(preview.status, 200, JSON.stringify(preview.data)); const input = { action: "request", proposal, reviewHash: preview.data.hash, reason: "PRIVATE RECONCILIATION REASON", publicExplanation: "Corrected after review", privateNote: "PRIVATE INTERNAL NOTE", ...overrides }; return { ...(await api(role, kind, input)), proposal, preview: preview.data }; }
before(async () => {
    await raw.school.create({ data: { id: schoolId, name: "Synthetic corrections school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
    await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", city: "Synthetic", regId: campusId } });
    for (const role of USER_ROLES) {
        const id = randomUUID();
        users[role] = id;
        await raw.user.create({ data: { id, schoolId, campusId, role, fullName: `Synthetic ${role}`, email: `${id}@example.invalid`, onboardingComplete: true, mfaEnabled: true } });
        const token = await new SignJWT({ userId: id, schoolId, campusId, role, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, onboardingComplete: true, mfaVerified: true }).setJti(randomUUID()).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? "synthetic-sko213-local-only"));
        cookies[role] = `skoolee_token=${token}`;
        await raw.loginSession.create({ data: { schoolId, userId: id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 7200000) } });
    }
    await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Correction class", academicYear: 2026, classTeacherId: users.TEACHER } });
    await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic pupil", rollNo: "C213", gender: "MALE", parentUserId: users.PARENT, studentUserId: users.STUDENT } });
    await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", totalMarks: 100, teacherId: users.TEACHER } });
    await raw.exam.create({ data: { id: examId, schoolId, campusId, classId, title: "Correction exam", term: "Term 1", academicYear: 2026, status: "LOCKED", isLocked: true } });
    markId = (await raw.mark.create({ data: { schoolId, campusId, examId, studentId, subjectId, marksObtained: 80 } })).id;
    await raw.reportCard.create({ data: { id: reportId, schoolId, campusId, examId, studentId, remarksEn: "Original approved report" } });
    await scoped(async () => { const [v] = await reviewQueue([reportId]); await approveVersions([{ reportCardId: reportId, versionId: v.id }], users.PRINCIPAL); await reviewExam(examId, users.PRINCIPAL); await publishExam(examId, users.PRINCIPAL); publishedId = v.id; });
    for (const currency of ["PKR", "SAR", "AED", "KWD", "USD"]) {
        const invoice = await raw.invoice.create({ data: { schoolId, campusId, studentId, currency, invoiceDate: new Date(), dueDate: new Date(), monthlyFee: 80001, subtotal: 80001, totalAmount: 80001, balanceDue: 80001 } });
        // Each currency needs a separate year because the existing carry-forward key
        // permits one currency per child/year. This is an explicit domain constraint.
        const year = 2020 + Object.keys(payments).length;
        const result = await scoped(() => prisma.$transaction(tx => recordPayment(tx, { campusId, studentId, invoiceId: invoice.id, amount: 100001, paymentDate: new Date(`${year}-06-01`), paymentMethod: "CASH", recordedBy: users.ACCOUNTANT })));
        payments[currency] = result.payment.id;
    }
});
after(async () => { writeFileSync("/private/tmp/sko213-fixture.json", JSON.stringify({ schoolId, campusId, studentId, reportId, examId, markId, users, cookies, payments })); await raw.$disconnect(); await prisma.$disconnect(); });
test("role matrix enforces direct API domain access", async () => { for (const role of USER_ROLES) {
    for (const kind of ["MARK", "PAYMENT"]) {
        const allowed = kind === "MARK" ? ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT"] : ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT", "PARENT", "STUDENT"];
        const r = await api(role, kind);
        assert.equal(r.status, allowed.includes(role) ? 200 : 403, `${role}/${kind}: ${JSON.stringify(r.data)}`);
    }
} });
test("two mark requests preserve immutable originals, stale second rejects, new report needs exact approval", async () => {
    const first = await request("TEACHER", "MARK", markId, { marksObtained: 85, isAbsent: false });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const second = await request("TEACHER", "MARK", markId, { marksObtained: 90, isAbsent: false });
    assert.equal(second.status, 201);
    const denied = await api("TEACHER", "MARK", { action: "approve", id: first.data.id, reviewHash: first.data.previewHash });
    assert.equal(denied.status, 403);
    const [one, two] = await Promise.all([api("PRINCIPAL", "MARK", { action: "approve", id: first.data.id, reviewHash: first.data.previewHash }), api("ADMIN", "MARK", { action: "approve", id: second.data.id, reviewHash: second.data.previewHash })]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    const applied = one.status === 200 ? one.data : two.data;
    let updated = await raw.reportCard.findUniqueOrThrow({ where: { id: reportId } });
    assert.equal(updated.publishedVersionId, publishedId);
    assert.notEqual(updated.currentVersionId, publishedId);
    assert.equal(updated.remarksApproved, false);
    const family = await api("PARENT");
    assert.equal(family.data.history.length, 0);
    await raw.reportCard.update({ where: { id: reportId }, data: { remarksEn: "Further reviewed remark after correction" } });
    await scoped(() => reviewQueue([reportId]));
    updated = await raw.reportCard.findUniqueOrThrow({ where: { id: reportId } });
    const bytesBefore = (await raw.reportVersion.findUniqueOrThrow({ where: { id: publishedId } })).documentBytes;
    await scoped(async () => { await assert.rejects(publishExam(examId, users.PRINCIPAL)); await assert.rejects(approveVersions([{ reportCardId: reportId, versionId: updated.currentVersionId! }], users.TEACHER, undefined, "Correction"), /different reviewer/); await approveVersions([{ reportCardId: reportId, versionId: updated.currentVersionId! }], users.PRINCIPAL, undefined, "Corrected after further review"); await reviewExam(examId, users.PRINCIPAL); await publishExam(examId, users.PRINCIPAL); });
    const publicHistory = await api("PARENT");
    assert.equal(publicHistory.data.history.length, 1);
    assert(!JSON.stringify(publicHistory.data).includes("PRIVATE"));
    assert.equal(publicHistory.data.history[0].id, applied.id);
    assert.deepEqual((await raw.reportVersion.findUniqueOrThrow({ where: { id: publishedId } })).documentBytes, bytesBefore);
    await assert.rejects(raw.correction.update({ where: { id: applied.id }, data: { reason: "rewrite" } }), /immutable/);
});
test("missing reason, review hash, direct self-approval and stale preview are rejected", async () => {
    const r = await request("PRINCIPAL", "MARK", markId, { marksObtained: 88, isAbsent: false }, { reason: " " });
    assert.equal(r.status, 400);
    const valid = await request("PRINCIPAL", "MARK", markId, { marksObtained: 88, isAbsent: false });
    assert.equal(valid.status, 201);
    assert.equal((await api("PRINCIPAL", "MARK", { action: "approve", id: valid.data.id, reviewHash: valid.data.previewHash })).status, 403);
    assert.equal((await api("ADMIN", "MARK", { action: "approve", id: valid.data.id, reviewHash: "unreviewed" })).status, 409);
    assert.equal((await api("ADMIN", "MARK", { action: "reject", id: valid.data.id, reviewHash: valid.data.previewHash })).status, 200);
    assert(!(await api("PARENT")).data.history.some((c: any) => c.id === valid.data.id));
});
test("five original currencies reverse partially allocated receipt and reconcile invoice, credit and ledger", async () => {
    for (const [currency, id] of Object.entries(payments)) {
        const originalBytes = await scoped(() => immutablePaymentPdf(id));
        const before = await raw.payment.findUniqueOrThrow({ where: { id } });
        const original = await raw.invoice.findUniqueOrThrow({ where: { id: before.invoiceId } });
        const r = await request("ACCOUNTANT", "PAYMENT", id, { allocations: [{ invoiceId: original.id, minor: 30001 }], unappliedMinor: 10000 });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        assert.equal((await api("ACCOUNTANT", "PAYMENT", { action: "approve", id: r.data.id, reviewHash: r.data.previewHash })).status, 403);
        const applied = await api("PRINCIPAL", "PAYMENT", { action: "approve", id: r.data.id, reviewHash: r.data.previewHash });
        assert.equal(applied.status, 200, JSON.stringify(applied.data));
        const reversal = await raw.payment.findUniqueOrThrow({ where: { id: applied.data.successorId } });
        assert.equal(reversal.amount, -40001);
        assert.equal(reversal.currency, currency);
        assert.equal(reversal.reversalOfId, id);
        assert.deepEqual(await raw.payment.findUniqueOrThrow({ where: { id } }), before);
        assert.deepEqual(await scoped(() => immutablePaymentPdf(id)), originalBytes);
        const invoice = await raw.invoice.findUniqueOrThrow({ where: { id: original.id } });
        assert.equal(invoice.totalAmountPaid, 50000);
        assert.equal(invoice.balanceDue, 30001);
        assert.equal(invoice.totalAmountPaid + invoice.balanceDue, invoice.totalAmount);
        const carry = await raw.feeCarryForward.findUniqueOrThrow({ where: { studentId_toAcademicYear: { studentId, toAcademicYear: before.paymentDate.getFullYear() + 1 } } });
        assert.equal(carry.balance, -10000);
        assert.equal(carry.currency, currency);
        const ledger = await raw.ledgerEntry.findUniqueOrThrow({ where: { paymentId: reversal.id } });
        assert.equal(ledger.amount, -40001);
        assert.equal(ledger.currency, currency);
        await assert.rejects(raw.payment.update({ where: { id }, data: { amount: 1 } }), /compensating/);
    }
    const history = await api("PARENT", "PAYMENT");
    assert.equal(history.data.history.length, 5);
    assert(!JSON.stringify(history.data).includes("PRIVATE"));
});
test("tenant, campus and unrelated family IDs are denied", async () => {
    const foreignSchool = await raw.school.create({ data: { name: "Other synthetic", slug: randomUUID(), regId: randomUUID(), contactEmail: `${randomUUID()}@example.invalid`, city: "Synthetic" } });
    const foreignCampus = await raw.campus.create({ data: { schoolId: foreignSchool.id, name: "Other", city: "Other", regId: randomUUID() } });
    const outside = await raw.campus.create({ data: { schoolId, name: "Other campus", city: "Other", regId: randomUUID() } });
    const version = (await api("ACCOUNTANT", "PAYMENT")).data.records[0].version;
    const payload = { action: "preview", proposal: { kind: "PAYMENT", sourceId: Object.values(payments)[0], expectedVersion: version, allocations: [], unappliedMinor: 1 } };
    await raw.user.update({ where: { id: users.ACCOUNTANT }, data: { campusId: outside.id } });
    assert.equal((await api("ACCOUNTANT", "PAYMENT", payload)).status, 403);
    await raw.user.update({ where: { id: users.ACCOUNTANT }, data: { schoolId: foreignSchool.id, campusId: foreignCampus.id } });
    assert([401, 403].includes((await api("ACCOUNTANT", "PAYMENT", payload)).status));
    await raw.user.update({ where: { id: users.ACCOUNTANT }, data: { schoolId, campusId } });
    await raw.student.update({ where: { id: studentId }, data: { parentUserId: null } });
    assert.equal((await api("PARENT", "PAYMENT")).data.history.length, 0);
    await raw.student.update({ where: { id: studentId }, data: { parentUserId: users.PARENT } });
});
test("one partially allocated payment reverses across both affected invoices atomically", async () => {
    const invoices = [];
    for (const total of [70000, 50000])
        invoices.push(await raw.invoice.create({ data: { schoolId, campusId, studentId, currency: "KWD", invoiceDate: new Date(), dueDate: new Date(), monthlyFee: total, subtotal: total, totalAmount: total, totalAmountPaid: 30000, balanceDue: total - 30000, status: "PARTIAL" } }));
    const p = await raw.payment.create({ data: { schoolId, campusId, studentId, invoiceId: invoices[0].id, currency: "KWD", amount: 80000, paymentDate: new Date("2035-01-01"), paymentMethod: "CASH", receiptNo: `SYN-${randomUUID()}`, recordedBy: users.ACCOUNTANT } });
    for (const [index, i] of invoices.entries())
        await raw.paymentAllocation.create({ data: { schoolId, campusId, paymentId: p.id, invoiceId: i.id, amount: 30000, credit: index === 0 ? 20000 : 0, currency: "KWD" } });
    const account = await raw.chartOfAccount.findFirstOrThrow({ where: { schoolId, campusId, name: "Fee Income" } });
    await raw.ledgerEntry.create({ data: { schoolId, campusId, kind: "INCOME", sourceName: "Synthetic allocated payment", accountId: account.id, paymentMethod: "CASH", date: new Date(), amount: 80000, currency: "KWD", paymentId: p.id, createdById: users.ACCOUNTANT } });
    await raw.feeCarryForward.create({ data: { schoolId, campusId, studentId, fromAcademicYear: 2035, toAcademicYear: 2036, balance: -20000, currency: "KWD" } });
    const r = await request("ACCOUNTANT", "PAYMENT", p.id, { allocations: invoices.map(i => ({ invoiceId: i.id, minor: 10000 })), unappliedMinor: 5000 });
    assert.equal(r.status, 201);
    const applied = await api("PRINCIPAL", "PAYMENT", { action: "approve", id: r.data.id, reviewHash: r.data.previewHash });
    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    for (const i of invoices) {
        const next = await raw.invoice.findUniqueOrThrow({ where: { id: i.id } });
        assert.equal(next.totalAmountPaid, 20000);
        assert.equal(next.balanceDue, i.totalAmount - 20000);
    }
    const receiptResponse = await fetch(`${base}/api/corrections?kind=PAYMENT&receipt=${r.data.id}`, { headers: { cookie: cookies.PRINCIPAL } });
    assert.equal(receiptResponse.status, 200);
    assert(!(await receiptResponse.text()).includes("PRIVATE"));
    const entries = await raw.paymentAllocation.findMany({ where: { paymentId: applied.data.successorId } });
    assert.equal(entries.length, 2);
    assert.equal(entries.reduce((n, a) => n + a.amount + a.credit, 0), -25000);
});
