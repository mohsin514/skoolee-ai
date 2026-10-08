import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertPermission, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { Prisma } from "@prisma/client";

// Consolidation keeps both immutable IDs and all source foreign keys. A source
// with academic/financial obligations needs case-by-case reconciliation rather
// than a destructive mass-reparent. This restriction is visible in the preview.
async function preview(tx: TxClient, sourceId: string, targetId: string) {
  const pupils = await tx.student.findMany({ where: { id: { in: [sourceId, targetId] } } });
  const source = pupils.find(p => p.id === sourceId), target = pupils.find(p => p.id === targetId);
  if (!source || !target || sourceId === targetId) throw new ApiError("Choose two distinct pupils in this institution", 404);
  const counts: Record<string, number> = {};
  for (const model of Prisma.dmmf.datamodel.models.filter(m => m.fields.some(f => f.kind === "object" && f.type === "Student" && f.relationFromFields?.length))) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    const client = tx as unknown as Record<string, { count(args: unknown): Promise<number> }>;
    const fields = model.fields.filter(f => f.kind === "object" && f.type === "Student").flatMap(f => f.relationFromFields || []);
    counts[delegate] = await client[delegate].count({ where: { OR: fields.map(field => ({ [field]: sourceId })) } });
  }
  const blockers: string[] = [];
  if (source.consolidatedIntoId || target.consolidatedIntoId) blockers.push("An identity is already consolidated; chains are forbidden.");
  if (source.campusId !== target.campusId) blockers.push("Cross-campus consolidation requires separate reconciliation.");
  if (!source.parentUserId || source.parentUserId !== target.parentUserId) blockers.push("Explicit guardian accounts differ or are absent; names cannot establish identity.");
  if (!source.dateOfBirth || !target.dateOfBirth || source.dateOfBirth.valueOf() !== target.dateOfBirth.valueOf()) blockers.push("Verified dates of birth must match.");
  if (source.studentUserId) blockers.push("Source has a pupil login; resolve account ownership first.");
  if (source.siblingGroupId !== target.siblingGroupId) blockers.push("Family groups differ.");
  const preservedModels = new Set(["studentEnrollment", "studentTimelineEvent", "studentDocument"]);
  for (const [model, count] of Object.entries(counts)) if (count && !preservedModels.has(model)) blockers.push(`${model}: ${count} records require reconciliation before consolidation.`);
  const report = { source: { id: source.id, fullName: source.fullName, admissionNo: source.admissionNo }, target: { id: target.id, fullName: target.fullName, admissionNo: target.admissionNo }, counts, blockers,
    outcome: "Archive the duplicate as an identity alias. No academic, financial, document or family foreign key is rewritten; originals remain auditable." };
  const token = createHash("sha256").update(JSON.stringify({ report, source, target })).digest("hex");
  return { ...report, token };
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "SUPER_ADMIN") throw new ApiError("Institution administrators alone may review or consolidate identities", 403);
    await assertPermission(user, "students", "delete");
    const body = await req.json();
    const sourceId = String(body.sourceId || ""), targetId = String(body.targetId || "");
    if (body.action === "preview") return Response.json(await preview(prisma, sourceId, targetId));
    if (body.action !== "confirm" || body.verifiedSourceId !== sourceId || body.verifiedTargetId !== targetId || !String(body.reason || "").trim()) throw new ApiError("Verify both permanent IDs and record a reason", 400);
    const result = await prisma.$transaction(async tx => {
      const report = await preview(tx, sourceId, targetId);
      if (report.blockers.length) throw new ApiError(report.blockers.join(" "), 409);
      if (body.token !== report.token) throw new ApiError("Dependencies changed. Preview consolidation again.", 409);
      await tx.studentEnrollment.updateMany({ where: { studentId: sourceId, status: "ACTIVE", endDate: null }, data: { status: "CONSOLIDATED" } });
      await tx.student.update({ where: { id: sourceId }, data: { status: "consolidated", consolidatedIntoId: targetId } });
      for (const id of [sourceId, targetId]) await tx.studentTimelineEvent.create({ data: { studentId: id, kind: "IDENTITY_CONSOLIDATED", title: "Duplicate identity reviewed", detail: JSON.stringify({ sourceId, targetId, reason: String(body.reason), counts: report.counts }), actorId: user.userId } });
      await tx.auditLog.create({ data: { tableName: "students", recordId: sourceId, userId: user.userId, oldValue: { consolidatedIntoId: null }, newValue: { targetId, reason: String(body.reason), counts: report.counts } } });
      return { sourceId, targetId, preserved: report.counts };
    }, { isolationLevel: "Serializable" });
    return Response.json(result);
  } catch (error) { return errorResponse(error, "Unable to consolidate pupil identities"); }
}
