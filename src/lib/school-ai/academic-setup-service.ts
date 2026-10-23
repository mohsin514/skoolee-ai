import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError, resolveWorkspaceCampus } from "./access";
import { academicClassIdentity, normalizeAcademicName, type AcademicSetupPreview } from "./academic-setup";
import { workflowDataSchema } from "./schemas";
import { workspaceRequestHash } from "./repository";

const dateString = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

/** Existing academic-cycle guards also run here, inside the preview/apply transaction. */
export async function previewAcademicSetup(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient): Promise<AcademicSetupPreview> {
  await resolveWorkspaceCampus(user, record.campusId, db);
  const data = workflowDataSchema.parse(record.data);
  const proposal = data.proposal;
  if (!proposal || proposal.operation !== "academics.setup_year") throw new SchoolAiError("This saved workflow does not contain an academic setup proposal.", 400, "SETUP_PROPOSAL_REQUIRED");
  if (data.missingInformation.length || !data.steps.length || data.steps.some(step => step.status === "blocked")) throw new SchoolAiError("Resolve the workflow's missing information and blockers before setup.", 422, "SETUP_INCOMPLETE");
  const cycles = await db.academicCycle.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId }, orderBy: { academicYear: "asc" } });
  const target = cycles.find(cycle => cycle.academicYear === proposal.academicYear);
  if (proposal.existingCycleId && target?.id !== proposal.existingCycleId) throw new SchoolAiError("The selected academic year is unavailable. Reload its current details.", 409, "CYCLE_DETAILS_CONFLICT");
  const activeOther = cycles.find(cycle => cycle.status === "ACTIVE" && cycle.id !== target?.id);
  if (activeOther) throw new SchoolAiError(`End or pause the active cycle ${activeOther.label} before preparing a different academic year.`, 409, "ACTIVE_CYCLE_CONFLICT");
  const unclosed = cycles.filter(cycle => cycle.academicYear < proposal.academicYear && cycle.status !== "ENDED");
  if (unclosed.length) throw new SchoolAiError(`Close ${unclosed.map(cycle => cycle.label).join(", ")} before preparing ${proposal.label}.`, 409, "PRIOR_CYCLE_UNCLOSED");
  if (target && !["DRAFT", "ACTIVE"].includes(target.status)) throw new SchoolAiError("This academic cycle is paused or ended. Use its existing lifecycle controls before adding classes.", 409, "CYCLE_NOT_OPEN");
  if (target && (normalizeAcademicName(target.label) !== normalizeAcademicName(proposal.label) || dateString(target.startDate) !== proposal.startDate || dateString(target.endDate) !== proposal.endDate)) throw new SchoolAiError("An academic cycle already exists for this year with different details. Match its label and dates; this tool never overwrites an existing cycle.", 409, "CYCLE_DETAILS_CONFLICT");

  const classes = await db.class.findMany({
    where: { schoolId: user.schoolId, campusId: record.campusId, academicYear: proposal.academicYear },
    select: { id: true, name: true, section: true, academicYear: true, status: true, archivedAt: true, classTeacherId: true, teachingMode: true },
    orderBy: { id: "asc" }, take: 5001,
  });
  if (classes.length > 5000) throw new SchoolAiError("This campus has too many classes for one setup preview. Review its class records first.", 422, "SETUP_SCOPE_TOO_LARGE");
  const willCreate: AcademicSetupPreview["willCreate"] = [], willKeep: AcademicSetupPreview["willKeep"] = [];
  for (const item of proposal.classes) {
    const matched = classes.filter(row => academicClassIdentity(row.name, row.section) === academicClassIdentity(item.name, item.section));
    if (matched.length > 1) throw new SchoolAiError(`Resolve duplicate existing classes for ${item.name}${item.section ? ` ${item.section}` : ""} before applying setup.`, 409, "CLASS_DUPLICATE_CONFLICT");
    const existing = matched[0];
    if (existing) {
      if (existing.archivedAt || existing.status !== "ACTIVE" || existing.teachingMode !== item.teachingMode) throw new SchoolAiError(`The existing class ${existing.name}${existing.section ? ` ${existing.section}` : ""} has a conflicting status or teaching mode. Review it in Classes first.`, 409, "CLASS_DETAILS_CONFLICT");
      willKeep.push({ proposalClassId: item.id, classId: existing.id, name: existing.name, section: existing.section, teachingMode: item.teachingMode });
    } else willCreate.push({ proposalClassId: item.id, name: normalizeAcademicName(item.name), section: item.section ? normalizeAcademicName(item.section) : null, teachingMode: item.teachingMode });
  }
  const preview = {
    operation: "academics.setup_year" as const, recordId: record.id, version: record.version, campusId: record.campusId, academicYear: proposal.academicYear,
    cycle: { action: target ? "KEEP" as const : "CREATE" as const, id: target?.id ?? null, label: target?.label ?? normalizeAcademicName(proposal.label), startDate: proposal.startDate, endDate: proposal.endDate, status: target?.status === "ACTIVE" ? "ACTIVE" as const : "DRAFT" as const },
    willCreate, willKeep,
  };
  const state = JSON.parse(JSON.stringify({ cycles, classes })) as unknown; // Preserve date values in the canonical hash.
  return { ...preview, previewHash: workspaceRequestHash({ preview, proposal, state }) };
}

/** New classes are ordinary active class rows; a new cycle stays DRAFT for existing lifecycle review. */
export async function applyAcademicSetup(user: AuthUser, preview: AcademicSetupPreview, db: TxClient) {
  let cycleId = preview.cycle.id;
  if (!cycleId) {
    const cycle = await db.academicCycle.create({ data: {
      schoolId: user.schoolId, campusId: preview.campusId, academicYear: preview.academicYear, label: preview.cycle.label, status: "DRAFT",
      startDate: preview.cycle.startDate ? new Date(`${preview.cycle.startDate}T00:00:00.000Z`) : null,
      endDate: preview.cycle.endDate ? new Date(`${preview.cycle.endDate}T00:00:00.000Z`) : null,
    } });
    cycleId = cycle.id;
    await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: cycle.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: preview.operation, workspaceId: preview.recordId, workspaceVersion: preview.version, academicYear: preview.academicYear, label: cycle.label, status: cycle.status } } });
  }
  const classIds = preview.willKeep.map(item => item.classId);
  for (const item of preview.willCreate) {
    const created = await db.class.create({ data: { schoolId: user.schoolId, campusId: preview.campusId, name: item.name, section: item.section, academicYear: preview.academicYear, status: "ACTIVE", teachingMode: item.teachingMode, classTeacherId: null } });
    classIds.push(created.id);
    await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "class", recordId: created.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: preview.operation, workspaceId: preview.recordId, workspaceVersion: preview.version, name: created.name, section: created.section, academicYear: created.academicYear, teachingMode: created.teachingMode } } });
  }
  return { createdCount: preview.willCreate.length, keptCount: preview.willKeep.length, cycleId, cycleCreated: preview.cycle.action === "CREATE", classIds };
}
