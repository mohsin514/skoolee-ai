import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolToday } from "@/lib/datetime";

/**
 * SKO-450 improvement and accreditation evidence. Frameworks are school-configured references; nothing here
 * decides or implies an accreditation outcome. Evidence points at one source record and the version it had when
 * linked, so a later change to the source shows as stale instead of silently counting. Improvement actions may
 * reference an SKO-425 learning action but never change it. Packs freeze a manifest with a digest; the digest
 * proves the file is unchanged, not that the evidence is educationally sound.
 */

const LEADS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const NOT_STAFF = ["PARENT", "STUDENT"];
const SOURCE_TYPES = ["INTERVENTION", "REPORT_CARD", "CLINIC_VISIT", "CARE_PLAN", "DOCUMENT"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];
export const DISCLAIMER = "School-configured framework. No accreditation outcome is implied.";
export const CAUSE_CAVEAT = "Observed change · cause not established";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date (YYYY-MM-DD).");
const json = (value: unknown) => value as Prisma.InputJsonValue;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assert(cond: unknown, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
const isLead = (user: AuthUser) => LEADS.includes(user.role);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

async function clinicMember(user: AuthUser) {
  return !!(await prisma.confidentialMember.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, domain: "CLINIC", revokedAt: null }, select: { id: true } }));
}

