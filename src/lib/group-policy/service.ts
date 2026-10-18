import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertStaffRole, canManageOperations } from "@/lib/api/scope";
import { getLocalePackage } from "@/lib/locale/store";

// SKO-443: school-group policy templates with controlled campus overrides.
// - A template covers one domain (grading or calendar) for named campuses, and says which countries and boards it
//   fits. A campus outside that fit, or already governed by another template of the domain, blocks scheduling —
//   nothing is coerced.
// - Versions are immutable once submitted. Each key a version sets is LOCKED (no campus may differ) or
//   OVERRIDABLE (a campus may differ only with an approved, time-bound override). Keys a version does not set
//   stay with the campus.
// - Publishing is preview first: the preview names affected campuses, overrides kept or ended, incompatibilities
//   and a hash of that state. Submitting binds the hash; a second group owner reviews; any campus change in
//   between makes the approval stale. Activation happens at the effective date and is recorded once.
// - The resolver answers "what applied at time T", so a record produced earlier keeps its rules; consumers store a
//   provenance row (version and overrides used) beside what they write.

export type Domain = "GRADING" | "CALENDAR";
type Spec = { label: string; check: (v: unknown) => boolean; hint: string };
const num = (min: number, max: number) => (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const oneOf = (...xs: string[]) => (v: unknown) => typeof v === "string" && xs.includes(v);
export const KEYS: Record<Domain, Record<string, Spec>> = {
  GRADING: {
    passingPercentage: { label: "Pass mark (%)", check: num(0, 100), hint: "0–100" },
    gradeAplus: { label: "A+ starts at (%)", check: num(0, 100), hint: "0–100" },
    gradeA: { label: "A starts at (%)", check: num(0, 100), hint: "0–100" },
    gradeB: { label: "B starts at (%)", check: num(0, 100), hint: "0–100" },
    gradeC: { label: "C starts at (%)", check: num(0, 100), hint: "0–100" },
    gradeD: { label: "D starts at (%)", check: num(0, 100), hint: "0–100" },
    roundingRule: { label: "Rounding", check: oneOf("WHOLE", "ONE_DECIMAL", "TWO_DECIMALS"), hint: "WHOLE, ONE_DECIMAL or TWO_DECIMALS" },
    missingMarkPolicy: { label: "Missing marks", check: oneOf("COUNT_AS_ZERO", "EXCLUDE", "BLOCK"), hint: "COUNT_AS_ZERO, EXCLUDE or BLOCK" },
    absentMarkPolicy: { label: "Absent marks", check: oneOf("COUNT_AS_ZERO", "EXCLUDE", "BLOCK"), hint: "COUNT_AS_ZERO, EXCLUDE or BLOCK" },
  },
  CALENDAR: {
    weekStartsOn: { label: "Week starts on", check: num(0, 6), hint: "0 (Sunday) – 6 (Saturday)" },
    weekend: { label: "Weekend days", check: v => Array.isArray(v) && v.length <= 3 && v.every(d => Number.isInteger(d) && d >= 0 && d <= 6), hint: "up to three days, 0–6" },
    termCount: { label: "Terms per year", check: v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4, hint: "1–4" },
    schoolDayStart: { label: "School day starts", check: v => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v), hint: "HH:MM" },
  },
};
const DOMAINS = Object.keys(KEYS) as Domain[];
const domainOf = (v: unknown): Domain => { if (!DOMAINS.includes(v as Domain)) throw new ApiError("Choose a policy domain.", 400); return v as Domain; };
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isGroupOwner = (user: AuthUser) => user.role === "SUPER_ADMIN" || !!user.isInstitutionOwner;
function groupOwner(user: AuthUser) { if (!isGroupOwner(user)) throw new ApiError("Only group policy owners can change group templates.", 403); }
const LIVE = ["SCHEDULED", "ACTIVE", "SUPERSEDED"];

