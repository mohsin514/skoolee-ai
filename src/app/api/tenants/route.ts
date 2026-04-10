// ===========================================
// POST /api/tenants – Create a new school tenant
// GET  /api/tenants – Get current user's tenant
// ===========================================

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema, getTenantForUser } from "@/lib/db/tenant";
import { onboardingSchema } from "@/lib/validators/schemas";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
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

    // Check slug uniqueness
    const existingSlug = await prisma.tenant.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      return Response.json(
        { error: "This subdomain is already taken" },
        { status: 409 }
      );
    }

    // Create tenant record
    const schemaName = `school_${slug.replace(/-/g, "_")}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: schoolName,
        slug,
        schemaName,
        address,
        phone,
        email,
        status: "TRIAL",
        plan: "FREE",
        aiCreditsUsed: 0,
        aiCreditsLimit: 100,
      },
    });

    // Create user record linked to tenant
    await prisma.user.create({
      data: {
        clerkId: userId,
        email: email || "",
        role: "ADMIN",
        tenantId: tenant.id,
      },
    });

    // Provision the tenant's PostgreSQL schema
    await createTenantSchema(schemaName);

    return Response.json({
      success: true,
      data: {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schemaName,
      },
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
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ data: null });
    }

    const full = await prisma.tenant.findUnique({
      where: { id: tenant.id },
    });

    return Response.json({ success: true, data: full });
  } catch (error) {
    console.error("[tenants] GET error:", error);
    return Response.json(
      { error: "Failed to fetch tenant" },
      { status: 500 }
    );
  }
}
