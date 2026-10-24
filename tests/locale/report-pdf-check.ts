import { generateClassGradesPdf } from "../../src/lib/pdf";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { renderReportCardPdfBuffer } from "../../src/lib/academic/pdf";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { reviewQueue, approveVersions } from "../../src/lib/academic/report-versions";
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
 const report = await db.reportCard.create({ data: { schoolId, campusId: campus.id, studentId: student.id, examId: exam.id, totalMarks: 100, obtainedMarks: 86, percentage: 86, grade: "A", status: "PUBLISHED", generatedAt: new Date("2027-04-01T00:30:00Z"), remarksAr: "أداء جيد في التعلم", remarksEn: "Original approved English remarks remain unchanged.", remarksUr: "طالب علم کی کارکردگی اچھی ہے۔", localeSnapshot: { ...defaultLocale, language: "ar", timezone: "Asia/Riyadh", numberingSystem: "arab" } } });
 for (const language of (["en", "ar", "ur", "en", "ar", "ur"] as const)) {
 await db.reportCard.update({ where: { id: report.id }, data: { reportLanguage: language, localeSnapshot: { ...defaultLocale, language, timezone: "Asia/Riyadh", numberingSystem: "arab" } } });
 await db.localePolicy.upsert({where:{id:`${schoolId}-locale`},update:{settings:{language}},create:{id:`${schoolId}-locale`,schoolId,scopeKey:"school",effectiveAt:new Date("2020-01-01Z"),settings:{language},createdBy:"fixture"}});
 const classPdf = await runWithTenantContext({schoolId},()=>generateClassGradesPdf(cls.id));await writeFile(`/tmp/sko201-evidence/actual-class-grades-${language}.pdf`,classPdf);
 const rendered = await runWithTenantContext({ schoolId }, async () => {
   const [version] = await reviewQueue([report.id]);
   await approveVersions([{ reportCardId: report.id, versionId: version.id }], "synthetic-reviewer");
   return renderReportCardPdfBuffer(report.id, version.id);
 }); await writeFile(`/tmp/sko201-evidence/actual-report-${language}.pdf`, rendered.buffer);
 const after = await db.reportCard.findUniqueOrThrow({ where: { id: report.id } }); assert.equal(after.obtainedMarks, 86); assert.equal(after.remarksEn, report.remarksEn); assert.deepEqual(after.generatedAt, report.generatedAt);
 }
 console.log("Real report-card payload rendered twice in English, Arabic and Urdu without changing identity, remarks, marks or generation timestamp");
 } finally { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
