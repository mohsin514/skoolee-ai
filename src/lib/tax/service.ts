import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertFeesRead, canManageFinance, soleChecker } from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";
import { getLocalePackage } from "@/lib/locale/store";
import { calculate, findVersion, limitationFor, PACKAGES, type Line } from "./packages";

// SKO-444: a school activates a versioned country package for named campuses after recording its tax identity,
// exemptions, a validation owner, dated review evidence and a passing run of its own accountant-approved fixtures;
// the institution authority signs it off (role-ux §2.5: the tax identity spans campuses, so the group admin or, in a
// single school, the school admin approves; the preparer never approves their own draft unless no other authority
// user exists — SD3, with a typed reason recorded in the audit row). Invoices issued on or after the effective date get an immutable tax
// document (rules, identity, currency, lines, totals and a sequential number). Electronic submission goes through
// the package's adapter only where one exists; retries and corrections keep the same document number and external
// id. A campus whose country has no package gets an explicit limitation, never a "compliant" badge.

/** Drafting, fixtures, submission and corrections: the finance desk (accountant, or the campus admin while no accountant is on the campus). */
const isFinance = (user: AuthUser) => canManageFinance(user);
async function finance(user: AuthUser) {
  await assertFeesRead(user);
  if (!isFinance(user)) throw new ApiError("Only the finance desk prepares tax packages.", 403);
}
/** SD3 reason floor (role-ux §2.5). */
export const SELF_APPROVAL_REASON_MIN = 10;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(x => String(x).trim()).filter(Boolean))].slice(0, 100) : [];
const configHash = (a: { packageCode: string; packageVersion: number; campusIds: string[]; legalName: string; taxId: string | null; exemptFeeCodes: string[]; currency: string }) =>
  createHash("sha256").update(JSON.stringify([a.packageCode, a.packageVersion, [...a.campusIds].sort(), a.legalName, a.taxId, [...a.exemptFeeCodes].sort(), a.currency])).digest("hex");

// ─── Catalog and campus readiness ────────────────────────────────────────

