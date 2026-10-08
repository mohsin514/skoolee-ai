import { PrismaClient } from "@prisma/client";
const url = process.env.DATABASE_URL || "";
if (!url.includes("127.0.0.1:55401/sko201")) throw new Error("Local SKO-201 database required");
const db = new PrismaClient();
async function main() {
 await db.school.upsert({ where: { id: "locale-fixture" }, update: { registrationKind: "GROUP" }, create: { registrationKind: "GROUP", id: "locale-fixture", name: "Locale test school", slug: "locale-fixture", city: "Test", regId: "LOCAL-LOCALE", contactEmail: "locale@example.invalid", status: "ACTIVE", plan: "PRO" } });
 for (const id of ["locale-campus-a", "locale-campus-b"]) await db.campus.upsert({ where: { id }, update: {}, create: { id, schoolId: "locale-fixture", name: id === "locale-campus-a" ? "مدرسة الاختبار العربية الطويلة للتعليم الدولي" : "Sibling campus", city: "Test", regId: id, localeDelegatedFields: ["language", "timezone"] } });
 for (const role of ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) await db.user.upsert({ where: { id: `locale-${role}` }, update: {}, create: { id: `locale-${role}`, schoolId: "locale-fixture", campusId: role === "SUPER_ADMIN" || role === "APP_OWNER" ? null : "locale-campus-a", email: `${role.toLowerCase()}@example.invalid`, fullName: `Local ${role}`, role, isActive: true, onboardingComplete: true } });
}
main().finally(() => db.$disconnect());
