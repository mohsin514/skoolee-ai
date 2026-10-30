import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AdmissionApplication, Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertModuleRead, assertPermission, assertStaffRole } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { runUnscoped } from "@/lib/db/tenant-context";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { resolveSourceActions } from "@/lib/notifications/actions";
import { deliverNotification } from "@/lib/notifications/in-app";
import { ASSESSMENT_ACTIONS, actOnAssessment, moveOnWaitlist, nextWaitlistRank, offerDeadline, offerLapsed } from "./assessments";
import { answerProblems, definitionProblems, foldName, identityKeysFor, identityValues, keepVisible, visibleDocuments, type Answers, type FormDefinition } from "./form-rules";

// SKO-398: admission forms, family applications and the pipeline to enrollment.
// - A form's draft is edited freely; publishing freezes a version (DB trigger). An application keeps the
//   version it was started with, so a later publication never changes what it asked or required.
// - Families hold a reference and a resume key (only its hash is stored); they see their own answers, the
//   stage in family words and messages written for them — never office notes.
// - Stage moves, offers, acceptance and conversion are separate events. Conversion creates the pupil at
//   most once (the application row is locked and its link is unique) and needs an explicit, recorded
//   choice whenever a possible duplicate exists.

export const ACTIVE = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED"];
const FAMILY_EDITABLE = ["DRAFT", "INFO_REQUESTED"];
const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENT = 5 * 1024 * 1024;
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function validDocumentBytes(type: string, name: string, bytes: Uint8Array) {
  const extension = name.toLowerCase().split(".").pop();
  const expectedExtension = type === "application/pdf" ? "pdf" : type === "image/jpeg" ? "jpg" : "png";
  if (extension !== expectedExtension && !(type === "image/jpeg" && extension === "jpeg")) return false;
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}
const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};
const problemsError = (problems: { key: string; message: string }[]) => Object.assign(new ApiError(`Some answers need attention: ${problems.map(p => `${p.key} — ${p.message}`).join("; ")}`, 400), { problems });
const asDefinition = (value: unknown) => value as FormDefinition;

// ─── Forms (staff) ───────────────────────────────────────────

async function canEdit(user: AuthUser) { assertStaffRole(user); await assertPermission(user, "admissions", "edit"); }
/**
 * role-ux G37: intake (enter, answers, staff submit, request info, notes, owners) is admissions.edit — the front
 * desk's work. Decisions (offer, waitlist, reject, the family's acceptance or decline), enrolment and the form
 * designer belong to the campus admin; the receptionist moves applications forward and never decides them.
 */
async function canDecide(user: AuthUser, what: string) {
  await canEdit(user);
  if (!isCampusOperator(user)) throw new ApiError(`Only your campus admin can ${what}.`, 403);
}
const DECISIONS = new Set(["offer", "waitlist", "waitlist-move", "reject", "record-acceptance", "record-decline"]);

export async function listForms(user: AuthUser, campusId: string) {
  await canRead(user);
  const forms = await prisma.admissionForm.findMany({ where: { campusId, schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, publishedAt: true, definition: true } } } });
  return forms.map(form => ({ id: form.id, name: form.name, draft: form.draft, currentVersion: form.currentVersion, publicToken: form.publicToken, isOpen: form.isOpen, published: form.versions[0] ?? null }));
}

export async function saveForm(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  await canDecide(user, "edit admission forms");
  const name = text(body.name, "Form name", 2, 120);
  const definition = asDefinition(body.definition);
  const problems = definitionProblems(definition);
  if (problems.length) throw new ApiError(problems.join(" "), 400);
  const draft = { fields: definition.fields, documents: definition.documents, identityKeys: definition.identityKeys, consent: definition.consent } as unknown as Prisma.InputJsonValue;
  if (body.id) {
    const form = await prisma.admissionForm.findFirst({ where: { id: String(body.id), campusId, schoolId: user.schoolId } });
    if (!form) throw new ApiError("Admission form not found", 404);
    return prisma.admissionForm.update({ where: { id: form.id }, data: { name, draft } });
  }
  return prisma.admissionForm.create({ data: { schoolId: user.schoolId, campusId, name, draft, publicToken: randomBytes(18).toString("base64url") } });
}

export async function publishForm(user: AuthUser, campusId: string, id: string) {
  await canDecide(user, "publish admission forms");
  return schoolAiTransaction(user, async db => {
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM admission_forms WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const form = locked ? await db.admissionForm.findUnique({ where: { id } }) : null;
    if (!form) throw new ApiError("Admission form not found", 404);
    const problems = definitionProblems(asDefinition(form.draft));
    if (problems.length) throw new ApiError(problems.join(" "), 400);
    const latest = await db.admissionFormVersion.findFirst({ where: { formId: id }, orderBy: { version: "desc" } });
    if (latest && JSON.stringify(latest.definition) === JSON.stringify(form.draft)) throw new ApiError("This draft is already the published version.", 409);
    const version = (latest?.version ?? 0) + 1;
    await db.admissionFormVersion.create({ data: { schoolId: user.schoolId, campusId, formId: id, version, definition: form.draft as Prisma.InputJsonValue, publishedById: user.userId } });
    return db.admissionForm.update({ where: { id }, data: { currentVersion: version } });
  });
}

