import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { moduleFlags } from "@/lib/permissions";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { getSchoolPlanContract } from "@/config/commercial-contract";
import { normalizePlan } from "@/config/plans";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { InviteSchema, type StaffInvitationInput } from "./invitation-schema";
import { z } from "zod";
export function isCompatibleInviteRole(existingRole: string, inviteRole: string) {
  if (inviteRole === "CAMPUS_ADMIN") {
    return existingRole === "CAMPUS_ADMIN" || existingRole === "ADMIN";
  }

  return existingRole === inviteRole;
}

function roleWhereForInvite(role: z.infer<typeof InviteSchema>["role"]): Prisma.UserWhereInput["role"] {
  return role === "CAMPUS_ADMIN" ? { in: ["CAMPUS_ADMIN", "ADMIN"] } : role;
}

export async function lockSchoolMemberships(tx: TxClient, schoolId: string) { await tx.$executeRaw`UPDATE schools SET created_at=created_at WHERE id=${schoolId}`; }
export async function assertSchoolTeacherInvitationCapacity(tx: TxClient, schoolId: string, additional: number) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { plan: true, commercialContract: true } }), contract = getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract);
  const [usage] = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT ((SELECT count(*) FROM users WHERE school_id=${schoolId} AND role='TEACHER' AND is_active=true) + (SELECT count(*) FROM staff_invitations WHERE school_id=${schoolId} AND role='TEACHER' AND status='pending')) AS count`;
  if (contract.maxTeachers >= 0 && Number(usage.count) + additional > contract.maxTeachers) throw new ApiError("Teacher allowance includes active staff and pending invitations on every campus.", 409);
}
/** Save the invitation atomically. Delivery is explicitly outside the retried transaction. */
export async function createStaffInvitation(user: AuthUser, input: StaffInvitationInput) {
  const valid = InviteSchema.parse(input);
  return schoolAiTransaction(user, async tx => {
    await lockSchoolMemberships(tx, user.schoolId);
    const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true, isInstitutionOwner: true, canManageMemberships: true } });
    if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion || !actor.isInstitutionOwner && !actor.canManageMemberships) throw new ApiError("Membership authority changed. Sign in again.", 403);
    const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } }), flags = moduleFlags(grants, user.role, "staff");
    if (!flags.canView || !flags.canAdd) throw new ApiError("Staff invitation permission is required.", 403);
    await assertSchoolOperational(user.schoolId, tx);
    const session = { ...user, isInstitutionOwner: actor.isInstitutionOwner, canManageMemberships: actor.canManageMemberships };
  // Honour an explicitly supplied campusId (e.g. inviting the admin/principal for a
  // newly created campus). Fall back to the caller's own campus only when omitted.
  const targetCampusId = valid.campusId || session.campusId;

  // Non-super callers may only invite staff into their own campus.
  if (!session.isInstitutionOwner && targetCampusId !== session.campusId) {
    throw new ApiError("You can only invite staff to your own campus", 403);
  }

  if (!targetCampusId) throw new ApiError('Campus ID is required', 400);

  const targetCampus = await tx.campus.findUnique({
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
  const [existingUserByEmail] = await tx.$queryRaw<Array<{ id: string; role: string; schoolId: string; campusId: string | null; isActive: boolean }>>`SELECT id,role,school_id AS "schoolId",campus_id AS "campusId",is_active AS "isActive" FROM users WHERE school_id=${session.schoolId} AND lower(email)=${valid.email} LIMIT 1`;

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

  const [existingPendingForEmail] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM staff_invitations WHERE school_id=${session.schoolId} AND lower(email)=${valid.email} AND status='pending' LIMIT 1`;

  if (existingPendingForEmail) {
    throw new ApiError("An invitation is already pending for this email. Use Resend Invite from the dashboard.", 409);
  }

  if (valid.role === "TEACHER") {
    await assertSchoolTeacherInvitationCapacity(tx, session.schoolId, 1);
  }

  // Check the position now rather than on acceptance. A bad id caught here is
  // a form error the inviter can fix; the same id caught days later, while
  // someone is setting their password, would either fail their sign-up or be
  // silently dropped.
  const position = valid.profile;
  if (position?.designationId) {
    const designation = await tx.staffDesignation.findFirst({
      where: { id: position.designationId, schoolId: session.schoolId },
      select: { id: true },
    });
    if (!designation) throw new ApiError("That rank is not one of your institution's designations", 400);
  }
  if (position?.primaryDepartmentId) {
    const department = await tx.department.findFirst({
      where: { id: position.primaryDepartmentId, campusId: targetCampusId },
      select: { id: true },
    });
    if (!department) throw new ApiError("That department is not on this campus", 400);
  }
  if (position?.reportsToId) {
    const manager = await tx.user.findFirst({
      where: { id: position.reportsToId, schoolId: session.schoolId, isActive: true },
      select: { id: true },
    });
    if (!manager) throw new ApiError("That manager is not an active member of this school", 400);
  }

  // Enforce one assigned owner slot in school-group campuses and one principal per campus.
  if (valid.role === 'PRINCIPAL' || (valid.role === 'CAMPUS_ADMIN' && !canInviteStandaloneAdmin)) {
    const existingUser = await tx.user.findFirst({
      where: { campusId: targetCampusId, role: roleWhereForInvite(valid.role), isActive: true }
    });
    const existingInvite = await tx.staffInvitation.findFirst({
      where: { campusId: targetCampusId, role: valid.role, status: 'pending' }
    });

    if (existingUser || existingInvite) {
      throw new ApiError(`A ${valid.role.replace('_', ' ')} is already assigned or invited to this facility.`, 409);
    }
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const invite = await tx.staffInvitation.create({
    data: {
      schoolId: session.schoolId,
      email: valid.email,
      role: valid.role,
      campusId: targetCampusId,
      token,
      expiresAt,
      profile: valid.profile ?? Prisma.JsonNull,
      invitedBy: session.fullName || session.email,
      canPurchaseSubscription: valid.canPurchaseSubscription ?? false,
      canManageMemberships: valid.canManageMemberships ?? false,
    }
  });

  await tx.auditLog.create({
    data: {
      schoolId: session.schoolId,
      tableName: 'staff_invitation',
      recordId: invite.id,
      newValue: { email: valid.email, role: valid.role },
      userId: session.userId,
    }
  });

  return invite;
  });
}
