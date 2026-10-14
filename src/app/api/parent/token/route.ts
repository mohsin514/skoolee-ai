import { studentScope, AccessDenied } from "@/lib/auth/policy";
import { assertPermission } from "@/lib/permissions";
import { JWT_SECRET } from "@/lib/auth/secret";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { SignJWT } from "jose";

const SECRET = JWT_SECRET;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Minting a portal token hands over 30 days of unauthenticated access to
    // one child's marks, attendance, and fees. Only the office issues those
    // links — a signed-in guardian must never be able to mint one for another
    // family's child.
    if (!canManageOperations(user) && user.role !== "RECEPTIONIST") {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "students", "view");
    const body = await req.json();
    const relationshipId = typeof body?.relationshipId === "string" ? body.relationshipId : null;
    const studentId = typeof body?.studentId === "string" ? body.studentId : null;
    if (!relationshipId && !studentId) throw new ApiError("Choose a verified guardian relationship", 400);

    const relationships = await prisma.guardianRelationship.findMany({
      where: {
        ...(relationshipId ? { id: relationshipId } : { studentId: studentId! }),
        status: "ACTIVE",
        verifiedAt: { not: null },
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
        student: studentScope(user),
      },
      select: { id: true, studentId: true, guardianUserId: true, schoolId: true, accessVersions: { where: { effectiveFrom: { lte: new Date() }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }] }, take: 1, select: { permissions: true } } },
    });
    if (relationships.length > 1) throw new ApiError("Choose one guardian relationship for this child", 409);
    const relationship = relationships[0];

    if (!relationship?.guardianUserId || !relationship.accessVersions[0] || (relationship.accessVersions[0].permissions as { learningRecords?: unknown }).learningRecords !== true) {
      throw new AccessDenied("student", "view", user);
    }

    // The school travels in the token so parent-portal requests, which have
    // no session, can still be bound to a tenant on the way in.
    const token = await new SignJWT({
      studentId: relationship.studentId,
      relationshipId: relationship.id,
      guardianUserId: relationship.guardianUserId,
      schoolId: relationship.schoolId,
      type: "parent_portal",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(`${THIRTY_DAYS}s`)
      .setIssuedAt()
      .sign(SECRET);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const portalUrl = `${appUrl}/parent?token=${token}`;

    return Response.json({
      success: true,
      token,
      portalUrl,
      relationshipId: relationship.id,
      expiresIn: THIRTY_DAYS,
    });
  } catch (error) {
    return errorResponse(error, "[parent/token] POST failed");
  }
}