export async function setFormOpen(user: AuthUser, campusId: string, id: string, isOpen: boolean) {
  await canDecide(user, "open or close admission forms");
  const form = await prisma.admissionForm.findFirst({ where: { id, campusId, schoolId: user.schoolId } });
  if (!form) throw new ApiError("Admission form not found", 404);
  return prisma.admissionForm.update({ where: { id }, data: { isOpen } });
}

// ─── Family (public, by token / reference + resume key) ──────

const FAMILY_STAGE: Record<string, string> = { DRAFT: "DRAFT", SUBMITTED: "RECEIVED", UNDER_REVIEW: "RECEIVED", INFO_REQUESTED: "INFO_REQUESTED", OFFERED: "OFFERED", WAITLISTED: "WAITLISTED", ACCEPTED: "ACCEPTED", ENROLLED: "ENROLLED", DECLINED: "CLOSED", REJECTED: "CLOSED", WITHDRAWN: "CLOSED" };

async function openForm(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new ApiError("This application link is not valid.", 404);
  const form = await prisma.admissionForm.findUnique({ where: { publicToken: token } });
  if (!form || !form.currentVersion) throw new ApiError("This application link is not valid.", 404);
  const version = await prisma.admissionFormVersion.findUniqueOrThrow({ where: { formId_version: { formId: form.id, version: form.currentVersion } } });
  const [school, campus] = await Promise.all([prisma.school.findUnique({ where: { id: form.schoolId }, select: { name: true } }), prisma.campus.findUnique({ where: { id: form.campusId }, select: { name: true } })]);
  return { form, version, schoolName: school?.name ?? "", campusName: campus?.name ?? "" };
}

export function publicForm(token: string) {
  return runUnscoped("public admission form by unguessable link token", async () => {
    const { form, version, schoolName, campusName } = await openForm(token);
    return { formName: form.name, schoolName, campusName, isOpen: form.isOpen, version: version.version, definition: version.definition };
  });
}

async function familyApplication(reference: string, resumeKey: string, db: TxClient = prisma) {
  if (!/^APP-[0-9A-F]{8}$/.test(reference) || !/^[A-Za-z0-9_-]{30,60}$/.test(resumeKey)) throw new ApiError("We could not find that application. Check the reference and the saved link.", 404);
  const application = await db.admissionApplication.findFirst({ where: { reference, resumeKeyHash: sha256(resumeKey) }, include: { formVersion: true } });
  if (!application) throw new ApiError("We could not find that application. Check the reference and the saved link.", 404);
  return application;
}

