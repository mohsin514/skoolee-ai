import "server-only";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { JWT_SECRET } from "@/lib/auth/secret";
import { phoneVariants } from "./markets";
import type { GuardianAccount, OtpDeps, OtpStore } from "./service";

export const prismaOtpStore: OtpStore = {
  async createChallenge(row) { await prisma.phoneOtpChallenge.create({ data: row }); },
  getChallenge: (id) => prisma.phoneOtpChallenge.findUnique({ where: { id } }),
  async supersedeOpen(phoneHash, purpose, now) {
    await prisma.phoneOtpChallenge.updateMany({ where: { phoneHash, purpose, consumedAt: null, supersededAt: null, expiresAt: { gt: now } }, data: { supersededAt: now } });
  },
  async claimAttempt(id, max, now) {
    const r = await prisma.phoneOtpChallenge.updateMany({ where: { id, attempts: { lt: max }, consumedAt: null, supersededAt: null, expiresAt: { gt: now } }, data: { attempts: { increment: 1 } } });
    return r.count === 1;
  },
  async setFallbackCode(id, hash) { await prisma.phoneOtpChallenge.update({ where: { id }, data: { fallbackCodeHash: hash } }); },
  async consume(id, now) {
    const r = await prisma.phoneOtpChallenge.updateMany({ where: { id, consumedAt: null, supersededAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    return r.count === 1;
  },
  async markVerified(id, now) { await prisma.phoneOtpChallenge.updateMany({ where: { id, verifiedAt: null }, data: { verifiedAt: now } }); },
  async addDelivery(row) { await prisma.otpDelivery.create({ data: row }); },
  deliveries: (challengeId) => prisma.otpDelivery.findMany({ where: { challengeId }, orderBy: { sentAt: "asc" } }),
  async markDeliveriesVerified(challengeId, now) { await prisma.otpDelivery.updateMany({ where: { challengeId, verifiedAt: null }, data: { verifiedAt: now } }); },
  async updateDeliveryStatus(providerMessageId, status, at, errorCode) {
    const row = await prisma.otpDelivery.findUnique({ where: { providerMessageId } });
    if (!row) return;
    const delivered = status === "delivered" || status === "read";
    // Statuses only move forward; a late "sent" never overwrites "delivered".
    if (delivered) await prisma.otpDelivery.update({ where: { id: row.id }, data: { status, deliveredAt: row.deliveredAt ?? at } });
    else if (status === "failed" || status === "not_on_whatsapp") { if (!row.deliveredAt) await prisma.otpDelivery.update({ where: { id: row.id }, data: { status, errorCode: errorCode ?? row.errorCode } }); }
  },
};

/**
 * Guardian accounts for a number. Like email login this is cross-tenant until an account
 * is found; only active PARENT users at a non-deleted school qualify. The match is on the
 * user's own phone or an active guardian relationship's phone linked to that user.
 */
export function findGuardians(e164: string, schoolId?: string): Promise<GuardianAccount[]> {
  return runUnscoped("phone OTP: resolve guardian by phone before school is known", async () => {
    const phones = phoneVariants(e164);
    const school = schoolId ? { schoolId } : {};
    const [direct, linked] = await Promise.all([
      prisma.user.findMany({ where: { ...school, role: "PARENT", isActive: true, phone: { in: phones } }, select: { id: true, schoolId: true, school: { select: { status: true } } } }),
      prisma.guardianRelationship.findMany({ where: { ...school, status: "ACTIVE", phone: { in: phones }, guardianUserId: { not: null } }, select: { guardianUserId: true } }),
    ]);
    const linkedUsers = linked.length
      ? await prisma.user.findMany({ where: { ...school, id: { in: linked.map((l) => l.guardianUserId!) }, role: "PARENT", isActive: true }, select: { id: true, schoolId: true, school: { select: { status: true } } } })
      : [];
    const seen = new Map<string, GuardianAccount>();
    for (const u of [...direct, ...linkedUsers]) {
      if (String(u.school?.status ?? "").toUpperCase() === "DELETED") continue;
      seen.set(u.id, { userId: u.id, schoolId: u.schoolId });
    }
    return [...seen.values()];
  });
}

export function otpDeps(): OtpDeps {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  return {
    store: prismaOtpStore,
    rateLimit: authRateLimit,
    findGuardians,
    secret: Buffer.from(JWT_SECRET).toString("hex"),
    statusCallbackUrl: appUrl && process.env.OTP_SMS_PROVIDER === "twilio" ? `${appUrl.replace(/\/$/, "")}/api/auth/otp/sms-status` : undefined,
  };
}

export function phoneOtpEnabled(env: Record<string, string | undefined> = process.env) {
  return env.PHONE_OTP_ENABLED === "true";
}
