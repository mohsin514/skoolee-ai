'use server'

import { getAuthUser } from "@/lib/auth";

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { inviteStaff } from "./invite";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { DEFAULT_EXAM_BOARD } from "@/config/boards";
import { assertEmail, assertPhone, assertWebsite, optionalText, requiredText } from "@/lib/school/details";


export interface AddCampusInput {
  name: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  board?: string;
  /** Omit to have one generated. */
  regId?: string;
  /** When set, a CAMPUS_ADMIN invitation is sent for the new campus. */
  adminEmail?: string;
}

/** Trimmed, or null when the field was left blank. */
const optional = (value?: string) => optionalText(value);

export async function addCampus(input: AddCampusInput) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new Error("Unauthorized");

  const payload = await getAuthUser();
  if (!payload) throw new Error("Unauthorized");
  if (payload.role !== "SUPER_ADMIN" && payload.role !== "ADMIN") throw new Error("Permission Denied");

  // SKO-402: the same validators as editing a campus, so a campus can always be saved as it was created.
  const name = requiredText(input.name, "Campus name");
  const city = requiredText(input.city, "City");
  const email = assertEmail(optional(input.email), "campus email address");
  const phone = assertPhone(optional(input.phone), "Phone number");
  const website = assertWebsite(optional(input.website), "website");
  const adminEmail = assertEmail(optional(input.adminEmail), "campus admin email address");

  const schoolId = String(payload.schoolId);
  // Bind current membership before touching tenant records.
  enterTenantContext({ schoolId, userId: payload.userId, campusId: payload.campusId, role: payload.role });
  await assertPlanCapacity({ schoolId, metric: "campuses" });

  const finalRegId = (optional(input.regId) || `BR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`).toUpperCase();

  // regId is unique platform-wide, so a clash is a user-facing problem, not a
  // 500. Check first for the common case; the create is still wrapped below
  // because two admins can race between this read and the write.
  const sameName = await prisma.campus.findFirst({ where: { schoolId, archivedAt: null, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (sameName) throw new Error("Another active campus already uses this name.");
  const clash = await prisma.campus.findUnique({ where: { regId: finalRegId }, select: { id: true } });
  if (clash) throw new Error(`Campus ID ${finalRegId} is already in use. Choose another.`);

  let newCampus;
  try {
    newCampus = await prisma.campus.create({
      data: {
        name,
        regId: finalRegId,
        schoolId,
        city,
        // Previously city was written into address as well, so every campus
        // reported its address as just the city name on letters and receipts.
        address: optional(input.address),
        phone,
        email,
        website,
        principalName: optional(input.principalName),
        board: optional(input.board) || DEFAULT_EXAM_BOARD,
      }
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw new Error(`Campus ID ${finalRegId} is already in use. Choose another.`);
    }
    throw error;
  }

  // A campus created after onboarding needs the same academic grounding the
  // wizard gives the first one, or the Academic Hub opens reporting the year
  // as unset, getActiveAcademicYear() falls back to the calendar year, and
  // exam scheduling will happily book a paper on the group's weekend.
  //
  // Inherit from a sibling campus so a new branch matches the group it joins,
  // rather than asking an admin to re-enter the session they already defined.
  await seedCampusCalendar(schoolId, newCampus.id);

  // Automatically trigger invite if email provided
  if (adminEmail) {
    await inviteStaff({
      email: adminEmail,
      role: 'CAMPUS_ADMIN',
      campusId: newCampus.id
    });
  }

  return { success: true, campus: newCampus };
}

/**
 * Gives a new campus an ACTIVE academic cycle and a working week, copied from
 * an existing campus in the same school when there is one.
 *
 * Best-effort: the campus itself is already created and usable, so a failure
 * here must not fail the whole action — the admin can still set the calendar
 * from Academic → Calendar.
 */
async function seedCampusCalendar(schoolId: string, campusId: string) {
  try {
    const sibling = await prisma.campus.findFirst({
      where: { schoolId, id: { not: campusId } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const template = sibling
      ? await prisma.academicCycle.findFirst({
          where: { campusId: sibling.id, status: "ACTIVE" },
          select: { label: true, academicYear: true, startDate: true, endDate: true },
        })
      : null;

    const year = template?.academicYear ?? new Date().getFullYear();
    await prisma.academicCycle.create({
      data: {
        campusId,
        label: template?.label ?? `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
        academicYear: year,
        status: "ACTIVE",
        startDate: template?.startDate ?? new Date(),
        endDate: template?.endDate ?? null,
      },
    });

    const siblingWeekends = sibling
      ? await prisma.weekend.findMany({
          where: { campusId: sibling.id },
          select: { dayOfWeek: true },
        })
      : [];

    // Sunday is the sane default when there is no sibling to copy.
    const days = siblingWeekends.length > 0 ? siblingWeekends.map((w) => w.dayOfWeek) : [7];
    await prisma.weekend.createMany({
      data: days.map((dayOfWeek) => ({ campusId, dayOfWeek })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[addCampus] calendar seeding failed", error);
  }
}
