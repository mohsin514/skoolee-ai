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

  // Fetch all campuses
  const campuses = await prisma.campus.findMany({
    where: { schoolId },
    include: {
      _count: {
        select: { users: true }
      }
    }
  });

  // Fetch School Info
  const school = await prisma.school.findUnique({
    where: { id: schoolId }
  });

  // Fetch Admins
  const admins = await prisma.user.findMany({
    where: { schoolId, role: 'CAMPUS_ADMIN' },
    select: { id: true, fullName: true, email: true, isActive: true, campus: { select: { name: true } } }
  });

  // Fetch Pending Invites
  const pendingInvites = await prisma.staffInvitation.findMany({
    where: { role: 'CAMPUS_ADMIN', campus: { schoolId } },
    select: { id: true, email: true, role: true, status: true, campus: { select: { name: true } } }
  });

  // Calculate totals
  const totalCampuses = campuses.length;
  const staffCount = await prisma.user.count({
    where: { schoolId, role: { in: ['TEACHER', 'PRINCIPAL', 'CAMPUS_ADMIN'] } }
  });
  const studentCount = await prisma.user.count({
    where: { schoolId, role: 'STUDENT' }
  });

  const formattedCampuses = campuses.map(c => ({
    id: c.id,
    name: c.name,
    status: "Active",
    students: Number(c._count.users),
    staff: "Varies",
    fee: 100,
    marks: 100,
    color: "emerald"
  }));

  return {
    schoolName: school?.name || "System",
    schoolSlug: school?.slug || "system",
    totalCampuses,
    staffCount,
    studentCount,
    feeProgress: "100%",
    campusesList: formattedCampuses,
    adminsList: admins,
    invitesList: pendingInvites
  };
}

export async function getCampusDashboardData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("skoolee_token")?.value;
  if (!token) throw new Error("Unauthorized");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  if (payload.role !== "CAMPUS_ADMIN") throw new Error("Permission Denied");

  const campusId = String(payload.campusId);
  const schoolId = String(payload.schoolId);

  // Fetch Students in this campus
  const students = await prisma.user.findMany({
    where: { campusId, role: 'STUDENT' },
    select: { id: true, fullName: true, email: true, isActive: true }
  });

  const studentCount = students.length;

  // Placeholder for accounting data (we'll implement this properly later)
  const stats = {
    totalStudents: studentCount,
    revenue: 0,
    recovery: 0,
    activeInvoices: 0
  };

  return {
    students,
    stats
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
