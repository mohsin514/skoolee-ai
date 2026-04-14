// ─────────────────────────────────────────────────────────────────
// POST /api/auth/register — Legacy API Support
// Supports external registration calls if needed.
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createTenantSchema } from "@/lib/db/tenant";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

    // Default RegID Generator for Legacy API
    const genRegId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (type === "school-group") {
      const { schoolName, city, contactEmail, slug, campusName, campusCity, board, ownerName, ownerEmail, password, regId } = data;

      const [slugExists, emailExists] = await Promise.all([
        prisma.school.findUnique({ where: { slug } }),
        prisma.school.findUnique({ where: { contactEmail } }),
      ]);
      if (slugExists) return Response.json({ error: "Subdomain slug already taken" }, { status: 409 });
      if (emailExists) return Response.json({ error: "Email already registered" }, { status: 409 });

      const hashed = await bcrypt.hash(password, 12);

      // Create School with mandatory regId
      const school = await prisma.school.create({
        data: { 
          name: schoolName, 
          slug, 
          city, 
          contactEmail, 
          status: "TRIAL",
          regId: regId || genRegId('SKL') 
        },
      });

      // Create first Campus with mandatory regId
      const campus = await prisma.campus.create({
        data: { 
          schoolId: school.id, 
          name: campusName, 
          city: campusCity, 
          board,
          regId: genRegId('BR')
        },
      });

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

      const schemaName = `school_${school.id.replace(/-/g, "_")}`;
      await createTenantSchema(schemaName, school.id);

      return Response.json({ success: true, schoolId: school.id, campusId: campus.id, userId: user.id });

    } else if (type === "standalone") {
      const { campusName, city, board, logoUrl, password, adminEmail, ownerEmail, adminName, ownerName, regId } = data;
      const finalEmail = adminEmail || ownerEmail;
      const finalName = adminName || ownerName;

      if (!finalEmail) return Response.json({ error: "Email is required" }, { status: 400 });

      const slug = campusName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const [slugExists, emailExists] = await Promise.all([
        prisma.school.findFirst({ where: { slug } }),
        prisma.school.findFirst({ where: { contactEmail: finalEmail } }),
      ]);

      if (emailExists) return Response.json({ error: "This email is already registered to a school" }, { status: 409 });
      const finalSlug = slugExists ? `${slug}-${Date.now()}` : slug;

      const hashed = await bcrypt.hash(password, 12);

      const school = await prisma.school.create({
        data: { 
          name: campusName, 
          slug: finalSlug, 
          city, 
          contactEmail: finalEmail, 
          status: "TRIAL",
          regId: regId || genRegId('SKL')
        },
      });

      const campus = await prisma.campus.create({
        data: { 
          schoolId: school.id, 
          name: campusName, 
          city, 
          board, 
          logoUrl: logoUrl || null,
          regId: genRegId('BR')
        },
      });

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