async function event(tx: TxClient | typeof prisma, schoolId: string, kind: string, actorId: string | null, ids: { templateId?: string | null; versionId?: string | null; campusId?: string | null }, detail: Record<string, unknown> = {}) {
  await tx.policyEvent.create({ data: { schoolId, kind, actorId, templateId: ids.templateId ?? null, versionId: ids.versionId ?? null, campusId: ids.campusId ?? null, detail: detail as Prisma.InputJsonValue } });
}

// ─── Resolver ────────────────────────────────────────────────────────────

type Version = Prisma.PolicyTemplateVersionGetPayload<object>;
type Template = Prisma.PolicyTemplateGetPayload<object>;

/** Scheduled versions whose date has come become active, once; the version they replace is superseded. */
export async function activateDue(schoolId: string, now = new Date()) {
  const due = await prisma.policyTemplateVersion.findMany({ where: { schoolId, status: "SCHEDULED", effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: "asc" } });
  let activated = 0;
  for (const v of due) {
    await prisma.$transaction(async tx => {
      // Serialise per template so two activations never race on the one-active index.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`policy:${v.templateId}`}))`;
      if (!(await tx.policyTemplateVersion.findFirst({ where: { id: v.id, status: "SCHEDULED" }, select: { id: true } }))) return;
      await tx.policyTemplateVersion.updateMany({ where: { templateId: v.templateId, status: "ACTIVE", version: { lt: v.version } }, data: { status: "SUPERSEDED" } });
      await tx.policyTemplateVersion.update({ where: { id: v.id }, data: { status: "ACTIVE", activatedAt: now } });
      // Overrides on keys this version no longer leaves overridable end now, as the preview said they would.
      const ending = await tx.policyOverride.findMany({ where: { templateId: v.templateId, status: { in: ["PENDING", "APPROVED"] }, key: { notIn: v.overridableKeys } }, select: { id: true, key: true, campusId: true, status: true } });
      if (ending.length) await tx.policyOverride.updateMany({ where: { id: { in: ending.map(o => o.id) } }, data: { status: "REVOKED", decisionNote: `Ended by Group Policy v${v.version}` } });
      for (const o of ending) await event(tx, schoolId, "OVERRIDE_ENDED", null, { templateId: v.templateId, versionId: v.id, campusId: o.campusId }, { overrideId: o.id, key: o.key, was: o.status });
      await event(tx, schoolId, "ACTIVATED", null, { templateId: v.templateId, versionId: v.id }, { version: v.version, effectiveFrom: v.effectiveFrom });
      activated++;
    });
  }
  return activated;
}

/** Approved overrides past their end are marked expired (the resolver already ignores them). */
export async function expireOverrides(schoolId: string, now = new Date()) {
  const rows = await prisma.policyOverride.findMany({ where: { schoolId, status: "APPROVED", validUntil: { lte: now } }, select: { id: true, campusId: true, templateId: true, key: true } });
  for (const r of rows) {
    const done = await prisma.policyOverride.updateMany({ where: { id: r.id, status: "APPROVED" }, data: { status: "EXPIRED" } });
    if (done.count) await event(prisma, schoolId, "OVERRIDE_EXPIRED", null, { templateId: r.templateId, campusId: r.campusId }, { overrideId: r.id, key: r.key });
  }
  return rows.length;
}

/** The template governing a campus for a domain (it must name the campus). */
async function templateFor(schoolId: string, campusId: string, domain: Domain, db: TxClient | typeof prisma = prisma) {
  return db.policyTemplate.findFirst({ where: { schoolId, domain, campusIds: { has: campusId } }, orderBy: { createdAt: "asc" } });
}

/** The version in effect at `at`: the highest reviewed version whose effective date has passed. */
async function versionAt(templateId: string, at: Date, db: TxClient | typeof prisma = prisma) {
  return db.policyTemplateVersion.findFirst({ where: { templateId, status: { in: LIVE }, effectiveFrom: { lte: at } }, orderBy: { version: "desc" } });
}

export type Effective = { key: string; label: string; value: unknown; source: "GROUP_LOCKED" | "GROUP_DEFAULT" | "OVERRIDE" | "CAMPUS"; version: number | null; versionId: string | null; override: { id: string; reason: string; approver: string | null; validUntil: Date; modifiesVersion: number | null } | null };

