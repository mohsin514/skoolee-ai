'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";
import { randomUUID } from "crypto";
import { sendInviteEmail } from "@/lib/email";

const InviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().optional(),
  role: z.enum(['CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT']),
  campusId: z.string().uuid().optional(),
});

export async function inviteStaff(data: z.infer<typeof InviteSchema>) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'CAMPUS_ADMIN' && session.role !== 'ADMIN')) {
    throw new Error('403 Forbidden');
  }

  const valid = InviteSchema.parse(data);
  const targetCampusId = (session.role === 'CAMPUS_ADMIN' || session.role === 'ADMIN') ? session.campusId : valid.campusId;
  
  if (!targetCampusId) throw new Error('Campus ID is required');

  // Enforce Single Admin / Single Principal rule
  if (valid.role === 'CAMPUS_ADMIN' || valid.role === 'PRINCIPAL') {
    const existingUser = await prisma.user.findFirst({
      where: { campusId: targetCampusId, role: valid.role, isActive: true }
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
  await sendInviteEmail(valid.email, valid.role, campus?.name || 'Your Campus', token);

  return { success: true };
}

export async function removeStaff(userId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'CAMPUS_ADMIN' && session.role !== 'ADMIN')) {
    throw new Error('403 Forbidden');
  }

  await prisma.user.delete({ where: { id: userId } });
  return { success: true };
}

export async function cancelInvitation(inviteId: string) {
  const session = await getAuthUser();
  if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'CAMPUS_ADMIN' && session.role !== 'ADMIN')) {
    throw new Error('403 Forbidden');
  }

  await prisma.staffInvitation.delete({ where: { id: inviteId } });
  return { success: true };
}

export async function acceptInvite(token: string, passwordHash: string, fullName: string) {
  const invite = await prisma.staffInvitation.findUnique({
    where: { token }
  });

  if (!invite) throw new Error('Invalid invite token');
  if (invite.status === 'accepted') throw new Error('Invite already used');
  if (new Date() > invite.expiresAt) throw new Error('Invite expired');

  // Mark as used
  await prisma.staffInvitation.update({
    where: { id: invite.id },
    data: { status: 'accepted' }
  });

  // Create User
  const user = await prisma.user.create({
    data: {
      email: invite.email,
      password: passwordHash,
      fullName: fullName,
      role: invite.role,
      campusId: invite.campusId,
      schoolId: (await prisma.campus.findUnique({where: {id: invite.campusId}}))!.schoolId,
      onboardingComplete: true, // Auto-onboarded
      isActive: true,
    }
  });

  return { success: true, user };
}
