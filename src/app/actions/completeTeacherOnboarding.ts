'use server';

import { getAuthUser } from "@/lib/auth";

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { z } from "zod";

import { JWT_SECRET } from "@/lib/auth/secret";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { rotateLoginSession } from "@/lib/audit";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  sessionCookieAttributes,
} from "@/lib/auth/session-cookie";

export type TeacherReadiness = {
  classTeacherOf: string[];
  subjects: { subject: string; className: string }[];
  /** Where the first permitted teaching task lives. Derived from real assignments only. */
  next: { kind: "REGISTER" | "CLASSES" | "UNASSIGNED"; href: string };
};

/** SKO-458: what the teacher can actually do first. Never invents an assignment. */
async function readinessFor(userId: string): Promise<TeacherReadiness> {
  const [classes, subjects] = await Promise.all([
    prisma.class.findMany({ where: { classTeacherId: userId }, select: { name: true, section: true }, orderBy: { name: "asc" }, take: 20 }),
    prisma.subject.findMany({ where: { teacherId: userId }, select: { name: true, class: { select: { name: true, section: true } } }, orderBy: { name: "asc" }, take: 40 }),
  ]);
  const label = (c: { name: string; section: string | null }) => (c.section ? `${c.name} ${c.section}` : c.name);
  const classTeacherOf = classes.map(label);
  const subjectRows = subjects.map((s) => ({ subject: s.name, className: label(s.class) }));
  const next: TeacherReadiness["next"] = classTeacherOf.length
    ? { kind: "REGISTER", href: "/teacher/attendance" }
    : subjectRows.length
    ? { kind: "CLASSES", href: "/teacher/classes" }
    : { kind: "UNASSIGNED", href: "/teacher" };
  return { classTeacherOf, subjects: subjectRows, next };
}

export async function getTeacherOnboardingSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = await getAuthUser();
    if (!payload) throw new Error("Unauthorized");
    if (payload.onboardingComplete) return { redirect: true, role: payload.role as string };
    if (payload.role !== "TEACHER") return { redirect: true, role: payload.role as string };

    enterTenantContext({ schoolId: payload.schoolId, userId: payload.userId, campusId: payload.campusId, role: payload.role });

    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      select: { id: true, email: true, fullName: true, phone: true, role: true, schoolId: true, campusId: true,
        school: { select: { name: true } }, campus: { select: { name: true } } },
    });
    if (!user) throw new Error("Unauthorized");
    // Invitation context the teacher should see while filling in the form: which
    // school and campus this profile is for, and what is already assigned.
    return { user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, role: user.role },
      school: user.school?.name ?? "", campus: user.campus?.name ?? "", readiness: await readinessFor(user.id) };
  } catch {
    return { error: true };
  }
}

/**
 * International numbers are accepted: digits with optional +, spaces, dashes,
 * dots and brackets, 7–15 digits in all (E.164 maximum).
 */
const phoneSchema = z.string().trim().refine((v) => /^\+?[\d\s().-]+$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 7 && (v.match(/\d/g)?.length ?? 0) <= 15);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optionalDate = z.string().trim().optional().refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))).transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  cnic: optionalText(40),
  dateOfBirth: optionalDate.refine((d) => !d || d.getTime() < Date.now()),
  gender: z.string().trim().optional().refine((v) => !v || ["MALE", "FEMALE", "OTHER"].includes(v)).transform((v) => v || null),
  qualification: optionalText(80),
  specialization: optionalText(400),
  experience: optionalText(80),
  address: optionalText(300),
  city: optionalText(80),
  province: optionalText(80),
  postalCode: optionalText(20),
  emergencyContact: optionalText(120),
  emergencyPhone: z.string().trim().optional().refine((v) => !v || phoneSchema.safeParse(v).success).transform((v) => v || null),
  subjectSpecialties: z.array(z.string().trim().max(60)).max(30).optional(),
  teachesAllSubjects: z.boolean().optional(),
  joiningDate: optionalDate,
  profileImageUrl: z.string().trim().max(500).optional().refine((v) => !v || /^https:\/\//.test(v)).transform((v) => v || null),
});

export type TeacherOnboardingInput = z.input<typeof profileSchema>;

