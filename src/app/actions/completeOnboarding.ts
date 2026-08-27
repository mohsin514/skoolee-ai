'use server';

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { parseDateOnly, parseEstablishedYear, safeTimezone } from "@/lib/school/details";

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

/** Weekly off days, ISO-style: 1 = Monday … 7 = Sunday. */
export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface OnboardingSchoolInput {
  name: string;
  city: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  establishedYear?: string;
  tagline?: string;
  regId: string;
  /** IANA zone deciding which calendar day an attendance mark falls on. */
  timezone?: string;
  /** Human label for the first session, e.g. "2026-27". */
  sessionLabel?: string;
  /** Academic year the first cycle is filed under — NOT always the calendar year. */
  academicYear?: string | number;
  sessionStart?: string;
  sessionEnd?: string;
  /** Days the campus is closed each week. Empty means "no weekend set". */
  weekends?: number[];
}

export interface OnboardingCampusInput {
  name: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  regId: string;
  board?: string;
}

export async function finishOnboarding(
  schoolData: OnboardingSchoolInput,
  campuses: OnboardingCampusInput[],
) {
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
  const establishedYear = parseEstablishedYear(schoolData.establishedYear);

  // The first academic session. A cycle labelled 2027 routinely starts in
  // August 2026, so the year is asked for explicitly rather than derived from
  // today's date — see getActiveAcademicYear() for why that matters.
  const academicYear = Number(schoolData.academicYear) || new Date().getFullYear();
  if (academicYear < 2000 || academicYear > new Date().getFullYear() + 5) {
    throw new Error("Please enter a valid academic year.");
  }
  const sessionLabel = schoolData.sessionLabel?.trim() || `${academicYear}-${String((academicYear + 1) % 100).padStart(2, "0")}`;
  const sessionStart = parseDateOnly(schoolData.sessionStart);
  const sessionEnd = parseDateOnly(schoolData.sessionEnd);
  if (sessionStart && sessionEnd && sessionEnd <= sessionStart) {
    throw new Error("The session end date must fall after the start date.");
  }

  // Weekly off days. Deduped and range-checked here so a malformed payload
  // cannot slip a 0 or an 8 into a column the calendar grid indexes by.
  const weekendDays = [...new Set(schoolData.weekends ?? [])]
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (weekendDays.length >= 7) {
    throw new Error("A campus needs at least one working day.");
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
      // Governs which calendar day an attendance mark or fee cutoff lands on.
      // Keep the schema default when the value is missing or not a real zone.
      ...(safeTimezone(schoolData.timezone) ? { timezone: safeTimezone(schoolData.timezone)! } : {}),
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

    // Every campus starts with a live academic session and a weekend, because
    // the rest of the product assumes both exist. Without an ACTIVE cycle,
    // getActiveAcademicYear() silently falls back to the calendar year and
    // marks get filed under a year the office is not looking at; without
    // weekend rows, exam scheduling happily books papers on a Sunday and the
    // Academic Hub reports the year as unfinished.
    await prisma.academicCycle.create({
      data: {
        campusId: campus.id,
        label: sessionLabel,
        academicYear,
        status: "ACTIVE",
        startDate: sessionStart ?? new Date(),
        endDate: sessionEnd,
      },
    });

    if (weekendDays.length > 0) {
      await prisma.weekend.createMany({
        data: weekendDays.map((dayOfWeek) => ({ campusId: campus.id, dayOfWeek })),
        skipDuplicates: true,
      });
    }
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
