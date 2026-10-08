"use server";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { JWT_SECRET } from "@/lib/auth/secret";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { wallTimeInstants } from "@/lib/locale/events";
import { currencyForCountry } from "@/lib/locale/country";
import { assertDelegatedChanges, canManageSchool, dateOnly, defaultLocale, LANGUAGES, localePatchSchema, POLICY_KEYS, resolvePackage } from "@/lib/locale/package";
import { getLocalePackage } from "@/lib/locale/store";

async function session() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("permission");
  return runWithTenantContext(auth, async () => {
    const user = await prisma.user.findFirst({ where: { id: auth.userId, schoolId: auth.schoolId, isActive: true }, select: { id: true, schoolId: true, campusId: true, role: true, preferredLanguage: true } });
    if (!user) throw new Error("permission");
    await assertSchoolOperational(user.schoolId);
    return user;
  });
}
async function context(user: Awaited<ReturnType<typeof session>>) {
  const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId }, select: { id: true, name: true, localeDelegatedFields: true } });
  // School-level counts must not be narrowed by the current principal's campus guard.
  const school = await prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { _count: { select: { campuses: true, users: { where: { role: "SUPER_ADMIN", isActive: true } } } } } });
  const grouped = school._count.campuses > 1 || school._count.users > 0;
  const scopeCount = grouped ? Math.max(2, school._count.campuses) : school._count.campuses;
  return { campuses, grouped, scopeCount, canManage: canManageSchool(user.role, scopeCount) };
}
export async function getLocaleSettings() {
  const user = await session();
  return runWithTenantContext(user, async () => {
    if (user.role === "APP_OWNER") return { personal: user.preferredLanguage, role: user.role, canManage: false, ownCampusId: null, grouped: false, school: defaultLocale, campuses: [], policies: [] };
    const { campuses, canManage, grouped } = await context(user);
    const visible = canManage ? campuses : campuses.filter((c) => c.id === user.campusId);
    const policies = await prisma.localePolicy.findMany({ where: { schoolId: user.schoolId, OR: [{ campusId: null }, ...visible.map((c) => ({ campusId: c.id }))] }, orderBy: { effectiveAt: "desc" }, take: 100 });
    return { personal: user.preferredLanguage, role: user.role, canManage, ownCampusId: user.campusId, grouped,
      school: await getLocalePackage(user.schoolId), campuses: await Promise.all(visible.map(async (c) => ({ ...c, policy: await getLocalePackage(user.schoolId, c.id) }))),
      policies: policies.map((p) => ({ id: p.id, campusId: p.campusId, settings: localePatchSchema.parse(p.settings), effectiveAt: p.effectiveAt.toISOString(), status: p.status })) };
  });
}
export async function saveLanguagePreference(language: string | null) {
  const preferredLanguage = z.enum(LANGUAGES).nullable().parse(language);
  const user = await session();
  await runWithTenantContext(user, async () => { await prisma.user.update({ where: { id: user.id, schoolId: user.schoolId }, data: { preferredLanguage } }); });
  return { preferredLanguage };
}
const changeSchema = z.object({ campusId: z.string().min(1).nullable(), settings: localePatchSchema, effectiveDate: z.string().transform(dateOnly) }).strict();
async function revision(schoolId: string, db: Pick<typeof prisma, "localePolicy" | "campus"> = prisma) {
  const [rows, campuses] = await Promise.all([db.localePolicy.findMany({ where: { schoolId }, orderBy: { id: "asc" } }), db.campus.findMany({ where: { schoolId }, select: { id: true, localeDelegatedFields: true }, orderBy: { id: "asc" } })]);
  return createHash("sha256").update(JSON.stringify({ rows, campuses })).digest("hex");
}
export async function previewLocaleChange(input: unknown) {
  const change = changeSchema.parse(input);
  if (change.settings.country) change.settings.currency = currencyForCountry(change.settings.country);
  const user = await session();
  return runWithTenantContext(user, async () => {
    const { campuses, scopeCount } = await context(user);
    const campus = change.campusId ? campuses.find((c) => c.id === change.campusId) : null;
    if (change.campusId && !campus) throw new Error("permission");
    assertDelegatedChanges(user.role, user.campusId, change.campusId, scopeCount, campus?.localeDelegatedFields || [], change.settings);
    const effectiveAt = new Date(`${change.effectiveDate}T00:00:00Z`);
    if (effectiveAt.getTime() <= Date.now()) throw new Error("futureDate");
    const before = await getLocalePackage(user.schoolId, change.campusId, effectiveAt);
    const school = await getLocalePackage(user.schoolId, null, effectiveAt);
    let settings = change.settings;
    if (campus && !canManageSchool(user.role, scopeCount)) {
      const existing = await prisma.localePolicy.findFirst({ where: { schoolId: user.schoolId, campusId: campus.id, status: "ACTIVE", effectiveAt: { lte: effectiveAt } }, orderBy: { effectiveAt: "desc" } });
      const retained = Object.fromEntries(Object.entries(localePatchSchema.parse(existing?.settings || {})).filter(([key]) => !campus.localeDelegatedFields.includes(key)));
      settings = { ...retained, ...settings };
    }
    const after = resolvePackage(change.campusId ? school : before, settings);
    const scheduled = await prisma.examSchedule.findMany({ where: { schoolId: user.schoolId, campusId: change.campusId || { in: campuses.map((c) => c.id) }, date: { gte: effectiveAt }, periodDefinitionId: { not: null } }, include: { exam: { select: { title: true } }, periodDefinition: { select: { startTime: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 100 });
    const events = await Promise.all(scheduled.map(async (event) => {
      const date = event.date.toISOString().slice(0, 10); const time = event.periodDefinition!.startTime;
      const previous = await getLocalePackage(user.schoolId, event.campusId, event.date);
      const proposed = change.campusId ? after : resolvePackage(after, localePatchSchema.parse((await prisma.localePolicy.findFirst({ where: { schoolId: user.schoolId, campusId: event.campusId, status: "ACTIVE", effectiveAt: { lte: event.date } }, orderBy: { effectiveAt: "desc" } }))?.settings || {}));
      return { id: event.id, title: event.exam.title, date, time, beforeZone: previous.timezone, afterZone: proposed.timezone, beforeUtc: wallTimeInstants(date, time, previous.timezone), afterUtc: wallTimeInstants(date, time, proposed.timezone) };
    }));
    const token = await new SignJWT({ change, revision: await revision(user.schoolId) }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setAudience("locale-preview").setExpirationTime("20m").sign(JWT_SECRET);
    return { before, after, settings, events, token, currencyReview: before.currency !== after.currency, effectiveAt: effectiveAt.toISOString() };
  });
}
export async function applyLocaleChange(token: string) {
  const user = await session();
  const { payload } = await jwtVerify(token, JWT_SECRET, { audience: "locale-preview", subject: user.id });
  const change = changeSchema.parse(payload.change);
  return runWithTenantContext(user, async () => {
    // Re-authorize against current membership and delegation on every apply.
    const preview = await previewLocaleChange(change);
    return prisma.$transaction(async (tx) => {
      if (payload.revision !== await revision(user.schoolId, tx)) throw new Error("stale");
      const current = await tx.user.findFirst({ where: { id: user.id, schoolId: user.schoolId, isActive: true } });
      if (!current || current.role !== user.role || current.campusId !== user.campusId) throw new Error("permission");
      const campusRows = await tx.campus.findMany({ where: { schoolId: user.schoolId }, select: { id: true, localeDelegatedFields: true } });
      const school = await tx.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { _count: { select: { campuses: true, users: { where: { role: "SUPER_ADMIN", isActive: true } } } } } });
      const scopeCount = school._count.users > 0 ? Math.max(2, school._count.campuses) : school._count.campuses;
      const campus = campusRows.find((c) => c.id === change.campusId);
      assertDelegatedChanges(current.role, current.campusId, change.campusId, scopeCount, campus?.localeDelegatedFields || [], change.settings);
      const record = await tx.localePolicy.create({ data: { schoolId: user.schoolId, campusId: change.campusId, scopeKey: change.campusId || "school", settings: preview.settings, effectiveAt: new Date(preview.effectiveAt), createdBy: user.id, status: preview.currencyReview ? "FINANCE_REVIEW" : "ACTIVE" } });
      return { id: record.id, status: record.status };
    }, { isolationLevel: "Serializable" });
  });
}
export async function setLocaleDelegation(campusId: string, fields: string[]) {
  const selected = z.array(z.enum(POLICY_KEYS as [typeof POLICY_KEYS[number], ...typeof POLICY_KEYS[number][]])).parse(fields);
  const user = await session();
  return runWithTenantContext(user, async () => {
    const { campuses, canManage } = await context(user);
    if (!canManage || !campuses.some((c) => c.id === campusId)) throw new Error("permission");
    await prisma.campus.update({ where: { id: campusId, schoolId: user.schoolId }, data: { localeDelegatedFields: [...new Set(selected)] } });
  });
}
export async function reviewLocaleCurrency(id: string, approved: boolean) {
  const user = await session();
  if (user.role !== "ACCOUNTANT") throw new Error("permission");
  return runWithTenantContext(user, async () => {
    const result = await prisma.localePolicy.updateMany({ where: { id, schoolId: user.schoolId, status: "FINANCE_REVIEW", createdBy: { not: user.id }, effectiveAt: { gt: new Date() }, ...(user.campusId ? { OR: [{ campusId: user.campusId }, { campusId: null }] } : {}) }, data: { status: approved ? "ACTIVE" : "REJECTED", financeReviewedBy: user.id } });
    if (result.count !== 1) throw new Error("permission");
  });
}

export async function getEffectiveDisplayLocale() {
  const user = await session();
  const personal = user.preferredLanguage === "en" || user.preferredLanguage === "ar" ? user.preferredLanguage : null;
  if (user.role === "APP_OWNER") return resolvePackage(defaultLocale, {}, personal);
  return runWithTenantContext(user, () => getLocalePackage(user.schoolId, user.campusId, new Date(), personal));
}
