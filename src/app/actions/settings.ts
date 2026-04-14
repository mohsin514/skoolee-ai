'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function updateSchoolSettings(data: { name: string; slug: string }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "SUPER_ADMIN") throw new Error("Permission Denied");

  const schoolId = String(payload.schoolId);

  // Validate slug uniqueness if changed
  if (data.slug !== payload.schoolSlug) {
    const existing = await prisma.school.findUnique({ where: { slug: data.slug } });
    if (existing) throw new Error("This slug is already in use by another school");
  }

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: {
      name: data.name,
      slug: data.slug,
    }
  });

  return { success: true, school: updated };
}
