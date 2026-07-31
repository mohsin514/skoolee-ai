import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const school = await prisma.school.upsert({
    where: { contactEmail: "admin@demo.com" },
    update: {},
    create: {
      name: "Demo School",
      slug: "demo",
      city: "Lahore",
      regId: "SCH-DEMO-001",
      contactEmail: "admin@demo.com",
      plan: "ACTIVE",
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ School: ${school.name} (${school.id})`);

  const campus = await prisma.campus.upsert({
    where: { regId: "CAM-DEMO-001" },
    update: {},
    create: {
      schoolId: school.id,
      name: "Main Campus",
      city: "Lahore",
      regId: "CAM-DEMO-001",
    },
  });
  console.log(`  ✓ Campus: ${campus.name} (${campus.id})`);

  const password = await bcrypt.hash("Admin@123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      campusId: campus.id,
      schoolId: school.id,
      email: "admin@demo.com",
      fullName: "Super Admin",
      password,
      role: "SUPER_ADMIN",
      isActive: true,
      onboardingComplete: true,
    },
  });
  console.log(`  ✓ Admin: ${admin.fullName} (${admin.email}) / Password: Admin@123`);

  const ownerPassword = await bcrypt.hash("Hussain?512", 10);
  const owner = await prisma.user.upsert({
    where: { email: "mohsin@skooleeai.com" },
    update: {},
    create: {
      schoolId: school.id,
      email: "mohsin@skooleeai.com",
      fullName: "Mohsin — Platform Owner",
      password: ownerPassword,
      role: "APP_OWNER",
      isActive: true,
      onboardingComplete: true,
    },
  });
  console.log(`  ✓ Owner: ${owner.fullName} (${owner.email})`);

  const principal = await prisma.user.upsert({
    where: { email: "principal@demo.com" },
    update: {},
    create: {
      campusId: campus.id,
      schoolId: school.id,
      email: "principal@demo.com",
      fullName: "Principal",
      password,
      role: "PRINCIPAL",
      isActive: true,
      onboardingComplete: true,
    },
  });
  console.log(`  ✓ Principal: ${principal.fullName} (${principal.email}) / Password: Admin@123`);

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@demo.com" },
    update: {},
    create: {
      campusId: campus.id,
      schoolId: school.id,
      email: "teacher@demo.com",
      fullName: "Demo Teacher",
      password,
      role: "TEACHER",
      isActive: true,
      onboardingComplete: true,
    },
  });
  console.log(`  ✓ Teacher: ${teacher.fullName} (${teacher.email}) / Password: Admin@123`);

  console.log("\n✅ Seeding complete!");
  console.log("   Login: admin@demo.com / Admin@123 (Super Admin)");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
