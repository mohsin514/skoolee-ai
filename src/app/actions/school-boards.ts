'use server'

import { getAuthUser } from "@/lib/auth";
import { enterTenantContext } from "@/lib/db/tenant-context";
import { schoolCountry } from "@/lib/school/country";

/** The signed-in user's school country (ISO alpha-2, or ""): picks the exam boards a campus form offers. */
export async function getSchoolCountry(): Promise<string> {
  const payload = await getAuthUser();
  if (!payload?.schoolId) return "";
  const schoolId = String(payload.schoolId);
  enterTenantContext({ schoolId, userId: payload.userId, campusId: payload.campusId, role: payload.role });
  return schoolCountry(schoolId);
}
