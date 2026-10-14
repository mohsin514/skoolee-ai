import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { assertPermission } from "@/lib/permissions";
import { EMPTY_GUARDIAN_PERMISSIONS, parseGuardianPermissions } from "@/lib/parent/guardian-access";

const permissionsSchema = z.object({
  learningRecords: z.boolean(), attendance: z.boolean(), finances: z.boolean(),
  communication: z.boolean(), pickup: z.boolean(),
  consents: z.object({
    medicalTreatment: z.boolean(), fieldTrips: z.boolean(), mediaPublication: z.boolean(), offsiteTravel: z.boolean(),
  }).strict(),
}).strict();

const guardianSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().trim().max(254).transform((value) => value.toLocaleLowerCase("en-US")),
  phone: z.string().trim().max(40).optional().nullable(),
  relationship: z.enum(["mother", "father", "step-parent", "grandparent", "legal guardian", "aunt", "uncle", "sibling", "other"]),
  permissions: permissionsSchema,
  effectiveFrom: z.iso.datetime().optional(),
  validUntil: z.iso.datetime().optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).optional(),
  reason: z.string().trim().min(5).max(500),
});

const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), relationshipId: z.string().optional(), ...guardianSchema.shape }),
  z.object({ action: z.literal("apply"), relationshipId: z.string().min(1), previewId: z.string().min(1) }),
  z.object({ action: z.literal("resolve-review"), reviewId: z.string().min(1), reason: z.string().trim().min(5).max(500) }),
]);

