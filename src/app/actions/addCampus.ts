'use server'

import { getAuthUser } from "@/lib/auth";
import { isGroupConsole } from "@/lib/auth/institution";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { inviteStaff } from "./invite";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { assertEmail, optionalText } from "@/lib/school/details";
import { createCampusRecord, validateCampusInput } from "@/lib/school/campus-commands";


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
  // §7.3 G20: only the group admin of a school group opens campuses. A single school's admin is told how to
  // become a group (support-assisted conversion, D1); everyone else is refused.
  if (!isGroupConsole(payload)) {
    if (payload.role === "ADMIN") throw new Error("Your school is a single school. Contact SkooleeAI support to become a school group.");
    throw new Error("Only the group admin can add a campus.");
  }

  // SKO-402: the same validators as editing a campus, so a campus can always be saved as it was created.
  const valid = validateCampusInput(input);
  const adminEmail = assertEmail(optional(input.adminEmail), "campus admin email address");

  const schoolId = String(payload.schoolId);
  // Bind current membership before touching tenant records.
  enterTenantContext({ schoolId, userId: payload.userId, campusId: payload.campusId, role: payload.role });
  // Plan capacity, the name and Campus ID checks, the create and the calendar seeding (shared with AI Workflows).
  const newCampus = await createCampusRecord(payload, valid);

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