/** Effective values with their source, for one campus and domain, at a moment (default now). */
export async function resolve(schoolId: string, campusId: string, domain: Domain, at = new Date(), local: Record<string, unknown> = {}, db: TxClient | typeof prisma = prisma) {
  if (at.getTime() >= Date.now() - 1000) { await activateDue(schoolId); }
  const template = await templateFor(schoolId, campusId, domain, db);
  const version = template ? await versionAt(template.id, at, db) : null;
  const overrides = template && version ? await db.policyOverride.findMany({ where: { schoolId, campusId, templateId: template.id, status: { in: ["APPROVED", "EXPIRED"] }, validFrom: { lte: at }, validUntil: { gt: at } }, include: { version: { select: { version: true } } }, orderBy: { decidedAt: "desc" } }) : [];
  const values = (version?.values ?? {}) as Record<string, unknown>;
  const approvers = new Map((await db.user.findMany({ where: { schoolId, id: { in: overrides.map(o => o.approverId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  const rows: Effective[] = Object.entries(KEYS[domain]).map(([key, spec]) => {
    if (version && key in values) {
      const locked = version.lockedKeys.includes(key);
      const o = !locked && version.overridableKeys.includes(key) ? overrides.find(x => x.key === key) : undefined;
      if (o) return { key, label: spec.label, value: o.value, source: "OVERRIDE", version: version.version, versionId: version.id, override: { id: o.id, reason: o.reason, approver: o.approverId ? approvers.get(o.approverId) ?? null : null, validUntil: o.validUntil, modifiesVersion: o.version.version } };
      return { key, label: spec.label, value: values[key], source: locked ? "GROUP_LOCKED" : "GROUP_DEFAULT", version: version.version, versionId: version.id, override: null };
    }
    return { key, label: spec.label, value: local[key] ?? null, source: "CAMPUS", version: null, versionId: null, override: null };
  });
  return { domain, campusId, at, template: template ? { id: template.id, title: template.title } : null, version: version ? { id: version.id, version: version.version, effectiveFrom: version.effectiveFrom } : null, rows };
}

/** For a consumer about to write: refuse keys the campus may not set to a different value. */
export async function assertWritable(user: AuthUser, campusId: string, domain: Domain, incoming: Record<string, unknown>) {
  const eff = await resolve(user.schoolId, campusId, domain);
  const blocked = eff.rows.filter(r => r.source !== "CAMPUS" && r.key in incoming && JSON.stringify(incoming[r.key]) !== JSON.stringify(r.value));
  if (blocked.length) {
    await event(prisma, user.schoolId, "LOCK_DENIED", user.userId, { templateId: eff.template?.id, versionId: eff.version?.id, campusId }, { keys: blocked.map(b => b.key) });
    const first = blocked[0];
    throw new ApiError(first.source === "GROUP_LOCKED"
      ? `${first.label} is locked by Group Policy v${first.version} (${eff.template?.title}). Ask your group policy owner if this campus needs a different value.`
      : `${first.label} is set by Group Policy v${first.version}${first.source === "OVERRIDE" ? " with an approved campus override" : ""}. Request an override to use a different value.`, 403);
  }
  return eff;
}

/** Stores which version and overrides governed a record when it was written. */
export async function recordProvenance(tx: TxClient | typeof prisma, schoolId: string, campusId: string, eff: Awaited<ReturnType<typeof resolve>>, recordType: string, recordIds: string[]) {
  if (!recordIds.length) return;
  const effective = Object.fromEntries(eff.rows.filter(r => r.source !== "CAMPUS").map(r => [r.key, { value: r.value, source: r.source }]));
  await tx.policyProvenance.createMany({ data: recordIds.map(recordId => ({ schoolId, campusId, domain: eff.domain, recordType, recordId, versionId: eff.version?.id ?? null, overrideIds: eff.rows.map(r => r.override?.id).filter(Boolean) as string[], effective: effective as Prisma.InputJsonValue })) });
}

// ─── Campus view ─────────────────────────────────────────────────────────

/** Current campus grading values (the section rows) so "campus setting" rows show a real value. */
async function localValues(schoolId: string, campusId: string, domain: Domain) {
  if (domain === "GRADING") {
    const row = await prisma.gradeWeightConfig.findFirst({ where: { schoolId, campusId, isActive: true }, orderBy: { academicYear: "desc" } });
    return row ? { passingPercentage: row.passingPercentage, gradeAplus: row.gradeAplus, gradeA: row.gradeA, gradeB: row.gradeB, gradeC: row.gradeC, gradeD: row.gradeD, roundingRule: row.roundingRule, missingMarkPolicy: row.missingMarkPolicy, absentMarkPolicy: row.absentMarkPolicy } : {};
  }
  const pack = await getLocalePackage(schoolId, campusId);
  return { weekStartsOn: pack.weekStartsOn, weekend: pack.weekend };
}

const campusFor = async (user: AuthUser, campusId?: string | null) => {
  const id = isGroupOwner(user) ? String(campusId || user.campusId || "") : user.campusId ?? "";
  const campus = await prisma.campus.findFirst({ where: { id, schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true, board: true } });
  if (!campus) throw new ApiError("Choose a campus.", 400);
  return campus;
};

export async function campusPolicy(user: AuthUser, campusIdParam: string | null, domainParam: string | null, atParam?: string | null) {
  assertStaffRole(user);
  const campus = await campusFor(user, campusIdParam);
  const domain = domainOf(domainParam || "GRADING");
  const at = atParam ? new Date(atParam) : new Date();
  if (Number.isNaN(at.getTime())) throw new ApiError("Choose a valid date.", 400);
  const eff = await resolve(user.schoolId, campus.id, domain, at, await localValues(user.schoolId, campus.id, domain));
  const pending = eff.template ? await prisma.policyOverride.findMany({ where: { schoolId: user.schoolId, campusId: campus.id, templateId: eff.template.id, status: "PENDING" }, select: { id: true, key: true, value: true, validFrom: true, validUntil: true, reason: true } }) : [];
  const scheduled = eff.template ? await prisma.policyTemplateVersion.findFirst({ where: { templateId: eff.template.id, status: "SCHEDULED" }, select: { version: true, effectiveFrom: true } }) : null;
  return { campus, ...eff, pending, scheduled, canRequest: canManageOperations(user) && (isGroupOwner(user) || user.campusId === campus.id), canPublish: isGroupOwner(user) };
}

export async function requestOverride(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageOperations(user)) throw new ApiError("Only campus leaders can request a policy override.", 403);
  const campus = await campusFor(user, body.campusId ? String(body.campusId) : null);
  const domain = domainOf(body.domain), key = String(body.key ?? "");
  const spec = KEYS[domain][key];
  if (!spec) throw new ApiError("This setting cannot be overridden.", 400);
  if (!spec.check(body.value)) throw new ApiError(`${spec.label}: use ${spec.hint}.`, 400);
  const reason = text(body.reason, 500);
  if (reason.length < 5) throw new ApiError("Explain why this campus needs a different value.", 400);
  const validFrom = body.validFrom ? new Date(String(body.validFrom)) : new Date(), validUntil = new Date(String(body.validUntil ?? ""));
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime()) || validUntil <= validFrom) throw new ApiError("Give an end date after the start date.", 400);
  if (validUntil.getTime() - validFrom.getTime() > 400 * 86_400_000) throw new ApiError("An override lasts at most about a school year (400 days).", 400);
  const template = await templateFor(user.schoolId, campus.id, domain);
  const version = template ? await versionAt(template.id, new Date()) : null;
  if (!template || !version || !(key in (version.values as Record<string, unknown>))) throw new ApiError("No group template sets this value; change it in the campus settings instead.", 409);
  if (version.lockedKeys.includes(key)) {
    await event(prisma, user.schoolId, "LOCK_DENIED", user.userId, { templateId: template.id, versionId: version.id, campusId: campus.id }, { key, viaOverride: true });
    throw new ApiError(`${spec.label} is locked by Group Policy v${version.version}. Ask your group policy owner if this campus needs a different value.`, 403);
  }
  if (!version.overridableKeys.includes(key)) throw new ApiError(`${spec.label} cannot be overridden under Group Policy v${version.version}.`, 403);
  const row = await prisma.policyOverride.create({ data: { schoolId: user.schoolId, campusId: campus.id, templateId: template.id, versionId: version.id, key, value: body.value as Prisma.InputJsonValue, reason, requestedById: user.userId, validFrom, validUntil } });
  await event(prisma, user.schoolId, "OVERRIDE_REQUESTED", user.userId, { templateId: template.id, versionId: version.id, campusId: campus.id }, { overrideId: row.id, key });
  return { id: row.id };
}

export async function decideOverride(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const decision = String(body.decision ?? "");
  if (decision !== "APPROVE" && decision !== "DECLINE") throw new ApiError("Approve or decline.", 400);
  const row = await prisma.policyOverride.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!row) throw new ApiError("Override not found", 404);
  if (row.requestedById === user.userId) throw new ApiError("Another group policy owner must decide an override you requested.", 403);
  const done = await prisma.policyOverride.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: decision === "APPROVE" ? "APPROVED" : "DECLINED", approverId: user.userId, decidedAt: new Date(), decisionNote: text(body.note, 500) || null } });
  if (!done.count) throw new ApiError("This override was already decided.", 409);
  await event(prisma, user.schoolId, decision === "APPROVE" ? "OVERRIDE_APPROVED" : "OVERRIDE_DECLINED", user.userId, { templateId: row.templateId, versionId: row.versionId, campusId: row.campusId }, { overrideId: row.id, key: row.key });
  return { id: row.id };
}