async function familyView(application: AdmissionApplication & { formVersion: { definition: Prisma.JsonValue; version: number } }) {
  const definition = asDefinition(application.formVersion.definition);
  const [documents, events, school, campus] = await Promise.all([
    prisma.admissionDocument.findMany({ where: { applicationId: application.id }, select: { id: true, key: true, fileName: true, sizeBytes: true, uploadedAt: true }, orderBy: { uploadedAt: "asc" } }),
    prisma.admissionApplicationEvent.findMany({ where: { applicationId: application.id, familyMessage: { not: null } }, select: { familyMessage: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.school.findUnique({ where: { id: application.schoolId }, select: { name: true } }),
    prisma.campus.findUnique({ where: { id: application.campusId }, select: { name: true } }),
  ]);
  const answers = application.answers as Answers;
  const uploaded = [...new Set(documents.map(document => document.key))];
  const missing = answerProblems(definition, answers, uploaded, true).filter(problem => problem.message.endsWith("required.")).map(problem => problem.key);
  return {
    reference: application.reference, stage: FAMILY_STAGE[application.status] ?? "RECEIVED", editable: FAMILY_EDITABLE.includes(application.status),
    schoolName: school?.name ?? "", campusName: campus?.name ?? "", formVersion: application.formVersion.version, definition, answers,
    documents, missing, messages: events.map(event => ({ message: event.familyMessage, at: event.createdAt })), submittedAt: application.submittedAt,
    offerExpiresAt: application.status === "OFFERED" ? application.offerExpiresAt : null,
  };
}

export function startApplication(token: string, body: Record<string, unknown>) {
  return runUnscoped("family starts an admission application from a public form link", async () => {
    const { form, version } = await openForm(token);
    if (!form.isOpen) throw new ApiError("This school is not accepting applications through this link at the moment.", 409);
    const definition = asDefinition(version.definition);
    const answers = keepVisible(definition, (body.answers ?? {}) as Answers);
    const problems = answerProblems(definition, answers, [], false);
    if (problems.length) throw problemsError(problems);
    const resumeKey = randomBytes(30).toString("base64url");
    const application = await prisma.$transaction(async tx => {
      const created = await tx.admissionApplication.create({ data: { schoolId: form.schoolId, campusId: form.campusId, formVersionId: version.id, reference: `APP-${randomBytes(4).toString("hex").toUpperCase()}`, answers: answers as Prisma.InputJsonValue, childName: String(identityValues(definition, answers).childName ?? ""), resumeKeyHash: sha256(resumeKey), identityKeys: [] } });
      await tx.admissionApplicationEvent.create({ data: { schoolId: form.schoolId, applicationId: created.id, kind: "CREATED", toStatus: "DRAFT", actorId: "FAMILY" } });
      return created;
    });
    return { reference: application.reference, resumeKey };
  });
}

export function loadApplication(reference: string, resumeKey: string) {
  return runUnscoped("family reads its own application by reference and resume key", async () => familyView(await familyApplication(reference, resumeKey)));
}

export function saveApplication(reference: string, resumeKey: string, body: Record<string, unknown>) {
  return runUnscoped("family saves its own draft application", async () => {
    const application = await familyApplication(reference, resumeKey);
    if (!FAMILY_EDITABLE.includes(application.status)) throw new ApiError("This application has been sent and can no longer be changed here.", 409);
    const definition = asDefinition(application.formVersion.definition);
    const answers = keepVisible(definition, (body.answers ?? {}) as Answers);
    const problems = answerProblems(definition, answers, [], false);
    if (problems.length) throw problemsError(problems);
    const updated = await prisma.admissionApplication.update({ where: { id: application.id }, data: { answers: answers as Prisma.InputJsonValue, childName: String(identityValues(definition, answers).childName ?? ""), version: { increment: 1 } }, include: { formVersion: true } });
    return familyView(updated);
  });
}

async function storeDocument(application: { id: string; schoolId: string; formVersion: { definition: Prisma.JsonValue }; answers: Prisma.JsonValue }, key: string, file: File, uploadedBy: string) {
  const definition = asDefinition(application.formVersion.definition);
  if (!visibleDocuments(definition, application.answers as Answers).some(document => document.key === key)) throw new ApiError("This form does not ask for that document.", 400);
  if (!DOCUMENT_TYPES.includes(file.type)) throw new ApiError("Upload a PDF, JPG or PNG file.", 400);
  if (file.size <= 0 || file.size > MAX_DOCUMENT) throw new ApiError("Files must be smaller than 5 MB.", 400);
  if ((await prisma.admissionDocument.count({ where: { applicationId: application.id } })) >= 40) throw new ApiError("This application already has the maximum number of files.", 409);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validDocumentBytes(file.type, String(file.name || key), bytes)) throw new ApiError("The file contents do not match the declared document type and extension.", 400);
  const created = await prisma.admissionDocument.create({ data: { schoolId: application.schoolId, applicationId: application.id, key, fileName: String(file.name || key).slice(0, 160), contentType: file.type, sizeBytes: bytes.byteLength, sha256: sha256(bytes), data: bytes, uploadedBy } });
  return { id: created.id, key: created.key, fileName: created.fileName, sizeBytes: created.sizeBytes, uploadedAt: created.uploadedAt };
}

export function uploadFamilyDocument(reference: string, resumeKey: string, key: string, file: File) {
  return runUnscoped("family uploads a document to its own application", async () => {
    const application = await familyApplication(reference, resumeKey);
    if (!FAMILY_EDITABLE.includes(application.status)) throw new ApiError("This application has been sent and can no longer be changed here.", 409);
    return storeDocument(application, key, file, "FAMILY");
  });
}

async function submitInTx(tx: TxClient, applicationId: string, actor: string, consent: boolean) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM admission_applications WHERE id = ${applicationId} FOR UPDATE`;
  if (!locked) throw new ApiError("Application not found", 404);
  const application = await tx.admissionApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { formVersion: true } });
  // Sending twice (a retry, a double tap) is the same submission.
  if (!FAMILY_EDITABLE.includes(application.status)) return { application, replayed: true };
  if (!consent) throw new ApiError("Confirm the consent statement before sending the application.", 400);
  const definition = asDefinition(application.formVersion.definition);
  const answers = keepVisible(definition, application.answers as Answers);
  const documents = await tx.admissionDocument.findMany({ where: { applicationId }, select: { id: true, key: true } });
  const problems = answerProblems(definition, answers, documents.map(document => document.key), true);
  if (problems.length) throw problemsError(problems);
  const identity = identityValues(definition, answers);
  const now = new Date();
  const updated = await tx.admissionApplication.update({ where: { id: applicationId }, data: {
    status: "SUBMITTED", submittedAt: application.submittedAt ?? now, answers: answers as Prisma.InputJsonValue, childName: identity.childName ?? "",
    dateOfBirth: identity.dateOfBirth ? new Date(`${identity.dateOfBirth}T00:00:00Z`) : null, guardianPhone: identity.guardianPhone ?? null,
    identityKeys: identityKeysFor(definition, answers), consentAt: now, consentText: definition.consent.en, version: { increment: 1 },
  }, include: { formVersion: true } });
  await tx.admissionSubmission.create({ data: { schoolId: application.schoolId, applicationId, formVersionId: application.formVersionId, answers: answers as Prisma.InputJsonValue, documentIds: documents.map(document => document.id), submittedBy: actor } });
  await tx.admissionApplicationEvent.create({ data: { schoolId: application.schoolId, applicationId, kind: "SUBMITTED", fromStatus: application.status, toStatus: "SUBMITTED", actorId: actor } });
  return { application: updated, replayed: false };
}

export function submitFamilyApplication(reference: string, resumeKey: string, body: Record<string, unknown>) {
  return runUnscoped("family sends its own application", async () => {
    const found = await familyApplication(reference, resumeKey);
    const { application } = await prisma.$transaction(tx => submitInTx(tx as TxClient, found.id, "FAMILY", body.consent === true), { timeout: 20000 });
    return familyView(application);
  });
}

/** A family accepts (or declines) an offered place. Acceptance is not enrollment; the school confirms that. */
export function familyRespond(reference: string, resumeKey: string, accept: boolean) {
  return runUnscoped("family answers its own offer", async () => {
    const found = await familyApplication(reference, resumeKey);
    const application = await prisma.$transaction(async tx => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM admission_applications WHERE id = ${found.id} FOR UPDATE`;
      const current = locked ? await tx.admissionApplication.findUniqueOrThrow({ where: { id: found.id }, include: { formVersion: true } }) : null;
      if (!current) throw new ApiError("Application not found", 404);
      if (current.status === (accept ? "ACCEPTED" : "DECLINED")) return current;
      if (current.status !== "OFFERED") throw new ApiError("There is no open offer to answer on this application.", 409);
      if (accept && current.offerExpiresAt && current.offerExpiresAt < new Date()) throw new ApiError("The date to accept this offer has passed. Please contact the school.", 409);
      const status = accept ? "ACCEPTED" : "DECLINED";
      await tx.admissionApplicationEvent.create({ data: { schoolId: current.schoolId, applicationId: current.id, kind: accept ? "ACCEPTED" : "STAGE", fromStatus: "OFFERED", toStatus: status, actorId: "FAMILY", detail: { by: "family" } } });
      return tx.admissionApplication.update({ where: { id: current.id }, data: { status, version: { increment: 1 } }, include: { formVersion: true } });
    });
    return familyView(application);
  });
}

