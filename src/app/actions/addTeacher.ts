'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import { assertPlanCapacity } from "@/lib/billing/entitlements";
import bcrypt from "bcryptjs";

export async function addTeacher(data: {
  fullName: string;
  email: string;
  phone?: string;
  cnic?: string;
  dateOfBirth?: string;
  gender?: string;
  qualification?: string;
  specialization?: string;
  subjectSpecialties?: string[];
  teachesAllSubjects?: boolean;
  experience?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  joiningDate?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}) {
  const session = await getAuthUser();
  if (!session || (!isCampusAdminRole(session.role) && session.role !== "SUPER_ADMIN" && session.role !== "PRINCIPAL")) {
    throw new Error("Permission Denied");
  }

  if (!session.campusId) throw new Error("Campus ID is required");

  const campusId = session.campusId;
  const schoolId = session.schoolId;
  await assertPlanCapacity({ schoolId, metric: "teachers" });

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("Email already registered");

  const defaultPassword = await bcrypt.hash("skoolee123", 10);

  const teacher = await prisma.user.create({
    data: {
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      password: defaultPassword,
      role: "TEACHER",
      campusId,
      schoolId,
      isActive: true,
      onboardingComplete: true,
      phone: data.phone?.trim() || null,
      cnic: data.cnic?.trim() || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender || null,
      qualification: data.qualification?.trim() || null,
      specialization: data.specialization?.trim() || null,
      subjectSpecialties: (data.subjectSpecialties || []).map((x) => x.trim()).filter(Boolean),
      teachesAllSubjects: Boolean(data.teachesAllSubjects),
      experience: data.experience?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      province: data.province?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : new Date(),
      emergencyContact: data.emergencyContact?.trim() || null,
      emergencyPhone: data.emergencyPhone?.trim() || null,
    },
  });

  return { success: true, teacher: { id: teacher.id, fullName: teacher.fullName, email: teacher.email } };
}