export async function revokeOverride(user: AuthUser, id: string) {
  groupOwner(user);
  const row = await prisma.policyOverride.findFirst({ where: { id, schoolId: user.schoolId, status: "APPROVED" } });
  if (!row) throw new ApiError("Override not found", 404);
  await prisma.policyOverride.update({ where: { id }, data: { status: "REVOKED" } });
  await event(prisma, user.schoolId, "OVERRIDE_REVOKED", user.userId, { templateId: row.templateId, campusId: row.campusId }, { overrideId: id, key: row.key });
  return { id };
}

// ─── Group templates ─────────────────────────────────────────────────────

export async function library(user: AuthUser) {
  groupOwner(user);
  await activateDue(user.schoolId);
  const [templates, campuses, pending] = await Promise.all([
    prisma.policyTemplate.findMany({ where: { schoolId: user.schoolId }, orderBy: [{ domain: "asc" }, { title: "asc" }], include: { versions: { orderBy: { version: "desc" } } } }),
    prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null }, select: { id: true, name: true, board: true }, orderBy: { name: "asc" } }),
    prisma.policyOverride.findMany({ where: { schoolId: user.schoolId, status: "PENDING" }, orderBy: { createdAt: "asc" } }),
  ]);
  const countries = Object.fromEntries(await Promise.all(campuses.map(async c => [c.id, (await getLocalePackage(user.schoolId, c.id)).country ?? "OTHER"] as const)));
  const owners = await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, OR: [{ role: "SUPER_ADMIN" }, { isInstitutionOwner: true }] }, select: { id: true, fullName: true } });
  return { templates, campuses: campuses.map(c => ({ ...c, country: countries[c.id] })), pending, owners, keys: Object.fromEntries(DOMAINS.map(d => [d, Object.entries(KEYS[d]).map(([key, s]) => ({ key, label: s.label, hint: s.hint }))])), userId: user.userId };
}

