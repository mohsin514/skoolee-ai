import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageCampusOps, isFamilyRole } from "@/lib/api/scope";
import { guardianRelationshipAuthorityWhere } from "@/lib/parent/guardian-query";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-439: confidential clinic and safeguarding workspaces.
// - Two domains with separate memberships. Clinic membership never opens safeguarding records and the other
//   way round; a principal or admin has no implicit access either — they configure, they do not read.
// - A domain is usable only after a campus leader records the local procedure, the responsible lead (who must
//   hold a LEAD membership), the retention period and confirms they were validated.
// - Nothing here is indexed by search, shown in timelines or dashboards, or sent to AI. Lists carry no
//   observation, diagnosis or narrative. Every sensitive view, export, change and refusal is logged.
// - Clinic: visits record what was observed and done; medication is recorded only against an approved,
//   in-date instruction, with that instruction's dose — the system never prescribes. General staff see only
//   the care-plan summary the clinic wrote for them.
// - Safeguarding: any staff member can record a concern (source, observation, event time; never a
//   diagnosis). The reporter gets a receipt and no further access. Leads triage, assign an owner and escalate;
//   the chronology is append-only. No family is ever told automatically: a disclosure names exact content,
//   recipient and purpose, is approved by a second lead bound to that exact content, and can never go to a
//   guardian named as implicated.
// - Emergency access is a short, purpose-stated grant for one student; it is checked on every request (so an
//   expired or revoked grant stops views and exports at once) and every grant is reviewed by the domain lead.
// This module sends no notifications (see ./notify).

export type Domain = "CLINIC" | "SAFEGUARDING";
const DOMAINS: Domain[] = ["CLINIC", "SAFEGUARDING"];
const ROLES: Record<Domain, string[]> = { CLINIC: ["NURSE", "CLINIC_STAFF", "LEAD"], SAFEGUARDING: ["LEAD", "DEPUTY"] };
const OUTCOMES = ["RETURNED_TO_CLASS", "SENT_HOME", "EMERGENCY_SERVICES", "STAYED_IN_CLINIC"];
const SOURCES = ["STAFF_OBSERVATION", "DISCLOSURE_BY_PUPIL", "THIRD_PARTY", "OTHER"];
const ESCALATIONS = ["INTERNAL_REVIEW", "EXTERNAL_REFERRAL"];
const RECIPIENTS = ["GUARDIAN", "STAFF", "EXTERNAL_AGENCY"];
const MAX_EMERGENCY_MINUTES = 240;

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const required = (v: unknown, max: number, message: string) => {
  const s = String(v ?? "").trim();
  if (!s) throw new ApiError(message, 400);
  if (s.length > max) throw new ApiError(`Keep this under ${max} characters.`, 400);
  return s;
};
const domainOf = (v: unknown): Domain => {
  if (!DOMAINS.includes(v as Domain)) throw new ApiError("Choose the clinic or safeguarding workspace.", 400);
  return v as Domain;
};
const when = (v: unknown, fallback?: Date) => {
  if (v == null || v === "") { if (fallback) return fallback; throw new ApiError("Give the date and time.", 400); }
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ApiError("Give a valid date and time.", 400);
  return d;
};
export const contentHash = (content: string) => createHash("sha256").update(content).digest("hex");
const userCampus = (user: AuthUser, requested?: unknown) => {
  const campusId = user.role === "SUPER_ADMIN" ? String(requested || user.campusId || "") : user.campusId ?? "";
  if (!campusId) throw new ApiError("Choose a campus.", 400);
  return campusId;
};

// ─── Audit ───────────────────────────────────────────────────────────────

type Log = { domain: Domain; recordType: string; recordId?: string | null; studentId?: string | null; action: string; emergencyAccessId?: string | null };
async function log(user: AuthUser, entry: Log, tx: TxClient | typeof prisma = prisma) {
  await tx.confidentialAccessLog.create({ data: { schoolId: user.schoolId, actorId: user.userId, domain: entry.domain, recordType: entry.recordType, recordId: entry.recordId ?? null, studentId: entry.studentId ?? null, action: entry.action, emergencyAccessId: entry.emergencyAccessId ?? null } });
}
async function deny(user: AuthUser, entry: Omit<Log, "action">, message = "You do not have access to this confidential workspace.", status = 403): Promise<never> {
  await log(user, { ...entry, action: "DENIED" });
  throw new ApiError(message, status);
}

// ─── Access ──────────────────────────────────────────────────────────────

async function setting(schoolId: string, campusId: string, domain: Domain) {
  return prisma.confidentialSetting.findFirst({ where: { schoolId, campusId, domain } });
}
async function membership(user: AuthUser, domain: Domain) {
  if (isFamilyRole(user)) return null;
  return prisma.confidentialMember.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, domain, revokedAt: null, ...(user.campusId && user.role !== "SUPER_ADMIN" ? { campusId: user.campusId } : {}) }, orderBy: { createdAt: "asc" } });
}
/** An active membership in an enabled workspace, or a logged refusal. */
async function member(user: AuthUser, domain: Domain, roles?: string[]) {
  const m = await membership(user, domain);
  if (!m || (roles && !roles.includes(m.role))) return deny(user, { domain, recordType: "WORKSPACE" });
  const s = await setting(user.schoolId, m.campusId, domain);
  if (!s?.enabled) throw new ApiError("This confidential workspace has not been enabled for your campus.", 409);
  return m;
}
async function activeGrant(user: AuthUser, domain: Domain, studentId: string) {
  return prisma.emergencyAccess.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, domain, studentId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
}
/** Members of the student's campus, or the holder of a live emergency grant for this student. */
async function studentAccess(user: AuthUser, domain: Domain, studentId: string, recordType: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, fullName: true, campusId: true, admissionNo: true, class: { select: { name: true, section: true } } } });
  if (!student) throw new ApiError("Record unavailable.", 404);
  const m = await membership(user, domain);
  if (m && m.campusId === student.campusId) {
    if (!(await setting(user.schoolId, m.campusId, domain))?.enabled) throw new ApiError("This confidential workspace has not been enabled for your campus.", 409);
    return { student, member: m, grant: null };
  }
  const grant = await activeGrant(user, domain, studentId);
  if (grant) return { student, member: null, grant };
  return deny(user, { domain, recordType, studentId });
}
async function campusStudent(schoolId: string, campusId: string, studentId: string) {
  const s = await prisma.student.findFirst({ where: { id: studentId, schoolId, campusId, archivedAt: null }, select: { id: true, fullName: true, campusId: true } });
  if (!s) throw new ApiError("Choose a student at this campus.", 404);
  return s;
}
const names = async (schoolId: string, ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, string>();
  const rows = await prisma.user.findMany({ where: { schoolId, id: { in: unique } }, select: { id: true, fullName: true } });
  return new Map(rows.map(r => [r.id, r.fullName]));
};

