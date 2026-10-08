import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, ApiError, errorResponse } from "@/lib/api/scope";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session-cookie";
export async function GET() {
  try {
    const user = await requireAuthUser();
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value || "";
    const sessions = await prisma.loginSession.findMany({ where: { userId: user.userId, schoolId: user.schoolId, isActive: true, expiresAt: { gt: new Date() } }, orderBy: { loginAt: "desc" }, select: { id: true, userAgent: true, loginAt: true, lastActivityAt: true, expiresAt: true, tokenHash: true } });
    const account = await prisma.user.findUnique({ where: { id: user.userId }, select: { mfaEnabled: true } });
    return Response.json({ mfaEnabled: account?.mfaEnabled ?? false, sessions: sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === hashSessionToken(token) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "[auth/sessions]"); }
}
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser(); const { id } = await req.json();
    if (typeof id !== "string") throw new ApiError("Choose a session", 400);
    const closed = await prisma.loginSession.updateMany({ where: { id, userId: user.userId, schoolId: user.schoolId, isActive: true }, data: { isActive: false, logoutAt: new Date() } });
    if (closed.count !== 1) throw new ApiError("Session is unavailable", 404);
    await runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role }, () => prisma.auditLog.create({ data: { userId: user.userId, tableName: "login_sessions", recordId: id, newValue: { action: "session.revoked" } } }));
    return Response.json({ success: true, endedAt: new Date().toISOString() });
  } catch (error) { return errorResponse(error, "[auth/sessions]"); }
}
