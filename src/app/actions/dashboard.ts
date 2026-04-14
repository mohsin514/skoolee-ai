'use server'

import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function getSuperAdminDashboardData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "SUPER_ADMIN") throw new Error("Permission Denied");

  const schoolId = String(payload.schoolId);

  // Fetch all campuses with their Admins and Principals
  const campuses = await prisma.campus.findMany({
    where: { schoolId },
    include: {
      users: {
        where: { role: { in: ['CAMPUS_ADMIN', 'PRINCIPAL'] } },
        select: { id: true, fullName: true, email: true, role: true, onboardingComplete: true, isActive: true }
      },
      staffInvitations: {
        where: { role: { in: ['CAMPUS_ADMIN', 'PRINCIPAL'] }, status: 'pending' },
        select: { id: true, email: true, role: true, status: true, expiresAt: true }
      },
      _count: {
        select: { users: true, classes: true }
      }
    }
  });

  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  const formattedCampuses = campuses.map(c => {
    const admin = c.users.find(u => u.role === 'CAMPUS_ADMIN');
    const principal = c.users.find(u => u.role === 'PRINCIPAL');
    const pendingAdmin = c.staffInvitations.find(i => i.role === 'CAMPUS_ADMIN');
    const pendingPrincipal = c.staffInvitations.find(i => i.role === 'PRINCIPAL');

    return {
      id: c.id,
      name: c.name,
      city: c.city,
      status: "Active",
      studentCount: c._count.users, // This counts all users, for now close enough
      classCount: c._count.classes,
      admin: admin ? { ...admin, status: admin.onboardingComplete ? 'Active' : 'Onboarding' } : (pendingAdmin ? { email: pendingAdmin.email, status: 'Invited' } : null),
      principal: principal ? { ...principal, status: principal.onboardingComplete ? 'Active' : 'Onboarding' } : (pendingPrincipal ? { email: pendingPrincipal.email, status: 'Invited' } : null)
    };
  });

  return {
    schoolName: school?.name || "System",
    schoolSlug: school?.slug || "system",
    campuses: formattedCampuses,
    user: {
       fullName: String(payload.fullName || "Owner"),
       email: String(payload.email || ""),
       role: "Super Admin"
    }
  };
}

export async function getCampusDashboardData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  const userRole = String(payload.role);
  if (userRole !== "CAMPUS_ADMIN" && userRole !== "ADMIN") throw new Error("Permission Denied");

  const campusId = String(payload.campusId);
  const schoolId = String(payload.schoolId);

  // Fetch Classes
  const classes = await prisma.class.findMany({
    where: { campusId },
    include: {
      _count: { select: { students: true } },
      classTeacher: { select: { fullName: true } }
    }
  });

  // Fetch Teachers
  const teachers = await prisma.user.findMany({
    where: { campusId, role: 'TEACHER' },
    select: { id: true, fullName: true, email: true, isActive: true, onboardingComplete: true }
  });

  // Fetch Principal (Max 1)
  const principal = await prisma.user.findFirst({
    where: { campusId, role: 'PRINCIPAL' },
    select: { id: true, fullName: true, email: true, onboardingComplete: true }
  });

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const campus = await prisma.campus.findUnique({ where: { id: campusId } });

  return {
    schoolName: school?.name || "Institution",
    campusName: campus?.name || "Campus",
    classes,
    teachers,
    principal,
    adminName: String(payload.fullName || "Administrator"),
    adminEmail: String(payload.email || ""),
    roleLabel: "Campus Admin"
  };
}

export async function getTeacherDashboardData() {
    const session = await getAuthUser();
    if (!session || session.role !== 'TEACHER') throw new Error("Unauthorized");

    const students = await prisma.user.findMany({
        where: { campusId: session.campusId, role: 'STUDENT' },
        select: { id: true, fullName: true, email: true }
    });

    const subjects = await prisma.subject.findMany({
        where: { teacherId: session.userId },
        select: { id: true, name: true, totalMarks: true }
    });

    return {
        students,
        subjects
    };
}

export async function getPrincipalDashboardData() {
    const session = await getAuthUser();
    if (!session || session.role !== 'PRINCIPAL') throw new Error("Unauthorized");

    const totalStudents = await prisma.user.count({ where: { campusId: session.campusId, role: 'STUDENT' } });
    const pendingRemarkReviews = 0; // @todo: Link to AI Remarks feature when implemented

    return {
        totalStudents,
        pendingRemarkReviews
    };
}

export async function getStudentDashboardData() {
    const session = await getAuthUser();
    if (!session || session.role !== 'STUDENT') throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({
        where: { id: session.userId }
    });

    return {
        user
    };
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: String(payload.userId),
      role: String(payload.role),
      campusId: String(payload.campusId),
      schoolId: String(payload.schoolId)
    };
  } catch {
    return null;
  }
}
