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
import { notify } from "@/lib/notifications/in-app";
import { Prisma } from "@prisma/client";

const InviteProfileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  cnic: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  qualification: z.string().optional(),
  specialization: z.string().optional(),
  subjectSpecialties: z.array(z.string()).optional(),
  teachesAllSubjects: z.boolean().optional(),
  experience: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  joiningDate: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  designation: z.string().optional(),
  contractType: z.enum(["PERMANENT", "CONTRACT", "PART_TIME"]).optional(),
  basicSalary: z.number().int().min(0).optional(),
});

const InviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().optional(),
  role: z.enum(['CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'RECEPTIONIST']),
  campusId: z.string().uuid().optional(),
  profile: InviteProfileSchema.optional(),
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
  const canInvite = session && (session.role === 'SUPER_ADMIN' || isCampusAdminRole(session.role) || session.role === 'PRINCIPAL');
  if (!canInvite) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  const valid = InviteSchema.parse(data);
  // Honour an explicitly supplied campusId (e.g. inviting the admin/principal for a
  // newly created campus). Fall back to the caller's own campus only when omitted.
  const targetCampusId = valid.campusId || session.campusId;

  // Non-super callers may only invite staff into their own campus.
  if ((isCampusAdminRole(session.role) || session.role === 'PRINCIPAL') && targetCampusId !== session.campusId) {
    throw new Error("You can only invite staff to your own campus");
  }

  if (!targetCampusId) throw new Error('Campus ID is required');

  const targetCampus = await prisma.campus.findUnique({
    where: { id: targetCampusId },
    select: { schoolId: true },
  });
  if (!targetCampus) throw new Error('Campus not found');
  if (targetCampus.schoolId !== session.schoolId) throw new Error('Campus is outside your school');

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
      profile: valid.profile ?? Prisma.JsonNull,
    }
  });

  await prisma.auditLog.create({
    data: {
      tableName: 'staff_invitation',
      recordId: invite.id,
      newValue: { email: valid.email, role: valid.role },
      userId: session.userId,
    }
  });

  const campus = await prisma.campus.findUnique({ where: { id: targetCampusId } });
  const baseUrl = await getRequestBaseUrl();
  await sendInviteEmail(valid.email, valid.role, campus?.name || 'Your Campus', token, baseUrl);

  const inviteLink = `${baseUrl}/accept-invite?token=${token}`;

  notify("STAFF_INVITED", {
    schoolId: session.schoolId,
    campusId: targetCampusId,
    actorId: session.userId,
    actorName: session.fullName,
    email: valid.email,
    roleName: valid.role,
  });

  return { success: true, inviteLink };
}

export async function removeStaff(userId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role) && session.role !== 'PRINCIPAL')) {
    throw new Error('403 Forbidden');
  }
  await assertSchoolOperational(session.schoolId);

  if (userId === session.userId) {
    throw new Error("You can't remove your own account");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, schoolId: true, campusId: true, fullName: true },
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

  notify("STAFF_REMOVED", {
    schoolId: session.schoolId,
    campusId: target.campusId,
    actorId: session.userId,
    actorName: session.fullName,
    staffName: target.fullName,
  });

  return { success: true };
}

export async function cancelInvitation(inviteId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role) && session.role !== 'PRINCIPAL')) {
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
  if (!session || (session.role !== 'SUPER_ADMIN' && !isCampusAdminRole(session.role) && session.role !== 'PRINCIPAL')) {
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

export async function acceptInvite(token: string, password: string) {
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
  const storedProfile = (invite.profile as Record<string, string> | null) || {};
  const placeholderName = storedProfile.fullName || invite.email.split("@")[0].replace(/[._-]/g, " ");

  const user = await prisma.$transaction(async (tx) => {
    const acceptedUser = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            password: passwordHash,
            fullName: placeholderName,
            phone: storedProfile.phone || null,
            cnic: storedProfile.cnic || null,
            dateOfBirth: storedProfile.dateOfBirth ? new Date(storedProfile.dateOfBirth) : null,
            gender: storedProfile.gender || null,
            qualification: storedProfile.qualification || null,
            specialization: storedProfile.specialization || null,
            subjectSpecialties: Array.isArray(storedProfile.subjectSpecialties) ? storedProfile.subjectSpecialties : [],
            teachesAllSubjects: Boolean(storedProfile.teachesAllSubjects),
            experience: storedProfile.experience || null,
            address: storedProfile.address || null,
            city: storedProfile.city || null,
            province: storedProfile.province || null,
            postalCode: storedProfile.postalCode || null,
            joiningDate: storedProfile.joiningDate ? new Date(storedProfile.joiningDate) : null,
            emergencyContact: storedProfile.emergencyContact || null,
            emergencyPhone: storedProfile.emergencyPhone || null,
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
            fullName: placeholderName,
            phone: storedProfile.phone || null,
            cnic: storedProfile.cnic || null,
            dateOfBirth: storedProfile.dateOfBirth ? new Date(storedProfile.dateOfBirth) : null,
            gender: storedProfile.gender || null,
            qualification: storedProfile.qualification || null,
            specialization: storedProfile.specialization || null,
            subjectSpecialties: Array.isArray(storedProfile.subjectSpecialties) ? storedProfile.subjectSpecialties : [],
            teachesAllSubjects: Boolean(storedProfile.teachesAllSubjects),
            experience: storedProfile.experience || null,
            address: storedProfile.address || null,
            city: storedProfile.city || null,
            province: storedProfile.province || null,
            postalCode: storedProfile.postalCode || null,
            joiningDate: storedProfile.joiningDate ? new Date(storedProfile.joiningDate) : null,
            emergencyContact: storedProfile.emergencyContact || null,
            emergencyPhone: storedProfile.emergencyPhone || null,
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

    if (storedProfile.designation || storedProfile.contractType || Number(storedProfile.basicSalary || 0) > 0) {
      await tx.staffProfile.upsert({
        where: { userId: acceptedUser.id },
        create: {
          userId: acceptedUser.id,
          designation: storedProfile.designation || null,
          contractType: storedProfile.contractType || null,
          basicSalary: Math.round(Number(storedProfile.basicSalary || 0)),
        },
        update: {},
      });
    }

    return acceptedUser;
  });

  notify("INVITE_ACCEPTED", {
    schoolId: campus.schoolId,
    campusId: invite.campusId,
    actorId: user.id,
    actorName: user.fullName,
    staffName: user.fullName,
    roleName: user.role,
  });

  return { success: true, user: { email: user.email, role: user.role } };
}
