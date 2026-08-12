import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import bcrypt from "bcryptjs";
import { PLANS } from "@/config/plans";
import { logSuperAdminAction } from "@/lib/audit";
import {
  assertEmailAvailable,
  generatePassword,
  genRegId,
  isValidEmail,
  normalizePlan,
  uniqueSlug,
} from "@/lib/owner/provisioning";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "";
    const plan = searchParams.get("plan") || "";

    const where: any = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        include: {
          campuses: {
            select: {
              id: true,
              name: true,
              city: true,
              phone: true,
              email: true,
              website: true,
              principalName: true,
              board: true,
              _count: { select: { students: true, users: true, classes: true } },
            },
          },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.school.count({ where }),
    ]);

    const data = schools.map((school) => ({
      id: school.id,
      name: school.name,
      slug: school.slug,
      contactEmail: school.contactEmail,
      city: school.city,
      phone: school.phone,
      website: school.website,
      logoUrl: school.logoUrl,
      tagline: school.tagline,
      establishedYear: school.establishedYear,
      status: school.status,
      plan: school.plan,
      aiCreditsUsed: school.aiCreditsUsed,
      aiCreditsLimit: school.aiCreditsLimit,
      createdAt: school.createdAt,
      campusCount: school.campuses.length,
      totalStudents: school.campuses.reduce((sum, c) => sum + c._count.students, 0),
      totalStaff: school.campuses.reduce((sum, c) => sum + c._count.users, 0),
      totalClasses: school.campuses.reduce((sum, c) => sum + c._count.classes, 0),
      campuses: school.campuses.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        phone: c.phone,
        email: c.email,
        website: c.website,
        principalName: c.principalName,
        board: c.board,
        students: c._count.students,
        staff: c._count.users,
        classes: c._count.classes,
      })),
    }));

    return Response.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools] GET failed");
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — Provision a new school (tenant)
//
// Creates School + first Campus + SUPER_ADMIN owner account in one
// transaction, on the chosen plan. This replaces self-serve /register:
// only the APP_OWNER can bring a new tenant into existence.
//
// The generated password is returned exactly once, in this response.
// It is never stored in plaintext and cannot be retrieved again.
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuthUser({ allowSuspended: true });
    if (actor.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const body = await req.json();

    const schoolName = String(body.schoolName || "").trim();
    const city = String(body.city || "").trim();
    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    const ownerName = String(body.ownerName || "").trim();
    const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
    const campusName = String(body.campusName || "").trim() || `${schoolName} — Main Campus`;
    const campusCity = String(body.campusCity || "").trim() || city;
    const board = String(body.board || "").trim() || null;
    const phone = String(body.phone || "").trim() || null;
    const address = String(body.address || "").trim() || null;

    if (!schoolName) throw new ApiError("School name is required", 400);
    if (!city) throw new ApiError("City is required", 400);
    if (!ownerName) throw new ApiError("Owner name is required", 400);
    if (!isValidEmail(ownerEmail)) throw new ApiError("A valid owner email is required", 400);
    if (contactEmail && !isValidEmail(contactEmail)) {
      throw new ApiError("School contact email is not valid", 400);
    }

    const plan = normalizePlan(body.plan);
    const planDef = PLANS[plan];
    const status = ["TRIAL", "ACTIVE"].includes(String(body.status).toUpperCase())
      ? String(body.status).toUpperCase()
      : "TRIAL";

    // Owner may override the plan's default AI credit allowance.
    const aiCreditsLimit =
      Number.isFinite(Number(body.aiCreditsLimit)) && Number(body.aiCreditsLimit) >= 0
        ? Math.floor(Number(body.aiCreditsLimit))
        : planDef.aiCredits;

    const schoolContact = contactEmail || ownerEmail;
    await assertEmailAvailable(ownerEmail);
    if (schoolContact !== ownerEmail) {
      const contactTaken = await prisma.school.findUnique({
        where: { contactEmail: schoolContact },
        select: { id: true },
      });
      if (contactTaken) throw new ApiError("That school contact email is already in use", 409);
    }

    const slug = await uniqueSlug(body.slug || schoolName);
    const tempPassword = String(body.password || "").trim() || generatePassword();
    if (tempPassword.length < 8) {
      throw new ApiError("Password must be at least 8 characters", 400);
    }
    const hashed = await bcrypt.hash(tempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: schoolName,
          slug,
          city,
          address,
          contactEmail: schoolContact,
          status,
          plan,
          aiCreditsLimit,
          regId: genRegId("SKL"),
        },
      });

      const campus = await tx.campus.create({
        data: {
          schoolId: school.id,
          name: campusName,
          city: campusCity,
          address,
          phone,
          board,
          regId: genRegId("BR"),
        },
      });

      const owner = await tx.user.create({
        data: {
          schoolId: school.id,
          campusId: campus.id,
          email: ownerEmail,
          fullName: ownerName,
          phone,
          password: hashed,
          role: "SUPER_ADMIN",
          isActive: true,
          // Owner-provisioned accounts skip email verification but must
          // replace the generated password before reaching a dashboard.
          onboardingComplete: true,
          mustChangePassword: true,
        },
      });

      return { school, campus, owner };
    });

    logSuperAdminAction({
      userId: actor.userId,
      action: "school_provisioned",
      status: "success",
      targetType: "school",
      targetId: result.school.id,
      targetName: result.school.name,
      newValues: { plan, status, ownerEmail, campusName },
    }).catch(() => {});

    return Response.json(
      {
        success: true,
        data: {
          schoolId: result.school.id,
          schoolName: result.school.name,
          slug: result.school.slug,
          campusId: result.campus.id,
          campusName: result.campus.name,
          ownerId: result.owner.id,
          ownerEmail: result.owner.email,
          plan,
          status,
          limits: {
            maxStudents: planDef.maxStudents,
            maxTeachers: planDef.maxTeachers,
            maxCampuses: planDef.maxCampuses,
            aiCredits: aiCreditsLimit,
          },
          // Shown once. Not recoverable.
          tempPassword,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[owner/schools] POST failed");
  }
}