type Access = { mode: "LEAD" | "STAFF" | "REVIEWER"; criteria: Set<string> | null; clinic: boolean };
async function access(user: AuthUser, frameworkId: string): Promise<Access> {
  const clinic = await clinicMember(user);
  if (isLead(user)) return { mode: "LEAD", criteria: null, clinic };
  const grants = await prisma.evidenceReviewerGrant.findMany({ where: { schoolId: user.schoolId, frameworkId, userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (grants.length) return { mode: "REVIEWER", criteria: new Set(grants.flatMap(g => g.criterionIds)), clinic };
  assert(!NOT_STAFF.includes(user.role), "The evidence workspace is for school staff and granted reviewers.");
  return { mode: "STAFF", criteria: null, clinic };
}
async function framework(user: AuthUser, id: string) {
  const fw = await prisma.evidenceFramework.findFirst({ where: { id, schoolId: user.schoolId }, include: { criteria: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] } } });
  if (!fw) throw new ApiError("Framework not found", 404);
  return fw;
}

/** The version a source record has right now, or null when it no longer exists in this school. */
async function currentSources(schoolId: string, refs: { type: string; id: string | null }[]) {
  const ids = (t: SourceType) => [...new Set(refs.filter(r => r.type === t && r.id).map(r => r.id!))];
  const out = new Map<string, { version: string; date: string; sensitivity: "NONE" | "PUPIL" | "CLINIC"; label: string; campusId: string | null }>();
  const [plans, reports, visits, care] = await Promise.all([
    ids("INTERVENTION").length ? prisma.interventionPlan.findMany({ where: { schoolId, id: { in: ids("INTERVENTION") } }, select: { id: true, version: true, status: true, studentId: true, title: true, createdAt: true, updatedAt: true, campusId: true } }) : [],
    ids("REPORT_CARD").length ? prisma.reportCard.findMany({ where: { schoolId, id: { in: ids("REPORT_CARD") } }, select: { id: true, sourceRevision: true, campusId: true, generatedAt: true, exam: { select: { title: true } } } }) : [],
    ids("CLINIC_VISIT").length ? prisma.clinicVisit.findMany({ where: { schoolId, id: { in: ids("CLINIC_VISIT") } }, select: { id: true, arrivedAt: true, createdAt: true, campusId: true } }) : [],
    ids("CARE_PLAN").length ? prisma.carePlan.findMany({ where: { schoolId, id: { in: ids("CARE_PLAN") } }, select: { id: true, updatedAt: true, campusId: true } }) : [],
  ]);
  for (const p of plans) out.set(`INTERVENTION:${p.id}`, { version: `v${p.version}`, date: iso(p.updatedAt), sensitivity: p.studentId ? "PUPIL" : "NONE", label: `Learning action v${p.version} · ${p.status}`, campusId: p.campusId });
  for (const r of reports) out.set(`REPORT_CARD:${r.id}`, { version: `r${r.sourceRevision}`, date: iso(r.generatedAt), sensitivity: "PUPIL", label: `Report card · ${r.exam.title} · revision ${r.sourceRevision}`, campusId: r.campusId });
  for (const v of visits) out.set(`CLINIC_VISIT:${v.id}`, { version: `c${v.createdAt.getTime()}`, date: iso(v.arrivedAt), sensitivity: "CLINIC", label: "Clinic visit", campusId: v.campusId });
  for (const c of care) out.set(`CARE_PLAN:${c.id}`, { version: `u${c.updatedAt.getTime()}`, date: iso(c.updatedAt), sensitivity: "CLINIC", label: "Care plan", campusId: c.campusId });
  return out;
}

type ItemRow = Prisma.EvidenceItemGetPayload<object>;
type Freshness = "CURRENT" | "SOURCE_CHANGED" | "EXPIRED" | "MISSING";
function freshness(item: ItemRow, now: Map<string, { version: string }>, today: string): Freshness {
  if (item.sourceType !== "DOCUMENT") {
    const cur = now.get(`${item.sourceType}:${item.sourceId}`);
    if (!cur) return "MISSING";
    if (cur.version !== item.sourceVersion) return "SOURCE_CHANGED";
  }
  return iso(item.reviewBy) < today ? "EXPIRED" : "CURRENT";
}
type Audience = "LEAD" | "STAFF" | "REVIEWER" | "EXTERNAL";
const visibleTo = (item: ItemRow, audience: Audience) => audience === "LEAD" || audience === "STAFF" ? true : audience === "REVIEWER" ? item.audience !== "STAFF" : item.audience === "EXTERNAL";
/** Restricted pupil and clinic sources never show their record id or the staff-written title outside leads. */
function present(item: ItemRow, fresh: Freshness, audience: Audience, clinic: boolean, people: Map<string, string>) {
  const restricted = item.sensitivity === "CLINIC" ? !(audience === "LEAD" && clinic) : item.sensitivity === "PUPIL" ? audience !== "LEAD" : false;
  const verified = item.reviewState === "ACCEPTED";
  return {
    id: item.id, sourceType: item.sourceType, sourceDate: iso(item.sourceDate), sourceVersion: item.sourceVersion, freshness: fresh,
    reviewState: item.reviewState, verified, stance: item.stance, sensitivity: item.sensitivity, audience: item.audience, restricted,
    sourceId: restricted ? null : item.sourceId, title: restricted ? null : item.title, note: restricted ? null : item.note,
    owner: people.get(item.ownerId) ?? "", ownerId: item.ownerId, reviewBy: iso(item.reviewBy), reviewNote: item.reviewNote,
    reviewer: item.reviewedById ? people.get(item.reviewedById) ?? "" : null, criterionIds: item.criterionIds,
    narrativeOnly: item.sourceType === "DOCUMENT" && !verified,
  };
}
type Presented = ReturnType<typeof present>;
/** CURRENT needs verified, current supporting evidence; contradicting verified evidence makes it CONFLICTING. */
function criterionStatus(items: Presented[]) {
  if (!items.length) return "MISSING";
  const live = items.filter(i => i.freshness === "CURRENT");
  const verified = live.filter(i => i.verified);
  if (verified.some(i => i.stance === "SUPPORTS") && verified.some(i => i.stance === "CONTRADICTS")) return "CONFLICTING";
  if (verified.some(i => i.stance === "SUPPORTS")) return "CURRENT";
  if (!live.length) return "STALE";
  return "UNVERIFIED";
}
type Reassessment = { measure: string; baseline: string; followUp: string; comparable: boolean; note?: string | null; recordedAt: string };
function outcome(r: Reassessment | null) {
  if (!r) return { state: "NOT_REASSESSED", text: "Reassessment not recorded · no outcome claimed" };
  if (!r.comparable) return { state: "NOT_COMPARABLE", text: "Follow-up recorded · measures not comparable" };
  return { state: "OBSERVED", text: `${r.baseline} → ${r.followUp} · ${CAUSE_CAVEAT}` };
}

async function people(schoolId: string, ids: string[]) {
  const rows = ids.length ? await prisma.user.findMany({ where: { schoolId, id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } }) : [];
  return new Map(rows.map(r => [r.id, r.fullName]));
}

/** One computed view of a framework for an audience; packs freeze exactly this. */
async function build(user: AuthUser, frameworkId: string, audience: Audience, clinic: boolean, only: Set<string> | null) {
  const fw = await framework(user, frameworkId);
  const today = await schoolToday(user.schoolId, fw.campusId);
  const [items, actions] = await Promise.all([
    prisma.evidenceItem.findMany({ where: { schoolId: user.schoolId, frameworkId }, orderBy: { createdAt: "asc" } }),
    prisma.improvementAction.findMany({ where: { schoolId: user.schoolId, frameworkId }, orderBy: { createdAt: "asc" } }),
  ]);
  const now = await currentSources(user.schoolId, items.map(i => ({ type: i.sourceType, id: i.sourceId })));
  const plans = await prisma.interventionPlan.findMany({ where: { schoolId: user.schoolId, id: { in: actions.map(a => a.interventionPlanId).filter((x): x is string => !!x) } }, select: { id: true, status: true, version: true } });
  const names = await people(user.schoolId, [...items.flatMap(i => [i.ownerId, i.reviewedById ?? ""]), ...actions.flatMap(a => [a.ownerId, a.completedById ?? ""]), ...fw.criteria.map(c => c.interpretationApprovedById ?? "")]);
  const criteria = fw.criteria.filter(c => !only || only.has(c.id));
  const shown = items.filter(i => visibleTo(i, audience) && i.criterionIds.some(id => criteria.some(c => c.id === id)));
  const presented = shown.map(i => present(i, freshness(i, now, today), audience, clinic, names));
  const excluded = items.filter(i => !visibleTo(i, audience) && i.criterionIds.some(id => criteria.some(c => c.id === id))).length;
  const crit = criteria.map(c => {
    const own = presented.filter(i => i.criterionIds.includes(c.id));
    const status = criterionStatus(own);
    const linked = actions.filter(a => a.criterionIds.includes(c.id));
    return {
      id: c.id, code: c.code, title: c.title, interpretation: c.interpretation, interpretationApproved: !!c.interpretationApprovedAt,
      interpretationApprovedBy: c.interpretationApprovedById ? names.get(c.interpretationApprovedById) ?? "" : null,
      status, items: own, actionIds: linked.map(a => a.id),
      gaps: [
        ...(!c.interpretationApprovedAt ? ["Interpretation not yet approved"] : []),
        ...(status === "MISSING" ? ["No evidence linked"] : status === "STALE" ? ["All linked evidence is stale"] : status === "UNVERIFIED" ? ["Evidence not yet reviewed"] : status === "CONFLICTING" ? ["Reviewed evidence conflicts"] : []),
        ...own.filter(i => i.freshness !== "CURRENT").map(i => `${i.sourceType} ${i.freshness === "SOURCE_CHANGED" ? "changed since linked" : i.freshness === "EXPIRED" ? "past its review date" : "source unavailable"}`),
      ],
    };
  });
  const planOf = new Map(plans.map(p => [p.id, p]));
  const acts = actions.filter(a => a.criterionIds.some(id => criteria.some(c => c.id === id))).map(a => {
    const r = a.reassessment as Reassessment | null;
    const plan = a.interventionPlanId ? planOf.get(a.interventionPlanId) : null;
    return {
      id: a.id, title: a.title, owner: names.get(a.ownerId) ?? "", ownerId: a.ownerId, dueDate: iso(a.dueDate), expectedMeasure: a.expectedMeasure,
      criterionIds: a.criterionIds, status: a.status, overdue: a.status === "OPEN" && iso(a.dueDate) < today, version: a.version,
      milestones: a.milestones as { label: string; date: string; done: boolean }[], reassessment: r, reflection: a.reflection,
      outcome: outcome(r), completionEvidenceId: a.completionEvidenceId, completedBy: a.completedById ? names.get(a.completedById) ?? "" : null,
      // The SKO-425 learning action stays canonical: read-only status, never changed here.
      learningAction: a.interventionPlanId ? (plan ? { id: audience === "LEAD" || audience === "STAFF" ? plan.id : null, status: plan.status, version: plan.version } : { id: null, status: "UNAVAILABLE", version: null }) : null,
    };
  });
  const current = crit.filter(c => c.status === "CURRENT").length;
  return {
    framework: { id: fw.id, name: fw.name, version: fw.version, status: fw.status, disclaimer: DISCLAIMER },
    asOf: today, audience, criteria: crit, actions: acts,
    summary: { current, total: crit.length, needsEvidence: crit.filter(c => c.status !== "CURRENT").length, overdueActions: acts.filter(a => a.overdue).length, excludedForAudience: excluded },
  };
}

export async function workspace(user: AuthUser, frameworkId?: string | null) {
  assert(!NOT_STAFF.includes(user.role), "The evidence workspace is for school staff and granted reviewers.");
  const lead = isLead(user);
  const frameworks = await prisma.evidenceFramework.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, version: true, status: true, createdAt: true }, orderBy: [{ name: "asc" }, { createdAt: "desc" }] });
  // A granted reviewer lands on the framework they were asked to review.
  const granted = lead ? null : await prisma.evidenceReviewerGrant.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { frameworkId: true } });
  const id = frameworkId || granted?.frameworkId || frameworks.find(f => f.status === "ACTIVE")?.id || frameworks[0]?.id;
  if (!id) return { frameworks, mode: lead ? "LEAD" : "STAFF", view: null, packs: [], grants: [] };
  const a = await access(user, id);
  const view = await build(user, id, a.mode, a.clinic, a.criteria);
  const packs = await prisma.evidencePack.findMany({ where: { schoolId: user.schoolId, frameworkId: id, ...(a.mode === "REVIEWER" ? { audience: "EXTERNAL" } : {}) }, select: { id: true, version: true, audience: true, digest: true, createdAt: true, manifest: true }, orderBy: { version: "desc" } });
  const grants = a.mode === "LEAD" ? await prisma.evidenceReviewerGrant.findMany({ where: { schoolId: user.schoolId, frameworkId: id, revokedAt: null }, orderBy: { createdAt: "desc" } }) : [];
  const grantNames = await people(user.schoolId, grants.map(g => g.userId));
  return {
    frameworks, mode: a.mode, view,
    packs: packs.filter(p => a.mode !== "REVIEWER" || packCriteria(p.manifest).every(c => a.criteria!.has(c))).map(p => ({ id: p.id, version: p.version, audience: p.audience, digest: p.digest, createdAt: p.createdAt, gaps: (p.manifest as { gaps?: unknown[] }).gaps?.length ?? 0 })),
    grants: grants.map(g => ({ id: g.id, userId: g.userId, name: grantNames.get(g.userId) ?? "", criterionIds: g.criterionIds, expiresAt: g.expiresAt, active: g.expiresAt > new Date() })),
  };
}

