import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import bcrypt from "bcryptjs";
import { logSuperAdminAction } from "@/lib/audit";
import { isUserRole, type UserRole } from "@/lib/roles";
import {
  assertEmailAvailable,
  assertSeatAvailable,
  generatePassword,
  isValidEmail,
  OWNER_CREATABLE_ROLES,
} from "@/lib/owner/provisioning";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role") || "";
    const schoolId = searchParams.get("schoolId") || "";
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (role) where.role = role;
    if (schoolId) where.schoolId = schoolId;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          onboardingComplete: true,
          lastLogin: true,
          lastPasswordChange: true,
          createdAt: true,
          school: { select: { id: true, name: true } },
          campus: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error, "[owner/users] GET failed");
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — Add a user to an existing school
//
// No plan fields here on purpose: a plan belongs to the school, not to
// a person. The new user inherits their school's plan and limits. To
// create a school (and its first owner) use POST /api/owner/schools.
//
// The generated password is returned exactly once, in this response.
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformOwner();

    const body = await req.json();

    const schoolId = String(body.schoolId || "").trim();
    const campusIdRaw = String(body.campusId || "").trim();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim() || null;
    const roleInput = String(body.role || "").trim().toUpperCase();

    if (!schoolId) throw new ApiError("School is required", 400);
    if (!fullName) throw new ApiError("Full name is required", 400);
    if (!isValidEmail(email)) throw new ApiError("A valid email is required", 400);
    if (!isUserRole(roleInput)) throw new ApiError("Unknown role", 400);

    const role = roleInput as UserRole;
    if (!OWNER_CREATABLE_ROLES.includes(role)) {
      throw new ApiError(
        `${role} accounts are created through admission, not here. Allowed: ${OWNER_CREATABLE_ROLES.join(", ")}`,
        400
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, plan: true },
    });
    if (!school) throw new ApiError("School not found", 404);

    // SUPER_ADMIN spans the whole school, so it carries no campus.
    // Every other role must be pinned to a campus in that school.
    let campusId: string | null = null;
    if (role !== "SUPER_ADMIN") {
      if (!campusIdRaw) throw new ApiError(`${role} must be assigned to a campus`, 400);
      const campus = await prisma.campus.findFirst({
        where: { id: campusIdRaw, schoolId },
        select: { id: true },
      });
      if (!campus) throw new ApiError("Campus not found in that school", 404);
      campusId = campus.id;
    }

    await assertEmailAvailable(email);
    await assertSeatAvailable(schoolId, role);

    const tempPassword = String(body.password || "").trim() || generatePassword();
    if (tempPassword.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }
    const hashed = await bcrypt.hash(tempPassword, 12);

    // Teachers land in their own onboarding flow after the password
    // change; everyone else goes straight to their dashboard.
    const onboardingComplete = role !== "TEACHER";

    const created = await prisma.user.create({
      data: {
        schoolId,
        campusId,
        email,
        fullName,
        phone,
        password: hashed,
        role,
        isActive: true,
        onboardingComplete,
        mustChangePassword: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        campus: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    logSuperAdminAction({
      userId: actor.userId,
      action: "user_provisioned",
      status: "success",
      targetType: "user",
      targetId: created.id,
      targetName: created.email,
      newValues: { role, schoolId, campusId, schoolName: school.name },
    }).catch(() => {});

    return Response.json(
      {
        success: true,
        data: {
          ...created,
          // Shown once. Not recoverable.
          tempPassword,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[owner/users] POST failed");
  }
}
