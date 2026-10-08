import { studentScope, AccessDenied } from "@/lib/auth/policy";
import { assertPermission } from "@/lib/permissions";
import { JWT_SECRET } from "@/lib/auth/secret";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
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
    const { studentId } = await req.json();
    if (typeof studentId !== "string" || !studentId) throw new AccessDenied("student", "view", user);

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        ...studentScope(user),
      },
      select: { id: true, schoolId: true, guardianWhatsapp: true, guardianPhone: true },
    });

    if (!student) {
      throw new AccessDenied("student", "view", user);
    }

    // The school travels in the token so parent-portal requests, which have
    // no session, can still be bound to a tenant on the way in.
    const token = await new SignJWT({
      studentId: student.id,
      schoolId: student.schoolId,
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
      expiresIn: THIRTY_DAYS,
    });
  } catch (error) {
    return errorResponse(error, "[parent/token] POST failed");
  }
}