// ─── Pipeline (staff) ────────────────────────────────────────

async function canRead(user: AuthUser) { assertStaffRole(user); await assertModuleRead(user, "admissions"); }

export async function listApplications(user: AuthUser, campusId: string, filters: { view: string; status: string | null; q: string }) {
  await canRead(user);
  const now = new Date();
  const q = filters.q.trim().slice(0, 80);
  const where: Prisma.AdmissionApplicationWhereInput = {
    campusId, schoolId: user.schoolId, status: filters.status ? filters.status : filters.view === "all" ? undefined : { in: ACTIVE.filter(status => status !== "DRAFT") },
    ...(filters.view === "mine" ? { ownerId: user.userId } : filters.view === "unassigned" ? { ownerId: null } : filters.view === "overdue" ? { nextContactAt: { lt: now } } : {}),
    ...(q ? { OR: [{ reference: { contains: q, mode: "insensitive" } }, { childName: { contains: q, mode: "insensitive" } }, { guardianPhone: { contains: q.replace(/\D/g, "") || q } }] } : {}),
  };
  const [rows, active] = await Promise.all([
    prisma.admissionApplication.findMany({ where, orderBy: [{ nextContactAt: { sort: "asc", nulls: "last" } }, { submittedAt: "asc" }], take: 300, select: { id: true, reference: true, status: true, channel: true, childName: true, dateOfBirth: true, submittedAt: true, nextContactAt: true, offerExpiresAt: true, waitlistRank: true, version: true, updatedAt: true, owner: { select: { id: true, fullName: true } }, formVersion: { select: { version: true, form: { select: { name: true } } } }, events: { where: { familyMessage: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } }),
    prisma.admissionApplication.findMany({ where: { campusId, schoolId: user.schoolId, status: { in: ACTIVE.filter(status => status !== "DRAFT") } }, select: { ownerId: true, nextContactAt: true } }),
  ]);
  return {
    data: rows.map(({ events, ...row }) => ({ ...row, lastFamilyContact: events[0]?.createdAt ?? null, overdue: Boolean(row.nextContactAt && row.nextContactAt < now && ACTIVE.includes(row.status)), offerLapsed: offerLapsed(row, now) })),
    counts: { active: active.length, unassigned: active.filter(row => !row.ownerId).length, overdue: active.filter(row => row.nextContactAt && row.nextContactAt < now).length, mine: active.filter(row => row.ownerId === user.userId).length },
  };
}

/** Possible duplicates by the form's configured identifiers: other applications and existing pupils. */
async function duplicatesFor(db: TxClient, application: AdmissionApplication & { formVersion: { definition: Prisma.JsonValue } }) {
  const definition = asDefinition(application.formVersion.definition);
  const keys = application.identityKeys.length ? application.identityKeys : identityKeysFor(definition, application.answers as Answers);
  const identity = identityValues(definition, application.answers as Answers);
  const applications = keys.length ? await db.admissionApplication.findMany({ where: { schoolId: application.schoolId, id: { not: application.id }, identityKeys: { hasSome: keys }, status: { notIn: ["DRAFT", "WITHDRAWN"] } }, select: { id: true, reference: true, status: true, childName: true, convertedStudentId: true } }) : [];
  const studentWhere: Prisma.StudentWhereInput[] = [];
  if (definition.identityKeys.includes("nameAndDob") && identity.dateOfBirth) studentWhere.push({ dateOfBirth: new Date(`${identity.dateOfBirth}T00:00:00Z`) });
  const phone = identity.guardianPhone?.replace(/\D/g, "").slice(-9);
  if (definition.identityKeys.includes("guardianPhoneAndName") && phone && phone.length >= 6) studentWhere.push({ guardianPhone: { contains: phone } });
  const candidates = studentWhere.length ? await db.student.findMany({ where: { schoolId: application.schoolId, consolidatedIntoId: null, OR: studentWhere }, select: { id: true, fullName: true, rollNo: true, admissionNo: true, dateOfBirth: true, guardianPhone: true, archivedAt: true, campusId: true, class: { select: { name: true, section: true } } }, take: 50 }) : [];
  const name = identity.childName ? foldName(identity.childName) : "";
  const students = candidates.filter(student => foldName(student.fullName) === name).map(student => ({ id: student.id, fullName: student.fullName, rollNo: student.rollNo, admissionNo: student.admissionNo, className: [student.class.name, student.class.section].filter(Boolean).join(" "), archived: Boolean(student.archivedAt), dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null }));
  return { applications, students };
}

export async function applicationDetail(user: AuthUser, campusId: string, id: string) {
  await canRead(user);
  const application = await prisma.admissionApplication.findFirst({ where: { id, campusId, schoolId: user.schoolId }, include: { formVersion: { select: { id: true, version: true, definition: true, form: { select: { name: true } } } }, owner: { select: { id: true, fullName: true } }, enquiry: { select: { id: true, name: true, source: true } }, convertedStudent: { select: { id: true, fullName: true, rollNo: true } } } });
  if (!application) throw new ApiError("Application not found", 404);
  const [submissions, events, documents, duplicates, assessments] = await Promise.all([
    prisma.admissionSubmission.findMany({ where: { applicationId: id }, orderBy: { submittedAt: "asc" }, select: { id: true, submittedAt: true, submittedBy: true, answers: true, documentIds: true, formVersion: { select: { version: true } } } }),
    prisma.admissionApplicationEvent.findMany({ where: { applicationId: id }, orderBy: { createdAt: "asc" } }),
    prisma.admissionDocument.findMany({ where: { applicationId: id }, select: { id: true, key: true, fileName: true, contentType: true, sizeBytes: true, uploadedBy: true, uploadedAt: true, sha256: true }, orderBy: { uploadedAt: "asc" } }),
    duplicatesFor(prisma, application as never),
    prisma.admissionAssessment.findMany({ where: { applicationId: id, schoolId: user.schoolId }, orderBy: { scheduledAt: "asc" }, include: { staff: { select: { id: true, fullName: true } } } }),
  ]);
  const ids = [...new Set(events.map(event => event.actorId).filter(actor => actor !== "FAMILY"))];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ids }, schoolId: user.schoolId }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
  const { resumeKeyHash: _key, ...rest } = application;
  const definition = asDefinition(application.formVersion.definition);
  const missing = answerProblems(definition, application.answers as Answers, [...new Set(documents.map(d => d.key))], true).map(problem => problem.key);
  return { ...rest, missing, submissions, documents, duplicates, assessments, offerLapsed: offerLapsed(application), events: events.map(event => ({ ...event, actorName: event.actorId === "FAMILY" ? null : people.get(event.actorId) ?? null })) };
}

