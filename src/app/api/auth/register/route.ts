// ─────────────────────────────────────────────────────────────────
// POST /api/auth/register — Diagram 2 Registration (both paths)
// Supports: school-group and standalone flows
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    if (type === "school-group") {
      // ─── Path A: School Group ─────────────────────────────
      const { schoolName, city, contactEmail, slug, campusName, campusCity, board, ownerName, ownerEmail, password } = data;

      // 1. Uniqueness check
      const [slugExists, emailExists] = await Promise.all([
        prisma.school.findUnique({ where: { slug } }),
        prisma.school.findUnique({ where: { contactEmail } }),
      ]);
      if (slugExists) return Response.json({ error: "Subdomain slug already taken" }, { status: 409 });
      if (emailExists) return Response.json({ error: "Email already registered" }, { status: 409 });

      // 2. Hash password
      const hashed = await bcrypt.hash(password, 12);

      // 3. Create School
      const school = await prisma.school.create({
        data: { name: schoolName, slug, city, contactEmail, status: "TRIAL" },
      });

      // 4. Create first Campus
      const campus = await prisma.campus.create({
        data: { schoolId: school.id, name: campusName, city: campusCity, board },
      });

      // 5. Create school owner (SUPER_ADMIN)
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          campusId: campus.id,
          email: ownerEmail,
          fullName: ownerName,
          password: hashed,
          role: "SUPER_ADMIN",
        },
      });

      // 6. Provision isolated schema
      const schemaName = `school_${school.id.replace(/-/g, "_")}`;
      await createTenantSchema(schemaName, school.id);

      return Response.json({ success: true, schoolId: school.id, campusId: campus.id, userId: user.id });

    } else if (type === "standalone") {
      // ─── Path B: Standalone Campus ────────────────────────
      const {
        campusName,
        city,
        board,
        logoUrl,
        password,
        adminEmail,
        ownerEmail,
        adminName,
        ownerName,
      } = data;

      const finalEmail = adminEmail || ownerEmail;
      const finalName = adminName || ownerName;

      if (!finalEmail) return Response.json({ error: "Email is required" }, { status: 400 });

      // 1. Uniqueness check for slug and email
      const slug = campusName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const [slugExists, emailExists] = await Promise.all([
        prisma.school.findFirst({ where: { slug } }),
        prisma.school.findFirst({ where: { contactEmail: finalEmail } }),
      ]);

      if (emailExists) return Response.json({ error: "This email is already registered to a school" }, { status: 409 });
      const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

      // 2. Hash password
      const hashed = await bcrypt.hash(password, 12);

      // 3. Create a "school" record (standalone — acts as its own group)
      const school = await prisma.school.create({
        data: { name: campusName, slug: finalSlug, city, contactEmail: finalEmail, status: "TRIAL" },
      });

      // 4. Create the campus with optional logo
      const campus = await prisma.campus.create({
        data: { schoolId: school.id, name: campusName, city, board, logoUrl: logoUrl || null },
      });

      // 5. Create campus admin (ADMIN role)
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          campusId: campus.id,
          email: finalEmail,
          fullName: finalName,
          password: hashed,
          role: "ADMIN",
        },
      });

      // 6. Provision isolated schema
      const schemaName = `school_${school.id.replace(/-/g, "_")}`;
      await createTenantSchema(schemaName, school.id);

      return Response.json({ success: true, schoolId: school.id, campusId: campus.id, userId: user.id });
    }

    return Response.json({ error: "Invalid registration type" }, { status: 400 });
  } catch (error) {
    console.error("[auth/register]", error);
    return Response.json({ error: "Registration failed" }, { status: 500 });
  }
}