/** What this person may open. Says nothing about whether any record exists. */
export async function workspaces(user: AuthUser) {
  const out: Record<string, unknown> = { canConfigure: canManageCampusOps(user), canReport: !isFamilyRole(user), canEmergency: { CLINIC: !isFamilyRole(user), SAFEGUARDING: canManageCampusOps(user) } };
  for (const domain of DOMAINS) {
    const m = await membership(user, domain);
    const s = m ? await setting(user.schoolId, m.campusId, domain) : null;
    out[domain] = m ? { role: m.role, campusId: m.campusId, enabled: !!s?.enabled } : null;
  }
  const grants = isFamilyRole(user) ? [] : await prisma.emergencyAccess.findMany({ where: { schoolId: user.schoolId, userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, domain: true, studentId: true, purpose: true, expiresAt: true } });
  const students = grants.length ? await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: grants.map(g => g.studentId) } }, select: { id: true, fullName: true } }) : [];
  out.grants = grants.map(g => ({ ...g, studentName: students.find(s => s.id === g.studentId)?.fullName ?? "" }));
  return out;
}

export async function findStudents(user: AuthUser, q: string) {
  assertStaffRole(user);
  const query = q.trim();
  if (query.length < 2) return [];
  const m = (await membership(user, "CLINIC")) ?? (await membership(user, "SAFEGUARDING"));
  const campusId = m?.campusId ?? user.campusId;
  return prisma.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(campusId ? { campusId } : {}), OR: [{ fullName: { contains: query, mode: "insensitive" } }, { rollNo: { contains: query } }] }, select: { id: true, fullName: true, rollNo: true, class: { select: { name: true, section: true } } }, take: 15 });
}

// ─── Settings and memberships (campus leaders) ───────────────────────────

function leader(user: AuthUser) {
  if (!canManageCampusOps(user)) throw new ApiError("Only campus leaders configure confidential workspaces.", 403);
}

export async function settings(user: AuthUser, campusIdParam?: string | null) {
  leader(user);
  const campusId = userCampus(user, campusIdParam);
  const [rows, members] = await Promise.all([
    prisma.confidentialSetting.findMany({ where: { schoolId: user.schoolId, campusId } }),
    prisma.confidentialMember.findMany({ where: { schoolId: user.schoolId, campusId, revokedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const people = await names(user.schoolId, [...members.map(m => m.userId), ...rows.map(r => r.leadUserId), ...rows.map(r => r.confirmedById)]);
  const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId }, { campusId: null }] }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" }, take: 300 });
  return {
    campusId,
    settings: DOMAINS.map(domain => {
      const r = rows.find(x => x.domain === domain);
      return { domain, enabled: !!r?.enabled, procedureReference: r?.procedureReference ?? "", leadUserId: r?.leadUserId ?? "", leadName: r?.leadUserId ? people.get(r.leadUserId) ?? "" : "", retentionMonths: r?.retentionMonths ?? null, confirmedAt: r?.confirmedAt ?? null, confirmedBy: r?.confirmedById ? people.get(r.confirmedById) ?? "" : "" };
    }),
    members: members.map(m => ({ id: m.id, domain: m.domain, role: m.role, userId: m.userId, name: people.get(m.userId) ?? "" })),
    staff,
  };
}

export async function configure(user: AuthUser, body: Record<string, unknown>) {
  leader(user);
  const campusId = userCampus(user, body.campusId), domain = domainOf(body.domain);
  const enabled = body.enabled === true;
  const procedureReference = text(body.procedureReference, 300) || null;
  const retentionMonths = body.retentionMonths == null || body.retentionMonths === "" ? null : Number(body.retentionMonths);
  if (retentionMonths != null && (!Number.isInteger(retentionMonths) || retentionMonths < 1 || retentionMonths > 1200)) throw new ApiError("Retention must be a whole number of months between 1 and 1200.", 400);
  const leadUserId = text(body.leadUserId, 64) || null;
  if (enabled) {
    if (!procedureReference) throw new ApiError("Record the local procedure this workspace follows before enabling it.", 400);
    if (!retentionMonths) throw new ApiError("Set how long closed records are retained before enabling it.", 400);
    if (!leadUserId) throw new ApiError("Name the responsible lead before enabling it.", 400);
    const lead = await prisma.confidentialMember.findFirst({ where: { schoolId: user.schoolId, campusId, domain, userId: leadUserId, role: "LEAD", revokedAt: null } });
    if (!lead) throw new ApiError("The responsible lead must first be added to this workspace as a lead.", 400);
    if (body.confirm !== true) throw new ApiError("Confirm the local procedure, lead and retention period were validated.", 400);
  }
  const confirmed = enabled ? { confirmedById: user.userId, confirmedAt: new Date() } : {};
  return prisma.confidentialSetting.upsert({
    where: { campusId_domain: { campusId, domain } },
    create: { schoolId: user.schoolId, campusId, domain, enabled, procedureReference, leadUserId, retentionMonths, ...confirmed },
    update: { enabled, procedureReference, leadUserId, retentionMonths, ...confirmed },
  });
}

export async function addMember(user: AuthUser, body: Record<string, unknown>) {
  leader(user);
  const campusId = userCampus(user, body.campusId), domain = domainOf(body.domain), role = String(body.role ?? "");
  if (!ROLES[domain].includes(role)) throw new ApiError("Choose a role this workspace allows.", 400);
  const target = await prisma.user.findFirst({ where: { id: String(body.userId ?? ""), schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId }, { campusId: null }] }, select: { id: true } });
  if (!target) throw new ApiError("Choose an active staff member at this campus.", 400);
  try {
    return await prisma.confidentialMember.create({ data: { schoolId: user.schoolId, campusId, domain, userId: target.id, role, grantedById: user.userId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This person already belongs to this workspace.", 409);
    throw error;
  }
}

export async function revokeMember(user: AuthUser, id: string) {
  leader(user);
  const row = await prisma.confidentialMember.findFirst({ where: { id, schoolId: user.schoolId, revokedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!row) throw new ApiError("Membership not found", 404);
  const s = await setting(user.schoolId, row.campusId, row.domain as Domain);
  if (s?.enabled && s.leadUserId === row.userId) throw new ApiError("Name a different responsible lead before removing this one.", 409);
  await prisma.confidentialMember.update({ where: { id }, data: { revokedAt: new Date() } });
  return { id };
}

// ─── Clinic ──────────────────────────────────────────────────────────────

const activeInstruction = (now = new Date()): Prisma.MedicationInstructionWhereInput => ({ endedAt: null, validFrom: { lte: now }, validUntil: { gt: now } });

/** Queue: names, times and outcomes only — never the observation. */
export async function clinicQueue(user: AuthUser) {
  const m = await member(user, "CLINIC");
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [visits, instructions] = await Promise.all([
    prisma.clinicVisit.findMany({ where: { schoolId: user.schoolId, campusId: m.campusId, arrivedAt: { gte: since } }, orderBy: { arrivedAt: "desc" }, take: 50, select: { id: true, studentId: true, arrivedAt: true, outcome: true } }),
    prisma.medicationInstruction.findMany({ where: { schoolId: user.schoolId, campusId: m.campusId, ...activeInstruction() }, orderBy: { validUntil: "asc" }, take: 100, select: { id: true, studentId: true, medicine: true, schedule: true, validUntil: true } }),
  ]);
  const students = await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set([...visits, ...instructions].map(r => r.studentId))] } }, select: { id: true, fullName: true } });
  const nameOf = (id: string) => students.find(s => s.id === id)?.fullName ?? "";
  await log(user, { domain: "CLINIC", recordType: "QUEUE", action: "VIEW" });
  return { role: m.role, visits: visits.map(v => ({ ...v, studentName: nameOf(v.studentId) })), instructions: instructions.map(i => ({ ...i, studentName: nameOf(i.studentId) })) };
}

