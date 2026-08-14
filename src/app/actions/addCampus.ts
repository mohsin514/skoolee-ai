'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { inviteStaff } from "./invite";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import { enterTenantContext } from "@/lib/db/tenant-context";

import { JWT_SECRET } from "@/lib/auth/secret";

export async function addCampus(name: string, location: string, board: string = "FBise", adminEmail?: string, regId?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "SUPER_ADMIN" && payload.role !== "ADMIN") throw new Error("Permission Denied");

  const schoolId = String(payload.schoolId);
  // This action decodes the JWT directly instead of going through
  // getAuthUser(), so it must bind the tenant context itself before touching
  // the database, or the guard will (correctly) refuse the query.
  enterTenantContext({ schoolId, userId: String(payload.userId || "") });
  await assertPlanCapacity({ schoolId, metric: "campuses" });

  // Validate or Generate regId
  const finalRegId = regId || `BR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const newCampus = await prisma.campus.create({
    data: {
      name,
      regId: finalRegId,
      schoolId: schoolId,
      city: location,
      address: location,
      board: board,
    }
  });

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
