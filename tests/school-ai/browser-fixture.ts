import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// This fixture must never connect to a school's database or sign with deployment credentials.
const expected = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== expected || process.env.DIRECT_URL !== expected) throw new Error("Use only the isolated School AI test database.");
const secret = "school-ai-isolated-browser-test-secret-only";
if (process.env.AUTH_SECRET !== secret) throw new Error("Use the isolated browser-test signing secret.");
const db = new PrismaClient();
async function main() {
  for (const suffix of ["a", "b"]) {
    const schoolId = `school-ai-browser-${suffix}`;
    await db.school.upsert({ where: { id: schoolId }, update: {}, create: { id: schoolId, name: `Synthetic Academy ${suffix}`, slug: schoolId, city: "Test", regId: schoolId, contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
    await db.campus.upsert({ where: { id: `${schoolId}-campus` }, update: {}, create: { id: `${schoolId}-campus`, schoolId, name: "Learning campus", city: "Test", regId: `${schoolId}-campus` } });
    for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
      await db.user.upsert({ where: { id: `${schoolId}-${role}` }, update: { mfaEnabled: true }, create: { id: `${schoolId}-${role}`, schoolId, campusId: `${schoolId}-campus`, email: `${suffix}-${role.toLowerCase()}@example.test`, fullName: `Synthetic ${role}`, role, mfaEnabled: true, isActive: true, onboardingComplete: true } });
    }
    await db.class.upsert({ where: { id: `${schoolId}-class` }, update: {}, create: { id: `${schoolId}-class`, schoolId, campusId: `${schoolId}-campus`, name: "Grade 8", section: "A", academicYear: 2026, classTeacherId: `${schoolId}-TEACHER` } });
    await db.subject.upsert({ where: { id: `${schoolId}-subject` }, update: {}, create: { id: `${schoolId}-subject`, schoolId, campusId: `${schoolId}-campus`, classId: `${schoolId}-class`, name: "Mathematics", teacherId: `${schoolId}-TEACHER` } });
    await db.student.upsert({ where: { id: `${schoolId}-student` }, update: {}, create: { id: `${schoolId}-student`, schoolId, campusId: `${schoolId}-campus`, classId: `${schoolId}-class`, studentUserId: `${schoolId}-STUDENT`, fullName: "Synthetic Learner", gender: "OTHER", rollNo: "QA-1" } });
  }
  const tokens: Record<string, string> = {};
  for (const suffix of ["a", "b"]) for (const role of ["ADMIN", "TEACHER", "STUDENT"]) {
    const schoolId = `school-ai-browser-${suffix}`;
    tokens[`${suffix}-${role}`] = await new SignJWT({ userId: `${schoolId}-${role}`, schoolId, campusId: `${schoolId}-campus`, role, email: `${suffix}-${role.toLowerCase()}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret));
    await db.loginSession.create({ data: { userId: `${schoolId}-${role}`, schoolId, tokenHash: createHash("sha256").update(tokens[`${suffix}-${role}`]).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  }
  await mkdir("test-results/school-ai", { recursive: true });
  await writeFile("test-results/school-ai/local-tokens.json", JSON.stringify(tokens), { mode: 0o600 });
  console.log("Synthetic browser fixtures created in the isolated local database.");
}
main().finally(() => db.$disconnect());