export async function createTemplate(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const domain = domainOf(body.domain), title = text(body.title, 120);
  if (title.length < 3) throw new ApiError("Name the template.", 400);
  const list = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(x => String(x).trim()).filter(Boolean))].slice(0, 50) : [];
  const campusIds = list(body.campusIds);
  if (campusIds.length && (await prisma.campus.count({ where: { schoolId: user.schoolId, id: { in: campusIds } } })) !== campusIds.length) throw new ApiError("Choose campuses in this school.", 400);
  const row = await prisma.policyTemplate.create({ data: { schoolId: user.schoolId, domain, title, countries: list(body.countries).map(c => c.toUpperCase()), boards: list(body.boards), campusIds, createdById: user.userId } });
  await event(prisma, user.schoolId, "TEMPLATE_CREATED", user.userId, { templateId: row.id }, { domain, campusIds });
  return { id: row.id };
}

/** Campuses and fit can change only before any version goes live; afterwards a new template is needed. */
export async function updateTemplate(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const template = await prisma.policyTemplate.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
  if (!template) throw new ApiError("Template not found", 404);
  if (await prisma.policyTemplateVersion.count({ where: { templateId: template.id, status: { in: [...LIVE, "IN_REVIEW"] } } })) throw new ApiError("This template already has a reviewed or live version. Create a new template for a different set of campuses.", 409);
  const list = (v: unknown, fallback: string[]) => Array.isArray(v) ? [...new Set(v.map(x => String(x).trim()).filter(Boolean))].slice(0, 50) : fallback;
  const campusIds = list(body.campusIds, template.campusIds);
  if (campusIds.length && (await prisma.campus.count({ where: { schoolId: user.schoolId, id: { in: campusIds } } })) !== campusIds.length) throw new ApiError("Choose campuses in this school.", 400);
  await prisma.policyTemplate.update({ where: { id: template.id }, data: { campusIds, countries: list(body.countries, template.countries).map(c => c.toUpperCase()), boards: list(body.boards, template.boards) } });
  await event(prisma, user.schoolId, "TEMPLATE_UPDATED", user.userId, { templateId: template.id }, { campusIds });
  return { id: template.id };
}

