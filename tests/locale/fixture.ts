import { PrismaClient } from "@prisma/client";
const url = process.env.DATABASE_URL || "";
if (!url.includes("127.0.0.1:55401/sko201")) throw new Error("Local SKO-201 database required");
const db = new PrismaClient();
async function main() {
 await db.school.upsert({ where: { id: "locale-fixture" }, update: { registrationKind: "GROUP" }, create: { registrationKind: "GROUP", id: "locale-fixture", name: "Locale test school", slug: "locale-fixture", city: "Test", regId: "LOCAL-LOCALE", contactEmail: "locale@example.invalid", status: "ACTIVE", plan: "PRO" } });
 for (const id of ["locale-campus-a", "locale-campus-b"]) await db.campus.upsert({ where: { id }, update: {}, create: { id, schoolId: "locale-fixture", name: id === "locale-campus-a" ? "مدرسة الاختبار العربية الطويلة للتعليم الدولي" : "Sibling campus", city: "Test", regId: id, localeDelegatedFields: ["language", "timezone"] } });
 for (const role of ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) await db.user.upsert({ where: { id: `locale-${role}` }, update: {}, create: { id: `locale-${role}`, schoolId: "locale-fixture", campusId: role === "SUPER_ADMIN" || role === "APP_OWNER" ? null : "locale-campus-a", email: `${role.toLowerCase()}@example.invalid`, fullName: `Local ${role}`, role, isActive: true, onboardingComplete: true } });
 await db.class.upsert({where:{id:"locale-portal-class"},update:{},create:{id:"locale-portal-class",schoolId:"locale-fixture",campusId:"locale-campus-a",name:"Locale class",academicYear:2026,classTeacherId:"locale-TEACHER"}});
 await db.student.upsert({where:{id:"locale-portal-student"},update:{studentUserId:"locale-STUDENT",parentUserId:"locale-PARENT"},create:{id:"locale-portal-student",schoolId:"locale-fixture",campusId:"locale-campus-a",classId:"locale-portal-class",studentUserId:"locale-STUDENT",parentUserId:"locale-PARENT",fullName:"علی احمد · طالب الاختبار",rollNo:"LOCAL-001",gender:"MALE"}});
 for(const [currency,amount] of [["PKR",123456],["KWD",1234567],["AED",34567]] as const) await db.invoice.upsert({where:{id:`locale-portal-${currency}`},update:{},create:{id:`locale-portal-${currency}`,schoolId:"locale-fixture",campusId:"locale-campus-a",studentId:"locale-portal-student",currency,invoiceNumber:`LOCAL-${currency}`,invoiceDate:new Date("2026-10-01Z"),dueDate:new Date("2026-10-30Z"),monthlyFee:amount,subtotal:amount,totalAmount:amount,balanceDue:amount}});
}
main().finally(() => db.$disconnect());
