'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import { z } from "zod";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { sendInviteEmail } from "@/lib/email";
import { assertPlanCapacity, assertSchoolOperational } from "@/lib/billing/entitlements";

const InviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().optional(),
  role: z.enum(['CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER']),
  campusId: z.string().uuid().optional(),
});

function isCompatibleInviteRole(existingRole: string, inviteRole: string) {
  if (inviteRole === "CAMPUS_ADMIN") {
    return existingRole === "CAMPUS_ADMIN" || existingRole === "ADMIN";
  }

  return existingRole === inviteRole;
}

function roleWhereForInvite(role: z.infer<typeof InviteSchema>["role"]) {
  return role === "CAMPUS_ADMIN" ? { in: ["CAMPUS_ADMIN", "ADMIN"] as const } : role;
}

function cleanBaseUrl(value?: string | null) {
  return value?.replace(/\/$/, "");
}

function isLocalHostname(hostname: string) {
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");
  if (cleanHostname === "localhost" || cleanHostname === "::1" || cleanHostname === "0.0.0.0") return true;
  if (cleanHostname.startsWith("127.")) return true;
  if (cleanHostname.startsWith("10.") || cleanHostname.startsWith("192.168.")) return true;

  const private172 = /^172\.(1[6-9]|2\d|3[01])\./.test(cleanHostname);
  return private172;
}

function isLocalBaseUrl(value?: string | null) {
  if (!value) return false;

  try {
    const { hostname } = new URL(value);
    return isLocalHostname(hostname);
  } catch {
    return false;
  }
}