export async function staff(user: AuthUser) {
  assert(!NOT_STAFF.includes(user.role), "Staff access is required.");
  return prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" }, take: 300 });
}

/** Linkable sources: learning actions and report cards on the user's campus. Clinic sources are linked by id only. */
export async function sources(user: AuthUser) {
  assert(!NOT_STAFF.includes(user.role), "Staff access is required.");
  const campus = isLead(user) && user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "__none__" };
  const [plans, reports] = await Promise.all([
    prisma.interventionPlan.findMany({ where: { schoolId: user.schoolId, ...campus }, select: { id: true, version: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.reportCard.findMany({ where: { schoolId: user.schoolId, ...campus }, select: { id: true, sourceRevision: true, exam: { select: { title: true } } }, orderBy: { id: "desc" }, take: 50 }),
  ]);
  return [
    ...plans.map(p => ({ type: "INTERVENTION", id: p.id, label: `Learning action v${p.version} · ${p.status}` })),
    ...reports.map(r => ({ type: "REPORT_CARD", id: r.id, label: `Report card · ${r.exam.title} · revision ${r.sourceRevision}` })),
  ];
}

const frameworkInput = z.object({
  name: text(2, 120), version: text(1, 40), campusId: z.string().uuid().nullish(), copyFrom: z.string().uuid().nullish(),
  criteria: z.array(z.object({ code: text(1, 30), title: text(2, 300), interpretation: z.string().trim().max(4000).nullish() })).max(200).default([]),
});
export async function createFramework(user: AuthUser, raw: unknown) {
  assert(isLead(user), "Only school leaders configure frameworks.");
  const input = parse(frameworkInput, raw);
  let criteria = input.criteria;
  if (input.copyFrom) {
    const from = await framework(user, input.copyFrom);
    // A new version copies criteria and wording but never the approval: the school re-approves its reading.
    criteria = [...from.criteria.map(c => ({ code: c.code, title: c.title, interpretation: c.interpretation })), ...criteria.filter(c => !from.criteria.some(f => f.code === c.code))];
  }
  assert(criteria.length > 0, "Add at least one criterion.", 400);
  assert(new Set(criteria.map(c => c.code)).size === criteria.length, "Criterion codes must be unique.", 400);
  const dup = await prisma.evidenceFramework.findFirst({ where: { schoolId: user.schoolId, name: input.name, version: input.version } });
  assert(!dup, "This framework version already exists.", 409);
  return prisma.$transaction(async tx => {
    const fw = await tx.evidenceFramework.create({ data: { schoolId: user.schoolId, campusId: input.campusId ?? null, name: input.name, version: input.version, createdById: user.userId } });
    await tx.evidenceCriterion.createMany({ data: criteria.map((c, i) => ({ schoolId: user.schoolId, frameworkId: fw.id, code: c.code, title: c.title, interpretation: c.interpretation ?? null, sortOrder: i })) });
    await writeAuditEvent(tx, user, { table: "evidence_frameworks", recordId: fw.id, action: "CREATE", after: { name: fw.name, version: fw.version, criteria: criteria.length } });
    return fw;
  });
}

export async function approveInterpretation(user: AuthUser, raw: unknown) {
  assert(isLead(user), "Only school leaders approve how the school reads a criterion.");
  const input = parse(z.object({ criterionId: z.string().uuid(), interpretation: text(5, 4000) }), raw);
  const c = await prisma.evidenceCriterion.findFirst({ where: { id: input.criterionId, schoolId: user.schoolId } });
  if (!c) throw new ApiError("Criterion not found", 404);
  const updated = await prisma.evidenceCriterion.update({ where: { id: c.id }, data: { interpretation: input.interpretation, interpretationApprovedById: user.userId, interpretationApprovedAt: new Date() } });
  await writeAuditEvent(prisma, user, { table: "evidence_criteria", recordId: c.id, action: "APPROVE", before: { interpretation: c.interpretation ?? "" }, after: { interpretation: input.interpretation } });
  return updated;
}

export async function retireFramework(user: AuthUser, id: string) {
  assert(isLead(user), "Only school leaders retire frameworks.");
  await framework(user, id);
  return prisma.evidenceFramework.update({ where: { id }, data: { status: "RETIRED" } });
}

const evidenceInput = z.object({
  frameworkId: z.string().uuid(), criterionIds: z.array(z.string().uuid()).min(1).max(20),
  sourceType: z.enum(SOURCE_TYPES), sourceId: z.string().uuid().nullish(), title: text(3, 300), note: z.string().trim().max(4000).nullish(),
  sourceDate: day.nullish(), reviewBy: day, audience: z.enum(["STAFF", "REVIEWER", "EXTERNAL"]).default("STAFF"),
  stance: z.enum(["SUPPORTS", "CONTRADICTS"]).default("SUPPORTS"), ownerId: z.string().uuid().nullish(), pupilData: z.boolean().default(false),
});
export async function addEvidence(user: AuthUser, raw: unknown) {
  const input = parse(evidenceInput, raw);
  const a = await access(user, input.frameworkId);
  assert(a.mode !== "REVIEWER", "Reviewers comment on evidence; school staff add it.");
  const fw = await framework(user, input.frameworkId);
  assert(fw.status === "ACTIVE", "This framework version is retired.", 409);
  assert(input.criterionIds.every(id => fw.criteria.some(c => c.id === id)), "Choose criteria from this framework.", 400);
  let sourceVersion: string, sourceDate: string, sensitivity: "NONE" | "PUPIL" | "CLINIC";
  if (input.sourceType === "DOCUMENT") {
    assert(input.note && input.note.length >= 10, "Describe the evidence; a narrative stays unverified until reviewed.", 400);
    sourceVersion = `d${sha(input.note).slice(0, 16)}`; sourceDate = input.sourceDate ?? await schoolToday(user.schoolId, fw.campusId); sensitivity = input.pupilData ? "PUPIL" : "NONE";
  } else {
    assert(input.sourceId, "Choose the source record.", 400);
    if (input.sourceType === "CLINIC_VISIT" || input.sourceType === "CARE_PLAN") assert(a.clinic, "Only clinic team members can link clinic records.");
    const cur = (await currentSources(user.schoolId, [{ type: input.sourceType, id: input.sourceId }])).get(`${input.sourceType}:${input.sourceId}`);
    if (!cur) throw new ApiError("Source record not found", 404);
    if (!isLead(user) && user.role !== "SUPER_ADMIN") assert(!cur.campusId || cur.campusId === user.campusId, "Source record not found", 404);
    sourceVersion = cur.version; sourceDate = cur.date; sensitivity = cur.sensitivity;
  }
  const ownerId = input.ownerId ?? user.userId;
  if (ownerId !== user.userId) assert(await prisma.user.count({ where: { id: ownerId, schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } } }), "Choose a staff owner.", 400);
  // Clinic records never leave staff, whatever audience was asked for.
  const audience = sensitivity === "CLINIC" ? "STAFF" : input.audience;
  return prisma.$transaction(async tx => {
    const item = await tx.evidenceItem.create({ data: { schoolId: user.schoolId, frameworkId: fw.id, criterionIds: input.criterionIds, sourceType: input.sourceType, sourceId: input.sourceType === "DOCUMENT" ? null : input.sourceId!, sourceVersion, sourceDate: new Date(`${sourceDate}T00:00:00Z`), title: input.title, note: input.note ?? null, ownerId, audience, sensitivity, stance: input.stance, reviewBy: new Date(`${input.reviewBy}T00:00:00Z`), createdById: user.userId } });
    await writeAuditEvent(tx, user, { table: "evidence_items", recordId: item.id, action: "CREATE", after: { sourceType: item.sourceType, sourceVersion, criteria: input.criterionIds.length, audience, sensitivity } });
    return item;
  });
}

/** Leads and granted reviewers judge evidence; never the person who added or owns it. */
export async function reviewEvidence(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ itemId: z.string().uuid(), decision: z.enum(["ACCEPT", "REQUEST_MORE"]), note: z.string().trim().max(2000).nullish() }), raw);
  const item = await prisma.evidenceItem.findFirst({ where: { id: input.itemId, schoolId: user.schoolId } });
  if (!item) throw new ApiError("Evidence not found", 404);
  const a = await access(user, item.frameworkId);
  assert(a.mode === "LEAD" || (a.mode === "REVIEWER" && item.audience !== "STAFF" && item.criterionIds.some(id => a.criteria!.has(id))), "You cannot review this evidence.");
  assert(item.createdById !== user.userId && item.ownerId !== user.userId, "Someone other than the person who added or owns this evidence must review it.", 409);
  if (input.decision === "REQUEST_MORE") assert(input.note && input.note.length >= 3, "Say what further evidence is needed.", 400);
  const updated = await prisma.evidenceItem.update({ where: { id: item.id }, data: { reviewState: input.decision === "ACCEPT" ? "ACCEPTED" : "MORE_REQUESTED", reviewedById: user.userId, reviewedAt: new Date(), reviewNote: input.note ?? null } });
  await writeAuditEvent(prisma, user, { table: "evidence_items", recordId: item.id, action: input.decision === "ACCEPT" ? "APPROVE" : "REJECT", after: { reviewState: updated.reviewState, note: input.note ?? "" } });
  return updated;
}

