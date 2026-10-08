// ===========================================
// POST /api/tenants – Create a new school tenant
// ===========================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";
import { onboardingSchema } from "@/lib/validators/schemas";
import { seedRolePermissions } from "@/lib/auth/seed-permissions";
import { getAuthUser } from "@/lib/auth";
import { createPlanContract } from "@/config/commercial-contract";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user || (user.role !== "APP_OWNER" && user.role !== "SUPER_ADMIN")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = onboardingSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { schoolName, slug, address, phone, email } = parsed.data;

    // 1. Check uniqueness
    const existingSchool = await prisma.school.findUnique({
      where: { slug },
    });
    
    if (existingSchool) {
      return Response.json(
        { error: "This subdomain is already taken" },
        { status: 409 }
      );
    }

    // 2. Create School record (Global Schema)
    const school = await prisma.school.create({
      data: {
        name: schoolName,
        slug: slug,
        regId: `SKL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        city: address || "Pending", // Mapping address to city for now
        contactEmail: email || `admin@${slug}.com`,
        status: "TRIAL",
        commercialContract: createPlanContract("FREE"),
      },
    });

    // 3. Provision isolated DB schema (Tenant Schema)
    const schemaName = `school_${school.id.replace(/-/g, "_")}`;
    await createTenantSchema(schemaName, school.id);

    // 4. Seed sensible role-permission defaults (Module 11). RolePermission
    //    rows are only written where the default differs — enforcement reads
    //    defaults when no row exists, so an empty table is still safe.
    await seedRolePermissions(school.id);

    return Response.json({
      success: true,
      id: school.id,
      slug: school.slug,
      schemaName: schemaName,
    });
  } catch (error) {
    console.error("[tenants] POST error:", error);
    return Response.json(
      { error: "Failed to create school" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: "Method not supported" }, { status: 405 });
}
