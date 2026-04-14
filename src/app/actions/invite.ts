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
  if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'CAMPUS_ADMIN')) {
    throw new Error('403 Forbidden');
  }

  const valid = InviteSchema.parse(data);

  // If Campus Admin, force their own campus ID
  const targetCampusId = session.role === 'CAMPUS_ADMIN' ? session.campusId : valid.campusId;
  
  if (!targetCampusId) {
    throw new Error('Campus ID is required');
  }

  // Create invite token
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48); // 48h expiry

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
  
  // Here you would integrate Resend or other email provider
  await sendInviteEmail(valid.email, valid.role, campus?.name || 'Your Campus', token);

  return { success: true, token }; // Returning token for dev/debugging
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