export async function documentFile(user: AuthUser, campusId: string, id: string) {
  await canRead(user);
  const document = await prisma.admissionDocument.findFirst({ where: { id, schoolId: user.schoolId, application: { campusId } } });
  if (!document) throw new ApiError("Document not found", 404);
  return document;
}

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  review: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  "request-info": { from: ["SUBMITTED", "UNDER_REVIEW"], to: "INFO_REQUESTED" },
  offer: { from: ["UNDER_REVIEW", "WAITLISTED"], to: "OFFERED" },
  waitlist: { from: ["UNDER_REVIEW", "OFFERED"], to: "WAITLISTED" },
  reject: { from: ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED"], to: "REJECTED" },
  "record-acceptance": { from: ["OFFERED"], to: "ACCEPTED" },
  "record-decline": { from: ["OFFERED"], to: "DECLINED" },
  withdraw: { from: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED"], to: "WITHDRAWN" },
};

async function validOwner(db: TxClient, user: AuthUser, campusId: string, ownerId: string) {
  // The front desk and the campus admins own applications (role-ux §2.2 #50); never the principal or the group admin.
  const owner = await db.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { in: ["CAMPUS_ADMIN", "ADMIN", "RECEPTIONIST"] }, campusId }, select: { id: true } });
  if (!owner) throw new ApiError("Choose an active front-desk colleague or campus admin in this campus as the owner.", 400);
}

