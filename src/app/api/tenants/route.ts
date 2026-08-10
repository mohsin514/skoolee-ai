// ===========================================
// POST /api/tenants – Create a new school tenant
// ===========================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";
import { onboardingSchema } from "@/lib/validators/schemas";
import { DEFAULT_PERMISSIONS, PERMISSION_MODULES } from "@/lib/permissions";
import type { UserRole } from "@/lib/roles";

export async function seedRolePermissions(schoolId: string) {
  const rows = [];
  const roles = Object.keys(DEFAULT_PERMISSIONS) as UserRole[];
  for (const role of roles) {
    for (const module of PERMISSION_MODULES) {
      const flags = DEFAULT_PERMISSIONS[role][module];
      if (!flags.canView && !flags.canAdd && !flags.canEdit && !flags.canDelete) continue;
      rows.push({
        schoolId,
        role,
        module,
        canView: flags.canView,
        canAdd: flags.canAdd,
        canEdit: flags.canEdit,
        canDelete: flags.canDelete,
      });
    }
  }
  if (rows.length) {
    await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  }
}

export async function POST(req: NextRequest) {
  try {
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
  return Response.json({ message: "Auth required to fetch school details" });
}