/** Drafts are the only editable versions; a new draft starts from the latest version's values. */
export async function saveDraft(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const template = await prisma.policyTemplate.findFirst({ where: { id: String(body.templateId ?? ""), schoolId: user.schoolId } });
  if (!template) throw new ApiError("Template not found", 404);
  const domain = template.domain as Domain;
  const values = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    const spec = KEYS[domain][key];
    if (!spec) throw new ApiError(`"${key}" is not a ${domain.toLowerCase()} setting a group template can set.`, 400);
    if (!spec.check(value)) throw new ApiError(`${spec.label}: use ${spec.hint}.`, 400);
  }
  if (domain === "GRADING") {
    const ladder = ["gradeAplus", "gradeA", "gradeB", "gradeC", "gradeD"].filter(k => k in values).map(k => values[k] as number);
    if (ladder.some((v, i) => i > 0 && v >= ladder[i - 1])) throw new ApiError("Each grade must start lower than the one above it.", 400);
  }
  const keys = (v: unknown) => Array.isArray(v) ? v.map(String).filter(k => k in values) : [];
  // Every key a version sets is either overridable (with review) or locked; nothing is silently in between.
  const overridableKeys = keys(body.overridableKeys), lockedKeys = Object.keys(values).filter(k => !overridableKeys.includes(k));
  const draft = await prisma.policyTemplateVersion.findFirst({ where: { templateId: template.id, status: "DRAFT" } });
  if (draft) {
    await prisma.policyTemplateVersion.update({ where: { id: draft.id }, data: { values: values as Prisma.InputJsonValue, lockedKeys, overridableKeys, note: text(body.note, 500) || null } });
    return { id: draft.id, version: draft.version };
  }
  const last = await prisma.policyTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } });
  const row = await prisma.policyTemplateVersion.create({ data: { schoolId: user.schoolId, templateId: template.id, version: (last?.version ?? 0) + 1, values: values as Prisma.InputJsonValue, lockedKeys, overridableKeys, note: text(body.note, 500) || null, createdById: user.userId } });
  return { id: row.id, version: row.version };
}

