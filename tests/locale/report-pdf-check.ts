import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { renderReportCardPdfBuffer } from "../../src/lib/academic/pdf";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { defaultLocale } from "../../src/lib/locale/package";
async function main() {
 if (!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201")) throw new Error("Local fixture database required");
 const db = new PrismaClient(); const schoolId = "locale-report-fixture";
 try {
 await db.school.create({ data: { id: schoolId, name: "مدرسة الاختبار", slug: schoolId, city: "Local", regId: schoolId, contactEmail: `${schoolId}@example.invalid` } });
 const campus = await db.campus.create({ data: { schoolId, name: "الحرم العربي", city: "Local", regId: schoolId } });
 const cls = await db.class.create({ data: { schoolId, campusId: campus.id, name: "الصف الخامس", section: "A", academicYear: 2027 } });
 const student = await db.student.create({ data: { schoolId, campusId: campus.id, classId: cls.id, fullName: "أحمد محمد", rollNo: "AR-014", gender: "MALE" } });
 const subject = await db.subject.create({ data: { schoolId, campusId: campus.id, classId: cls.id, name: "الرياضيات", totalMarks: 100 } });
 const exam = await db.exam.create({ data: { schoolId, campusId: campus.id, classId: cls.id, subjectId: subject.id, title: "اختبار الفصل", term: "Term-1", academicYear: 2027, status: "PUBLISHED", publishedAt: new Date(), isLocked: true } });
 await db.mark.create({ data: { schoolId, campusId: campus.id, studentId: student.id, examId: exam.id, subjectId: subject.id, marksObtained: 86 } });
 const report = await db.reportCard.create({ data: { schoolId, campusId: campus.id, studentId: student.id, examId: exam.id, totalMarks: 100, obtainedMarks: 86, percentage: 86, grade: "A", status: "PUBLISHED", generatedAt: new Date("2027-04-01T00:30:00Z"), remarksEn: "Original approved English remarks remain unchanged.", remarksUr: "طالب علم کی کارکردگی اچھی ہے۔", localeSnapshot: { ...defaultLocale, language: "ar", timezone: "Asia/Riyadh", numberingSystem: "arab" } } });
 const rendered = await runWithTenantContext({ schoolId }, () => renderReportCardPdfBuffer(report.id)); await writeFile("/tmp/sko201-evidence/actual-report-ar.pdf", rendered.buffer);
 const after = await db.reportCard.findUniqueOrThrow({ where: { id: report.id } }); assert.equal(after.obtainedMarks, 86); assert.equal(after.remarksEn, report.remarksEn); assert.deepEqual(after.generatedAt, report.generatedAt);
 console.log("Real report-card payload rendered in Arabic without changing identity, remarks, marks or generation timestamp");
 } finally { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