/** Opening a source is a separate, checked request; reviewers can review a criterion without opening restricted records. */
export async function openSource(user: AuthUser, itemId: string) {
  const item = await prisma.evidenceItem.findFirst({ where: { id: itemId, schoolId: user.schoolId } });
  if (!item) throw new ApiError("Evidence not found", 404);
  const a = await access(user, item.frameworkId);
  if (a.mode === "REVIEWER") assert(item.audience !== "STAFF" && item.criterionIds.some(id => a.criteria!.has(id)), "Evidence not found", 404);
  const restricted = item.sensitivity === "CLINIC" ? !(a.mode === "LEAD" && a.clinic) : item.sensitivity === "PUPIL" ? a.mode !== "LEAD" : false;
  assert(!restricted, "You can review this criterion but cannot open its restricted source.");
  if (item.sourceType === "DOCUMENT") return { sourceType: item.sourceType, version: item.sourceVersion, current: true, content: { note: item.note } };
  const cur = (await currentSources(user.schoolId, [{ type: item.sourceType, id: item.sourceId }])).get(`${item.sourceType}:${item.sourceId}`);
  if (!cur) return { sourceType: item.sourceType, version: item.sourceVersion, current: false, content: null, message: "This evidence source is unavailable. The criterion remains incomplete." };
  return { sourceType: item.sourceType, version: item.sourceVersion, currentVersion: cur.version, current: cur.version === item.sourceVersion, content: { label: cur.label, date: cur.date } };
}