export async function clinicRecord(user: AuthUser, studentId: string) {
  const { student, member: m, grant } = await studentAccess(user, "CLINIC", studentId, "CLINIC_RECORD");
  const [plan, instructions, visits, doses] = await Promise.all([
    prisma.carePlan.findFirst({ where: { schoolId: user.schoolId, studentId } }),
    prisma.medicationInstruction.findMany({ where: { schoolId: user.schoolId, studentId, ...(grant ? activeInstruction() : {}) }, orderBy: { validFrom: "desc" }, take: 50 }),
    // Emergency access shows what is needed to act now: the care plan and in-date instructions.
    grant ? Promise.resolve([]) : prisma.clinicVisit.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { arrivedAt: "desc" }, take: 50 }),
    grant ? Promise.resolve([]) : prisma.medicationDose.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { givenAt: "desc" }, take: 100 }),
  ]);
  const people = await names(user.schoolId, [plan?.updatedById, ...instructions.map(i => i.approvedById), ...visits.map(v => v.recordedById), ...doses.map(d => d.actorId)]);
  await log(user, { domain: "CLINIC", recordType: "CLINIC_RECORD", studentId, action: "VIEW", emergencyAccessId: grant?.id });
  const now = new Date();
  return {
    student: { id: student.id, fullName: student.fullName, className: student.class ? `${student.class.name}${student.class.section ? ` ${student.class.section}` : ""}` : "" },
    access: grant ? { emergency: true, expiresAt: grant.expiresAt, purpose: grant.purpose } : { emergency: false, role: m!.role },
    plan: plan ? { allergies: plan.allergies, actionPlan: plan.actionPlan, teacherSummary: plan.teacherSummary, updatedAt: plan.updatedAt, updatedBy: people.get(plan.updatedById) ?? "" } : null,
    instructions: instructions.map(i => ({ id: i.id, medicine: i.medicine, dose: i.dose, schedule: i.schedule, authorizedBy: i.authorizedBy, authorizationRef: i.authorizationRef, validFrom: i.validFrom, validUntil: i.validUntil, endedAt: i.endedAt, approvedBy: people.get(i.approvedById) ?? "", active: !i.endedAt && i.validFrom <= now && i.validUntil > now })),
    visits: visits.map(v => ({ id: v.id, arrivedAt: v.arrivedAt, observation: v.observation, actionTaken: v.actionTaken, outcome: v.outcome, recordedBy: people.get(v.recordedById) ?? "" })),
    doses: doses.map(d => ({ id: d.id, instructionId: d.instructionId, givenAt: d.givenAt, dose: d.dose, note: d.note, actor: people.get(d.actorId) ?? "" })),
  };
}

export async function recordVisit(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "CLINIC");
  const student = await campusStudent(user.schoolId, m.campusId, String(body.studentId ?? ""));
  const observation = required(body.observation, 4000, "Record what you observed.");
  const actionTaken = required(body.actionTaken, 2000, "Record what was done.");
  const outcome = String(body.outcome ?? "");
  if (!OUTCOMES.includes(outcome)) throw new ApiError("Choose the outcome of the visit.", 400);
  const arrivedAt = when(body.arrivedAt, new Date());
  if (arrivedAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError("The visit time cannot be in the future.", 400);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.clinicVisit.create({ data: { schoolId: user.schoolId, campusId: m.campusId, studentId: student.id, arrivedAt, observation, actionTaken, outcome, recordedById: user.userId } });
    await log(user, { domain: "CLINIC", recordType: "CLINIC_VISIT", recordId: row.id, studentId: student.id, action: "CREATE" }, tx);
    return { id: row.id };
  });
}

export async function saveCarePlan(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "CLINIC", ["NURSE", "LEAD"]);
  const student = await campusStudent(user.schoolId, m.campusId, String(body.studentId ?? ""));
  const data = { allergies: text(body.allergies, 2000) || null, actionPlan: text(body.actionPlan, 4000) || null, teacherSummary: text(body.teacherSummary, 600) || null, updatedById: user.userId };
  return schoolAiTransaction(user, async tx => {
    const row = await tx.carePlan.upsert({ where: { studentId: student.id }, create: { schoolId: user.schoolId, campusId: m.campusId, studentId: student.id, ...data }, update: data });
    await log(user, { domain: "CLINIC", recordType: "CARE_PLAN", recordId: row.id, studentId: student.id, action: "UPDATE" }, tx);
    return { id: row.id };
  });
}

/** Records the school's approved instruction as received from the authorizing professional and family. */
export async function addInstruction(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "CLINIC", ["NURSE", "LEAD"]);
  const student = await campusStudent(user.schoolId, m.campusId, String(body.studentId ?? ""));
  const data = {
    medicine: required(body.medicine, 200, "Name the medicine as written on the instruction."),
    dose: required(body.dose, 100, "Give the dose as written on the instruction."),
    schedule: required(body.schedule, 300, "Give when it may be given, as written on the instruction."),
    authorizedBy: required(body.authorizedBy, 200, "Name who authorized it."),
    authorizationRef: required(body.authorizationRef, 120, "Give the reference of the signed authorization."),
    validFrom: when(body.validFrom), validUntil: when(body.validUntil),
  };
  if (data.validUntil <= data.validFrom) throw new ApiError("The instruction must end after it starts.", 400);
  return schoolAiTransaction(user, async tx => {
    const row = await tx.medicationInstruction.create({ data: { schoolId: user.schoolId, campusId: m.campusId, studentId: student.id, approvedById: user.userId, ...data } });
    await log(user, { domain: "CLINIC", recordType: "MEDICATION_INSTRUCTION", recordId: row.id, studentId: student.id, action: "CREATE" }, tx);
    return { id: row.id };
  });
}

