'use server'

import { invitationContext } from "@/lib/auth/invitation-context";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import { ApiError } from "@/lib/api/scope";
import { authRateLimit } from "@/lib/auth/rate-limit";
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
  // Where this person will sit once they accept. Captured now because the
  // hiring decision already knows it — asking again after they sign in would
  // leave every new teacher unplaced in the chart until someone remembers.
  designationId: z.string().uuid().optional(),
  primaryDepartmentId: z.string().uuid().optional(),
  reportsToId: z.string().uuid().optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "VISITING", "ADJUNCT", "CONTRACT", "INTERN", "VOLUNTEER"])
    .optional(),
  employeeCode: z.string().optional(),
});

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().optional(),
  role: z.enum(['CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'RECEPTIONIST', 'STUDENT', 'PARENT']),
  campusId: z.string().uuid().optional(),
  canPurchaseSubscription: z.boolean().optional(),
  canManageMemberships: z.boolean().optional(),
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
  if (process.env.NEXT_PUBLIC_APP_URL) return cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.NODE_ENV === "production") throw new ApiError("Invitation delivery is unavailable. Contact your administrator.", 503);
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

  return `http://localhost:${process.env.PORT || "3000"}`;
}

export async function inviteStaff(data: z.infer<typeof InviteSchema>) {
  const session = await getAuthUser();
  const canInvite = session && (session.isInstitutionOwner || session.canManageMemberships);
  if (!canInvite) {
    throw new ApiError('Forbidden', 403);
  }
  await assertSchoolOperational(session.schoolId);
  if (!(await authRateLimit(`invite-admin:${session.userId}`, { limit: 20, windowMs: 300_000 })).ok) throw new ApiError("Wait five minutes before trying again", 429);

  const parsed = InviteSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("Review the email, work role and campus scope", 400);
  const valid = parsed.data;
  // Honour an explicitly supplied campusId (e.g. inviting the admin/principal for a
  // newly created campus). Fall back to the caller's own campus only when omitted.
  const targetCampusId = valid.campusId || session.campusId;

  // Non-super callers may only invite staff into their own campus.
  if (!session.isInstitutionOwner && targetCampusId !== session.campusId) {
    throw new ApiError("You can only invite staff to your own campus", 403);
  }

  if (!targetCampusId) throw new ApiError('Campus ID is required', 400);

  const targetCampus = await prisma.campus.findUnique({
    where: { id: targetCampusId },
    select: { schoolId: true },
  });
  if (!targetCampus) throw new ApiError('Campus not found', 404);
  if (targetCampus.schoolId !== session.schoolId) throw new ApiError('Campus is outside your school', 403);

  const canInviteStandaloneAdmin = session.isInstitutionOwner === true;
  if ((valid.canPurchaseSubscription || valid.canManageMemberships) && !session.isInstitutionOwner) {
    throw new ApiError("Only an institution owner can delegate purchasing or membership management", 403);
  }
  if (["PARENT", "STUDENT"].includes(valid.role) && (valid.canPurchaseSubscription || valid.canManageMemberships)) {
    throw new ApiError("Family memberships cannot receive administrative delegations", 400);
  }
  if (valid.role === "CAMPUS_ADMIN" && !session.isInstitutionOwner) {
    throw new ApiError("Only an institution owner can invite campus administrators", 403);
  }

  // FINDING-D: identity is tenant-scoped, so an invite only cares whether this
  // address already has an account AT THIS SCHOOL. Globally, the same person may
  // legitimately hold an account elsewhere.
  const existingUserByEmail = await prisma.user.findFirst({
    where: { email: valid.email, schoolId: session.schoolId },
    select: { id: true, role: true, schoolId: true, campusId: true, isActive: true },
  });

  if (existingUserByEmail?.isActive) {
    throw new ApiError("This email already has active access", 409);
  }

  if (
    existingUserByEmail &&
    (existingUserByEmail.schoolId !== session.schoolId ||
      existingUserByEmail.campusId !== targetCampusId ||
      !isCompatibleInviteRole(existingUserByEmail.role, valid.role))
  ) {
    throw new ApiError("This email belongs to another account context", 409);
  }

  const existingPendingForEmail = await prisma.staffInvitation.findFirst({
    where: { email: valid.email, campusId: targetCampusId, role: valid.role as any, status: "pending" },
    select: { id: true },
  });

  if (existingPendingForEmail) {
    throw new ApiError("An invitation is already pending for this email. Use Resend Invite from the dashboard.", 409);
  }

  if (valid.role === "TEACHER") {
    await assertPlanCapacity({ schoolId: session.schoolId, metric: "teachers" });
  }

  // Check the position now rather than on acceptance. A bad id caught here is
  // a form error the inviter can fix; the same id caught days later, while
  // someone is setting their password, would either fail their sign-up or be
  // silently dropped.
  const position = valid.profile;
  if (position?.designationId) {
    const designation = await prisma.staffDesignation.findFirst({
      where: { id: position.designationId, schoolId: session.schoolId },
      select: { id: true },
    });
    if (!designation) throw new ApiError("That rank is not one of your institution's designations", 400);
  }
  if (position?.primaryDepartmentId) {
    const department = await prisma.department.findFirst({
      where: { id: position.primaryDepartmentId, campusId: targetCampusId },
      select: { id: true },
    });
    if (!department) throw new ApiError("That department is not on this campus", 400);
  }
  if (position?.reportsToId) {
    const manager = await prisma.user.findFirst({
      where: { id: position.reportsToId, schoolId: session.schoolId, isActive: true },
      select: { id: true },
    });
    if (!manager) throw new ApiError("That manager is not an active member of this school", 400);
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
      throw new ApiError(`A ${valid.role.replace('_', ' ')} is already assigned or invited to this facility.`, 409);
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
      invitedBy: session.fullName || session.email,
      canPurchaseSubscription: valid.canPurchaseSubscription ?? false,
      canManageMemberships: valid.canManageMemberships ?? false,
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
  try {
    await sendInviteEmail(valid.email, valid.role, campus?.name || 'Your Campus', token, baseUrl);
    await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "sent", lastDeliveryAt: new Date() } });
  } catch {
    await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "failed", lastDeliveryAt: new Date() } });
    throw new ApiError("Invitation saved, but email could not be delivered. Use Resend Invite to try again.", 503);
  }

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
  if (!session || (!session.isInstitutionOwner && !session.canManageMemberships)) {
    throw new ApiError('Forbidden', 403);
  }
  await assertSchoolOperational(session.schoolId);
  if (!(await authRateLimit(`invite-admin:${session.userId}`, { limit: 20, windowMs: 300_000 })).ok) throw new ApiError("Wait five minutes before trying again", 429);

  if (userId === session.userId) {
    throw new ApiError("You can't remove your own account", 403);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, schoolId: true, campusId: true, fullName: true, isInstitutionOwner: true, canManageMemberships: true, canPurchaseSubscription: true },
  });

  if (!target || target.schoolId !== session.schoolId) {
    throw new ApiError("Staff member not found", 404);
  }

  if (!session.isInstitutionOwner && target.campusId !== session.campusId) {
    throw new ApiError("Staff member is outside your campus", 403);
  }

  if (target.isInstitutionOwner) {
    throw new ApiError("The campus owner account cannot be revoked", 403);
  }

  if (!session.isInstitutionOwner && (target.canManageMemberships || target.canPurchaseSubscription || isCampusAdminRole(target.role))) {
    throw new ApiError("Only an owner can revoke delegated administrators", 403);
  }
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { isActive: false, accessVersion: { increment: 1 } } });
    await tx.loginSession.updateMany({ where: { userId }, data: { isActive: false } });
    await tx.auditLog.create({ data: { tableName: "membership", recordId: userId, userId: session.userId, oldValue: { isActive: true, role: target.role, campusId: target.campusId }, newValue: { isActive: false } } });
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
  if (!session || (!session.isInstitutionOwner && !session.canManageMemberships)) {
    throw new ApiError('Forbidden', 403);
  }
  await assertSchoolOperational(session.schoolId);
  if (!(await authRateLimit(`invite-admin:${session.userId}`, { limit: 20, windowMs: 300_000 })).ok) throw new ApiError("Wait five minutes before trying again", 429);

  const invite = await prisma.staffInvitation.findUnique({
    where: { id: inviteId },
    include: { campus: { select: { schoolId: true } } },
  });

  if (!invite || invite.campus.schoolId !== session.schoolId) {
    throw new ApiError("Invitation not found", 404);
  }

  if (!session.isInstitutionOwner && invite.campusId !== session.campusId) {
    throw new ApiError("Invitation is outside your campus", 403);
  }

  const cancelled = await prisma.staffInvitation.updateMany({
    where: { id: inviteId, status: 'pending', token: invite.token },
    data: { status: 'cancelled', token: randomUUID() },
  });
  if (cancelled.count !== 1) throw new ApiError('Invitation is no longer pending', 409);
  return { success: true };
}

