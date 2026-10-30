import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, canManageAcademics, resolveCampusId } from "@/lib/api/scope";
import { academicModelConfigurationSchema, type AcademicModelConfiguration } from "@/lib/academic/model-config";
import { isSameDraft, orderCycles } from "@/lib/academic/cycle-rules";

/**
 * POST /api/academic-models: save a DRAFT academic model version (a campus cohort's terms, subject mapping,
 * grading weights, progression and report rules) or, for the group administrator, a shared template draft.
 * Extracted from the route so the AI Workflows adapter writes the same row through the same checks; the
 * route keeps its responses: 400 with the field errors for an invalid configuration, else 201 with the model.
 * Nothing here activates a model; activation stays on POST /api/academic-models/[id].
 */
export type AcademicModelDraftResult =
  | { ok: false; fieldErrors: Record<string, string[] | undefined> }
  | { ok: true; model: Prisma.AcademicModelVersionGetPayload<object> };

/** The route's guards, run before the body is read (and again by the command). */
export async function assertAcademicModelDraftAccess(user: AuthUser) {
  if (!canManageAcademics(user)) throw new ApiError("Academic configuration editing is required", 403);
  await assertPermission(user, "exams", "edit");
}

export function academicModelCohortKey(name: string) {
  return name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function dateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!value || !Number.isFinite(date.getTime())) throw new ApiError("Enter a valid effective start date", 400);
  return date;
}

