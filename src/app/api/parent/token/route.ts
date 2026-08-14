import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { SignJWT, jwtVerify } from "jose";
import { runUnscoped } from "@/lib/db/tenant-context";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "parent-portal-secret");
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
    const { studentId } = await req.json();

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        campus: { schoolId: user.schoolId },
      },
      select: { id: true, schoolId: true, guardianWhatsapp: true, guardianPhone: true },
    });

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
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

export async function verifyParentToken(
  token: string
): Promise<{ studentId: string; schoolId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.type !== "parent_portal" || typeof payload.studentId !== "string") {
      return null;
    }

    const studentId = payload.studentId;
    if (typeof payload.schoolId === "string" && payload.schoolId) {
      return { studentId, schoolId: payload.schoolId };
    }

    // Tokens issued before the school was embedded. Resolve it once from the
    // student the token already names — the token is the authority for which
    // student that is, so this reads exactly one row.
    const student = await runUnscoped(
      "parent portal: resolve school for a legacy token",
      () =>
        prisma.student.findUnique({
          where: { id: studentId },
          select: { schoolId: true },
        })
    );

    return student ? { studentId, schoolId: student.schoolId } : null;
  } catch {
    return null;
  }
}