/** The impact of a draft on every named campus: compatibility, value changes and overrides kept or ended. */
export async function preview(user: AuthUser, versionId: string, effectiveFromParam?: unknown) {
  groupOwner(user);
  const version = await prisma.policyTemplateVersion.findFirst({ where: { id: versionId, schoolId: user.schoolId }, include: { template: true } });
  if (!version) throw new ApiError("Version not found", 404);
  return computePreview(user.schoolId, version.template, version, effectiveFromParam ? new Date(String(effectiveFromParam)) : new Date());
}

async function computePreview(schoolId: string, template: Template, version: Version, at: Date) {
  const domain = template.domain as Domain;
  const campuses = await prisma.campus.findMany({ where: { schoolId, id: { in: template.campusIds } }, select: { id: true, name: true, board: true } });
  const values = version.values as Record<string, unknown>;
  const result = [];
  for (const campus of campuses) {
    const country = (await getLocalePackage(schoolId, campus.id)).country ?? "OTHER";
    const problems: string[] = [];
    if (template.countries.length && !template.countries.includes(country)) problems.push(`Country ${country} is not covered by this template (${template.countries.join(", ")}).`);
    if (template.boards.length && !template.boards.some(b => b.toLowerCase() === (campus.board ?? "").toLowerCase())) problems.push(`Curriculum board "${campus.board ?? "none"}" is not covered by this template (${template.boards.join(", ")}).`);
    const other = await prisma.policyTemplate.findFirst({ where: { schoolId, domain, campusIds: { has: campus.id }, id: { not: template.id } }, select: { title: true } });
    if (other) problems.push(`Already governed by "${other.title}" for ${domain.toLowerCase()}.`);
    const current = await resolve(schoolId, campus.id, domain, new Date(), await localValues(schoolId, campus.id, domain));
    const ov = await prisma.policyOverride.findMany({ where: { schoolId, campusId: campus.id, templateId: template.id, status: { in: ["APPROVED", "PENDING"] }, validUntil: { gt: at } }, select: { id: true, key: true, status: true, validUntil: true } });
    const changes = Object.keys(values).map(key => ({ key, from: current.rows.find(r => r.key === key)?.value ?? null, to: values[key], locked: version.lockedKeys.includes(key) })).filter(c => JSON.stringify(c.from) !== JSON.stringify(c.to));
    result.push({ campusId: campus.id, name: campus.name, country, board: campus.board, compatible: problems.length === 0, problems, changes, keptOverrides: ov.filter(o => version.overridableKeys.includes(o.key)).map(o => ({ id: o.id, key: o.key, status: o.status, validUntil: o.validUntil })), endedOverrides: ov.filter(o => !version.overridableKeys.includes(o.key)).map(o => ({ id: o.id, key: o.key, status: o.status, validUntil: o.validUntil })) });
  }
  const snapshot = JSON.stringify({ v: version.id, values: version.values, locked: version.lockedKeys, over: version.overridableKeys, campuses: result.map(r => ({ id: r.campusId, ok: r.compatible, changes: r.changes, kept: r.keptOverrides.map(o => `${o.id}:${o.status}`), ended: r.endedOverrides.map(o => `${o.id}:${o.status}`) })) });
  return { versionId: version.id, version: version.version, templateTitle: template.title, affected: result.length, blocking: result.filter(r => !r.compatible).length, campuses: result, previewHash: createHash("sha256").update(snapshot).digest("hex") };
}