export async function endInstruction(user: AuthUser, id: string) {
  const m = await member(user, "CLINIC", ["NURSE", "LEAD"]);
  return schoolAiTransaction(user, async tx => {
    const done = await tx.medicationInstruction.updateMany({ where: { id, schoolId: user.schoolId, campusId: m.campusId, endedAt: null }, data: { endedAt: new Date() } });
    if (!done.count) throw new ApiError("Instruction not found or already ended", 404);
    const row = await tx.medicationInstruction.findFirstOrThrow({ where: { id }, select: { studentId: true } });
    await log(user, { domain: "CLINIC", recordType: "MEDICATION_INSTRUCTION", recordId: id, studentId: row.studentId, action: "UPDATE" }, tx);
    return { id };
  });
}

/** Records a dose given: only against an active instruction, and only that instruction's dose. */
export async function recordDose(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "CLINIC");
  const givenAt = when(body.givenAt, new Date());
  if (givenAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError("The time given cannot be in the future.", 400);
  const dose = required(body.dose, 100, "Give the dose given.");
  return schoolAiTransaction(user, async tx => {
    const ins = await tx.medicationInstruction.findFirst({ where: { id: String(body.instructionId ?? ""), schoolId: user.schoolId, campusId: m.campusId } });
    if (!ins) throw new ApiError("Instruction not found", 404);
    if (ins.endedAt || ins.validFrom > givenAt || ins.validUntil <= givenAt) throw new ApiError("There is no approved instruction in effect at that time. Do not give the medicine; contact the family and the authorizing professional.", 409);
    if (dose.replace(/\s+/g, " ").toLowerCase() !== ins.dose.replace(/\s+/g, " ").toLowerCase()) throw new ApiError(`The dose must match the approved instruction (${ins.dose}). The clinic cannot change a dose.`, 409);
    const row = await tx.medicationDose.create({ data: { schoolId: user.schoolId, instructionId: ins.id, studentId: ins.studentId, givenAt, dose: ins.dose, actorId: user.userId, note: text(body.note, 500) || null } });
    await log(user, { domain: "CLINIC", recordType: "MEDICATION_DOSE", recordId: row.id, studentId: ins.studentId, action: "CREATE" }, tx);
    return { id: row.id };
  });
}

/** General staff at the student's campus see the summary the clinic wrote for them — nothing else. */
export async function careSummary(user: AuthUser, studentId: string) {
  assertStaffRole(user);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true } });
  if (!student) throw new ApiError("Student not found", 404);
  const plan = await prisma.carePlan.findFirst({ where: { schoolId: user.schoolId, studentId }, select: { teacherSummary: true, updatedAt: true } });
  await log(user, { domain: "CLINIC", recordType: "CARE_SUMMARY", studentId, action: "VIEW" });
  return { summary: plan?.teacherSummary ?? null, updatedAt: plan?.teacherSummary ? plan.updatedAt : null };
}

// ─── Safeguarding ────────────────────────────────────────────────────────

async function nextReference(tx: TxClient, schoolId: string) {
  const count = await tx.safeguardingConcern.count({ where: { schoolId } });
  return `SG-${String(count + 1).padStart(3, "0")}`;
}
async function entry(tx: TxClient, user: AuthUser, concernId: string, kind: string, body: string | null, detail: Record<string, unknown> = {}) {
  await tx.safeguardingEntry.create({ data: { schoolId: user.schoolId, concernId, kind, body, detail: detail as Prisma.InputJsonValue, actorId: user.userId } });
}