/** One staff action per call, checked against the version the person was looking at. */
export async function actOnApplication(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  if (DECISIONS.has(action)) await canDecide(user, "decide an application");
  else await canEdit(user);
  const result = await schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM admission_applications WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const application = locked ? await db.admissionApplication.findUnique({ where: { id }, include: { formVersion: true } }) : null;
    if (!application) throw new ApiError("Application not found", 404);
    if (body.version !== undefined && Number(body.version) !== application.version) throw new ApiError("This application changed since you opened it. Reload to see the latest before saving.", 409);
    const event = { schoolId: user.schoolId, applicationId: id, actorId: user.userId };
    const bump = { version: { increment: 1 } };
    const officeNote = body.officeNote ? text(body.officeNote, "Office note", 2, 2000) : null;
    if (action === "assign") {
      const ownerId = body.ownerId ? String(body.ownerId) : null;
      const nextContactAt = body.nextContactAt ? new Date(String(body.nextContactAt)) : null;
      if (nextContactAt && Number.isNaN(nextContactAt.getTime())) throw new ApiError("Enter a valid next-contact date.", 400);
      if (ownerId) await validOwner(db, user, campusId, ownerId);
      const updated = await db.admissionApplication.update({ where: { id }, data: { ownerId, nextContactAt, ...bump } });
      await db.admissionApplicationEvent.create({ data: { ...event, kind: "ASSIGNED", officeNote, detail: { ownerId, nextContactAt: nextContactAt?.toISOString() ?? null } } });
      if (ownerId !== application.ownerId) await resolveSourceActions({ schoolId: user.schoolId, sourceType: "application", sourceId: id, resolution: "REASSIGNED", exceptUserIds: ownerId ? [ownerId] : [] }, db);
      return { updated, notify: ownerId && ownerId !== application.ownerId ? ownerId : null };
    }
    if (action === "note") {
      await db.admissionApplicationEvent.create({ data: { ...event, kind: "NOTE", officeNote: text(body.officeNote, "Office note", 2, 2000) } });
      return { updated: await db.admissionApplication.update({ where: { id }, data: bump }), notify: null };
    }
    if (action === "staff-submit") {
      const submitted = await submitInTx(db, id, user.userId, body.consent === true);
      return { updated: submitted.application, notify: null };
    }
    if (ASSESSMENT_ACTIONS.has(action)) {
      await actOnAssessment({ db, user, campusId, application, officeNote }, action, body);
      return { updated: await db.admissionApplication.update({ where: { id }, data: bump }), notify: null };
    }
    if (action === "waitlist-move") {
      await moveOnWaitlist({ db, user, campusId, application, officeNote }, body.direction);
      return { updated: await db.admissionApplication.findUniqueOrThrow({ where: { id } }), notify: null };
    }
    const transition = TRANSITIONS[action];
    if (!transition) throw new ApiError("Unknown action", 400);
    if (!transition.from.includes(application.status)) throw new ApiError(`This application is ${application.status.toLowerCase().replace("_", " ")}; that step is not available now.`, 409);
    const familyMessage = body.familyMessage ? text(body.familyMessage, "Message to the family", 2, 2000) : null;
    if (action === "request-info" && !familyMessage) throw new ApiError("Write what the family needs to provide.", 400);
    if (["reject", "record-acceptance", "record-decline", "withdraw"].includes(action) && !officeNote) throw new ApiError("Add an office note saying why, or how the family told you.", 400);
    let intakeClassId = application.intakeClassId;
    if (action === "offer") {
      intakeClassId = String(body.intakeClassId ?? application.intakeClassId ?? "");
      const cls = intakeClassId ? await db.class.findFirst({ where: { id: intakeClassId, campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } }) : null;
      if (!cls) throw new ApiError("Choose the class the place is offered in.", 400);
    }
    // SKAI-1142: an offer may carry a respond-by date; joining the waitlist takes the next place, leaving it frees it.
    const offerExpiresAt = action === "offer" ? offerDeadline(body.offerExpiresAt) : application.offerExpiresAt;
    const waitlistRank = transition.to === "WAITLISTED" ? await nextWaitlistRank(db, user.schoolId, campusId) : null;
    const updated = await db.admissionApplication.update({ where: { id }, data: { status: transition.to, intakeClassId, offerExpiresAt, waitlistRank, ...bump } });
    await db.admissionApplicationEvent.create({ data: { ...event, kind: action === "request-info" ? "INFO_REQUESTED" : action === "record-acceptance" ? "ACCEPTED" : action === "withdraw" ? "WITHDRAWN" : "STAGE", fromStatus: application.status, toStatus: transition.to, officeNote, familyMessage, detail: action === "offer" ? { intakeClassId, offerExpiresAt: offerExpiresAt?.toISOString() ?? null } : waitlistRank ? { waitlistRank } : undefined } });
    if (["REJECTED", "DECLINED", "WITHDRAWN"].includes(transition.to)) await resolveSourceActions({ schoolId: user.schoolId, sourceType: "application", sourceId: id, resolution: "CANCELLED" }, db);
    return { updated, notify: null };
  });
  if (result.notify) await deliverNotification("ADMISSION_APPLICATION_ASSIGNED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName ?? null, ownerId: result.notify, applicationId: result.updated.id, reference: result.updated.reference })
    .catch(error => console.error("[admissions] owner notification failed", error));
  const { resumeKeyHash: _key, ...data } = result.updated;
  return data;
}

