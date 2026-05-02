'use server'

import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  
  // Security best practice: Always return success even if user doesn't exist to prevent email enumeration
  if (!user) {
    return { success: true };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

  await prisma.passwordReset.create({
    data: {
      email,
      token,
      expiresAt
    }
  });

  await sendPasswordResetEmail(email, token);

  return { success: true };
}

export async function verifyToken(token: string) {
  const resetRequest = await prisma.passwordReset.findUnique({ where: { token } });
  
  if (!resetRequest || resetRequest.expiresAt < new Date()) {
    return { valid: false };
  }
  
  return { valid: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const resetRequest = await prisma.passwordReset.findUnique({ where: { token } });
  
  if (!resetRequest || resetRequest.expiresAt < new Date()) {
    throw new Error("Invalid or expired token");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email: resetRequest.email },
    data: { password: hashedPassword }
  });

  // Clean up
  await prisma.passwordReset.delete({ where: { token } });

  return { success: true };
}