/** Any staff member records what they observed. Returns a receipt; the reporter gets no further access. */
export async function reportConcern(user: AuthUser, body: Record<string, unknown>) {
  assertStaffRole(user);
  const idempotencyKey = text(body.idempotencyKey, 80);
  if (idempotencyKey.length < 8) throw new ApiError("Missing submission key; reload and try again.", 400);
  const existing = await prisma.safeguardingConcern.findFirst({ where: { reporterId: user.userId, idempotencyKey, schoolId: user.schoolId }, select: { id: true, reference: true, campusId: true, createdAt: true } });
  if (existing) return { ...existing, created: false };
  const student = await prisma.student.findFirst({ where: { id: String(body.studentId ?? ""), schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true } });
  if (!student) throw new ApiError("Choose a student at your campus.", 404);
  const s = await setting(user.schoolId, student.campusId, "SAFEGUARDING");
  if (!s?.enabled) throw new ApiError("The safeguarding workspace is not enabled for this campus. Follow your local safeguarding procedure and speak to the designated lead now.", 409);
  const source = String(body.source ?? "");
  if (!SOURCES.includes(source)) throw new ApiError("Say how this came to your attention.", 400);
  const observation = required(body.observation, 6000, "Record what you observed or were told, in the words used.");
  const eventAt = when(body.eventAt);
  if (eventAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError("The time of the event cannot be in the future.", 400);
  // The reporter cannot see the family; "a parent or carer is involved" marks every current guardian as
  // implicated until a lead narrows it, so nothing about the case can reach them in the meantime.
  const implicated = body.guardianInvolved === true ? (await prisma.guardianRelationship.findMany({ where: { ...guardianRelationshipAuthorityWhere(null, new Date(), user.schoolId), studentId: student.id }, select: { guardianUserId: true } })).map(g => g.guardianUserId).filter(Boolean) as string[] : [];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await schoolAiTransaction(user, async tx => {
        const row = await tx.safeguardingConcern.create({ data: { schoolId: user.schoolId, campusId: student.campusId, reference: await nextReference(tx, user.schoolId), studentId: student.id, source, observation, eventAt, reporterId: user.userId, implicatedGuardianIds: implicated, idempotencyKey } });
        await entry(tx, user, row.id, "CREATED", null, { source });
        await log(user, { domain: "SAFEGUARDING", recordType: "CONCERN", recordId: row.id, studentId: student.id, action: "CREATE" }, tx);
        return { id: row.id, reference: row.reference, campusId: row.campusId, createdAt: row.createdAt, created: true };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const again = await prisma.safeguardingConcern.findFirst({ where: { reporterId: user.userId, idempotencyKey, schoolId: user.schoolId }, select: { id: true, reference: true, campusId: true, createdAt: true } });
      if (again) return { ...again, created: false };
    }
  }
  throw new ApiError("Could not record the concern; your text is still on this page. Try again.", 503);
}

export async function myReports(user: AuthUser) {
  assertStaffRole(user);
  return prisma.safeguardingConcern.findMany({ where: { schoolId: user.schoolId, reporterId: user.userId }, orderBy: { createdAt: "desc" }, take: 20, select: { reference: true, createdAt: true } });
}

/** Lead queue: reference, status, owner and dates — no names, observations or conclusions. */
export async function safeguardingQueue(user: AuthUser) {
  const m = await member(user, "SAFEGUARDING");
  const s = await setting(user.schoolId, m.campusId, "SAFEGUARDING");
  const rows = await prisma.safeguardingConcern.findMany({ where: { schoolId: user.schoolId, campusId: m.campusId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200, select: { id: true, reference: true, status: true, escalation: true, ownerId: true, source: true, eventAt: true, createdAt: true, closedAt: true, disclosures: { where: { status: "PROPOSED" }, select: { id: true } } } });
  const people = await names(user.schoolId, rows.map(r => r.ownerId));
  const members = await prisma.confidentialMember.findMany({ where: { schoolId: user.schoolId, campusId: m.campusId, domain: "SAFEGUARDING", revokedAt: null }, select: { userId: true, role: true } });
  const memberNames = await names(user.schoolId, members.map(x => x.userId));
  const retentionCutoff = s?.retentionMonths ? new Date(Date.now() - s.retentionMonths * 30.44 * 86_400_000) : null;
  await log(user, { domain: "SAFEGUARDING", recordType: "QUEUE", action: "VIEW" });
  return {
    role: m.role, userId: user.userId,
    members: members.map(x => ({ userId: x.userId, role: x.role, name: memberNames.get(x.userId) ?? "" })),
    concerns: rows.map(r => ({ id: r.id, reference: r.reference, status: r.status, escalation: r.escalation, owner: r.ownerId ? people.get(r.ownerId) ?? "" : null, mine: r.ownerId === user.userId, source: r.source, eventAt: r.eventAt, createdAt: r.createdAt, pendingDisclosures: r.disclosures.length, retentionDue: !!(retentionCutoff && r.closedAt && r.closedAt < retentionCutoff) })),
  };
}

async function concernAccess(user: AuthUser, concernId: string, recordType = "CONCERN") {
  const c = await prisma.safeguardingConcern.findFirst({ where: { id: concernId, schoolId: user.schoolId } });
  // Unknown and forbidden look the same, so the response never confirms a case exists.
  if (!c) return deny(user, { domain: "SAFEGUARDING", recordType, recordId: concernId }, "Record unavailable.", 404);
  const m = await membership(user, "SAFEGUARDING");
  if (m && m.campusId === c.campusId && (await setting(user.schoolId, m.campusId, "SAFEGUARDING"))?.enabled) return { concern: c, member: m, grant: null };
  const grant = await activeGrant(user, "SAFEGUARDING", c.studentId);
  if (grant) return { concern: c, member: null, grant };
  return deny(user, { domain: "SAFEGUARDING", recordType, recordId: concernId }, "Record unavailable.", 404);
}

export async function concernDetail(user: AuthUser, concernId: string) {
  const { concern: c, member: m, grant } = await concernAccess(user, concernId);
  const [student, entries, disclosures, guardians] = await Promise.all([
    prisma.student.findFirst({ where: { id: c.studentId, schoolId: user.schoolId }, select: { id: true, fullName: true, class: { select: { name: true, section: true } } } }),
    prisma.safeguardingEntry.findMany({ where: { schoolId: user.schoolId, concernId: c.id }, orderBy: { createdAt: "asc" } }),
    prisma.safeguardingDisclosure.findMany({ where: { schoolId: user.schoolId, concernId: c.id }, orderBy: { createdAt: "desc" } }),
    prisma.guardianRelationship.findMany({ where: { ...guardianRelationshipAuthorityWhere(null, new Date(), user.schoolId), studentId: c.studentId }, select: { guardianUserId: true, fullName: true, relationship: true } }),
  ]);
  const people = await names(user.schoolId, [c.reporterId, c.ownerId, ...entries.map(e => e.actorId), ...disclosures.flatMap(d => [d.proposedById, d.reviewedById])]);
  await log(user, { domain: "SAFEGUARDING", recordType: "CONCERN", recordId: c.id, studentId: c.studentId, action: "VIEW", emergencyAccessId: grant?.id });
  return {
    access: grant ? { emergency: true, expiresAt: grant.expiresAt, purpose: grant.purpose } : { emergency: false, role: m!.role },
    concern: { id: c.id, reference: c.reference, status: c.status, escalation: c.escalation, source: c.source, observation: c.observation, eventAt: c.eventAt, createdAt: c.createdAt, closedAt: c.closedAt, version: c.version, reporter: people.get(c.reporterId) ?? "", ownerId: c.ownerId, owner: c.ownerId ? people.get(c.ownerId) ?? "" : null },
    student: student ? { id: student.id, fullName: student.fullName, className: student.class ? `${student.class.name}${student.class.section ? ` ${student.class.section}` : ""}` : "" } : null,
    entries: entries.map(e => ({ id: e.id, kind: e.kind, body: e.body, detail: e.detail, actor: people.get(e.actorId) ?? "", createdAt: e.createdAt })),
    disclosures: disclosures.map(d => ({ id: d.id, recipientType: d.recipientType, recipientName: d.recipientName, purpose: d.purpose, content: d.content, contentHash: d.contentHash, status: d.status, proposedBy: people.get(d.proposedById) ?? "", proposedByMe: d.proposedById === user.userId, reviewedBy: d.reviewedById ? people.get(d.reviewedById) ?? "" : null, reviewedAt: d.reviewedAt, releasedAt: d.releasedAt, createdAt: d.createdAt })),
    guardians: guardians.filter(g => g.guardianUserId).map(g => ({ userId: g.guardianUserId!, name: g.fullName, relationship: g.relationship, implicated: c.implicatedGuardianIds.includes(g.guardianUserId!) })),
  };
}

/** Lead actions change the case under its version so two leads never overwrite each other. */
async function leadChange(user: AuthUser, body: Record<string, unknown>, change: (tx: TxClient, c: Prisma.SafeguardingConcernGetPayload<object>, m: { campusId: string }) => Promise<{ data: Prisma.SafeguardingConcernUpdateManyMutationInput; kind: string; text: string | null; detail?: Record<string, unknown> }>) {
  const m = await member(user, "SAFEGUARDING");
  const version = Number(body.version);
  return schoolAiTransaction(user, async tx => {
    const c = await tx.safeguardingConcern.findFirst({ where: { id: String(body.concernId ?? ""), schoolId: user.schoolId, campusId: m.campusId } });
    if (!c) throw new ApiError("Record unavailable.", 404);
    if (c.status === "CLOSED" && body.action !== "note") throw new ApiError("This case is closed. Its chronology is retained as it stands.", 409);
    const { data, kind, text: note, detail } = await change(tx, c, m);
    const done = await tx.safeguardingConcern.updateMany({ where: { id: c.id, version }, data: { ...data, version: { increment: 1 } } });
    if (!done.count) throw new ApiError("Someone else updated this case. Reload to see the latest chronology.", 409);
    await entry(tx, user, c.id, kind, note, detail);
    await log(user, { domain: "SAFEGUARDING", recordType: "CONCERN", recordId: c.id, studentId: c.studentId, action: "UPDATE" }, tx);
    return { id: c.id, campusId: c.campusId, ownerId: (data.ownerId as string | undefined) ?? c.ownerId };
  });
}

export async function assignOwner(user: AuthUser, body: Record<string, unknown>) {
  return leadChange(user, body, async (tx, c, m) => {
    const ownerId = String(body.ownerId ?? "");
    const owner = await tx.confidentialMember.findFirst({ where: { schoolId: user.schoolId, campusId: m.campusId, domain: "SAFEGUARDING", userId: ownerId, revokedAt: null } });
    if (!owner) throw new ApiError("The owner must be a member of the safeguarding workspace.", 400);
    return { data: { ownerId, status: c.status === "NEW" ? "TRIAGED" : c.status }, kind: "OWNER", text: null, detail: { ownerId } };
  });
}

export async function escalate(user: AuthUser, body: Record<string, unknown>) {
  return leadChange(user, body, async (_tx, c) => {
    const escalation = String(body.escalation ?? "");
    if (!ESCALATIONS.includes(escalation)) throw new ApiError("Choose the escalation.", 400);
    if (!c.ownerId) throw new ApiError("Assign an owner before escalating.", 409);
    return { data: { escalation, status: "ESCALATED" }, kind: "ESCALATION", text: required(body.reason, 2000, "Record why this is being escalated."), detail: { escalation } };
  });
}

export async function addNote(user: AuthUser, body: Record<string, unknown>) {
  return leadChange(user, { ...body, action: "note" }, async () => ({ data: {}, kind: "NOTE", text: required(body.body, 4000, "Write the note.") }));
}

/** Leads narrow (or widen) which guardians are named in the concern; it is recorded in the chronology. */
export async function setImplicated(user: AuthUser, body: Record<string, unknown>) {
  return leadChange(user, body, async (tx, c) => {
    const ids = Array.isArray(body.guardianUserIds) ? [...new Set(body.guardianUserIds.map(String))].slice(0, 10) : [];
    const live = await tx.guardianRelationship.findMany({ where: { schoolId: user.schoolId, studentId: c.studentId, guardianUserId: { in: ids } }, select: { guardianUserId: true } });
    if (live.length !== ids.length) throw new ApiError("Choose guardians of this student.", 400);
    return { data: { implicatedGuardianIds: ids }, kind: "NOTE", text: required(body.reason, 1000, "Record why this changed."), detail: { implicatedCount: ids.length } };
  });
}

/** Case ids for one student — for a lead, or for the holder of a live emergency grant. */
export async function concernsForStudent(user: AuthUser, studentId: string) {
  const { grant } = await studentAccess(user, "SAFEGUARDING", studentId, "CONCERN_LIST");
  const rows = await prisma.safeguardingConcern.findMany({ where: { schoolId: user.schoolId, studentId }, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, status: true, createdAt: true } });
  await log(user, { domain: "SAFEGUARDING", recordType: "CONCERN_LIST", studentId, action: "VIEW", emergencyAccessId: grant?.id });
  return rows;
}

export async function closeConcern(user: AuthUser, body: Record<string, unknown>) {
  return leadChange(user, body, async (_tx, c) => {
    if (!c.ownerId) throw new ApiError("Assign an owner before closing.", 409);
    return { data: { status: "CLOSED", closedAt: new Date() }, kind: "CLOSED", text: required(body.reason, 2000, "Record why the case is being closed.") };
  });
}

// ─── Disclosure ──────────────────────────────────────────────────────────

export async function proposeDisclosure(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "SAFEGUARDING");
  const recipientType = String(body.recipientType ?? "");
  if (!RECIPIENTS.includes(recipientType)) throw new ApiError("Choose who will receive this.", 400);
  const purpose = required(body.purpose, 200, "State the purpose of this disclosure.");
  const content = required(body.content, 4000, "Write exactly what will be shared.");
  return schoolAiTransaction(user, async tx => {
    const c = await tx.safeguardingConcern.findFirst({ where: { id: String(body.concernId ?? ""), schoolId: user.schoolId, campusId: m.campusId } });
    if (!c) throw new ApiError("Record unavailable.", 404);
    let recipientUserId: string | null = null, recipientName = text(body.recipientName, 160);
    if (recipientType === "GUARDIAN") {
      recipientUserId = String(body.recipientUserId ?? "");
      if (c.implicatedGuardianIds.includes(recipientUserId)) throw new ApiError("This guardian is named in the concern. Nothing about the case can be shared with them.", 409);
      const g = await tx.guardianRelationship.findFirst({ where: { ...guardianRelationshipAuthorityWhere(recipientUserId, new Date(), user.schoolId), studentId: c.studentId }, select: { fullName: true } });
      if (!g) throw new ApiError("Choose a current guardian of this student.", 400);
      recipientName = g.fullName;
    } else if (recipientType === "STAFF") {
      recipientUserId = String(body.recipientUserId ?? "");
      const s = await tx.user.findFirst({ where: { id: recipientUserId, schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } }, select: { fullName: true } });
      if (!s) throw new ApiError("Choose an active staff member.", 400);
      recipientName = s.fullName;
    } else if (recipientName.length < 3) throw new ApiError("Name the agency and contact.", 400);
    const row = await tx.safeguardingDisclosure.create({ data: { schoolId: user.schoolId, concernId: c.id, recipientType, recipientUserId, recipientName, purpose, content, contentHash: contentHash(content), proposedById: user.userId } });
    await entry(tx, user, c.id, "DISCLOSURE", null, { disclosureId: row.id, status: "PROPOSED", recipientType, recipientName, purpose });
    await log(user, { domain: "SAFEGUARDING", recordType: "DISCLOSURE", recordId: row.id, studentId: c.studentId, action: "CREATE" }, tx);
    return { id: row.id, campusId: c.campusId };
  });
}

