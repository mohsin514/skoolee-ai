import { prisma } from "@/lib/db/prisma";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { runWithTenantContext } from "@/lib/db/tenant-context";

export async function logSuperAdminAction(params: {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  oldValues?: any;
  newValues?: any;
  status?: string;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  let ip = params.ipAddress;
  let ua = params.userAgent;

  if (!ip || !ua) {
    try {
      const h = await headers();
      ip = ip || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
      ua = ua || h.get("user-agent") || undefined;
    } catch {
      // headers() may throw outside request context
    }
  }

  await prisma.superAdminAuditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: ip,
      userAgent: ua,
      status: params.status || "success",
      errorMessage: params.errorMessage,
    },
  });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function recordLoginSession(params: {
  userId: string;
  schoolId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}) {
  let ip = params.ipAddress;
  let ua = params.userAgent;

  if (!ip || !ua) {
    try {
      const h = await headers();
      ip = ip || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
      ua = ua || h.get("user-agent") || undefined;
    } catch {}
  }

  // Called from the login handler, which runs unscoped because the school
  // is not known until the account is found. Bind it explicitly here.
  await runWithTenantContext({ schoolId: params.schoolId, userId: params.userId }, () =>
    prisma.loginSession.create({
      data: {
        userId: params.userId,
        schoolId: params.schoolId,
        tokenHash: params.tokenHash,
        ipAddress: ip,
        userAgent: ua,
        expiresAt: params.expiresAt,
      },
    })
  );
}