const actionInput = z.object({
  frameworkId: z.string().uuid(), criterionIds: z.array(z.string().uuid()).min(1).max(20), title: text(3, 200), ownerId: z.string().uuid(),
  dueDate: day, expectedMeasure: text(5, 2000), interventionPlanId: z.string().uuid().nullish(),
  milestones: z.array(z.object({ label: text(2, 200), date: day })).max(20).default([]),
});
export async function createAction(user: AuthUser, raw: unknown) {
  assert(isLead(user), "Only school leaders create improvement actions.");
  const input = parse(actionInput, raw);
  const fw = await framework(user, input.frameworkId);
  assert(input.criterionIds.every(id => fw.criteria.some(c => c.id === id)), "Choose criteria from this framework.", 400);
  assert(await prisma.user.count({ where: { id: input.ownerId, schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT"] } } }), "Choose a staff owner.", 400);
  if (input.interventionPlanId) assert(await prisma.interventionPlan.count({ where: { id: input.interventionPlanId, schoolId: user.schoolId } }), "Learning action not found", 404);
  return prisma.$transaction(async tx => {
    const action = await tx.improvementAction.create({ data: { schoolId: user.schoolId, frameworkId: fw.id, criterionIds: input.criterionIds, title: input.title, ownerId: input.ownerId, dueDate: new Date(`${input.dueDate}T00:00:00Z`), expectedMeasure: input.expectedMeasure, interventionPlanId: input.interventionPlanId ?? null, milestones: json(input.milestones.map(m => ({ ...m, done: false }))), createdById: user.userId } });
    await writeAuditEvent(tx, user, { table: "improvement_actions", recordId: action.id, action: "CREATE", after: { title: action.title, ownerId: action.ownerId, dueDate: input.dueDate, criteria: input.criterionIds.length } });
    return action;
  });
}

async function ownAction(user: AuthUser, id: string, expectedVersion: number) {
  const action = await prisma.improvementAction.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!action) throw new ApiError("Improvement action not found", 404);
  assert(isLead(user) || action.ownerId === user.userId, "Only the action owner or a school leader can update this action.");
  assert(action.version === expectedVersion, "This action changed since you opened it. Reload to see the latest version.", 409);
  assert(action.status === "OPEN", "This action is complete.", 409);
  return action;
}

export async function recordFollowUp(user: AuthUser, raw: unknown) {
  const input = parse(z.object({
    actionId: z.string().uuid(), expectedVersion: z.number().int().positive(), milestoneDone: z.array(z.number().int().min(0)).max(20).optional(),
    reassessment: z.object({ measure: text(2, 300), baseline: text(1, 100), followUp: text(1, 100), comparable: z.boolean(), note: z.string().trim().max(1000).nullish() }).optional(),
    reflection: z.string().trim().max(4000).optional(),
  }), raw);
  const action = await ownAction(user, input.actionId, input.expectedVersion);
  const milestones = (action.milestones as { label: string; date: string; done: boolean }[]).map((m, i) => ({ ...m, done: m.done || !!input.milestoneDone?.includes(i) }));
  const reassessment = input.reassessment ? { ...input.reassessment, recordedAt: new Date().toISOString() } : action.reassessment;
  const updated = await prisma.improvementAction.update({ where: { id: action.id }, data: { milestones: json(milestones), reassessment: reassessment === null ? Prisma.DbNull : json(reassessment), reflection: input.reflection ?? action.reflection, version: { increment: 1 } } });
  await writeAuditEvent(prisma, user, { table: "improvement_actions", recordId: action.id, action: "UPDATE", after: { version: updated.version, reassessed: !!input.reassessment, reflection: input.reflection !== undefined } });
  return updated;
}

/** Completion needs reviewed, current evidence; it changes nothing on the referenced learning action. */
export async function completeAction(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ actionId: z.string().uuid(), expectedVersion: z.number().int().positive(), evidenceId: z.string().uuid() }), raw);
  const action = await ownAction(user, input.actionId, input.expectedVersion);
  const item = await prisma.evidenceItem.findFirst({ where: { id: input.evidenceId, schoolId: user.schoolId, frameworkId: action.frameworkId } });
  if (!item) throw new ApiError("Completion evidence not found", 404);
  const fw = await prisma.evidenceFramework.findFirstOrThrow({ where: { id: action.frameworkId } });
  const fresh = freshness(item, await currentSources(user.schoolId, [{ type: item.sourceType, id: item.sourceId }]), await schoolToday(user.schoolId, fw.campusId));
  assert(item.reviewState === "ACCEPTED", "Completion evidence must be reviewed and accepted first.", 409);
  assert(fresh === "CURRENT", "Completion evidence is stale; link current evidence.", 409);
  const updated = await prisma.improvementAction.update({ where: { id: action.id }, data: { status: "COMPLETED", completionEvidenceId: item.id, completedById: user.userId, completedAt: new Date(), version: { increment: 1 } } });
  await writeAuditEvent(prisma, user, { table: "improvement_actions", recordId: action.id, action: "APPROVE", after: { status: "COMPLETED", evidenceId: item.id, reassessed: !!action.reassessment } });
  return updated;
}

