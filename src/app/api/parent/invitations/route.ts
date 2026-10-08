import { randomUUID } from "node:crypto";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") throw new ApiError("Only a guardian account can view guardian invitations", 403);
    const invitations = await prisma.guardianRelationship.findMany({
      where: { schoolId: user.schoolId, status: "INVITED", invitationExpiresAt: { gt: new Date() }, guardianUserId: null, email: { equals: user.email, mode: "insensitive" } },
      select: { id: true, relationship: true, fullName: true, email: true, student: { select: { fullName: true, campus: { select: { name: true } } } }, accessVersions: { where: { effectiveFrom: { lte: new Date() }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" }, take: 1, select: { permissions: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ success: true, invitations: invitations.map((item) => ({ id: item.id, relationship: item.relationship, guardianName: item.fullName, childName: item.student.fullName, campusName: item.student.campus.name, permissions: item.accessVersions[0]?.permissions ?? {} })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Failed to load guardian invitations"); }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") throw new ApiError("Only a guardian account can accept this invitation", 403);
    const body = await req.json();
    if (!body || typeof body.relationshipId !== "string") throw new ApiError("Invitation is unavailable", 400);
    const now = new Date();
    const relation = await prisma.guardianRelationship.findFirst({
      where: { id: body.relationshipId, schoolId: user.schoolId, status: "INVITED", invitationExpiresAt: { gt: now } },
    });
    if (!relation || relation.email.trim().toLocaleLowerCase("en-US") !== user.email.trim().toLocaleLowerCase("en-US")) {
      throw new ApiError("This invitation is not available to the signed-in account", 404);
    }
    const duplicate = await prisma.guardianRelationship.findFirst({
      where: { schoolId: user.schoolId, studentId: relation.studentId, guardianUserId: user.userId, status: "ACTIVE", id: { not: relation.id } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError("This guardian already has an active relationship with the child", 409);

    await prisma.$transaction(async (tx) => {
      const accepted = await tx.guardianRelationship.updateMany({
        where: { id: relation.id, schoolId: user.schoolId, status: "INVITED", invitationExpiresAt: { gt: now }, guardianUserId: null },
        data: { guardianUserId: user.userId, verifiedAt: now, status: "ACTIVE" },
      });
      if (accepted.count !== 1) throw new ApiError("This invitation has already been accepted or changed", 409);
      await tx.guardianAccessEvent.create({ data: {
        id: randomUUID(), schoolId: user.schoolId, relationshipId: relation.id,
        actorUserId: user.userId, action: "ACCEPTED", reason: "Guardian accepted with the invited school account email.",
        afterState: { guardianUserId: user.userId, verifiedAt: now.toISOString(), status: "ACTIVE" }, effectiveAt: now,
      } });
    });
    return Response.json({ success: true, status: "ACTIVE" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "Failed to accept guardian invitation"); }
}
