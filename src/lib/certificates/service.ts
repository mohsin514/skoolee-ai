import { createHash, randomBytes } from "node:crypto";
import type { CertificateIssue } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { getLocalePackage } from "@/lib/locale/store";
import { formatDateOnly, type Language } from "@/lib/locale/package";
import { resolveSourceActions } from "@/lib/notifications/actions";
import { deliverNotification } from "@/lib/notifications/in-app";

// SKO-469: certificates and ID cards. A template is drafted freely, but only an approved version can be
// issued, and that version never changes. An issued document freezes the fields it used, its rendered
// text, serial and artifact hash at the moment of issue (a database trigger refuses later edits), so a
// re-download is the same document even after the pupil's record or the template changes. Corrections
// are reissues: a new serial that points at the one it replaces, which is then marked superseded.

export const KINDS = ["STUDENT_CERTIFICATE", "ID_CARD"] as const;
export const LANGUAGES = ["en", "ar", "ur"] as const;
export const PAGE_SIZES = ["A4", "A5", "LETTER", "ID_CARD"] as const;
/** Every variable a template may use; nothing else about the pupil is ever read into a document. */
export const VARIABLES = ["studentName", "studentNameUr", "rollNo", "admissionNo", "className", "section", "dateOfBirth", "guardianName", "nationality", "schoolName", "campusName", "issueDate", "serial", "photo"] as const;
type Variable = (typeof VARIABLES)[number];
const SYSTEM: Variable[] = ["issueDate", "serial"];
const PATTERN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

// role-ux G38a / §2.2 #54: templates (design and approval) belong to the campus admin; issuing is the front desk's
// (the receptionist, or the campus admin who holds the desk when no receptionist is on duty).
export const isLeader = (user: AuthUser) => isCampusOperator(user);
const canIssue = (user: AuthUser) => isCampusOperator(user) || user.role === "RECEPTIONIST";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const sha256Bytes = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};
function frontDesk(user: AuthUser) { if (!canIssue(user)) throw new ApiError("Only the front desk and your campus admin can issue certificates.", 403); }
function leader(user: AuthUser, what: string) { if (!isLeader(user)) throw new ApiError(`Only your campus admin can ${what}.`, 403); }

/** The variables a body uses; unknown names are refused so a typo cannot silently print blank. */
export function usedVariables(body: string) {
  const used = new Set<string>();
  for (const match of body.matchAll(PATTERN)) used.add(match[1]);
  const unknown = [...used].filter(name => !(VARIABLES as readonly string[]).includes(name));
  if (unknown.length) throw new ApiError(`Unknown variable(s): ${unknown.join(", ")}. Use only: ${VARIABLES.join(", ")}.`, 400);
  return [...used] as Variable[];
}

type Draft = { title: string; body: string };
const draftOf = (layoutJson: unknown): Draft => {
  const value = (layoutJson ?? {}) as Record<string, unknown>;
  return { title: String(value.title ?? ""), body: String(value.body ?? "") };
};