export async function grantReviewer(user: AuthUser, raw: unknown) {
  assert(isLead(user), "Only school leaders grant reviewer access.");
  const input = parse(z.object({ frameworkId: z.string().uuid(), userId: z.string().uuid(), criterionIds: z.array(z.string().uuid()).min(1).max(200), expiresAt: day }), raw);
  const fw = await framework(user, input.frameworkId);
  assert(input.criterionIds.every(id => fw.criteria.some(c => c.id === id)), "Choose criteria from this framework.", 400);
  // Reviewers are staff accounts (internal or a visiting reviewer set up as staff); families and pupils never are.
  assert(await prisma.user.count({ where: { id: input.userId, schoolId: user.schoolId, isActive: true, role: { notIn: NOT_STAFF as never } } }), "Reviewer not found", 404);
  const expiresAt = new Date(`${input.expiresAt}T23:59:59Z`);
  assert(expiresAt > new Date(), "Choose a future expiry date.", 400);
  const grant = await prisma.evidenceReviewerGrant.create({ data: { schoolId: user.schoolId, frameworkId: fw.id, userId: input.userId, criterionIds: input.criterionIds, expiresAt, grantedById: user.userId } });
  await writeAuditEvent(prisma, user, { table: "evidence_reviewer_grants", recordId: grant.id, action: "GRANT", after: { userId: input.userId, criteria: input.criterionIds.length, expiresAt: input.expiresAt } });
  return grant;
}