/** Staff a safeguarding member may name as a disclosure recipient: active staff at their campus. */
export async function disclosureStaff(user: AuthUser) {
  const m = await member(user, "SAFEGUARDING");
  return prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] }, OR: [{ campusId: m.campusId }, { campusId: null }] }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 300 });
}

/** A second lead approves the exact content shown to them; a changed text no longer matches. */
export async function reviewDisclosure(user: AuthUser, body: Record<string, unknown>) {
  const m = await member(user, "SAFEGUARDING", ["LEAD", "DEPUTY"]);
  const decision = String(body.decision ?? "");
  if (decision !== "APPROVE" && decision !== "DECLINE") throw new ApiError("Approve or keep restricted.", 400);
  return schoolAiTransaction(user, async tx => {
    const d = await tx.safeguardingDisclosure.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, concern: { campusId: m.campusId } }, include: { concern: { select: { id: true, studentId: true, implicatedGuardianIds: true } } } });
    if (!d) throw new ApiError("Disclosure not found", 404);
    if (d.proposedById === user.userId) throw new ApiError("A different lead must review a disclosure you proposed.", 403);
    if (decision === "APPROVE" && String(body.contentHash ?? "") !== d.contentHash) throw new ApiError("The content changed since you opened it. Review the current text.", 409);
    if (decision === "APPROVE" && d.recipientUserId && d.concern.implicatedGuardianIds.includes(d.recipientUserId)) throw new ApiError("This guardian is named in the concern. Nothing about the case can be shared with them.", 409);
    const status = decision === "APPROVE" ? "APPROVED" : "DECLINED";
    const done = await tx.safeguardingDisclosure.updateMany({ where: { id: d.id, status: "PROPOSED" }, data: { status, reviewedById: user.userId, reviewedAt: new Date() } });
    if (!done.count) throw new ApiError("This disclosure was already reviewed.", 409);
    await entry(tx, user, d.concern.id, "DISCLOSURE", text(body.note, 1000) || null, { disclosureId: d.id, status });
    await log(user, { domain: "SAFEGUARDING", recordType: "DISCLOSURE", recordId: d.id, studentId: d.concern.studentId, action: "UPDATE" }, tx);
    return { id: d.id, status };
  });
}