export async function overview(user: AuthUser) {
  await assertFeesRead(user);
  await activateDue(user.schoolId);
  const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const withCountry = await Promise.all(campuses.map(async c => { const country = (await getLocalePackage(user.schoolId, c.id)).country ?? "OTHER"; return { ...c, country, limitation: limitationFor(country) }; }));
  const activations = await prisma.taxActivation.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, include: { fixtureRuns: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const feeTypes = await prisma.feeType.findMany({ where: { schoolId: user.schoolId }, select: { code: true, name: true }, orderBy: { name: "asc" } }).catch(() => []);
  const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { in: ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "ACCOUNTANT"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  const canApprove = isInstitutionAuthority(user);
  // SD3 only matters to an authority looking at a draft they prepared themselves.
  const soleApprover = canApprove && activations.some(a => a.status === "DRAFT" && a.preparedById === user.userId) ? await soleChecker("tax", user, null) : false;
  // "Submit for sign-off" (role-ux §4.4b) is recorded in the audit trail: the latest request per draft, valid only
  // while the draft's configuration is the one that was submitted (an edit after submitting needs a new request).
  const drafts = activations.filter(a => a.status === "DRAFT");
  const requests = drafts.length ? await prisma.auditLog.findMany({ where: { schoolId: user.schoolId, tableName: "tax_activations", recordId: { in: drafts.map(a => a.id) } }, orderBy: { createdAt: "desc" }, select: { recordId: true, newValue: true, createdAt: true, userId: true } }) : [];
  const signOffRequest = (a: Activation) => {
    const row = requests.find(r => r.recordId === a.id && (r.newValue as { action?: string } | null)?.action === SIGN_OFF_REQUESTED);
    return row && (row.newValue as { configHash?: string }).configHash === a.configHash ? { at: row.createdAt, byId: row.userId } : null;
  };
  return { packages: PACKAGES, campuses: withCountry, activations: activations.map(a => ({ ...a, lastRun: a.fixtureRuns[0] ?? null, fixtureRuns: undefined, blockers: blockers(a, a.fixtureRuns[0] ?? null), selfApproved: a.approvedById !== null && a.approvedById === a.preparedById, signOffRequestedAt: a.status === "DRAFT" ? signOffRequest(a)?.at ?? null : null })), feeTypes, staff, canManage: isFinance(user), canApprove, soleApprover, userId: user.userId };
}

const SIGN_OFF_REQUESTED = "SIGN_OFF_REQUESTED";

/**
 * The finance desk submits a ready draft (every validation requirement met, fixtures passing) to the institution
 * authority for sign-off (role-ux §4.4b row action). Recorded once per configuration in the audit trail; the
 * authority is told through the `TAX_SIGNOFF_REQUESTED` notice (an ACTION item linking to Approvals › Tax; the draft
 * is also listed in the authority's Approvals queue).
 */
export async function requestSignOff(user: AuthUser, id: string) {
  await finance(user);
  const a = await prisma.taxActivation.findFirst({ where: { id, schoolId: user.schoolId, status: "DRAFT" } });
  if (!a) throw new ApiError("Draft not found", 404);
  const run = await prisma.taxFixtureRun.findFirst({ where: { activationId: a.id }, orderBy: { createdAt: "desc" } });
  const missing = blockers(a, run);
  if (missing.length) throw new ApiError(`Resolve these before submitting for sign-off: ${missing.join(" ")}`, 409);
  const earlier = await prisma.auditLog.findMany({ where: { schoolId: user.schoolId, tableName: "tax_activations", recordId: a.id }, orderBy: { createdAt: "desc" }, take: 20, select: { newValue: true, createdAt: true } });
  const same = earlier.find(r => (r.newValue as { action?: string; configHash?: string } | null)?.action === SIGN_OFF_REQUESTED && (r.newValue as { configHash?: string }).configHash === a.configHash);
  if (same) return { id: a.id, requestedAt: same.createdAt, repeated: true };
  const row = await prisma.auditLog.create({ data: { schoolId: user.schoolId, tableName: "tax_activations", recordId: a.id, userId: user.userId, oldValue: { status: "DRAFT" }, newValue: { action: SIGN_OFF_REQUESTED, configHash: a.configHash, packageCode: a.packageCode, packageVersion: a.packageVersion } } });
  // Fire-and-forget after the write; loaded lazily so the tax service never opens the delivery queue on import.
  void import("@/lib/notifications/in-app").then(({ notify }) => notify("TAX_SIGNOFF_REQUESTED", { schoolId: user.schoolId, campusId: null, actorId: user.userId, actorName: user.fullName ?? null, activationId: a.id, packageCode: a.packageCode, packageVersion: a.packageVersion })).catch(() => undefined);
  return { id: a.id, requestedAt: row.createdAt, repeated: false };
}

type Activation = Prisma.TaxActivationGetPayload<object>;
type Run = Prisma.TaxFixtureRunGetPayload<object> | null;
/** Everything still missing before approval — shown as a list, and enforced on approval. */
function blockers(a: Activation, run: Run) {
  const out: string[] = [];
  const found = findVersion(a.packageCode, a.packageVersion);
  if (!found) return ["This package version no longer exists."];
  for (const f of found.v.requiredFields) {
    const value = f.key === "legalName" ? a.legalName : a.taxId ?? "";
    if (!value.trim()) out.push(f.key === "legalName" ? "Enter the registered legal name." : "Enter the tax number this package requires.");
    else if (f.pattern && !new RegExp(f.pattern).test(value)) out.push("The tax number does not have the format this package requires.");
  }
  if (!found.v.currencies.includes(a.currency)) out.push(`This package covers ${found.v.currencies.join(", ")}, not ${a.currency}.`);
  if (!a.campusIds.length) out.push("Choose the campuses this applies to.");
  if (!a.ownerId) out.push("Name the validation owner.");
  if (!a.evidenceReviewer || !a.evidenceReference || !a.evidenceReviewedAt) out.push("Record who reviewed the configuration, when, and the evidence reference.");
  if (!a.effectiveFrom) out.push("Choose the effective date.");
  if (!run) out.push("Run the accountant-approved fixtures.");
  else if (run.configHash !== a.configHash) out.push("The configuration changed after the last fixture run; run the fixtures again.");
  else if (!run.passed) out.push("A fixture did not match the approved result.");
  return out;
}

// ─── Activations ─────────────────────────────────────────────────────────

export async function saveDraft(user: AuthUser, body: Record<string, unknown>) {
  await finance(user);
  const packageCode = text(body.packageCode, 40), packageVersion = Number(body.packageVersion);
  const found = findVersion(packageCode, packageVersion);
  if (!found) throw new ApiError("Choose a package and version from the catalog.", 400);
  const campusIds = list(body.campusIds);
  const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId, id: { in: campusIds } }, select: { id: true, name: true } });
  if (campuses.length !== campusIds.length) throw new ApiError("Choose campuses in this school.", 400);
  for (const c of campuses) {
    const country = (await getLocalePackage(user.schoolId, c.id)).country ?? "OTHER";
    // The package is chosen explicitly; it must still be the campus's own jurisdiction.
    if (country !== found.v.country) throw new ApiError(`${c.name} is set up for ${country}; ${found.pkg.name} covers ${found.v.country}. Choose the package for that campus's jurisdiction.`, 400);
  }
  const data = {
    packageCode, packageVersion, campusIds, legalName: text(body.legalName, 200), taxId: text(body.taxId, 40) || null, exemptFeeCodes: list(body.exemptFeeCodes), currency: text(body.currency, 3).toUpperCase() || found.v.currencies[0],
    effectiveFrom: body.effectiveFrom ? new Date(String(body.effectiveFrom)) : null, ownerId: text(body.ownerId, 64) || null,
    evidenceReviewer: text(body.evidenceReviewer, 160) || null, evidenceReference: text(body.evidenceReference, 300) || null, evidenceReviewedAt: body.evidenceReviewedAt ? new Date(String(body.evidenceReviewedAt)) : null,
  };
  if (data.effectiveFrom && Number.isNaN(data.effectiveFrom.getTime())) throw new ApiError("Choose a valid effective date.", 400);
  if (data.ownerId && !(await prisma.user.findFirst({ where: { id: data.ownerId, schoolId: user.schoolId, isActive: true } }))) throw new ApiError("Choose an active staff member as the validation owner.", 400);
  const hash = configHash(data);
  if (body.id) {
    const done = await prisma.taxActivation.updateMany({ where: { id: String(body.id), schoolId: user.schoolId, status: "DRAFT" }, data: { ...data, configHash: hash } });
    if (!done.count) throw new ApiError("Only a draft can be edited. Approved packages are kept as issued; create a new draft for a change.", 409);
    return { id: String(body.id) };
  }
  return prisma.taxActivation.create({ data: { schoolId: user.schoolId, ...data, configHash: hash, preparedById: user.userId }, select: { id: true } });
}