/** Staff enter an application for a family (for example from an enquiry); it follows the same rules. */
export async function staffStart(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  await canEdit(user);
  const form = await prisma.admissionForm.findFirst({ where: { id: String(body.formId ?? ""), campusId, schoolId: user.schoolId } });
  if (!form || !form.currentVersion) throw new ApiError("Publish the admission form before entering applications.", 409);
  const version = await prisma.admissionFormVersion.findUniqueOrThrow({ where: { formId_version: { formId: form.id, version: form.currentVersion } } });
  const definition = asDefinition(version.definition);
  let enquiryId: string | null = null, prefill: Answers = {};
  if (body.enquiryId) {
    const enquiry = await prisma.admissionQuery.findFirst({ where: { id: String(body.enquiryId), campusId, schoolId: user.schoolId } });
    if (!enquiry) throw new ApiError("Enquiry not found", 404);
    const existing = await prisma.admissionApplication.findFirst({ where: { enquiryId: enquiry.id, status: { notIn: ["WITHDRAWN", "REJECTED", "DECLINED"] } }, select: { reference: true } });
    if (existing) throw new ApiError(`This enquiry already has application ${existing.reference}.`, 409);
    enquiryId = enquiry.id;
    const byIdentity = (identity: string) => definition.fields.find(field => field.identity === identity)?.key;
    prefill = Object.fromEntries([[byIdentity("guardianName"), enquiry.name], [byIdentity("guardianPhone"), enquiry.phone], [byIdentity("guardianEmail"), enquiry.email ?? undefined]].filter(([key, value]) => key && value)) as Answers;
  }
  const answers = keepVisible(definition, { ...prefill, ...((body.answers ?? {}) as Answers) });
  const problems = answerProblems(definition, answers, [], false);
  if (problems.length) throw problemsError(problems);
  return schoolAiTransaction(user, async db => {
    const created = await db.admissionApplication.create({ data: { schoolId: user.schoolId, campusId, formVersionId: version.id, reference: `APP-${randomBytes(4).toString("hex").toUpperCase()}`, channel: "STAFF", answers: answers as Prisma.InputJsonValue, childName: String(identityValues(definition, answers).childName ?? ""), identityKeys: [], enquiryId, ownerId: user.userId } });
    await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: created.id, kind: "CREATED", toStatus: "DRAFT", actorId: user.userId, detail: enquiryId ? { enquiryId } : undefined } });
    const { resumeKeyHash: _key, ...data } = created;
    return data;
  });
}

export async function staffSaveAnswers(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  await canEdit(user);
  return schoolAiTransaction(user, async db => {
    const application = await db.admissionApplication.findFirst({ where: { id: String(body.id ?? ""), campusId, schoolId: user.schoolId }, include: { formVersion: true } });
    if (!application) throw new ApiError("Application not found", 404);
    if (application.channel !== "STAFF" || !FAMILY_EDITABLE.includes(application.status)) throw new ApiError("Only a draft entered by staff can be edited here. A family's own answers stay as they sent them.", 409);
    const definition = asDefinition(application.formVersion.definition);
    const answers = keepVisible(definition, (body.answers ?? {}) as Answers);
    const problems = answerProblems(definition, answers, [], false);
    if (problems.length) throw problemsError(problems);
    const nextVersion = application.version + 1;
    const updated = await db.admissionApplication.update({ where: { id: application.id }, data: { answers: answers as Prisma.InputJsonValue, childName: String(identityValues(definition, answers).childName ?? ""), version: nextVersion } });
    await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: application.id, kind: "ANSWERS_UPDATED", actorId: user.userId, detail: { fromVersion: application.version, toVersion: nextVersion } } });
    const { resumeKeyHash: _key, ...data } = updated;
    return data;
  });
}

export async function staffUpload(user: AuthUser, campusId: string, id: string, key: string, file: File) {
  await canEdit(user);
  const application = await prisma.admissionApplication.findFirst({ where: { id, campusId, schoolId: user.schoolId }, include: { formVersion: true } });
  if (!application) throw new ApiError("Application not found", 404);
  if (!ACTIVE.includes(application.status)) throw new ApiError("This application is closed.", 409);
  return storeDocument(application, key, file, user.userId);
}

/**
 * Turn an accepted application into a pupil — once. The application row is locked; an application that is
 * already enrolled returns its pupil (so a lost response can be retried). A possible duplicate needs an
 * explicit, recorded choice: enrol as a new pupil (with a reason) or link the existing pupil record.
 */
