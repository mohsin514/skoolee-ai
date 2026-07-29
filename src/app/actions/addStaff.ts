'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import bcrypt from "bcryptjs";

export async function addStaff(data: {
  fullName: string;
  email: string;
  phone?: string;
  cnic?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  role: "CAMPUS_ADMIN" | "PRINCIPAL";
}) {
  const session = await getAuthUser();
  if (!session || (!isCampusAdminRole(session.role) && session.role !== "SUPER_ADMIN")) {
    throw new Error("Permission Denied");
  }

  if (!session.campusId) throw new Error("Campus ID is required");

  const campusId = session.campusId;
  const schoolId = session.schoolId;

  const existing = await prisma.user.findUnique({ where: { email: data.email.trim().toLowerCase() } });
  if (existing) throw new Error("Email already registered");

  if (data.role === "PRINCIPAL") {
    const existingPrincipal = await prisma.user.findFirst({
      where: { campusId, role: "PRINCIPAL", isActive: true },
    });
    if (existingPrincipal) throw new Error("This campus already has an active principal. Remove the current principal first.");
  }

  const defaultPassword = await bcrypt.hash("skoolee123", 10);

  const user = await prisma.user.create({
    data: {
      fullName: data.fullName.trim(),
      email: data.email.trim().toLowerCase(),
      password: defaultPassword,
      role: data.role,
      campusId,
      schoolId,
      isActive: true,
      onboardingComplete: true,
      phone: data.phone?.trim() || null,
      cnic: data.cnic?.trim() || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      province: data.province?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      emergencyContact: data.emergencyContact?.trim() || null,
      emergencyPhone: data.emergencyPhone?.trim() || null,
    },
  });

  return { success: true, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } };
}
