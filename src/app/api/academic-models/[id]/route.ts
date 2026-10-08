import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { academicModelConfigurationSchema, changedConfigurationSections, simulateAcademicResult, validateAcademicModel, type AcademicModelConfiguration, type SimulatedComponent } from "@/lib/academic/model-config";
import { Prisma } from "@prisma/client";

type Context = { params: Promise<{ id: string }> };
function overlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null) {
  return aStart <= (bEnd ?? new Date("9999-12-31T00:00:00Z")) && bStart <= (aEnd ?? new Date("9999-12-31T00:00:00Z"));
}
function idsIntersect(a: string[], b: string[]) {
  const ids = new Set(a);
  return b.some((id) => ids.has(id));
}
function localDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "exams", "view");
    const { id } = await context.params;
    const model = await prisma.academicModelVersion.findFirst({ where: { id } });
    if (!model || model.schoolId !== user.schoolId) throw new ApiError("Academic model version not found", 404);
    if (model.isSharedTemplate && user.role !== "SUPER_ADMIN") throw new ApiError("Only a school-group administrator can view shared template drafts", 403);
    if (!model.isSharedTemplate && model.campusId !== user.campusId && user.role !== "SUPER_ADMIN") throw new ApiError("Academic model is outside your campus", 403);
    return Response.json({ success: true, model });
  } catch (error) {
    return errorResponse(error, "[academic-models/:id] GET failed");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Academic configuration approval is required", 403);
    await assertPermission(user, "exams", "edit");
    const { id } = await context.params;
    const body = await request.json();
    const model = await prisma.academicModelVersion.findFirst({ where: { id } });
    if (!model || model.schoolId !== user.schoolId) throw new ApiError("Academic model version not found", 404);
    if (model.isSharedTemplate) {
      if (user.role !== "SUPER_ADMIN") throw new ApiError("Only a school-group administrator can approve shared templates", 403);
    } else {
      const allowedCampus = await resolveCampusId(user, body.campusId ?? model.campusId);
      if (allowedCampus !== model.campusId) throw new ApiError("Academic model is outside your campus", 403);
    }
    const action = String(body.action ?? "");

    if (action === "approve-template") {
      if (!model.isSharedTemplate || model.status !== "DRAFT") throw new ApiError("Only a shared template draft can be approved", 409);
      const parsed = academicModelConfigurationSchema.safeParse(model.configuration);
      if (!parsed.success) throw new ApiError("Repair the template fields before approval", 400);
      const problems = validateAcademicModel(parsed.data, { effectiveFrom: "2000-01-01", template: true });
      if (problems.length) return Response.json({ success: false, problems }, { status: 409 });
      const approved = await prisma.academicModelVersion.update({
        where: { id },
        data: { status: "TEMPLATE", templateApprovedAt: new Date(), templateApprovedBy: user.userId, approvedAt: new Date(), approvedBy: user.userId },
      });
      await prisma.auditLog.create({ data: { tableName: "academic_model_versions", recordId: id, userId: user.userId, oldValue: { status: model.status }, newValue: { status: "TEMPLATE", templateApprovedAt: approved.templateApprovedAt } } });
      return Response.json({ success: true, model: approved });
    }

    if (model.isSharedTemplate || model.status !== "DRAFT") throw new ApiError("Only a campus draft can be previewed or activated", 409);
    const configuration = model.configuration as unknown as AcademicModelConfiguration;
    const parsed = academicModelConfigurationSchema.safeParse(configuration);
    if (!parsed.success) throw new ApiError("Configuration contains invalid fields", 400);
    const selectedClassIds = configuration.classIds;
    const classes = await prisma.class.findMany({
      where: { id: { in: selectedClassIds }, campusId: model.campusId!, schoolId: user.schoolId, academicYear: model.academicYear, status: "ACTIVE" },
      select: { id: true, name: true, subjects: { select: { id: true, name: true } } },
    });
    if (classes.length !== selectedClassIds.length) throw new ApiError("One or more mapped class sections no longer belong to this campus and year", 409);
    const actualSubjects = classes.flatMap((cls) => cls.subjects.map((subject) => ({ classId: cls.id, subjectId: subject.id })));
    const problems = validateAcademicModel(configuration, {
      effectiveFrom: model.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: model.effectiveTo?.toISOString().slice(0, 10),
      selectedClassIds,
      actualSubjects,
    });
    const activeVersions = await prisma.academicModelVersion.findMany({
      where: { campusId: model.campusId, academicYear: model.academicYear, status: "ACTIVE" },
      select: { id: true, title: true, cohortLabel: true, effectiveFrom: true, effectiveTo: true, configuration: true },
    });
    const conflicting = activeVersions.filter((active) => {
      const activeConfig = active.configuration as unknown as AcademicModelConfiguration;
      return idsIntersect(selectedClassIds, activeConfig.classIds ?? []) && overlap(model.effectiveFrom, model.effectiveTo, active.effectiveFrom, active.effectiveTo);
    });
    for (const conflict of conflicting) {
      problems.push({ code: "period_conflict", message: `The effective dates overlap ${conflict.title} (version covering ${conflict.cohortLabel}).`, repairHref: `/admin?view=academic-model#academic-model-periods` });
    }
    const changedFrom = activeVersions.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
    const changedSections = changedFrom ? changedConfigurationSections(changedFrom.configuration, configuration) : ["terms", "subjectMappings", "grading", "progression", "report", "classIds"];
    const [studentCount, examCount, publishedReportCount, pendingReportCount] = selectedClassIds.length ? await Promise.all([
      prisma.student.count({ where: { campusId: model.campusId!, classId: { in: selectedClassIds } } }),
      prisma.exam.count({ where: { campusId: model.campusId!, classId: { in: selectedClassIds }, academicYear: model.academicYear } }),
      prisma.reportCard.count({ where: { campusId: model.campusId!, exam: { classId: { in: selectedClassIds }, academicYear: model.academicYear }, status: "PUBLISHED" } }),
      prisma.reportCard.count({ where: { campusId: model.campusId!, exam: { classId: { in: selectedClassIds }, academicYear: model.academicYear }, status: { not: "PUBLISHED" } } }),
    ]) : [0, 0, 0, 0];
    const components: SimulatedComponent[] = (Array.isArray(body.components) ? body.components : [
      { label: "Quiz", score: 80, total: 100, status: "SCORED", weight: configuration.grading.quizWeight },
      { label: "Class test", score: 70, total: 100, status: "SCORED", weight: configuration.grading.classTestWeight },
      { label: "Mid-term", score: 90, total: 100, status: "SCORED", weight: configuration.grading.midTermWeight },
      { label: "Final", score: 0, total: 100, status: "MISSING", weight: configuration.grading.finalWeight },
    ]).map((component: any) => ({ ...component, weight: Number(component.weight), total: Number(component.total), score: component.score === null ? null : Number(component.score) }));
    const simulation = simulateAcademicResult(configuration, components);
    if (action === "simulate") return Response.json({ success: true, simulation });
    const preview = { success: problems.length === 0, problems, changedSections, simulation, impact: { students: studentCount, exams: examCount, publishedReports: publishedReportCount, pendingReports: pendingReportCount }, inheritedRules: model.inheritedConfiguration, localOverrideKeys: model.localOverrideKeys };
    if (action === "preview") return Response.json(preview, { status: problems.length ? 409 : 200 });
    if (action !== "activate") throw new ApiError("Unsupported academic model action", 400);
    if (problems.length) return Response.json(preview, { status: 409 });

    const grading = configuration.grading;
    const grades = new Map(grading.thresholds.map((threshold) => [threshold.label.toUpperCase(), threshold.minimum]));
    const activated = await prisma.$transaction(async (tx) => {
      const currentActive = await tx.academicModelVersion.findMany({ where: { campusId: model.campusId, academicYear: model.academicYear, status: "ACTIVE" }, select: { id: true, effectiveFrom: true, effectiveTo: true, configuration: true } });
      const raceConflict = currentActive.find((active) => {
        const activeConfig = active.configuration as unknown as AcademicModelConfiguration;
        return idsIntersect(selectedClassIds, activeConfig.classIds ?? []) && overlap(model.effectiveFrom, model.effectiveTo, active.effectiveFrom, active.effectiveTo);
      });
      if (raceConflict) throw new ApiError("Another model became active for this cohort and period. Reload the preview.", 409);
      for (const classId of selectedClassIds) {
        await tx.gradeWeightConfig.upsert({
          where: { classId_academicYear: { classId, academicYear: model.academicYear } },
          update: {
            quizWeight: grading.quizWeight, classTestWeight: grading.classTestWeight, midTermWeight: grading.midTermWeight, finalWeight: grading.finalWeight,
            passingPercentage: grading.passingPercentage, weightMode: grading.weightMode,
            gradeAplus: grades.get("A+") ?? 90, gradeA: grades.get("A") ?? 80, gradeB: grades.get("B") ?? 70, gradeC: grades.get("C") ?? 60, gradeD: grades.get("D") ?? 50,
            missingMarkPolicy: grading.missingPolicy, absentMarkPolicy: grading.absentPolicy, exemptMarkPolicy: grading.exemptPolicy,
            roundingRule: grading.roundingRule, academicModelVersionId: model.id,
          },
          create: {
            campusId: model.campusId!, classId, academicYear: model.academicYear,
            quizWeight: grading.quizWeight, classTestWeight: grading.classTestWeight, midTermWeight: grading.midTermWeight, finalWeight: grading.finalWeight,
            passingPercentage: grading.passingPercentage, weightMode: grading.weightMode,
            gradeAplus: grades.get("A+") ?? 90, gradeA: grades.get("A") ?? 80, gradeB: grades.get("B") ?? 70, gradeC: grades.get("C") ?? 60, gradeD: grades.get("D") ?? 50,
            missingMarkPolicy: grading.missingPolicy, absentMarkPolicy: grading.absentPolicy, exemptMarkPolicy: grading.exemptPolicy,
            roundingRule: grading.roundingRule, academicModelVersionId: model.id,
          },
        });
      }
      const version = await tx.academicModelVersion.update({
        where: { id: model.id },
        data: { status: "ACTIVE", approvedAt: new Date(), approvedBy: user.userId },
      });
      await tx.auditLog.create({ data: { tableName: "academic_model_versions", recordId: model.id, userId: user.userId, oldValue: { status: "DRAFT" }, newValue: { status: "ACTIVE", version: model.version, changedSections, effectiveFrom: model.effectiveFrom, effectiveTo: model.effectiveTo, impactedStudents: studentCount, impactedPublishedReports: publishedReportCount } } });
      return version;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ success: true, model: activated, preview: { changedSections, simulation, impact: preview.impact } });
  } catch (error) {
    return errorResponse(error, "[academic-models/:id] POST failed");
  }
}
