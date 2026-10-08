import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { sendInviteEmail } from "@/lib/email";
export async function POST(req: Request) {
  const result = { success: true, message: "If the invitation is available, a new link will be sent. Check your inbox or contact your school administrator." };
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (!(await authRateLimit(`invite-reissue:${ip}`, { limit: 3, windowMs: 300_000 })).ok) return Response.json(result);
    const { token } = await req.json();
    if (typeof token !== "string" || token.length > 128) return Response.json(result);
    await runUnscoped("request a replacement for exact expired invitation credential", async () => {
      const invite = await prisma.staffInvitation.findUnique({ where: { token }, include: { campus: true } });
      if (!invite || invite.status !== "pending" || invite.expiresAt > new Date()) return;
      const replacement = randomUUID();
      const changed = await prisma.staffInvitation.updateMany({ where: { id: invite.id, token, status: "pending" }, data: { token: replacement, expiresAt: new Date(Date.now() + 48 * 3600_000) } });
      if (!changed.count) return;
      try { await sendInviteEmail(invite.email, invite.role, invite.campus.name, replacement); await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "sent", lastDeliveryAt: new Date() } }); }
      catch { await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "failed", lastDeliveryAt: new Date() } }); }
    });
  } catch { /* Public response must not reveal membership or mail delivery. */ }
  return Response.json(result);
}