type Fixture = { name: string; lines: Line[]; discount: number; expected: { tax: number; total: number } };
/** Runs the school's accountant-approved fixtures against this exact configuration. */
export async function runFixtures(user: AuthUser, body: Record<string, unknown>) {
  await finance(user);
  const a = await prisma.taxActivation.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, status: "DRAFT" } });
  if (!a) throw new ApiError("Draft not found", 404);
  const found = findVersion(a.packageCode, a.packageVersion)!;
  const fixtures = (Array.isArray(body.fixtures) ? body.fixtures : []) as Fixture[];
  if (!fixtures.length) throw new ApiError("Add at least one fixture with its approved result.", 400);
  const valid = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
  const results = fixtures.map(f => {
    if (!f?.name || !Array.isArray(f.lines) || !f.lines.length || !f.lines.every(l => l?.code && valid(l.amount)) || !valid(f.discount ?? 0) || !valid(f.expected?.tax) || !valid(f.expected?.total)) return { name: String(f?.name ?? ""), error: "Each fixture needs a name, lines with amounts in minor units, and the approved tax and total.", passed: false };
    try {
      const got = calculate(found.v, f.lines.map(l => ({ code: String(l.code), name: String(l.name ?? l.code), amount: l.amount })), f.discount ?? 0, a.exemptFeeCodes);
      return { name: f.name, expected: f.expected, got: { tax: got.tax, total: got.total }, lines: got.lines, passed: got.tax === f.expected.tax && got.total === f.expected.total };
    } catch (e) { return { name: f.name, error: e instanceof Error ? e.message : "Calculation failed.", passed: false }; }
  });
  const run = await prisma.taxFixtureRun.create({ data: { schoolId: user.schoolId, activationId: a.id, configHash: a.configHash, fixtures: fixtures as unknown as Prisma.InputJsonValue, results: results as unknown as Prisma.InputJsonValue, passed: results.every(r => r.passed), runById: user.userId } });
  return { id: run.id, passed: run.passed, results };
}

