'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function addStudent(data: { fullName: string, email: string, rollNo: string }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "CAMPUS_ADMIN" && payload.role !== "SUPER_ADMIN") {
      throw new Error("Permission Denied");
  }

  const campusId = String(payload.campusId);
  const schoolId = String(payload.schoolId);

  // Check if student email already exists
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("Email already registered");

  // Default password for students (they can change it)
  const hashedPassword = await bcrypt.hash("skoolee123", 10);

  const newStudent = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      password: hashedPassword,
      role: 'STUDENT',
      campusId,
      schoolId,
      isActive: true,
      onboardingComplete: true, // Students don't do onboarding
    }
  });

  return { success: true, student: newStudent };
}
