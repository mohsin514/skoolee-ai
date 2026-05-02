'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import bcrypt from "bcryptjs";

export async function addStudent(data: {
  fullName: string;
  email?: string;
  rollNo: string;
  classId?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
}) {
  const session = await getAuthUser();
  if (!session || (!isCampusAdminRole(session.role) && session.role !== "SUPER_ADMIN")) {
      throw new Error("Permission Denied");
  }

  if (!session.campusId) throw new Error("Campus ID is required");

  const campusId = session.campusId;
  const schoolId = session.schoolId;
  await assertPlanCapacity({ schoolId, metric: "students" });

  const targetClass = data.classId
    ? await prisma.class.findFirst({ where: { id: data.classId, campusId } })
    : await prisma.class.findFirst({ where: { campusId }, orderBy: { name: "asc" } });

  if (!targetClass) throw new Error("Create a class before adding students");

  // Check if student email already exists
  const existing = data.email ? await prisma.user.findUnique({ where: { email: data.email } }) : null;
  if (existing) throw new Error("Email already registered");

  // Default password for students (they can change it)
  const account = data.email
    ? await prisma.user.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          password: await bcrypt.hash("skoolee123", 10),
          role: "STUDENT",
          campusId,
          schoolId,
          isActive: true,
          onboardingComplete: true,
        },
      })
    : null;

  const newStudent = await prisma.student.create({
    data: {
      fullName: data.fullName,
      rollNo: data.rollNo,
      gender: data.gender || "OTHER",
      campusId,
      classId: targetClass.id,
      studentUserId: account?.id,
    },
  });

  return { success: true, student: newStudent, account };
}