/** The institution authority signs off only with every blocker cleared; never their own draft unless they are the only authority (SD3). */
export async function approve(user: AuthUser, id: string, reason?: string | null) {
  await assertFeesRead(user);
  if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator signs off a tax package.", 403);
  const a = await prisma.taxActivation.findFirst({ where: { id, schoolId: user.schoolId, status: "DRAFT" } });
  if (!a) throw new ApiError("Draft not found", 404);
  let self: { selfApproved: true; reason: string } | null = null;
  if (a.preparedById === user.userId) {
    // SD3: no other active authority user; an accountant never blocks it.
    if (!(await soleChecker("tax", user, null))) throw new ApiError("You prepared this package, so another administrator must sign it off.", 403);
    const why = (reason ?? "").trim().slice(0, 2000);
    if (why.length < SELF_APPROVAL_REASON_MIN) throw new ApiError(`You are the only administrator who can sign this off. Give a reason of at least ${SELF_APPROVAL_REASON_MIN} characters.`, 400);
    self = { selfApproved: true, reason: why };
  }
  const run = await prisma.taxFixtureRun.findFirst({ where: { activationId: a.id }, orderBy: { createdAt: "desc" } });
  const missing = blockers(a, run);
  if (missing.length) throw new ApiError(`This package has unresolved validation requirements: ${missing.join(" ")}`, 409);
  const done = await prisma.taxActivation.updateMany({ where: { id: a.id, status: "DRAFT", configHash: a.configHash }, data: { status: "SCHEDULED", approvedById: user.userId, approvedAt: new Date() } });
  if (!done.count) throw new ApiError("The draft changed while you were reviewing it. Review it again.", 409);
  await prisma.auditLog.create({ data: { schoolId: user.schoolId, tableName: "tax_activations", recordId: a.id, userId: user.userId, oldValue: { status: "DRAFT" }, newValue: { status: "SCHEDULED", preparedById: a.preparedById, configHash: a.configHash, ...(self ?? {}) } } });
  // The approver is the institution authority, so an SD3 sign-off needs no authority notice (role-ux §2.5).
  await activateDue(user.schoolId);
  return { id: a.id, effectiveFrom: a.effectiveFrom };
}

/** Scheduled activations whose date has come become active; an older one for the same campuses is superseded. */
export async function activateDue(schoolId: string, now = new Date()) {
  const due = await prisma.taxActivation.findMany({ where: { schoolId, status: "SCHEDULED", effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: "asc" } });
  for (const a of due) {
    await prisma.$transaction(async tx => {
      const claimed = await tx.taxActivation.updateMany({ where: { id: a.id, status: "SCHEDULED" }, data: { status: "ACTIVE" } });
      if (!claimed.count) return;
      await tx.taxActivation.updateMany({ where: { schoolId, status: "ACTIVE", id: { not: a.id }, campusIds: { hasSome: a.campusIds }, effectiveFrom: { lt: a.effectiveFrom! } }, data: { status: "SUPERSEDED" } });
    });
  }
  return due.length;
}

/** The activation that applies to an invoice: approved, covering the campus, latest effective date on or before it. */
export async function activationFor(db: TxClient | typeof prisma, schoolId: string, campusId: string, invoiceDate: Date) {
  return db.taxActivation.findFirst({ where: { schoolId, campusIds: { has: campusId }, status: { in: ["SCHEDULED", "ACTIVE", "SUPERSEDED"] }, effectiveFrom: { lte: invoiceDate } }, orderBy: { effectiveFrom: "desc" } });
}

// ─── Issuing ─────────────────────────────────────────────────────────────

/** Tax for an invoice about to be created, or null when no package applies (legacy behaviour stays). */
export async function taxFor(db: TxClient, schoolId: string, campusId: string, invoiceDate: Date, currency: string, lines: Line[], discount: number) {
  const a = await activationFor(db, schoolId, campusId, invoiceDate);
  if (!a) return null;
  if (a.currency !== currency) throw new ApiError(`The ${a.packageCode} package is approved for ${a.currency}; this invoice is in ${currency}.`, 409);
  const found = findVersion(a.packageCode, a.packageVersion)!;
  return { activation: a, version: found.v, pkg: found.pkg, calc: calculate(found.v, lines, discount, a.exemptFeeCodes) };
}