export async function resendInvitation(inviteId: string) {
  const session = await getAuthUser();
  if (!session || (!session.isInstitutionOwner && !session.canManageMemberships)) {
    throw new ApiError('Forbidden', 403);
  }
  await assertSchoolOperational(session.schoolId);
  if (!(await authRateLimit(`invite-admin:${session.userId}`, { limit: 20, windowMs: 300_000 })).ok) throw new ApiError("Wait five minutes before trying again", 429);

  const invite = await prisma.staffInvitation.findUnique({
    where: { id: inviteId },
    include: { campus: { select: { id: true, name: true, schoolId: true } } },
  });

  if (!invite || invite.campus.schoolId !== session.schoolId) {
    throw new ApiError("Invitation not found", 404);
  }

  if (!session.isInstitutionOwner && invite.campusId !== session.campusId) {
    throw new ApiError("Invitation is outside your campus", 403);
  }

  if (invite.status !== "pending") {
    throw new ApiError("Only pending invitations can be resent", 409);
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const updatedInvite = await prisma.staffInvitation.update({
    where: { id: invite.id, status: "pending", token: invite.token },
    data: { token, expiresAt },
  });

  try {
  await sendInviteEmail(
    updatedInvite.email,
    updatedInvite.role,
    invite.campus.name || "Your Campus",
    token,
    await getRequestBaseUrl()
  );
  await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "sent", lastDeliveryAt: new Date() } });
  } catch {
    await prisma.staffInvitation.update({ where: { id: invite.id }, data: { deliveryStatus: "failed", lastDeliveryAt: new Date() } });
    throw new ApiError("Email could not be delivered. Use Resend Invite to try again.", 503);
  }

  return { success: true };
}

