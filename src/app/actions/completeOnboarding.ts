'use server';

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";

import { JWT_SECRET } from "@/lib/auth/secret";

export async function getOnboardingSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.onboardingComplete) return { redirect: true, role: payload.role as string };

    // Decodes the JWT directly, so bind tenant context before any query.
    enterTenantContext({ schoolId: String(payload.schoolId), userId: String(payload.userId || "") });

    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      include: { school: true }
    });
    
    return { user };
  } catch (e) {
    return { error: true };
  }
}

export async function finishOnboarding(schoolData: any, campuses: any[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("No session found");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  const userId = String(payload.userId);
  const schoolId = String(payload.schoolId);
  // Decodes the JWT directly, so bind tenant context before any query.
  enterTenantContext({ schoolId, userId });
  await assertPlanCapacity({ schoolId, metric: "campuses", increment: campuses.length });

  // ── Basic validation ─────────────────────────────
  // contactEmail is locked at registration and is read-only in the UI.
  const establishedYear = schoolData.establishedYear ? Number(schoolData.establishedYear) : null;
  if (establishedYear && (establishedYear < 1800 || establishedYear > new Date().getFullYear() + 1)) {
    throw new Error("Please enter a valid established year.");
  }

  // 1. Update School Info (Branding, Identity & Contact)
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      address: schoolData.address || null,
      city: schoolData.city,
      regId: schoolData.regId,
      phone: schoolData.phone || null,
      website: schoolData.website || null,
      logoUrl: schoolData.logoUrl || null,
      establishedYear,
      tagline: schoolData.tagline || null,
    }
  });

  // 2. Create All Campuses
  let primaryCampusId = null;
  for (const c of campuses) {
    const campus = await prisma.campus.create({
      data: {
        schoolId: schoolId,
        name: c.name,
        city: c.city,
        address: c.address,
        phone: c.phone,
        email: c.email || null,
        website: c.website || null,
        principalName: c.principalName || null,
        regId: c.regId,
        board: c.board,
      }
    });
    if (!primaryCampusId) primaryCampusId = campus.id;
  }

  // 3. Finalize User
  const updateData: any = { onboardingComplete: true };
  if (payload.role === 'ADMIN' && primaryCampusId) {
    updateData.campusId = primaryCampusId;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    include: { school: true },
  });

  // 4. Re-issue Session
  const newToken = await new SignJWT({
    userId: updatedUser.id,
    email: updatedUser.email,
    fullName: updatedUser.fullName,
    role: updatedUser.role,
    schoolId: updatedUser.schoolId,
      campusId: updatedUser.campusId, // CRITICAL: Include campusId
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