export async function revokeReviewer(user: AuthUser, id: string) {
  assert(isLead(user), "Only school leaders revoke reviewer access.");
  const grant = await prisma.evidenceReviewerGrant.findFirst({ where: { id, schoolId: user.schoolId, revokedAt: null } });
  if (!grant) throw new ApiError("Grant not found", 404);
  await prisma.evidenceReviewerGrant.update({ where: { id }, data: { revokedAt: new Date() } });
  await writeAuditEvent(prisma, user, { table: "evidence_reviewer_grants", recordId: id, action: "REVOKE", after: { userId: grant.userId } });
  return { id, revoked: true };
}

function packCriteria(manifest: unknown) { return ((manifest as { criteria?: { id: string }[] }).criteria ?? []).map(c => c.id); }

/** Freeze the selected view: later source changes never alter an exported version. */
export async function exportPack(user: AuthUser, raw: unknown) {
  assert(isLead(user), "Only school leaders export evidence packs.");
  const input = parse(z.object({ frameworkId: z.string().uuid(), audience: z.enum(["STAFF", "EXTERNAL"]), criterionIds: z.array(z.string().uuid()).max(200).optional() }), raw);
  const fw = await framework(user, input.frameworkId);
  const only = input.criterionIds?.length ? new Set(input.criterionIds) : null;
  if (only) assert([...only].every(id => fw.criteria.some(c => c.id === id)), "Choose criteria from this framework.", 400);
  // A staff pack is still a file that leaves the system: pupil and clinic sources stay redacted in both packs.
  const view = await build(user, fw.id, input.audience === "STAFF" ? "STAFF" : "EXTERNAL", false, only);
  const body = {
    framework: view.framework, asOf: view.asOf, audience: input.audience, summary: view.summary,
    criteria: view.criteria.map(c => ({ ...c, items: c.items.map(({ ownerId: _o, reviewNote, ...rest }) => ({ ...rest, reviewNote: input.audience === "EXTERNAL" ? null : reviewNote })) })),
    actions: view.actions.map(({ ownerId: _o, ...rest }) => rest),
    gaps: view.criteria.flatMap(c => c.gaps.map(g => `${c.code}: ${g}`)),
    exclusions: { restrictedSourcesRedacted: view.criteria.reduce((n, c) => n + c.items.filter(i => i.restricted).length, 0), itemsNotForThisAudience: view.summary.excludedForAudience },
    notices: [DISCLAIMER, "Before and after observations do not establish cause.", "The digest proves this file is unchanged; it does not certify the evidence."],
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const version = (await tx.evidencePack.count({ where: { frameworkId: fw.id } })) + 1;
        const manifest = { ...body, packVersion: version };
        const digest = sha(stable(manifest));
        const pack = await tx.evidencePack.create({ data: { schoolId: user.schoolId, frameworkId: fw.id, version, audience: input.audience, manifest: json(manifest), digest, createdById: user.userId } });
        await writeAuditEvent(tx, user, { table: "evidence_packs", recordId: pack.id, action: "CREATE", after: { version, audience: input.audience, digest, gaps: body.gaps.length } });
        return { id: pack.id, version, audience: input.audience, digest, gaps: body.gaps.length };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new ApiError("Another export was created at the same time. Try again.", 409);
}

/** Authorization is checked at download, so a revoked reviewer cannot fetch a pack prepared earlier. */
export async function downloadPack(user: AuthUser, id: string) {
  const pack = await prisma.evidencePack.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!pack) throw new ApiError("Evidence pack not found", 404);
  const a = await access(user, pack.frameworkId).catch(() => null);
  if (!a || (a.mode === "REVIEWER" && (pack.audience !== "EXTERNAL" || !packCriteria(pack.manifest).every(c => a.criteria!.has(c))))) throw new ApiError("Evidence pack not found", 404);
  assert(a.mode !== "STAFF", "Only leaders and granted reviewers download evidence packs.");
  await writeAuditEvent(prisma, user, { table: "evidence_packs", recordId: pack.id, action: "UPDATE", after: { downloaded: true, version: pack.version } });
  return { id: pack.id, version: pack.version, audience: pack.audience, digest: pack.digest, manifest: pack.manifest, verified: sha(stable(pack.manifest)) === pack.digest };
}