export async function acceptInvite(token: string, password: string, fullName?: string, expectedContext?: string) {
  return runUnscoped("accept exact secret invitation before account exists", () => acceptInvitation(token, password, fullName, expectedContext));
}

async function acceptInvitation(token: string, password: string, fullName?: string, expectedContext?: string) {
  if (typeof token !== "string" || token.length > 128 || !(await authRateLimit(`invite-accept:${token}`, { limit: 5, windowMs: 300_000 })).ok) throw new ApiError("Unable to accept. Wait five minutes and try again.", 429);
  if (typeof password !== "string" || password.length > 72) throw new ApiError("Password must be between 8 and 72 characters", 400);
  if (password.length < 8) throw new ApiError("Password must be at least 8 characters", 400);

  const invite = await prisma.staffInvitation.findUnique({
    where: { token }
  });

  if (!invite) throw new ApiError('Invalid invite token', 400);
  if (expectedContext !== invitationContext(invite)) throw new ApiError('Invitation details changed. Reload and review the school, campus and role before accepting.', 409);
  if (invite.status === 'accepted') throw new ApiError('Invite already used', 409);
  if (invite.status === 'cancelled') throw new ApiError('Invite cancelled', 409);
  if (new Date() > invite.expiresAt) throw new ApiError('Invite expired', 410);

  const campus = await prisma.campus.findUnique({ where: { id: invite.campusId }, select: { schoolId: true } });
  if (!campus) throw new ApiError("Campus not found", 404);

  if (invite.role === "TEACHER") {
    await assertPlanCapacity({ schoolId: campus.schoolId, metric: "teachers", increment: 0 });
  }

  // FINDING-D: scoped to the inviting school (see above).
  const existingUser = await prisma.user.findFirst({ where: { email: invite.email, schoolId: campus.schoolId } });
  if (
    existingUser &&
    (existingUser.isActive ||
      existingUser.schoolId !== campus.schoolId ||
      existingUser.campusId !== invite.campusId ||
      !isCompatibleInviteRole(existingUser.role, invite.role))
  ) {
    throw new ApiError("An account already exists for this email", 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // The invite's captured profile. Values are whatever InviteProfileSchema
  // accepted at invite time, so this is deliberately loose rather than lying
  // about being all-strings.
  const storedProfile = (invite.profile as Record<string, unknown> | null) || {};
  const text = (key: string) => (typeof storedProfile[key] === "string" ? (storedProfile[key] as string) : null);
  const id = (key: string) => text(key) || null;
  const placeholderName = fullName?.trim().slice(0, 160) || text("fullName") || invite.email.split("@")[0].replace(/[._-]/g, " ");

  const user = await runWithTenantContext({ schoolId: campus.schoolId }, () => prisma.$transaction(async (tx) => {
    const claimed = await tx.staffInvitation.updateMany({ where: { id: invite.id, token, campusId: invite.campusId, role: invite.role, canManageMemberships: invite.canManageMemberships, canPurchaseSubscription: invite.canPurchaseSubscription, status: "pending", expiresAt: { gt: new Date() } }, data: { status: "accepted" } });
    if (claimed.count !== 1) throw new ApiError("Invitation is no longer active", 409);
    if (existingUser) await tx.loginSession.updateMany({ where: { userId: existingUser.id }, data: { isActive: false, logoutAt: new Date() } });
    const acceptedUser = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id, isActive: false, accessVersion: existingUser.accessVersion },
          data: {
            password: passwordHash,
            fullName: placeholderName,
            phone: text("phone"),
            cnic: text("cnic"),
            dateOfBirth: text("dateOfBirth") ? new Date(text("dateOfBirth")!) : null,
            gender: text("gender"),
            qualification: text("qualification"),
            specialization: text("specialization"),
            subjectSpecialties: Array.isArray(storedProfile.subjectSpecialties) ? storedProfile.subjectSpecialties : [],
            teachesAllSubjects: Boolean(storedProfile.teachesAllSubjects),
            experience: text("experience"),
            address: text("address"),
            city: text("city"),
            province: text("province"),
            postalCode: text("postalCode"),
            joiningDate: text("joiningDate") ? new Date(text("joiningDate")!) : null,
            emergencyContact: text("emergencyContact"),
            emergencyPhone: text("emergencyPhone"),
            role: invite.role,
            campusId: invite.campusId,
            schoolId: campus.schoolId,
            canPurchaseSubscription: invite.canPurchaseSubscription,
            canManageMemberships: invite.canManageMemberships,
            isInstitutionOwner: false,
            accessVersion: existingUser ? existingUser.accessVersion + 1 : 0,
            onboardingComplete: true,
            isActive: true,
          },
        })
      : await tx.user.create({
          data: {
            email: invite.email,
            password: passwordHash,
            fullName: placeholderName,
            phone: text("phone"),
            cnic: text("cnic"),
            dateOfBirth: text("dateOfBirth") ? new Date(text("dateOfBirth")!) : null,
            gender: text("gender"),
            qualification: text("qualification"),
            specialization: text("specialization"),
            subjectSpecialties: Array.isArray(storedProfile.subjectSpecialties) ? storedProfile.subjectSpecialties : [],
            teachesAllSubjects: Boolean(storedProfile.teachesAllSubjects),
            experience: text("experience"),
            address: text("address"),
            city: text("city"),
            province: text("province"),
            postalCode: text("postalCode"),
            joiningDate: text("joiningDate") ? new Date(text("joiningDate")!) : null,
            emergencyContact: text("emergencyContact"),
            emergencyPhone: text("emergencyPhone"),
            role: invite.role,
            campusId: invite.campusId,
            schoolId: campus.schoolId,
            canPurchaseSubscription: invite.canPurchaseSubscription,
            canManageMemberships: invite.canManageMemberships,
            isInstitutionOwner: false,
            accessVersion: 0,
            onboardingComplete: true,
            isActive: true,
          }
        });

    await tx.staffInvitation.update({
      where: { id: invite.id },
      data: { status: 'accepted' }
    });

    // Every staff member gets a profile row, not only the ones hired with a
    // salary on file. The hierarchy hangs off this row — rank, unit, reporting
    // line — so a teacher without one is invisible to the org chart and to
    // anything that walks the chain of command.
    const designationId = id("designationId");
    const departmentId = id("primaryDepartmentId");
    const reportsToId = id("reportsToId");
    const basicSalary = Math.round(Number(storedProfile.basicSalary || 0));
    const employmentType =
      (text("employmentType") as
        | "FULL_TIME" | "PART_TIME" | "VISITING" | "ADJUNCT" | "CONTRACT" | "INTERN" | "VOLUNTEER"
        | null) ?? "FULL_TIME";

    // Re-read the rank inside the transaction: it was validated at invite time,
    // but that could have been days ago and the ladder is editable.
    const designation = designationId
      ? await tx.staffDesignation.findFirst({
          where: { id: designationId, schoolId: campus.schoolId, isActive: true },
          select: { id: true, name: true, level: true },
        })
      : null;
    const department = departmentId
      ? await tx.department.findFirst({
          where: { id: departmentId, campusId: invite.campusId, isActive: true },
          select: { id: true, name: true },
        })
      : null;
    const manager = reportsToId
      ? await tx.user.findFirst({
          where: { id: reportsToId, schoolId: campus.schoolId, isActive: true },
          select: { id: true, fullName: true, isInstitutionOwner: true, canManageMemberships: true, canPurchaseSubscription: true },
        })
      : null;

    const joinedAt = text("joiningDate") ? new Date(text("joiningDate")!) : new Date();

    if (!["STUDENT", "PARENT"].includes(invite.role)) {
    await tx.staffProfile.upsert({
      where: { userId: acceptedUser.id },
      create: {
        userId: acceptedUser.id,
        designation: designation?.name ?? text("designation"),
        designationId: designation?.id ?? null,
        seniorityLevel: designation?.level ?? null,
        primaryDepartmentId: department?.id ?? null,
        reportsToId: manager?.id ?? null,
        employmentType,
        employeeCode: text("employeeCode"),
        contractType: text("contractType"),
        basicSalary,
        rankSince: joinedAt,
      },
      // An existing profile means a re-invited account. Its position is
      // whatever an admin last set, and the invite must not overwrite that.
      update: {},
    });

    if (department) {
      await tx.departmentMember.create({
        data: {
          departmentId: department.id,
          userId: acceptedUser.id,
          role: "MEMBER",
          isPrimary: true,
          startedAt: joinedAt,
        },
      });
    }

    // The first row of the service record.
    const alreadyOnRecord = await tx.staffAppointment.count({ where: { userId: acceptedUser.id } });
    if (alreadyOnRecord === 0) {
      await tx.staffAppointment.create({
        data: {
          userId: acceptedUser.id,
          changeKind: "JOINED",
          designationId: designation?.id ?? null,
          designationName: designation?.name ?? text("designation"),
          departmentId: department?.id ?? null,
          departmentName: department?.name ?? null,
          reportsToId: manager?.id ?? null,
          reportsToName: manager?.fullName ?? null,
          level: designation?.level ?? null,
          employmentType,
          employmentStatus: "ACTIVE",
          basicSalary,
          effectiveFrom: joinedAt,
        },
      });
    }

    }
    await tx.auditLog.create({ data: { tableName: "membership", recordId: acceptedUser.id, userId: acceptedUser.id, newValue: { action: "invitation.accepted", role: invite.role, campusId: invite.campusId, isInstitutionOwner: false, canPurchaseSubscription: invite.canPurchaseSubscription, canManageMemberships: invite.canManageMemberships } } });
    return acceptedUser;
  }));

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