/** Marks an approved disclosure released. The route delivers it to an in-app recipient. */
export async function releaseDisclosure(user: AuthUser, id: string) {
  const m = await member(user, "SAFEGUARDING");
  return schoolAiTransaction(user, async tx => {
    const d = await tx.safeguardingDisclosure.findFirst({ where: { id, schoolId: user.schoolId, concern: { campusId: m.campusId } }, include: { concern: { select: { id: true, studentId: true, campusId: true, implicatedGuardianIds: true } } } });
    if (!d) throw new ApiError("Disclosure not found", 404);
    if (d.contentHash !== contentHash(d.content)) throw new ApiError("The content no longer matches what was approved.", 409);
    if (d.recipientUserId && d.concern.implicatedGuardianIds.includes(d.recipientUserId)) throw new ApiError("This guardian is named in the concern. Nothing about the case can be shared with them.", 409);
    const done = await tx.safeguardingDisclosure.updateMany({ where: { id, status: "APPROVED" }, data: { status: "RELEASED", releasedAt: new Date() } });
    if (!done.count) throw new ApiError("Only an approved disclosure can be released.", 409);
    await entry(tx, user, d.concern.id, "DISCLOSURE", null, { disclosureId: d.id, status: "RELEASED" });
    await log(user, { domain: "SAFEGUARDING", recordType: "DISCLOSURE", recordId: d.id, studentId: d.concern.studentId, action: "UPDATE" }, tx);
    return { id: d.id, recipientType: d.recipientType, recipientUserId: d.recipientUserId, campusId: d.concern.campusId };
  });
}

/** Released messages addressed to this person: the approved text and date only, no case reference. */
export async function messagesForMe(user: AuthUser) {
  const rows = await prisma.safeguardingDisclosure.findMany({ where: { schoolId: user.schoolId, recipientUserId: user.userId, status: "RELEASED", recipientType: isFamilyRole(user) ? "GUARDIAN" : "STAFF" }, orderBy: { releasedAt: "desc" }, take: 20, select: { id: true, purpose: true, content: true, releasedAt: true } });
  return rows;
}

// ─── Export ──────────────────────────────────────────────────────────────

const stamp = (d: Date | null | undefined) => d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "";

/** One case's chronology only — no other student, case or clinic detail. Checked live on every request. */
export async function exportConcern(user: AuthUser, concernId: string) {
  const { concern: c, member: m, grant } = await concernAccess(user, concernId, "CONCERN_EXPORT");
  if (m && !["LEAD", "DEPUTY"].includes(m.role) && c.ownerId !== user.userId) return deny(user, { domain: "SAFEGUARDING", recordType: "CONCERN_EXPORT", recordId: c.id });
  const entries = await prisma.safeguardingEntry.findMany({ where: { schoolId: user.schoolId, concernId: c.id }, orderBy: { createdAt: "asc" } });
  const people = await names(user.schoolId, [c.reporterId, c.ownerId, ...entries.map(e => e.actorId)]);
  await log(user, { domain: "SAFEGUARDING", recordType: "CONCERN_EXPORT", recordId: c.id, studentId: c.studentId, action: "EXPORT", emergencyAccessId: grant?.id });
  const lines = [
    `CONFIDENTIAL — safeguarding case ${c.reference}`,
    `Exported ${stamp(new Date())} by ${people.get(user.userId) ?? user.userId}${grant ? " under emergency access" : ""}`,
    `Status: ${c.status}${c.escalation ? ` · ${c.escalation}` : ""} · Owner: ${c.ownerId ? people.get(c.ownerId) ?? "" : "unassigned"}`,
    `Source: ${c.source} · Event: ${stamp(c.eventAt)} · Reported by ${people.get(c.reporterId) ?? ""} at ${stamp(c.createdAt)}`,
    "", "Observation (as recorded):", c.observation, "", "Chronology:",
    ...entries.map(e => `${stamp(e.createdAt)} · ${e.kind} · ${people.get(e.actorId) ?? ""}${e.body ? ` — ${e.body}` : ""}`),
  ];
  return { filename: `${c.reference}.txt`, body: lines.join("\n") };
}

