import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { createVerificationToken, pendingVerificationWhere } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email";
import { clientIp } from "@/lib/http/client-ip";

// SKO-457: a new verification link for an account still waiting for one. The response is the
// same for unknown, active, deactivated, throttled and delivery-failure cases, and the work runs
// after the response, so neither the body nor the timing says whether the address has an account.
const ACCEPTED = { success: true, message: "If an account at this address is waiting for verification, a new link is on its way." };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const ip = clientIp(req.headers);
  const allowed = (await authRateLimit(`verify-resend:${ip}`, { limit: 5, windowMs: 300_000 })).ok
    && (await authRateLimit(`verify-resend:target:${email}`, { limit: 3, windowMs: 900_000 })).ok;
  if (allowed) {
    after(() => runUnscoped("verification resend before sign-in", async () => {
      const users = await prisma.user.findMany({ where: { email, ...pendingVerificationWhere }, select: { id: true, email: true, schoolId: true } });
      for (const user of users) {
        try {
          await sendVerificationEmail(user.email, user.id, await createVerificationToken(user.id));
          await prisma.auditLog.create({ data: { schoolId: user.schoolId, userId: user.id, tableName: "account_security", recordId: user.id, newValue: { action: "email_verification.resent" } } });
        } catch {
          console.warn("[verify-resend] delivery failed");
        }
      }
    }).catch(() => console.warn("[verify-resend] task failed")));
  }
  return NextResponse.json(ACCEPTED, { headers: { "Cache-Control": "no-store" } });
}