/** Field → message shown to the teacher. Kept as source strings so the page can translate them. */
const FIELD_MESSAGES: Record<string, string> = {
  fullName: "Name must be at least 2 characters",
  phone: "Enter a phone number with 7 to 15 digits",
  emergencyPhone: "Enter a phone number with 7 to 15 digits",
  dateOfBirth: "Enter a valid date in the past",
  joiningDate: "Enter a valid date",
};

export type TeacherOnboardingResult =
  | { ok: true; role: string; alreadyComplete: boolean; readiness: TeacherReadiness }
  | { ok: false; code: "SESSION_EXPIRED" | "NOT_TEACHER" | "INVALID" | "SCHOOL_UNAVAILABLE" | "FAILED"; fields?: Record<string, string> };

/**
 * SKO-458. Results are returned, not thrown: a thrown server-action error is
 * redacted in production, so the teacher would only ever see a generic failure.
 * Submitting twice (double click, replay after back navigation, a second tab)
 * completes once and reports the same outcome.
 */
export async function completeTeacherOnboarding(data: TeacherOnboardingInput): Promise<TeacherOnboardingResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { ok: false, code: "SESSION_EXPIRED" };

  const payload = await getAuthUser();
  if (!payload) return { ok: false, code: "SESSION_EXPIRED" };
  if (payload.role !== "TEACHER") return { ok: false, code: "NOT_TEACHER" };

  const parsed = profileSchema.safeParse(data ?? {});
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "profile");
      fields[field] ??= FIELD_MESSAGES[field] ?? "Check this value";
    }
    return { ok: false, code: "INVALID", fields };
  }
  const input = parsed.data;

  const userId = String(payload.userId);
  enterTenantContext({ schoolId: payload.schoolId, userId, campusId: payload.campusId, role: payload.role });
  try {
    await assertSchoolOperational(String(payload.schoolId));
  } catch {
    return { ok: false, code: "SCHOOL_UNAVAILABLE" };
  }

  try {
    // Only the profile fields below are writable here: never role, school,
    // campus, permissions or class assignments.
    const updated = await prisma.user.updateMany({
      where: { id: userId, role: "TEACHER", onboardingComplete: false },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        onboardingComplete: true,
        cnic: input.cnic,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        qualification: input.qualification,
        specialization: input.specialization,
        experience: input.experience,
        address: input.address,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        emergencyContact: input.emergencyContact,
        emergencyPhone: input.emergencyPhone,
        subjectSpecialties: input.teachesAllSubjects ? [] : [...new Set((input.subjectSpecialties ?? []).filter(Boolean))],
        teachesAllSubjects: Boolean(input.teachesAllSubjects),
        joiningDate: input.joiningDate,
        profileImageUrl: input.profileImageUrl,
      },
    });
    const alreadyComplete = updated.count === 0;

    const updatedUser = await prisma.user.findUnique({ where: { id: userId }, include: { school: true } });
    if (!updatedUser || !updatedUser.onboardingComplete) return { ok: false, code: "FAILED" };

    // Re-mint either way, so a replay from a tab holding the pre-completion
    // cookie stops being sent back to onboarding by the proxy.
    const newToken = await new SignJWT({
      mfaVerified: payload.mfaVerified === true,
      userId: updatedUser.id,
      accessVersion: updatedUser.accessVersion,
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

    // Close the row for the token being replaced and record one for its
    // successor, so this session stays revocable across the re-mint instead of
    // leaving a permanently-open row keyed to a token nobody holds.
    await rotateLoginSession({
      previousToken: token,
      token: newToken,
      userId: updatedUser.id,
      schoolId: updatedUser.schoolId,
      expiresAt: new Date(Date.now() + SESSION_DAYS.default * 24 * 60 * 60 * 1000),
    });

    cookieStore.set(
      SESSION_COOKIE_NAME,
      newToken,
      sessionCookieAttributes(SESSION_DAYS.default)
    );

    return { ok: true, role: updatedUser.role, alreadyComplete, readiness: await readinessFor(userId) };
  } catch (error) {
    console.error("[teacher-onboarding] save failed", error instanceof Error ? error.message : error);
    return { ok: false, code: "FAILED" };
  }
}