export async function createAcademicModelDraft(user: AuthUser, body: Record<string, unknown>): Promise<AcademicModelDraftResult> {
  await assertAcademicModelDraftAccess(user);
  const isTemplate = body.action === "create-template";
  if (isTemplate && user.role !== "SUPER_ADMIN") throw new ApiError("Only a school-group administrator can create a shared template", 403);

  const parsed = academicModelConfigurationSchema.safeParse(body.configuration);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  // SKAI-117: terms are stored in date order so every consumer reads Term 1 before Term 2.
  let configuration: AcademicModelConfiguration = { ...parsed.data, terms: orderCycles(parsed.data.terms) };
  let inheritedConfiguration: AcademicModelConfiguration | null = null;
  let templateSourceId: string | null = null;
  let delegatedOverrideKeys: string[] = [];
  let localOverrideKeys: string[] = [];

  if (isTemplate) {
    if (typeof body.sourceVersionId === "string" && body.sourceVersionId) {
      const source = await prisma.academicModelVersion.findFirst({ where: { id: body.sourceVersionId, schoolId: user.schoolId, campusId: null, isSharedTemplate: true, status: "TEMPLATE", templateApprovedAt: { not: null } } });
      if (!source) throw new ApiError("Approved group template not found", 404);
      templateSourceId = source.id;
      inheritedConfiguration = source.configuration as unknown as AcademicModelConfiguration;
    }
    delegatedOverrideKeys = Array.isArray(body.delegatedOverrideKeys)
      ? body.delegatedOverrideKeys.filter((key: unknown): key is string => ["terms", "subjectMappings", "grading", "progression", "report"].includes(String(key)))
      : [];
  } else {
    const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
    const classIds = [...new Set(configuration.classIds)];
    if (!classIds.length) throw new ApiError("Choose a cohort before saving a campus model", 400);
    const selectedClasses = await prisma.class.findMany({
      where: { id: { in: classIds }, campusId, schoolId: user.schoolId, academicYear: Number(body.academicYear), status: "ACTIVE" },
      select: { id: true, name: true, section: true, academicYear: true },
    });
    if (selectedClasses.length !== classIds.length) throw new ApiError("One or more selected sections are outside this campus or academic year", 403);
    const names = new Set(selectedClasses.map((cls) => cls.name.trim().toLocaleLowerCase()));
    if (names.size !== 1) throw new ApiError("A version applies to one cohort name; choose sections of the same class", 400);
    configuration = { ...configuration, classIds };

    if (body.templateSourceId) {
      const source = await prisma.academicModelVersion.findFirst({ where: { id: String(body.templateSourceId), campusId: null, schoolId: user.schoolId, isSharedTemplate: true, status: "TEMPLATE", templateApprovedAt: { not: null } } });
      if (!source) throw new ApiError("This group template is not approved for adoption", 403);
      inheritedConfiguration = source.configuration as unknown as AcademicModelConfiguration;
      templateSourceId = source.id;
      delegatedOverrideKeys = source.delegatedOverrideKeys;
      // Local section IDs are bindings to this campus. The group template's
      // canonical subject names and other rules stay inherited.
      const comparableLocal = { ...configuration, classIds: [] };
      const comparableInherited = { ...inheritedConfiguration, classIds: [] };
      comparableLocal.subjectMappings = comparableLocal.subjectMappings.map(({ code, label }) => ({ code, label, subjectIds: [] }));
      comparableInherited.subjectMappings = comparableInherited.subjectMappings.map(({ code, label }) => ({ code, label, subjectIds: [] }));
      const changed = ["terms", "subjectMappings", "grading", "progression", "report"].filter((key) => JSON.stringify((comparableLocal as Record<string, unknown>)[key]) !== JSON.stringify((comparableInherited as Record<string, unknown>)[key]));
      localOverrideKeys = changed.filter((key) => key !== "subjectMappings" || JSON.stringify(comparableLocal.subjectMappings.map((row) => [row.code, row.label])) !== JSON.stringify(comparableInherited.subjectMappings.map((row) => [row.code, row.label])));
      const unauthorized = localOverrideKeys.filter((key) => !delegatedOverrideKeys.includes(key));
      if (unauthorized.length) throw new ApiError(`This template does not delegate local changes to ${unauthorized.join(", ")}. Ask the group administrator to delegate those rules.`, 403);
    }
  }

  const academicYear = isTemplate ? 0 : Number(body.academicYear);
  if (!isTemplate && (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100)) throw new ApiError("Enter a valid academic year", 400);
  const campusId = isTemplate ? null : await resolveCampusId(user, body.campusId as string | null | undefined);
  const names = isTemplate ? [] : await prisma.class.findMany({ where: { id: { in: configuration.classIds } }, select: { name: true } });
  const label = isTemplate ? "All campuses" : names[0]?.name ?? String(body.cohortLabel ?? "Cohort");
  const key = isTemplate ? "shared-template" : academicModelCohortKey(label);
  const effectiveFrom = isTemplate ? new Date("2000-01-01T00:00:00.000Z") : dateOnly(String(body.effectiveFrom || `${academicYear}-01-01`));
  const effectiveTo = body.effectiveTo ? dateOnly(String(body.effectiveTo)) : null;
  const title = String(body.title || (isTemplate ? "Group academic template" : `${label} academic model`)).trim().slice(0, 100);
  const model = await prisma.$transaction(async (tx) => {
    const previous = await tx.academicModelVersion.findFirst({
      where: { schoolId: user.schoolId, campusId, academicYear, cohortKey: key },
      orderBy: { version: "desc" },
    });
    if (previous && isSameDraft(previous, { title, effectiveFrom, effectiveTo, configuration })) return previous;
    const created = await tx.academicModelVersion.create({
      data: {
        campusId,
        academicYear,
        cohortKey: key,
        cohortLabel: label,
        title,
        version: (previous?.version ?? 0) + 1,
        status: "DRAFT",
        effectiveFrom,
        effectiveTo,
        configuration: configuration as never,
        templateSourceId,
        inheritedConfiguration: inheritedConfiguration ? inheritedConfiguration as never : Prisma.DbNull,
        delegatedOverrideKeys,
        localOverrideKeys,
        isSharedTemplate: isTemplate,
        createdBy: user.userId,
      },
    });
    await tx.auditLog.create({
      data: { tableName: "academic_model_versions", recordId: created.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { version: created.version, title: created.title, academicYear, cohortLabel: label, isSharedTemplate: isTemplate, templateSourceId } },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
  return { ok: true, model };
}
