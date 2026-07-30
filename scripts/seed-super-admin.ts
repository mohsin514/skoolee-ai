import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  const email = "mohsin@skooleeai.com";
  const rawPassword = "Hussain?512";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Super Admin already exists:");
    console.log(`  Email: ${existing.email}`);
    console.log(`  Role: ${existing.role}`);
    console.log(`  ID: ${existing.id}`);

    if (existing.role !== "APP_OWNER") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "APP_OWNER" },
      });
      console.log("  -> Role upgraded to APP_OWNER");
    }
    return;
  }

  let school = await prisma.school.findFirst({ orderBy: { createdAt: "asc" } });

  if (!school) {
    school = await prisma.school.create({
      data: {
        name: "SkooleeAI Network",
        slug: "skooleeai",
        status: "ACTIVE",
        plan: "PRO",
        city: "Islamabad",
        regId: "SKL-HQ-001",
        contactEmail: email,
      },
    });
    console.log(`Created school: ${school.name} (${school.id})`);
  }

  const hashedPassword = await bcrypt.hash(rawPassword, 12);

  const superAdmin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      fullName: "Mohsin (App Owner)",
      role: "APP_OWNER",
      schoolId: school.id,
      isActive: true,
      onboardingComplete: true,
      lastLogin: new Date(),
      lastPasswordChange: new Date(),
    },
  });

  console.log("Super Admin created successfully:");
  console.log(`  Email: ${email}`);
  console.log(`  ID: ${superAdmin.id}`);
  console.log(`  School: ${school.name}`);
  console.log(`  Role: SUPER_ADMIN`);
}

seedSuperAdmin()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
