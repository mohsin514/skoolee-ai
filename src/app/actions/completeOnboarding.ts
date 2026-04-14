'use server';

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function getOnboardingSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.onboardingComplete) return { redirect: true };
    
    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      include: { school: true }
    });
    
    return { user };
  } catch (e) {
    return null;
  }
}

export async function finishOnboarding(schoolData: any, campuses: any[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("No session found");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  const userId = String(payload.userId);
  const schoolId = String(payload.schoolId);

  // 1. Update School Info (Branding & RegId)
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      address: schoolData.address,
      city: schoolData.city,
      regId: schoolData.regId,
    }
  });

  // 2. Create All Campuses
  for (const c of campuses) {
    await prisma.campus.create({
      data: {
        schoolId: schoolId,
        name: c.name,
        city: c.city,
        address: c.address,
        phone: c.phone,
        regId: c.regId,
        board: c.board,
      }
    });
  }

  // 3. Finalize User
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { onboardingComplete: true },
    include: { school: true },
  });

  // 4. Re-issue Session
  const newToken = await new SignJWT({
    userId: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
    schoolId: updatedUser.schoolId,
    schoolSlug: updatedUser.school?.slug,
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