export async function exportClinic(user: AuthUser, studentId: string) {
  const record = await clinicRecord(user, studentId);
  await log(user, { domain: "CLINIC", recordType: "CLINIC_EXPORT", studentId, action: "EXPORT" });
  const lines = [
    `CONFIDENTIAL — clinic record for ${record.student.fullName}`,
    `Exported ${stamp(new Date())}${record.access.emergency ? " under emergency access" : ""}`,
    "", `Allergies: ${record.plan?.allergies ?? "none recorded"}`, `Action plan: ${record.plan?.actionPlan ?? "none recorded"}`,
    "", "Medication instructions:", ...record.instructions.map(i => `${i.medicine} · ${i.dose} · ${i.schedule} · ${stamp(i.validFrom)}–${stamp(i.validUntil)} · ref ${i.authorizationRef}${i.endedAt ? " · ended" : ""}`),
    "", "Doses given:", ...record.doses.map(d => `${stamp(d.givenAt)} · ${d.dose} · ${d.actor}`),
    "", "Visits:", ...record.visits.map(v => `${stamp(v.arrivedAt)} · ${v.outcome} · ${v.observation} · ${v.actionTaken}`),
  ];
  return { filename: "clinic-record.txt", body: lines.join("\n") };
}

// ─── Emergency access ────────────────────────────────────────────────────

export async function openEmergency(user: AuthUser, body: Record<string, unknown>) {
  assertStaffRole(user);
  const domain = domainOf(body.domain);
  if (domain === "SAFEGUARDING" && !canManageCampusOps(user)) return deny(user, { domain, recordType: "EMERGENCY_ACCESS" }, "Only a campus leader can open emergency safeguarding access.");
  const student = await prisma.student.findFirst({ where: { id: String(body.studentId ?? ""), schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true } });
  if (!student) throw new ApiError("Choose a student at your campus.", 404);
  if (!(await setting(user.schoolId, student.campusId, domain))?.enabled) throw new ApiError("This confidential workspace has not been enabled for this campus.", 409);
  const purpose = required(body.purpose, 300, "State why you need emergency access.");
  const minutes = Number(body.minutes ?? 60);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > MAX_EMERGENCY_MINUTES) throw new ApiError(`Emergency access lasts between 5 and ${MAX_EMERGENCY_MINUTES} minutes.`, 400);
  return schoolAiTransaction(user, async tx => {
    const now = new Date();
    const row = await tx.emergencyAccess.create({ data: { schoolId: user.schoolId, campusId: student.campusId, domain, userId: user.userId, studentId: student.id, purpose, createdAt: now, expiresAt: new Date(now.getTime() + minutes * 60_000) } });
    await log(user, { domain, recordType: "EMERGENCY_ACCESS", recordId: row.id, studentId: student.id, action: "EMERGENCY_OPEN", emergencyAccessId: row.id }, tx);
    return { id: row.id, domain, campusId: student.campusId, expiresAt: row.expiresAt };
  });
}

export async function revokeEmergency(user: AuthUser, id: string) {
  const row = await prisma.emergencyAccess.findFirst({ where: { id, schoolId: user.schoolId, revokedAt: null } });
  if (!row) throw new ApiError("Emergency access not found", 404);
  const lead = await membership(user, row.domain as Domain);
  if (row.userId !== user.userId && !(lead?.role === "LEAD" && lead.campusId === row.campusId)) return deny(user, { domain: row.domain as Domain, recordType: "EMERGENCY_ACCESS", recordId: id });
  await prisma.emergencyAccess.update({ where: { id }, data: { revokedAt: new Date() } });
  await log(user, { domain: row.domain as Domain, recordType: "EMERGENCY_ACCESS", recordId: id, studentId: row.studentId, action: "EMERGENCY_REVOKE", emergencyAccessId: id });
  return { id };
}

/** The domain lead reviews every emergency grant, and sees what it was used for. */
export async function oversight(user: AuthUser, domainParam: string | null) {
  const domain = domainOf(domainParam);
  const m = await member(user, domain, ["LEAD"]);
  const [grants, logs] = await Promise.all([
    prisma.emergencyAccess.findMany({ where: { schoolId: user.schoolId, campusId: m.campusId, domain }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.confidentialAccessLog.findMany({ where: { schoolId: user.schoolId, domain }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const people = await names(user.schoolId, [...grants.flatMap(g => [g.userId, g.reviewedById]), ...logs.map(l => l.actorId)]);
  const students = await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(grants.map(g => g.studentId))] } }, select: { id: true, fullName: true } });
  const used = await prisma.confidentialAccessLog.groupBy({ by: ["emergencyAccessId"], where: { schoolId: user.schoolId, emergencyAccessId: { in: grants.map(g => g.id) }, action: { in: ["VIEW", "EXPORT"] } }, _count: { _all: true } });
  const now = new Date();
  await log(user, { domain, recordType: "OVERSIGHT", action: "VIEW" });
  return {
    grants: grants.map(g => ({ id: g.id, user: people.get(g.userId) ?? "", studentName: students.find(s => s.id === g.studentId)?.fullName ?? "", purpose: g.purpose, createdAt: g.createdAt, expiresAt: g.expiresAt, revokedAt: g.revokedAt, live: !g.revokedAt && g.expiresAt > now, uses: used.find(u => u.emergencyAccessId === g.id)?._count._all ?? 0, reviewedAt: g.reviewedAt, reviewedBy: g.reviewedById ? people.get(g.reviewedById) ?? "" : null, reviewNote: g.reviewNote })),
    logs: logs.map(l => ({ id: l.id, actor: people.get(l.actorId) ?? "", action: l.action, recordType: l.recordType, emergency: !!l.emergencyAccessId, createdAt: l.createdAt })),
  };
}

export async function reviewEmergency(user: AuthUser, body: Record<string, unknown>) {
  const row = await prisma.emergencyAccess.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!row) throw new ApiError("Emergency access not found", 404);
  const m = await member(user, row.domain as Domain, ["LEAD"]);
  if (m.campusId !== row.campusId) throw new ApiError("Emergency access not found", 404);
  if (row.userId === user.userId) throw new ApiError("Another lead must review your own emergency access.", 403);
  const note = required(body.note, 1000, "Record the outcome of the review.");
  const done = await prisma.emergencyAccess.updateMany({ where: { id: row.id, reviewedAt: null }, data: { reviewedAt: new Date(), reviewedById: user.userId, reviewNote: note, ...(row.revokedAt || row.expiresAt <= new Date() ? {} : { revokedAt: new Date() }) } });
  if (!done.count) throw new ApiError("This emergency access was already reviewed.", 409);
  await log(user, { domain: row.domain as Domain, recordType: "EMERGENCY_ACCESS", recordId: row.id, studentId: row.studentId, action: "EMERGENCY_REVIEW", emergencyAccessId: row.id });
  return { id: row.id };
}

/** Leads to notify; only ids — the notice itself names no student or case. */
export async function domainLeads(schoolId: string, campusId: string, domain: Domain, roles = ["LEAD", "DEPUTY"]) {
  const rows = await prisma.confidentialMember.findMany({ where: { schoolId, campusId, domain, revokedAt: null, role: { in: roles } }, select: { userId: true } });
  return [...new Set(rows.map(r => r.userId))];
}