export async function listTemplates(user: AuthUser, campusId: string) {
  frontDesk(user);
  const rows = await prisma.certificateTemplate.findMany({ where: { campusId, schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  return rows.map(row => ({ id: row.id, kind: row.kind, name: row.name, language: row.language, pageSize: row.pageSize, requiresApproval: row.requiresApproval, currentVersion: row.currentVersion, draft: draftOf(row.layoutJson), approved: row.versions[0] ? { version: row.versions[0].version, title: row.versions[0].title, body: row.versions[0].body, approvedAt: row.versions[0].approvedAt } : null, createdAt: row.createdAt }));
}

export async function saveTemplate(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  frontDesk(user);
  const kind = String(body.kind ?? "");
  const language = String(body.language ?? "en");
  const pageSize = String(body.pageSize ?? (kind === "ID_CARD" ? "ID_CARD" : "A4"));
  if (!(KINDS as readonly string[]).includes(kind)) throw new ApiError("Choose a certificate or an ID card.", 400);
  if (!(LANGUAGES as readonly string[]).includes(language)) throw new ApiError("Choose English, Arabic or Urdu for the document.", 400);
  if (!(PAGE_SIZES as readonly string[]).includes(pageSize)) throw new ApiError("Unknown page size.", 400);
  const draft = { version: 1, title: text(body.title, "Document title", 2, 120), body: text(body.body, "Document text", 10, 4000) };
  usedVariables(draft.body);
  const data = { kind, language, pageSize, name: text(body.name, "Template name", 2, 120), requiresApproval: kind === "ID_CARD" ? true : body.requiresApproval !== false, layoutJson: draft };
  if (body.id) {
    const existing = await prisma.certificateTemplate.findFirst({ where: { id: String(body.id), campusId, schoolId: user.schoolId } });
    if (!existing) throw new ApiError("Certificate template not found", 404);
    // Editing changes the draft only; issued documents keep pointing at their approved version.
    return prisma.certificateTemplate.update({ where: { id: existing.id }, data: { ...data, draftVersion: { increment: 1 } } });
  }
  return prisma.certificateTemplate.create({ data: { schoolId: user.schoolId, campusId, ...data } });
}

export async function approveTemplate(user: AuthUser, campusId: string, id: string) {
  leader(user, "approve a template");
  return schoolAiTransaction(user, async db => {
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM certificate_templates WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const template = locked ? await db.certificateTemplate.findUnique({ where: { id } }) : null;
    if (!template) throw new ApiError("Certificate template not found", 404);
    const draft = draftOf(template.layoutJson);
    if (draft.title.length < 2 || draft.body.length < 10) throw new ApiError("Write the document title and text before approving.", 400);
    usedVariables(draft.body);
    const latest = await db.certificateTemplateVersion.findFirst({ where: { templateId: id }, orderBy: { version: "desc" } });
    if (latest && latest.title === draft.title && latest.body === draft.body && latest.language === template.language && latest.pageSize === template.pageSize) throw new ApiError("This draft is already the approved version.", 409);
    const version = (latest?.version ?? 0) + 1;
    await db.certificateTemplateVersion.create({ data: { schoolId: user.schoolId, campusId, templateId: id, version, kind: template.kind, title: draft.title, body: draft.body, language: template.language, pageSize: template.pageSize, approvedById: user.userId } });
    return db.certificateTemplate.update({ where: { id }, data: { currentVersion: version } });
  });
}

/** Templates can be removed only while nothing was ever approved or issued from them. */
export async function deleteTemplate(user: AuthUser, campusId: string, id: string) {
  frontDesk(user);
  const template = await prisma.certificateTemplate.findFirst({ where: { id, campusId, schoolId: user.schoolId }, select: { id: true, currentVersion: true } });
  if (!template) throw new ApiError("Certificate template not found", 404);
  if (template.currentVersion > 0) throw new ApiError("An approved template is kept because documents may have been issued from it.", 409);
  await prisma.certificateTemplate.delete({ where: { id } });
}

/** Pupils this campus may issue documents for; enough to tell namesakes apart, nothing more. */
export async function findStudents(user: AuthUser, campusId: string, q: string) {
  frontDesk(user);
  const query = q.trim().slice(0, 80);
  if (query.length < 2) return [];
  const rows = await prisma.student.findMany({
    where: { campusId, schoolId: user.schoolId, archivedAt: null, consolidatedIntoId: null, OR: [{ fullName: { contains: query, mode: "insensitive" } }, { rollNo: { contains: query, mode: "insensitive" } }, { admissionNo: { contains: query, mode: "insensitive" } }] },
    select: { id: true, fullName: true, rollNo: true, admissionNo: true, class: { select: { name: true, section: true } } },
    orderBy: { fullName: "asc" }, take: 20,
  });
  return rows.map(row => ({ id: row.id, fullName: row.fullName, rollNo: row.rollNo, admissionNo: row.admissionNo, className: [row.class.name, row.class.section].filter(Boolean).join(" ") }));
}

type Context = { values: Partial<Record<Variable, string>>; photoUrl: string | null; schoolName: string; campusName: string };
async function studentContext(db: TxClient, user: AuthUser, campusId: string, studentId: string, used: Variable[], language: Language, issueDate: Date, serial: string): Promise<Context> {
  const student = await db.student.findFirst({ where: { id: studentId, campusId, schoolId: user.schoolId, archivedAt: null, consolidatedIntoId: null }, include: { class: { select: { name: true, section: true } }, campus: { select: { name: true, school: { select: { name: true } } } } } });
  if (!student) throw new ApiError("Student not found in this campus", 404);
  const policy = { ...(await getLocalePackage(user.schoolId, campusId, new Date(), null, db)), language };
  const day = (value: Date | null) => (value ? formatDateOnly(value.toISOString().slice(0, 10), policy) : "");
  const all: Record<Variable, string> = {
    studentName: student.fullName, studentNameUr: student.nameUr ?? "", rollNo: student.rollNo, admissionNo: student.admissionNo ?? "",
    className: student.class.name, section: student.class.section ?? "", dateOfBirth: day(student.dateOfBirth), guardianName: student.guardianName ?? "",
    nationality: student.nationality ?? "", schoolName: student.campus.school.name, campusName: student.campus.name, issueDate: day(issueDate), serial, photo: student.profileImageUrl ? "photo" : "",
  };
  // Only the variables the template uses enter the snapshot.
  const values = Object.fromEntries(used.map(name => [name, all[name]])) as Partial<Record<Variable, string>>;
  return { values, photoUrl: used.includes("photo") ? student.profileImageUrl ?? null : null, schoolName: all.schoolName, campusName: all.campusName };
}
const missingOf = (used: Variable[], values: Partial<Record<Variable, string>>) => used.filter(name => !SYSTEM.includes(name) && !values[name]);
const render = (body: string, values: Partial<Record<Variable, string>>) => body.replace(PATTERN, (_, name: Variable) => name === "photo" ? "" : values[name] ?? "").replace(/[ \t]+\n/g, "\n").trim();

function artifactHash(issue: { serial: string; title: string; renderedBody: string; language: string; pageSize: string; photoUrl: string | null; issuedAt: Date }, schoolName: string, campusName: string) {
  return sha256(JSON.stringify({ serial: issue.serial, title: issue.title, body: issue.renderedBody, language: issue.language, pageSize: issue.pageSize, school: schoolName, campus: campusName, photo: issue.photoUrl ? sha256(issue.photoUrl) : null, issuedAt: issue.issuedAt.toISOString() }));
}

async function approvedVersion(db: TxClient, user: AuthUser, campusId: string, templateId: string) {
  const template = await db.certificateTemplate.findFirst({ where: { id: templateId, campusId, schoolId: user.schoolId } });
  if (!template) throw new ApiError("Certificate template not found", 404);
  if (!template.currentVersion) throw new ApiError("This template has not been approved yet. A campus leader must approve it before documents can be issued.", 409);
  const version = await db.certificateTemplateVersion.findUniqueOrThrow({ where: { templateId_version: { templateId, version: template.currentVersion } } });
  return { template, version };
}

/** What the document would say for this pupil, and which required fields are missing. Nothing is stored. */
export async function previewIssue(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  frontDesk(user);
  return schoolAiTransaction(user, async db => {
    const { template, version } = await approvedVersion(db, user, campusId, String(body.templateId ?? ""));
    const used = usedVariables(version.body);
    const context = await studentContext(db, user, campusId, String(body.studentId ?? ""), used, version.language as Language, new Date(), "—");
    return { title: version.title, body: render(version.body, context.values), missing: missingOf(used, context.values), language: version.language, kind: version.kind, templateVersion: version.version, requiresApproval: template.requiresApproval && !isLeader(user), hasPhoto: Boolean(context.photoUrl), schoolName: context.schoolName, campusName: context.campusName };
  });
}

type Pending = { issue: CertificateIssue; notifyLeaders: boolean };
/** Request (or, for a leader or a template without approval, issue) a document. Retries replay. */
export async function requestIssue(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  frontDesk(user);
  const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const templateId = String(body.templateId ?? ""), studentId = String(body.studentId ?? "");
  const previousId = body.previousId ? String(body.previousId) : null;
  const reissueReason = previousId ? text(body.reissueReason, "Reason for reissue", 5, 500) : null;
  const requestHash = sha256(JSON.stringify({ templateId, studentId, previousId, reissueReason }));
  const result: Pending = await schoolAiTransaction(user, async db => {
    if (key) {
      const previous = await db.certificateIssue.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the request you first sent. Start a new request instead.", 409);
        return { issue: previous, notifyLeaders: false };
      }
    }
    if (previousId) {
      const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM certificate_issues WHERE id = ${previousId} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
      const prior = locked ? await db.certificateIssue.findUnique({ where: { id: previousId } }) : null;
      if (!prior) throw new ApiError("The document being replaced was not found", 404);
      if (prior.studentId !== studentId) throw new ApiError("A reissue is for the same pupil as the document it replaces.", 400);
      if (!["ISSUED", "REVOKED"].includes(prior.status)) throw new ApiError("Only an issued or revoked document can be reissued.", 409);
      const open = await db.certificateIssue.findFirst({ where: { previousId, status: { in: ["PENDING_APPROVAL", "ISSUED"] } }, select: { serial: true } });
      if (open) throw new ApiError(`This document already has a replacement (${open.serial}).`, 409);
    }
    const { template, version } = await approvedVersion(db, user, campusId, templateId);
    const used = usedVariables(version.body);
    const serial = `${version.kind === "ID_CARD" ? "IDC" : "CRT"}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const now = new Date();
    const context = await studentContext(db, user, campusId, studentId, used, version.language as Language, now, serial);
    const missing = missingOf(used, context.values);
    if (missing.length) throw new ApiError(`This pupil's record is missing: ${missing.join(", ")}. Complete the record or use a template that does not need it.`, 400);
    const issueNow = !template.requiresApproval || isLeader(user);
    const content = { serial, title: version.title, renderedBody: render(version.body, context.values), language: version.language, pageSize: version.pageSize, photoUrl: context.photoUrl, issuedAt: now };
    const issue = await db.certificateIssue.create({ data: {
      schoolId: user.schoolId, campusId, studentId, templateId, templateVersionId: version.id, serial, snapshot: { ...context.values, schoolName: context.schoolName, campusName: context.campusName },
      title: content.title, renderedBody: content.renderedBody, language: content.language, pageSize: content.pageSize, photoUrl: content.photoUrl,
      artifactHash: artifactHash(content, context.schoolName, context.campusName), verifyToken: randomBytes(18).toString("base64url"),
      status: issueNow ? "ISSUED" : "PENDING_APPROVAL", requestedById: user.userId, ...(issueNow ? { approvedById: user.userId, approvedAt: now, issuedAt: now } : {}),
      previousId, reissueReason, idempotencyKey: key, requestHash: key ? requestHash : null,
    } });
    if (issueNow && previousId) await supersede(db, previousId);
    return { issue, notifyLeaders: !issueNow };
  });
  if (result.notifyLeaders) await deliverNotification("CERTIFICATE_APPROVAL_NEEDED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName ?? null, issueId: result.issue.id, serial: result.issue.serial, title: result.issue.title })
    .catch(error => console.error("[certificates] approval notification failed", error));
  return result.issue;
}

async function supersede(db: TxClient, previousId: string) {
  await db.certificateIssue.updateMany({ where: { id: previousId, status: "ISSUED" }, data: { status: "SUPERSEDED", version: { increment: 1 } } });
}

/** A leader approves (issues), rejects, or revokes. Every decision needs the version the leader saw. */
export async function decide(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  leader(user, "approve, reject or revoke a document");
  const action = String(body.action ?? "");
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM certificate_issues WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const issue = locked ? await db.certificateIssue.findUnique({ where: { id }, include: { templateVersion: true } }) : null;
    if (!issue) throw new ApiError("Document not found", 404);
    if (body.version !== undefined && Number(body.version) !== issue.version) throw new ApiError("This document changed since you opened it. Reload to see the latest before deciding.", 409);
    const done = () => resolveSourceActions({ schoolId: user.schoolId, sourceType: "certificate", sourceId: id, resolution: "COMPLETED" }, db);
    if (action === "approve") {
      if (issue.status !== "PENDING_APPROVAL") throw new ApiError("Only a pending request can be approved.", 409);
      // The issue date is the approval date; the pupil's fields stay exactly as they were requested.
      const now = new Date();
      const snapshot = issue.snapshot as Record<string, string>;
      const policy = { ...(await getLocalePackage(user.schoolId, campusId, now, null, db)), language: issue.language as Language };
      const values = { ...snapshot, issueDate: formatDateOnly(now.toISOString().slice(0, 10), policy), serial: issue.serial } as Partial<Record<Variable, string>>;
      const renderedBody = render(issue.templateVersion.body, values);
      const hash = artifactHash({ ...issue, renderedBody, issuedAt: now }, snapshot.schoolName ?? "", snapshot.campusName ?? "");
      const updated = await db.certificateIssue.update({ where: { id }, data: { status: "ISSUED", approvedById: user.userId, approvedAt: now, issuedAt: now, renderedBody, artifactHash: hash, decisionNote: String(body.note ?? "").trim() || null, version: { increment: 1 } } });
      if (issue.previousId) await supersede(db, issue.previousId);
      await done();
      return updated;
    }
    if (action === "reject") {
      if (issue.status !== "PENDING_APPROVAL") throw new ApiError("Only a pending request can be rejected.", 409);
      const updated = await db.certificateIssue.update({ where: { id }, data: { status: "REJECTED", approvedById: user.userId, approvedAt: new Date(), decisionNote: text(body.note, "Reason for rejecting", 5, 500), version: { increment: 1 } } });
      await done();
      return updated;
    }
    if (action === "revoke") {
      if (issue.status !== "ISSUED") throw new ApiError("Only an issued document can be revoked.", 409);
      return db.certificateIssue.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date(), revokedById: user.userId, decisionNote: text(body.note, "Reason for revoking", 5, 500), version: { increment: 1 } } });
    }
    throw new ApiError("Unknown action", 400);
  });
}