/** Binds the previewed state and a future (or immediate) effective date, then waits for a second owner. */
export async function submitForReview(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const version = await prisma.policyTemplateVersion.findFirst({ where: { id: String(body.versionId ?? ""), schoolId: user.schoolId, status: "DRAFT" }, include: { template: true } });
  if (!version) throw new ApiError("Draft not found", 404);
  if (!Object.keys(version.values as object).length) throw new ApiError("Set at least one value before submitting.", 400);
  const effectiveFrom = new Date(String(body.effectiveFrom ?? ""));
  if (Number.isNaN(effectiveFrom.getTime())) throw new ApiError("Choose the effective date.", 400);
  const reviewer = await prisma.user.findFirst({ where: { id: String(body.reviewerId ?? ""), schoolId: user.schoolId, isActive: true, OR: [{ role: "SUPER_ADMIN" }, { isInstitutionOwner: true }] }, select: { id: true } });
  if (!reviewer || reviewer.id === user.userId) throw new ApiError("Choose another group policy owner to review this change.", 400);
  const p = await computePreview(user.schoolId, version.template, version, effectiveFrom);
  if (p.previewHash !== String(body.previewHash ?? "")) throw new ApiError("Campus settings changed since your preview. Review the new impact before submitting.", 409);
  if (p.blocking) throw new ApiError(`${p.blocking} campus(es) are incompatible with this template. Remove them or create a separate template for them.`, 409);
  const done = await prisma.policyTemplateVersion.updateMany({ where: { id: version.id, status: "DRAFT" }, data: { status: "IN_REVIEW", effectiveFrom, previewHash: p.previewHash, submittedById: user.userId, reviewerId: reviewer.id } });
  if (!done.count) throw new ApiError("This draft was already submitted.", 409);
  await event(prisma, user.schoolId, "SUBMITTED", user.userId, { templateId: version.templateId, versionId: version.id }, { effectiveFrom, previewHash: p.previewHash, affected: p.affected });
  return { id: version.id, reviewerId: reviewer.id };
}

/** The named reviewer approves only if the campus state still matches what was previewed. */
export async function review(user: AuthUser, body: Record<string, unknown>) {
  groupOwner(user);
  const decision = String(body.decision ?? "");
  const version = await prisma.policyTemplateVersion.findFirst({ where: { id: String(body.versionId ?? ""), schoolId: user.schoolId, status: "IN_REVIEW", activatedAt: null }, include: { template: true } });
  if (!version || !version.effectiveFrom) throw new ApiError("Version awaiting review not found", 404);
  if (version.reviewerId !== user.userId) throw new ApiError("Only the named reviewer can decide this version.", 403);
  if (decision === "RETURN") {
    await prisma.policyTemplateVersion.update({ where: { id: version.id }, data: { status: "DRAFT", previewHash: null, submittedById: null, reviewerId: null, effectiveFrom: null } });
    await event(prisma, user.schoolId, "RETURNED", user.userId, { templateId: version.templateId, versionId: version.id }, { note: text(body.note, 500) });
    return { id: version.id, status: "DRAFT" };
  }
  if (decision !== "APPROVE") throw new ApiError("Approve or return to draft.", 400);
  const p = await computePreview(user.schoolId, version.template, version, version.effectiveFrom);
  if (p.previewHash !== version.previewHash) {
    await event(prisma, user.schoolId, "STALE_APPROVAL", user.userId, { templateId: version.templateId, versionId: version.id }, {});
    throw new ApiError("A campus changed since this version was previewed. Return it to draft and preview again.", 409);
  }
  const done = await prisma.policyTemplateVersion.updateMany({ where: { id: version.id, status: "IN_REVIEW" }, data: { status: "SCHEDULED", reviewedAt: new Date() } });
  if (!done.count) throw new ApiError("This version was already decided.", 409);
  await event(prisma, user.schoolId, "SCHEDULED", user.userId, { templateId: version.templateId, versionId: version.id }, { effectiveFrom: version.effectiveFrom });
  const activated = await activateDue(user.schoolId);
  return { id: version.id, status: activated && version.effectiveFrom <= new Date() ? "ACTIVE" : "SCHEDULED", effectiveFrom: version.effectiveFrom, affected: p.affected };
}

export async function history(user: AuthUser, templateId: string) {
  groupOwner(user);
  return prisma.policyEvent.findMany({ where: { schoolId: user.schoolId, templateId }, orderBy: { createdAt: "asc" } });
}

export async function provenanceFor(user: AuthUser, recordType: string, recordId: string) {
  assertStaffRole(user);
  return prisma.policyProvenance.findMany({ where: { schoolId: user.schoolId, recordType, recordId }, orderBy: { createdAt: "asc" } });
}