function activePermissionVersion(versions: Array<{ id: string; permissions: unknown; effectiveFrom: Date; effectiveUntil: Date | null }>, at: Date) {
  return versions.find((item) => item.effectiveFrom <= at && (!item.effectiveUntil || item.effectiveUntil > at)) ?? null;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "view");
    const { id: studentId } = await params;
    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true, fullName: true, rollNo: true, campusId: true, campus: { select: { name: true } } },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const [relationships, reviewQueue] = await Promise.all([
      prisma.guardianRelationship.findMany({
        where: { schoolId: user.schoolId, studentId },
        include: { accessVersions: { orderBy: { effectiveFrom: "desc" } }, accessEvents: { orderBy: { createdAt: "desc" }, take: 25, include: { actor: { select: { fullName: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      req.nextUrl.searchParams.get("review") === "1" ? prisma.guardianReviewQueue.findMany({
        where: { schoolId: user.schoolId, studentId, status: "OPEN" }, orderBy: { createdAt: "asc" },
        select: { id: true, contactName: true, email: true, phone: true, legacyRelationship: true, reason: true, createdAt: true },
      }) : Promise.resolve([]),
    ]);
    const now = new Date();
    return Response.json({
      success: true,
      student,
      relationships: relationships.map(({ accessVersions, accessEvents, ...relation }) => ({
        ...relation,
        permissions: relation.status === "ACTIVE" || relation.status === "INVITED"
          ? parseGuardianPermissions(activePermissionVersion(accessVersions, now)?.permissions ?? EMPTY_GUARDIAN_PERMISSIONS)
          : EMPTY_GUARDIAN_PERMISSIONS,
        events: accessEvents.map(({ actor, ...event }) => ({ ...event, actorName: actor.fullName })),
      })),
      reviewQueue,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Failed to load guardian access"); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "edit");
    const { id: studentId } = await params;
    const parsed = decisionSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("Please check the guardian details and try again", 400);
    const input = parsed.data;
    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true, schoolId: true, campusId: true, fullName: true },
    });
    if (!student) throw new ApiError("Student not found", 404);

    if (input.action === "resolve-review") {
      const changed = await prisma.guardianReviewQueue.updateMany({
        where: { id: input.reviewId, schoolId: user.schoolId, studentId, status: "OPEN" },
        data: { status: "REVIEWED", reviewedByUserId: user.userId, reviewedAt: new Date() },
      });
      if (changed.count !== 1) throw new ApiError("Review item is no longer open", 409);
      await prisma.auditLog.create({ data: {
        schoolId: user.schoolId, tableName: "guardian_review_queue", recordId: input.reviewId,
        userId: user.userId, oldValue: { status: "OPEN" }, newValue: { status: "REVIEWED", reason: input.reason },
      } });
      return Response.json({ success: true });
    }

    if (input.action === "preview") {
      const now = new Date();
      const effectiveFrom = input.status === "SUSPENDED" || input.status === "REVOKED" ? now : input.effectiveFrom ? new Date(input.effectiveFrom) : now;
      const validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (Number.isNaN(effectiveFrom.getTime()) || validUntil && Number.isNaN(validUntil.getTime()) || validUntil && validUntil <= effectiveFrom) {
        throw new ApiError("The effective dates are invalid", 400);
      }
      const permissions = parseGuardianPermissions(input.permissions);
      let relationship = input.relationshipId
        ? await prisma.guardianRelationship.findFirst({ where: { id: input.relationshipId, schoolId: user.schoolId, studentId }, include: { accessVersions: { orderBy: { effectiveFrom: "desc" } } } })
        : null;
      if (input.relationshipId && !relationship) throw new ApiError("Guardian relationship not found", 404);
      if (!relationship) {
        const duplicate = await prisma.guardianRelationship.findFirst({
          where: { schoolId: user.schoolId, studentId, status: { not: "REVOKED" }, email: { equals: input.email, mode: "insensitive" } },
          select: { id: true },
        });
        if (duplicate) throw new ApiError("This email already has a guardian relationship for the child. Edit that relationship instead.", 409);
      }
      if (!relationship) relationship = await prisma.guardianRelationship.create({ data: {
        id: randomUUID(), schoolId: student.schoolId, campusId: student.campusId, studentId,
        createdByUserId: user.userId, fullName: input.fullName, email: input.email,
        phone: input.phone || null, relationship: input.relationship, status: "DRAFT",
        validFrom: effectiveFrom, validUntil,
        invitationExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      }, include: { accessVersions: true } });

      const current = activePermissionVersion(relationship.accessVersions, now);
      const beforeState = { status: relationship.status, currentVersionId: current?.id ?? null, permissions: current ? parseGuardianPermissions(current.permissions) : null };
      const afterState = { status: input.status ?? (relationship.status === "DRAFT" ? "INVITED" : relationship.status), permissions, effectiveFrom: effectiveFrom.toISOString(), validUntil: validUntil?.toISOString() ?? null };
      const preview = await prisma.guardianAccessEvent.create({ data: {
        id: randomUUID(), schoolId: user.schoolId, relationshipId: relationship.id, actorUserId: user.userId,
        action: "CHANGE_PREVIEWED", reason: input.reason, beforeState, afterState, effectiveAt: effectiveFrom,
      }, select: { id: true } });
      const effectiveAccess = input.status === "SUSPENDED" || input.status === "REVOKED" ? EMPTY_GUARDIAN_PERMISSIONS : permissions;
      return Response.json({ success: true, relationshipId: relationship.id, previewId: preview.id, effectiveAccess,
        impact: {
          child: student.fullName,
          guardian: relationship.fullName,
          learning: effectiveAccess.learningRecords ? "Can view learning records and published reports" : "Cannot view learning records",
          attendance: effectiveAccess.attendance ? "Can view attendance" : "Cannot view attendance",
          finance: effectiveAccess.finances ? "Can view fee statements and receipts" : "Cannot view financial records",
          communication: effectiveAccess.communication ? "Can receive authorized school messages" : "Will not receive guardian messages",
          pickup: effectiveAccess.pickup ? "Can be listed as an authorized pickup guardian" : "Cannot be listed for pickup authorization",
          effectiveFrom: effectiveFrom.toISOString(), validUntil: validUntil?.toISOString() ?? null,
        },
      });
    }

    const relation = await prisma.guardianRelationship.findFirst({
      where: { id: input.relationshipId, schoolId: user.schoolId, studentId },
      include: { accessVersions: { orderBy: { effectiveFrom: "desc" } } },
    });
    const preview = await prisma.guardianAccessEvent.findFirst({ where: {
      id: input.previewId, relationshipId: input.relationshipId, schoolId: user.schoolId, actorUserId: user.userId,
      action: "CHANGE_PREVIEWED", createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    } });
    if (!relation || !preview || !preview.afterState) throw new ApiError("Review the current access summary before applying this change", 409);
    const now = new Date();
    const current = activePermissionVersion(relation.accessVersions, now);
    const actualBefore = { status: relation.status, currentVersionId: current?.id ?? null, permissions: current ? parseGuardianPermissions(current.permissions) : null };
    if (canonical(actualBefore) !== canonical(preview.beforeState)) throw new ApiError("Access changed after the preview. Review the latest permissions again.", 409);
    const change = preview.afterState as { status: string; permissions: unknown; effectiveFrom: string; validUntil: string | null };
    const effectiveFrom = new Date(change.effectiveFrom);
    const permissions = parseGuardianPermissions(change.permissions);
    const finalStatus = relation.status === "DRAFT" ? "INVITED" : change.status;
    if (!["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"].includes(finalStatus) || finalStatus === "ACTIVE" && !relation.verifiedAt) {
      throw new ApiError("A guardian must accept the invitation before access can be activated", 409);
    }
    await prisma.$transaction(async (tx) => {
      const future = relation.accessVersions.find((version) => version.effectiveFrom > now);
      if (future && effectiveFrom >= future.effectiveFrom) throw new ApiError("Review the existing scheduled permission change before adding another", 409);
      if (current) await tx.guardianAccessVersion.update({ where: { id: current.id }, data: { effectiveUntil: effectiveFrom } });
      await tx.guardianAccessVersion.create({ data: {
        id: randomUUID(), schoolId: user.schoolId, relationshipId: relation.id, permissions,
        effectiveFrom, effectiveUntil: future?.effectiveFrom ?? null,
        reason: preview.reason, createdByUserId: user.userId,
      } });
      await tx.guardianRelationship.update({ where: { id: relation.id }, data: {
        status: finalStatus,
        validUntil: change.validUntil ? new Date(change.validUntil) : null,
        ...(finalStatus === "INVITED" ? { invitationExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } : {}),
      } });
      await tx.guardianAccessEvent.create({ data: {
        id: randomUUID(), schoolId: user.schoolId, relationshipId: relation.id, actorUserId: user.userId,
        action: relation.status === "DRAFT" ? "INVITED" : finalStatus === "REVOKED" ? "REVOKED" : finalStatus === "SUSPENDED" ? "SUSPENDED" : "PERMISSIONS_CHANGED",
        reason: preview.reason, beforeState: actualBefore, afterState: change, effectiveAt: effectiveFrom,
      } });
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return Response.json({ success: true, status: finalStatus, effectiveAt: effectiveFrom.toISOString(), ...(finalStatus === "INVITED" ? { invitationUrl: `${appUrl}/parent-invitations` } : {}) });
  } catch (error) { return errorResponse(error, "Failed to update guardian access"); }
}