/** Writes the immutable tax document beside a new invoice, with the next number for that activation. */
export async function issueDocument(db: TxClient, schoolId: string, invoice: { id: string; campusId: string; invoiceNumber: string | null; invoiceDate: Date; studentName: string }, t: NonNullable<Awaited<ReturnType<typeof taxFor>>>) {
  // One unbroken sequence per package prefix for the school, across activations and versions.
  const prefix = t.version.numbering.prefix;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`taxnum:${schoolId}:${prefix}`}))`;
  const last = await db.taxDocument.findFirst({ where: { schoolId, documentNumber: { startsWith: prefix } }, orderBy: { documentNumber: "desc" }, select: { documentNumber: true } });
  const next = (last ? Number(last.documentNumber.slice(prefix.length)) : 0) + 1;
  await db.taxActivation.update({ where: { id: t.activation.id }, data: { numberSeq: { increment: 1 } } });
  const documentNumber = `${prefix}${String(next).padStart(t.version.numbering.pad, "0")}`;
  const campus = await db.campus.findFirst({ where: { id: invoice.campusId }, select: { name: true } });
  const snapshot = {
    package: { code: t.pkg.code, name: t.pkg.name, version: t.version.version, country: t.version.country, rounding: t.version.rounding, standardRatePercent: t.version.standardRatePercent, verifiedScope: t.version.verifiedScope, limitations: t.version.limitations, ruleReviewDate: t.version.ruleReviewDate, invoiceLanguage: t.version.invoiceLanguage },
    seller: { legalName: t.activation.legalName, taxId: t.activation.taxId, campus: campus?.name ?? "" },
    buyer: { name: invoice.studentName },
    invoice: { id: invoice.id, number: invoice.invoiceNumber, date: invoice.invoiceDate },
    currency: t.activation.currency, lines: t.calc.lines, subtotal: t.calc.subtotal, discount: t.calc.discount, tax: t.calc.tax, total: t.calc.total,
    approval: { activationId: t.activation.id, approvedById: t.activation.approvedById, approvedAt: t.activation.approvedAt, evidenceReference: t.activation.evidenceReference },
  };
  return db.taxDocument.create({ data: { schoolId, invoiceId: invoice.id, activationId: t.activation.id, campusId: invoice.campusId, packageCode: t.pkg.code, packageVersion: t.version.version, documentNumber, snapshot: snapshot as unknown as Prisma.InputJsonValue, currency: t.activation.currency, taxAmount: t.calc.tax, totalAmount: t.calc.total, issuedAt: new Date(), submissionStatus: t.version.electronic.adapter ? "NONE" : "NOT_SUPPORTED" } });
}

// ─── Documents and electronic submission ─────────────────────────────────

export async function documents(user: AuthUser) {
  await assertFeesRead(user);
  return prisma.taxDocument.findMany({ where: { schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, take: 100, include: { attempts: { orderBy: { attempt: "asc" } } } });
}

export async function document(user: AuthUser, id: string) {
  await assertFeesRead(user);
  const d = await prisma.taxDocument.findFirst({ where: { id, schoolId: user.schoolId }, include: { attempts: { orderBy: { attempt: "asc" } } } });
  if (!d) throw new ApiError("Document not found", 404);
  return d;
}

/** Sandbox stand-in for a tax authority: deterministic outcomes from synthetic markers, with a server-side record. */
async function sandboxSend(doc: { externalId: string; snapshot: Prisma.JsonValue; revision: number }) {
  const s = doc.snapshot as { buyer?: { name?: string }; correction?: { buyerName?: string } };
  const buyer = s.correction?.buyerName ?? s.buyer?.name ?? "";
  if (/SYNTHETIC-TIMEOUT/.test(buyer) && doc.revision === 1) return { outcome: "TIMEOUT" as const, received: true, detail: "No response before the timeout." };
  if (/SYNTHETIC-REJECT/.test(buyer)) return { outcome: "REJECTED" as const, received: true, detail: "Buyer name contains characters the sandbox schema rejects (synthetic)." };
  return { outcome: "ACCEPTED" as const, received: true, detail: "Accepted by the sandbox." };
}

/** Queues and sends one document. The external id is assigned once and reused for every retry and correction. */
export async function submit(user: AuthUser, id: string) {
  await finance(user);
  const d = await prisma.taxDocument.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!d) throw new ApiError("Document not found", 404);
  if (d.submissionStatus === "NOT_SUPPORTED") throw new ApiError("This package has no electronic submission. Report this document through your accountant's process.", 409);
  if (d.submissionStatus === "ACCEPTED") return { id, status: "ACCEPTED", repeated: true };
  if (d.submissionStatus === "REJECTED") throw new ApiError("This document was rejected. Prepare a reviewed correction before resubmitting.", 409);
  const externalId = d.externalId ?? randomUUID();
  const claimed = await prisma.taxDocument.updateMany({ where: { id, submissionStatus: { in: ["NONE", "QUEUED", "CORRECTED"] } }, data: { submissionStatus: "QUEUED", externalId } });
  if (!claimed.count) throw new ApiError("This document is already being submitted.", 409);
  const attempt = (await prisma.taxSubmissionAttempt.count({ where: { documentId: id } })) + 1;
  const r = await sandboxSend({ externalId, snapshot: d.snapshot, revision: d.revision });
  await prisma.taxSubmissionAttempt.create({ data: { schoolId: user.schoolId, documentId: id, attempt, revision: d.revision, outcome: r.outcome, detail: r.detail, actorId: user.userId } });
  if (r.outcome === "TIMEOUT") return { id, status: "QUEUED", externalId, uncertain: true };
  await prisma.taxDocument.update({ where: { id }, data: { submissionStatus: r.outcome, lastError: r.outcome === "REJECTED" ? r.detail : null } });
  return { id, status: r.outcome, externalId };
}

/** After an uncertain send: ask the sandbox about the same external id instead of sending a new document. */
export async function reconcile(user: AuthUser, id: string) {
  await finance(user);
  const d = await prisma.taxDocument.findFirst({ where: { id, schoolId: user.schoolId }, include: { attempts: { orderBy: { attempt: "desc" }, take: 1 } } });
  if (!d || !d.externalId) throw new ApiError("Document not found or never submitted", 404);
  if (d.submissionStatus !== "QUEUED") return { id, status: d.submissionStatus, repeated: true };
  const received = d.attempts[0]?.outcome === "TIMEOUT"; // the sandbox kept what it received
  const attempt = (await prisma.taxSubmissionAttempt.count({ where: { documentId: id } })) + 1;
  await prisma.taxSubmissionAttempt.create({ data: { schoolId: user.schoolId, documentId: id, attempt, revision: d.revision, outcome: received ? "RECONCILED_ACCEPTED" : "RECONCILED_MISSING", detail: received ? "The sandbox already holds this external id as accepted." : "The sandbox has no record; it can be sent again with the same id.", actorId: user.userId } });
  if (received) await prisma.taxDocument.update({ where: { id }, data: { submissionStatus: "ACCEPTED", lastError: null } });
  return { id, status: received ? "ACCEPTED" : "QUEUED", externalId: d.externalId };
}

/** A reviewed correction of a rejected document: same number and external id, a new revision, ready to resend. */
export async function correct(user: AuthUser, body: Record<string, unknown>) {
  await finance(user);
  const d = await prisma.taxDocument.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!d) throw new ApiError("Document not found", 404);
  if (d.submissionStatus !== "REJECTED") throw new ApiError("Only a rejected document can be corrected here.", 409);
  const note = text(body.note, 500), buyerName = text(body.buyerName, 200);
  if (note.length < 5 || !buyerName) throw new ApiError("Record what was corrected and why.", 400);
  const snapshot = { ...(d.snapshot as Record<string, unknown>), correction: { revision: d.revision + 1, buyerName, note, by: user.userId, at: new Date().toISOString() } };
  await prisma.taxDocument.update({ where: { id: d.id }, data: { snapshot: snapshot as Prisma.InputJsonValue, revision: { increment: 1 }, submissionStatus: "CORRECTED", correctedById: user.userId, correctionNote: note } });
  return { id: d.id, revision: d.revision + 1 };
}