function originFromReferer(value?: string | null) {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function originFromHost(host?: string | null, proto?: string | null) {
  if (!host) return undefined;

  const firstHost = host.split(",")[0]?.trim();
  if (!firstHost) return undefined;

  const hostname = firstHost.startsWith("[::1]") ? "[::1]" : firstHost.split(":")[0] || firstHost;
  const protocol = proto?.split(",")[0]?.trim() || (isLocalHostname(hostname) ? "http" : "https");

  return `${protocol}://${firstHost}`;
}

async function getRequestBaseUrl() {
  const headerStore = await headers();
  const origin = cleanBaseUrl(headerStore.get("origin"));
  const refererOrigin = cleanBaseUrl(originFromReferer(headerStore.get("referer")));
  const forwardedOrigin = cleanBaseUrl(
    originFromHost(headerStore.get("x-forwarded-host"), headerStore.get("x-forwarded-proto"))
  );
  const hostOrigin = cleanBaseUrl(originFromHost(headerStore.get("host"), headerStore.get("x-forwarded-proto")));

  const requestCandidates = [origin, refererOrigin, hostOrigin, forwardedOrigin];
  const localCandidate = requestCandidates.find(isLocalBaseUrl);
  if (localCandidate) return localCandidate;

  const requestBaseUrl = [origin, refererOrigin, forwardedOrigin, hostOrigin].find(Boolean);
  if (requestBaseUrl) return requestBaseUrl;

  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || "3000"}`;
  }

  return undefined;
}

export async function inviteStaff(data: z.infer<typeof InviteSchema>) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role))) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  const valid = InviteSchema.parse(data);
  const targetCampusId = isCampusAdminRole(session.role) ? session.campusId : valid.campusId;
  
  if (!targetCampusId) throw new Error('Campus ID is required');

  let canInviteStandaloneAdmin = false;
  if (valid.role === 'CAMPUS_ADMIN' && session.role !== 'SUPER_ADMIN') {
    const campusCount = await prisma.campus.count({ where: { schoolId: session.schoolId } });
    canInviteStandaloneAdmin =
      isCampusAdminRole(session.role) &&
      campusCount === 1 &&
      session.campusId === targetCampusId;

    if (!canInviteStandaloneAdmin) {
      throw new Error('Only the school owner can invite campus admins');
    }
  }

  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: valid.email },
    select: { id: true, role: true, schoolId: true, campusId: true, isActive: true },
  });

  if (existingUserByEmail?.isActive) {
    throw new Error("This email already has active access");
  }

  if (
    existingUserByEmail &&
    (existingUserByEmail.schoolId !== session.schoolId ||
      existingUserByEmail.campusId !== targetCampusId ||
      !isCompatibleInviteRole(existingUserByEmail.role, valid.role))
  ) {
    throw new Error("This email belongs to another account context");
  }

  const existingPendingForEmail = await prisma.staffInvitation.findFirst({
    where: { email: valid.email, campusId: targetCampusId, role: valid.role as any, status: "pending" },
    select: { id: true },
  });

  if (existingPendingForEmail) {
    throw new Error("An invitation is already pending for this email. Use Resend Invite from the dashboard.");
  }

  if (valid.role === "TEACHER") {
    await assertPlanCapacity({ schoolId: session.schoolId, metric: "teachers" });
  }

  // Enforce one assigned owner slot in school-group campuses and one principal per campus.
  if (valid.role === 'PRINCIPAL' || (valid.role === 'CAMPUS_ADMIN' && !canInviteStandaloneAdmin)) {
    const existingUser = await prisma.user.findFirst({
      where: { campusId: targetCampusId, role: roleWhereForInvite(valid.role) as any, isActive: true }
    });
    const existingInvite = await prisma.staffInvitation.findFirst({
      where: { campusId: targetCampusId, role: valid.role as any, status: 'pending' }
    });

    if (existingUser || existingInvite) {
      throw new Error(`A ${valid.role.replace('_', ' ')} is already assigned or invited to this facility.`);
    }
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const invite = await prisma.staffInvitation.create({
    data: {
      email: valid.email,
      role: valid.role as any,
      campusId: targetCampusId,
      token,
      expiresAt,
    }
  });

  const campus = await prisma.campus.findUnique({ where: { id: targetCampusId } });
  await sendInviteEmail(valid.email, valid.role, campus?.name || 'Your Campus', token, await getRequestBaseUrl());

  return { success: true };
}

export async function removeStaff(userId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role))) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  if (userId === session.userId) {
    throw new Error("You can't remove your own account");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, schoolId: true, campusId: true },
  });

  if (!target || target.schoolId !== session.schoolId) {
    throw new Error("Staff member not found");
  }

  if (isCampusAdminRole(session.role) && target.campusId !== session.campusId) {
    throw new Error("Staff member is outside your campus");
  }

  if (target.role === "ADMIN" && session.role !== "SUPER_ADMIN") {
    throw new Error("The campus owner account cannot be revoked");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
  return { success: true };
}

export async function cancelInvitation(inviteId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role))) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  const invite = await prisma.staffInvitation.findUnique({
    where: { id: inviteId },
    include: { campus: { select: { schoolId: true } } },
  });

  if (!invite || invite.campus.schoolId !== session.schoolId) {
    throw new Error("Invitation not found");
  }

  if (isCampusAdminRole(session.role) && invite.campusId !== session.campusId) {
    throw new Error("Invitation is outside your campus");
  }

  await prisma.staffInvitation.update({
    where: { id: inviteId },
    data: { status: 'cancelled' },
  });
  return { success: true };
}

export async function resendInvitation(inviteId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role))) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  const invite = await prisma.staffInvitation.findUnique({
    where: { id: inviteId },
    include: { campus: { select: { id: true, name: true, schoolId: true } } },
  });

  if (!invite || invite.campus.schoolId !== session.schoolId) {
    throw new Error("Invitation not found");
  }

  if (isCampusAdminRole(session.role) && invite.campusId !== session.campusId) {
    throw new Error("Invitation is outside your campus");
  }

  if (invite.status !== "pending") {
    throw new Error("Only pending invitations can be resent");
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const updatedInvite = await prisma.staffInvitation.update({
    where: { id: invite.id },
    data: { token, expiresAt },
  });

  await sendInviteEmail(
    updatedInvite.email,
    updatedInvite.role,
    invite.campus.name || "Your Campus",
    token,
    await getRequestBaseUrl()
  );

  return { success: true };
}

export async function acceptInvite(token: string, password: string, fullName: string) {
  const cleanName = fullName.trim();
  if (!cleanName) throw new Error("Full name is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const invite = await prisma.staffInvitation.findUnique({
    where: { token }
  });

  if (!invite) throw new Error('Invalid invite token');
  if (invite.status === 'accepted') throw new Error('Invite already used');
  if (invite.status === 'cancelled') throw new Error('Invite cancelled');
  if (new Date() > invite.expiresAt) throw new Error('Invite expired');

  const campus = await prisma.campus.findUnique({ where: { id: invite.campusId }, select: { schoolId: true } });
  if (!campus) throw new Error("Campus not found");

  if (invite.role === "TEACHER") {
    await assertPlanCapacity({ schoolId: campus.schoolId, metric: "teachers", increment: 0 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (
    existingUser &&
    (existingUser.isActive ||
      existingUser.schoolId !== campus.schoolId ||
      existingUser.campusId !== invite.campusId ||
      !isCompatibleInviteRole(existingUser.role, invite.role))
  ) {
    throw new Error("An account already exists for this email");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const acceptedUser = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            password: passwordHash,
            fullName: cleanName,
            role: invite.role,
            campusId: invite.campusId,
            schoolId: campus.schoolId,
            onboardingComplete: true,
            isActive: true,
          },
        })
      : await tx.user.create({
          data: {
            email: invite.email,
            password: passwordHash,
            fullName: cleanName,
            role: invite.role,
            campusId: invite.campusId,
            schoolId: campus.schoolId,
            onboardingComplete: true,
            isActive: true,
          }
        });

    await tx.staffInvitation.update({
      where: { id: invite.id },
      data: { status: 'accepted' }
    });

    return acceptedUser;
  });

  return { success: true, user: { email: user.email, role: user.role } };
}
