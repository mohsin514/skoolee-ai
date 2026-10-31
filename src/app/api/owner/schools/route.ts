import { pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { bindProvisionHandoff, completeProvisionHandoff } from "@/lib/owner/workflow-provisioning";
import { ownerPagination } from "@/lib/owner/list-query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import bcrypt from "bcryptjs";
import { PLANS } from "@/config/plans";
import { createPlanContract } from "@/config/commercial-contract";
import { logSuperAdminAction } from "@/lib/audit";
import {
  assertEmailAvailable,
  generatePassword,
  genRegId,
  isValidEmail,
  normalizePlan,
  uniqueSlug,
} from "@/lib/owner/provisioning";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();
    await assertListBudget(user, "owner/schools");

    const { searchParams } = new URL(req.url);
    const { page: requestedPage, limit } = ownerPagination(searchParams);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status") || "";
    const plan = searchParams.get("plan") || "";

    const where: any = {};
    if (status) where.status = status;
    if (plan && !["FREE", "BASIC", "PRO", "ENTERPRISE"].includes(plan)) throw new ApiError("Unknown plan", 400);
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.school.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const schools = await prisma.school.findMany({
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
              _count: { select: { students: true, users: { where: { role: { notIn: ["PARENT", "STUDENT", "APP_OWNER"] } } }, classes: true } },
            },
          },
          _count: { select: { users: { where: { role: { notIn: ["PARENT", "STUDENT", "APP_OWNER"] } } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      });

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
      dataRegion: school.dataRegion,
      attendanceRegulator: school.attendanceRegulator,
      aiCreditsUsed: school.aiCreditsUsed,
      aiCreditsLimit: school.aiCreditsLimit,
      aiWorkflowsLiveAt: school.aiWorkflowsLiveAt,
      createdAt: school.createdAt,
      campusCount: school.campuses.length,
      totalStudents: school.campuses.reduce((sum, c) => sum + c._count.students, 0),
      totalStaff: school._count.users,
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
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools] GET failed");
  }
}

// ─────────────────────────────────────────────────────────────────
// POST — Provision a new school (tenant)
//
// Creates School + first Campus + owner account in one transaction, on the
// chosen plan. This replaces self-serve /register: only the APP_OWNER can
// bring a new tenant into existence.
//
// G22: the institution kind is a required, explicit choice. It is stored as
// `registrationKind` (the first signal `institutionKindOf` reads), and the
// owner is created as that kind's institution authority with the owner and
// purchase flags, so billing, invitations and approvals work from day one:
//   GROUP      → SUPER_ADMIN, not pinned to a campus (campusId: null)
//   STANDALONE → ADMIN, pinned to the school's only campus
//
// The generated password is returned exactly once, in this response.
// It is never stored in plaintext and cannot be retrieved again.
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePlatformOwner();

    const body = await parseBody(req, jsonObjectBody);

    // Text identity fields must arrive as JSON strings; numbers would otherwise be silently stringified.
    for (const key of ["schoolName", "city", "ownerName", "campusName"] as const) {
      const value = body[key];
      if (value !== undefined && value !== null && typeof value !== "string") {
        throw new ApiError(`${key} must be text`, 400);
      }
    }

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

    const kind = body.kind === "GROUP" || body.kind === "STANDALONE" ? (body.kind as "GROUP" | "STANDALONE") : null;
    if (!kind) throw new ApiError("Choose whether this is a school group or a single school", 400);
    if (!schoolName) throw new ApiError("School name is required", 400);
    if (!city) throw new ApiError("City is required", 400);
    if (!ownerName) throw new ApiError("Owner name is required", 400);
    if (!isValidEmail(ownerEmail)) throw new ApiError("A valid owner email is required", 400);
    if (contactEmail && !isValidEmail(contactEmail)) {
      throw new ApiError("School contact email is not valid", 400);
    }

    // SKAI-1369: unknown plan or status values are rejected, not silently
    // downgraded to FREE/TRIAL. Omitted values keep their defaults.
    if (body.plan && !["FREE", "BASIC", "PRO", "ENTERPRISE"].includes(String(body.plan).toUpperCase())) {
      throw new ApiError("Unsupported plan", 400);
    }
    if (body.status && !["TRIAL", "ACTIVE"].includes(String(body.status).toUpperCase())) {
      throw new ApiError("Unsupported status", 400);
    }
    const plan = normalizePlan(body.plan);
    const planDef = PLANS[plan];
    const status = body.status ? String(body.status).toUpperCase() : "TRIAL";

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
      const handoff = await bindProvisionHandoff(tx, actor, body.workflowHandoffId);
      const school = await tx.school.create({
        data: {
          name: schoolName,
          slug,
          city,
          address,
          contactEmail: schoolContact,
          status,
          plan,
          registrationKind: kind,
          commercialContract: createPlanContract(plan, { aiCredits: aiCreditsLimit }),
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
          // A group admin works across every campus; a single school's admin runs its one campus.
          campusId: kind === "GROUP" ? null : campus.id,
          email: ownerEmail,
          fullName: ownerName,
          phone,
          password: hashed,
          role: kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN",
          isInstitutionOwner: true,
          canPurchaseSubscription: true,
          isActive: true,
          // Owner-provisioned accounts skip email verification but must
          // replace the generated password before reaching a dashboard.
          onboardingComplete: true,
          mustChangePassword: true,
        },
      });

      if (handoff) await completeProvisionHandoff(tx, actor, handoff, school.id);
      return { school, campus, owner };
    });

    logSuperAdminAction({
      userId: actor.userId,
      action: "school_provisioned",
      status: "success",
      targetType: "school",
      targetId: result.school.id,
      targetName: result.school.name,
      newValues: { plan, status, kind, ownerEmail, campusName },
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
          ownerRole: result.owner.role,
          kind,
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
