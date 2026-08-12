// ─────────────────────────────────────────────────────────────────
// POST /api/auth/register — Legacy API Support
// Supports external registration calls if needed.
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok } = rateLimit(`register:${ip}`, { limit: 5, windowMs: 300_000 });
    if (!ok) {
      return Response.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }
    const body = await req.json();
    const { type, ...data } = body;

    // Default RegID Generator for Legacy API
    const genRegId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (type === "school-group") {
      const { schoolName, city, contactEmail, slug, campusName, campusCity, board, ownerName, ownerEmail, password, regId } = data;

      if (!schoolName || !city || !contactEmail || !slug || !campusName || !campusCity || !ownerName || !ownerEmail || !password) {
        return Response.json({ error: "Missing required registration fields" }, { status: 400 });
      }

      const [slugExists, emailExists, userExists] = await Promise.all([
        prisma.school.findUnique({ where: { slug } }),
        prisma.school.findUnique({ where: { contactEmail } }),
        prisma.user.findUnique({ where: { email: ownerEmail } }),
      ]);
      if (slugExists) return Response.json({ error: "Subdomain slug already taken" }, { status: 409 });
      if (emailExists) return Response.json({ error: "Email already registered" }, { status: 409 });
      if (userExists) return Response.json({ error: "Owner email already has an account" }, { status: 409 });

      const hashed = await bcrypt.hash(password, 12);

      const { school, campus, user } = await prisma.$transaction(async (tx) => {
        const createdSchool = await tx.school.create({
          data: {
            name: schoolName,
            slug,
            city,
            contactEmail,
            status: "TRIAL",
            regId: regId || genRegId('SKL')
          },
        });

        const createdCampus = await tx.campus.create({
          data: {
            schoolId: createdSchool.id,
            name: campusName,
            city: campusCity,
            board,
            regId: genRegId('BR')
          },
        });

        const createdUser = await tx.user.create({
          data: {
            schoolId: createdSchool.id,
            campusId: createdCampus.id,
            email: ownerEmail,
            fullName: ownerName,
            password: hashed,
            role: "SUPER_ADMIN",
          },
        });

        return { school: createdSchool, campus: createdCampus, user: createdUser };
      });

      const schemaName = `school_${school.id.replace(/-/g, "_")}`;
      let tenantSchemaReady = true;
      try {
        await createTenantSchema(schemaName, school.id);
      } catch (error) {
        tenantSchemaReady = false;
        console.warn("[auth/register] tenant schema creation skipped", error);
      }

      return Response.json({ success: true, schoolId: school.id, campusId: campus.id, userId: user.id, tenantSchemaReady });

    } else if (type === "standalone") {
      const { campusName, city, board, logoUrl, password, adminEmail, ownerEmail, adminName, ownerName, regId } = data;
      const finalEmail = adminEmail || ownerEmail;
      const finalName = adminName || ownerName;

      if (!finalEmail) return Response.json({ error: "Email is required" }, { status: 400 });
      if (!campusName || !city || !board || !password || !finalName) {
        return Response.json({ error: "Missing required registration fields" }, { status: 400 });
      }

      const slug = campusName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const [slugExists, emailExists, userExists] = await Promise.all([
        prisma.school.findFirst({ where: { slug } }),
        prisma.school.findFirst({ where: { contactEmail: finalEmail } }),
        prisma.user.findUnique({ where: { email: finalEmail } }),
      ]);

      if (emailExists) return Response.json({ error: "This email is already registered to a school" }, { status: 409 });
      if (userExists) return Response.json({ error: "This email already has an account" }, { status: 409 });
      const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

      const hashed = await bcrypt.hash(password, 12);

      const { school, campus, user } = await prisma.$transaction(async (tx) => {
        const createdSchool = await tx.school.create({
          data: {
            name: campusName,
            slug: finalSlug,
            city,
            contactEmail: finalEmail,
            status: "TRIAL",
            regId: regId || genRegId('SKL')
          },
        });

        const createdCampus = await tx.campus.create({
          data: {
            schoolId: createdSchool.id,
            name: campusName,
            city,
            board,
            logoUrl: logoUrl || null,
            regId: genRegId('BR')
          },
        });

        const createdUser = await tx.user.create({
          data: {
            schoolId: createdSchool.id,
            campusId: createdCampus.id,
            email: finalEmail,
            fullName: finalName,
            password: hashed,
            role: "ADMIN",
          },
        });

        return { school: createdSchool, campus: createdCampus, user: createdUser };
      });

      const schemaName = `school_${school.id.replace(/-/g, "_")}`;
      let tenantSchemaReady = true;
      try {
        await createTenantSchema(schemaName, school.id);
      } catch (error) {
        tenantSchemaReady = false;
        console.warn("[auth/register] tenant schema creation skipped", error);
      }

      return Response.json({ success: true, schoolId: school.id, campusId: campus.id, userId: user.id, tenantSchemaReady });
    }

    return Response.json({ error: "Invalid registration type" }, { status: 400 });
  } catch (error: any) {
    console.error("[auth/register]", error);
    if (error?.code === "P2002") {
      return Response.json({ error: "A school, campus, or user with these details already exists" }, { status: 409 });
    }
    return Response.json({ error: "Registration failed" }, { status: 500 });
  }
}