export async function convertApplication(user: AuthUser, campusId: string, body: Record<string, unknown>) {
  await canDecide(user, "enrol a pupil");
  await assertPermission(user, "students", "add");
  const id = String(body.id ?? "");
  const outcome = await schoolAiTransaction(user, async db => {
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM admission_applications WHERE id = ${id} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
    const application = locked ? await db.admissionApplication.findUnique({ where: { id }, include: { formVersion: true } }) : null;
    if (!application) throw new ApiError("Application not found", 404);
    if (application.status === "ENROLLED" && application.convertedStudentId) {
      const student = await db.student.findUniqueOrThrow({ where: { id: application.convertedStudentId }, select: { id: true, fullName: true, rollNo: true, admissionNo: true } });
      return { application, student, replayed: true };
    }
    if (application.status !== "ACCEPTED") throw new ApiError("Record the family's acceptance before enrolling. An offer on its own is not enrollment.", 409);
    const definition = asDefinition(application.formVersion.definition);
    const answers = application.answers as Answers;
    const identity = identityValues(definition, answers);
    const duplicates = await duplicatesFor(db, application);
    const choice = (body.duplicate ?? {}) as { choice?: string; studentId?: string; reason?: string };
    const hasDuplicates = duplicates.students.length > 0 || duplicates.applications.some(other => other.convertedStudentId);
    if (hasDuplicates && !["new", "existing"].includes(String(choice.choice))) throw Object.assign(new ApiError("This child may already be on the school's records. Review the possible matches and choose whether to enrol a new pupil or link the existing record.", 409), { duplicates });
    if (hasDuplicates) text(choice.reason, "Reason for the duplicate decision", 5, 500);
    let student: { id: string; fullName: string; rollNo: string; admissionNo: string | null };
    if (choice.choice === "existing") {
      const candidates = new Set([...duplicates.students.map(s => s.id), ...duplicates.applications.map(a => a.convertedStudentId).filter(Boolean) as string[]]);
      if (!choice.studentId || !candidates.has(choice.studentId)) throw new ApiError("Choose one of the listed matching pupils.", 400);
      const taken = await db.admissionApplication.findFirst({ where: { convertedStudentId: choice.studentId }, select: { reference: true } });
      if (taken) throw new ApiError(`That pupil is already linked to application ${taken.reference}. Record this application as withdrawn instead.`, 409);
      student = await db.student.findUniqueOrThrow({ where: { id: choice.studentId }, select: { id: true, fullName: true, rollNo: true, admissionNo: true } });
    } else {
      const classId = String(body.classId ?? application.intakeClassId ?? "");
      // SKAI-1388: only an ACTIVE class with free capacity takes a new placement.
      const cls = await db.class.findFirst({ where: { id: classId, campusId, schoolId: user.schoolId, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true, capacity: true } });
      if (!cls) throw new ApiError("Choose an active class to enrol the pupil in.", 400);
      if (cls.capacity != null) {
        const occupied = await db.student.count({ where: { classId: cls.id, archivedAt: null, status: "active" } });
        if (occupied + 1 > cls.capacity) throw new ApiError(`The class is full (${occupied} of ${cls.capacity} seats). Choose another class.`, 409);
      }
      const rollNo = text(body.rollNo, "Roll number", 1, 32);
      await db.$queryRaw`SELECT id FROM campuses WHERE id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
      const clash = await db.$queryRaw<{ id: string }[]>`SELECT id FROM students WHERE school_id = ${user.schoolId} AND campus_id = ${campusId} AND archived_at IS NULL AND lower(btrim(roll_no)) = ${rollNo.toLocaleLowerCase("en")} LIMIT 1`;
      if (clash.length) throw new ApiError("This roll number already belongs to a pupil in the campus.", 409);
      await assertPlanCapacity({ schoolId: user.schoolId, metric: "students", increment: 1 });
      const gender = ["MALE", "FEMALE", "OTHER"].includes(String(identity.gender)) ? identity.gender as "MALE" | "FEMALE" | "OTHER" : "OTHER";
      const created = await db.student.create({ data: {
        schoolId: user.schoolId, campusId, classId: cls.id, fullName: identity.childName ?? application.childName, rollNo, gender,
        admissionNo: `ADM-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").toUpperCase()}`,
        dateOfBirth: identity.dateOfBirth ? new Date(`${identity.dateOfBirth}T00:00:00Z`) : null,
        guardianName: identity.guardianName || null, guardianPhone: identity.guardianPhone || null, guardianEmail: identity.guardianEmail?.toLowerCase() || null,
        address: identity.address || null, previousSchool: identity.previousSchool || null,
      }, select: { id: true, fullName: true, rollNo: true, admissionNo: true } });
      await db.studentTimelineEvent.create({ data: { studentId: created.id, kind: "ADMITTED", title: "Student admitted", detail: `From application ${application.reference} · Class ${cls.name}${cls.section ? ` - ${cls.section}` : ""} · Roll ${rollNo}`, actorId: user.userId } });
      student = created;
    }
    const decision = hasDuplicates ? { choice: choice.choice, studentId: choice.studentId ?? null, reason: choice.reason, candidates: duplicates } : null;
    const updated = await db.admissionApplication.update({ where: { id }, data: { status: "ENROLLED", convertedStudentId: student.id, convertedAt: new Date(), convertedById: user.userId, duplicateDecision: decision as Prisma.InputJsonValue ?? undefined, version: { increment: 1 } } });
    if (decision) await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: id, kind: "DUPLICATE_DECISION", officeNote: decision.reason ?? null, detail: { choice: decision.choice, studentId: decision.studentId } as Prisma.InputJsonValue, actorId: user.userId } });
    await db.admissionApplicationEvent.create({ data: { schoolId: user.schoolId, applicationId: id, kind: "ENROLLED", fromStatus: "ACCEPTED", toStatus: "ENROLLED", detail: { studentId: student.id }, actorId: user.userId, familyMessage: body.familyMessage ? text(body.familyMessage, "Message to the family", 2, 2000) : null } });
    if (application.enquiryId) await db.admissionQuery.updateMany({ where: { id: application.enquiryId, convertedStudentId: null }, data: { status: "CONVERTED", convertedStudentId: student.id } });
    await resolveSourceActions({ schoolId: user.schoolId, sourceType: "application", sourceId: id, resolution: "COMPLETED" }, db);
    return { application: updated, student, replayed: false };
  });
  const { resumeKeyHash: _key, ...application } = outcome.application;
  return { application, student: outcome.student, replayed: outcome.replayed };
}
