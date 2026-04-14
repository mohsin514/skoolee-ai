'use server'

import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendVerificationEmail } from "@/lib/email";
import { randomUUID } from "crypto";

const SignupStep1Schema = z.object({
  email: z.string().email(),
  registrationType: z.enum(['school_group', 'single_campus']),
});

const SignupStep2Schema = z.object({
  email: z.string().email("Invalid work email address"),
  fullName: z.string().min(3, "Please enter your full name"),
  password: z.string().min(8, "Minimum 8 characters"),
  schoolName: z.string().min(3, "Institution name is required"),
  regId: z.string().min(3, "Unique identity code is required"),
});

export async function submitSignupStep1(data: z.infer<typeof SignupStep1Schema>) {
  const valid = SignupStep1Schema.parse(data);

  const existing = await prisma.pendingRegistration.findFirst({
    where: { email: valid.email }
  });

  if (existing) {
    await prisma.pendingRegistration.update({
      where: { id: existing.id },
      data: { registrationType: valid.registrationType }
    });
  } else {
    await prisma.pendingRegistration.create({
      data: {
        email: valid.email,
        registrationType: valid.registrationType,
      }
    });
  }

  return { success: true };
}

export async function submitSignupStep2(data: z.infer<typeof SignupStep2Schema>) {
  const valid = SignupStep2Schema.parse(data);

  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: valid.email }
  });

  if (!pending) throw new Error("Step 1 not completed");

  const existingUser = await prisma.user.findUnique({
    where: { email: valid.email }
  });

  if (existingUser) throw new Error("User already exists");

  const existingSchool = await prisma.school.findUnique({
    where: { regId: valid.regId }
  });
  if (existingSchool) throw new Error("This Identity Code (Reg ID) is already registered.");

  const hashedPassword = await bcrypt.hash(valid.password, 10);
  const role = pending.registrationType === 'school_group' ? 'SUPER_ADMIN' : 'ADMIN';

  // Create school with actual user-provided name and RegID
  const school = await prisma.school.create({
    data: {
      name: valid.schoolName,
      regId: valid.regId,
      slug: valid.schoolName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString().slice(-4),
      contactEmail: valid.email,
      city: "Establishing...",
      status: "TRIAL"
    }
  });

  const user = await prisma.user.create({
    data: {
      email: valid.email,
      password: hashedPassword,
      fullName: valid.fullName,
      role: role,
      schoolId: school.id,
      onboardingComplete: false,
      isActive: false, 
    }
  });

  const token = randomUUID();
  await sendVerificationEmail(user.email, user.id, token);

  return { success: true, user: { id: user.id, email: user.email } };
}
