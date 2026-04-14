'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { inviteStaff } from "./invite";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function addCampus(name: string, location: string, board: string, adminEmail: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "SUPER_ADMIN") throw new Error("Permission Denied");

  const schoolId = String(payload.schoolId);

  // Check if admin email already tied
  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingUser) throw new Error("Admin email already exists in system");

  const newCampus = await prisma.campus.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString().slice(-4),
      schoolId: schoolId,
      city: location,
      address: location,
    }
  });

  // Automatically trigger invite for the adminEmail
  await inviteStaff({
    email: adminEmail,
    role: 'CAMPUS_ADMIN',
    campusId: newCampus.id
  });

  return { success: true, campus: newCampus };
}
