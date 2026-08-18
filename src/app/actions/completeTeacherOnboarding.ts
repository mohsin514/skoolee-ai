'use server';

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { JWT_SECRET } from "@/lib/auth/secret";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";

export async function getTeacherOnboardingSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.onboardingComplete) return { redirect: true, role: payload.role as string };
    if (payload.role !== "TEACHER") return { redirect: true, role: payload.role as string };

    enterTenantContext({ schoolId: String(payload.schoolId), userId: String(payload.userId || "") });

    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      select: { id: true, email: true, fullName: true, phone: true, role: true, schoolId: true, campusId: true },
    });

    return { user };
  } catch {
    return { error: true };
  }
}

export async function completeTeacherOnboarding(data: {
  fullName: string;
  phone: string;
  cnic?: string;
  dateOfBirth?: string;
  gender?: string;
  qualification?: string;
  specialization?: string;
  experience?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}) {
  const fullName = data.fullName.trim();
  const phone = data.phone.trim();

  if (!fullName || fullName.length < 2) throw new Error("Full name is required (min 2 characters)");
  if (!phone || phone.length < 7) throw new Error("Phone number is required (min 7 digits)");

  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("No session found");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "TEACHER") throw new Error("Only teachers can complete this onboarding");
  if (payload.onboardingComplete) throw new Error("Onboarding already completed");

  const userId = String(payload.userId);
  enterTenantContext({ schoolId: String(payload.schoolId), userId });
  await assertSchoolOperational(String(payload.schoolId));

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName,
      phone,
      onboardingComplete: true,
      cnic: data.cnic?.trim() || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender || null,
      qualification: data.qualification?.trim() || null,
      specialization: data.specialization?.trim() || null,
      experience: data.experience?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      province: data.province?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      emergencyContact: data.emergencyContact?.trim() || null,
      emergencyPhone: data.emergencyPhone?.trim() || null,
    },
    include: { school: true },
  });

  const newToken = await new SignJWT({
    userId: updatedUser.id,
    email: updatedUser.email,
    fullName: updatedUser.fullName,
    role: updatedUser.role,
    schoolId: updatedUser.schoolId,
    campusId: updatedUser.campusId,
    schoolSlug: updatedUser.school?.slug,
    schoolStatus: updatedUser.school?.status,
    onboardingComplete: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  cookieStore.set("skoolee_token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return { success: true, role: updatedUser.role };
}