export async function listIssues(user: AuthUser, campusId: string, filters: { status: string | null; q: string }) {
  frontDesk(user);
  const q = filters.q.trim().slice(0, 80);
  const rows = await prisma.certificateIssue.findMany({
    where: { campusId, schoolId: user.schoolId, ...(filters.status ? { status: filters.status } : {}), ...(q ? { OR: [{ serial: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { student: { fullName: { contains: q, mode: "insensitive" } } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, serial: true, status: true, title: true, language: true, issuedAt: true, createdAt: true, version: true, previousId: true, reissueReason: true, decisionNote: true, artifactHash: true, verifyToken: true, requestedById: true, approvedById: true, student: { select: { id: true, fullName: true, rollNo: true } }, templateVersion: { select: { version: true, kind: true } }, templateId: true, successors: { select: { serial: true, status: true } } },
  });
  const ids = [...new Set(rows.flatMap(row => [row.requestedById, row.approvedById]).filter((value): value is string => Boolean(value)))];
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: ids } }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  return rows.map(({ requestedById, approvedById, ...row }) => ({ ...row, requestedBy: people.get(requestedById) ?? null, approvedBy: approvedById ? people.get(approvedById) ?? null : null }));
}

/**
 * The delivered PDF. The first successful download renders it from the frozen content and stores the bytes;
 * every later download returns exactly those bytes, so a revoked or superseded document is still the same
 * file (its current state is on the verification link, not stamped into a changed copy). A failed render
 * stores nothing and can simply be retried.
 */
export async function deliveredPdf(user: AuthUser, campusId: string, id: string, render: (issue: CertificateIssue, school: { schoolName: string; campusName: string }) => Promise<Buffer>) {
  frontDesk(user);
  const issue = await prisma.certificateIssue.findFirst({ where: { id, campusId, schoolId: user.schoolId } });
  if (!issue) throw new ApiError("Document not found", 404);
  if (!issue.issuedAt || !["ISSUED", "REVOKED", "SUPERSEDED"].includes(issue.status)) throw new ApiError("This document has not been issued. It can be downloaded once a campus leader approves it.", 409);
  if (issue.pdf && issue.pdfSha256) return { issue, pdf: Buffer.from(issue.pdf), pdfSha256: issue.pdfSha256 };
  const snapshot = issue.snapshot as Record<string, string>;
  let pdf: Buffer;
  try { pdf = await render(issue, { schoolName: snapshot.schoolName ?? "", campusName: snapshot.campusName ?? "" }); }
  catch (error) {
    console.error("[certificates] render failed", error);
    throw new ApiError("The PDF could not be generated. The document itself is safe and unchanged; try the download again.", 502);
  }
  const pdfSha256 = sha256Bytes(pdf);
  // Two first downloads at once: whichever stores first wins, and both return the stored bytes.
  await prisma.certificateIssue.updateMany({ where: { id, pdf: null }, data: { pdf: new Uint8Array(pdf), pdfSha256 } });
  const stored = await prisma.certificateIssue.findUniqueOrThrow({ where: { id }, select: { pdf: true, pdfSha256: true } });
  return { issue, pdf: Buffer.from(stored.pdf!), pdfSha256: stored.pdfSha256! };
}
